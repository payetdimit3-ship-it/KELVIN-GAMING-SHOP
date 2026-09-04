require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static('.'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ☁️ SUPABASE CLIENT SETUP
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('☁️ Supabase imeunganishwa kikamilifu.');
  } catch (err) {
    console.error('⚠️ Imeshindwa kuanzisha Supabase client:', err.message);
  }
} else {
  console.log('⚠️ Supabase HAIJAWEKWA — data itapotea kila deploy mpya!');
}

const TRACKED_FILES = [
  'users.json', 'sessions.json', 'products.json', 
  'orders.json', 'requests.json', 'security.json', 
  'marketplace.json', 'coupons.json', 'reviews.json', 'matches.json'
];

// 📁 DATA STORAGE UTILITIES
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJson(file, fallback) {
  try { 
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); 
  } catch (e) { 
    return fallback; 
  }
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
  if (supabase) {
    supabase.from('kv_store').upsert({ file_name: file, data, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.error(`☁️ Supabase backup error (${file}):`, error.message); })
      .catch(err => console.error(`☁️ Supabase backup error (${file}):`, err.message));
  }
}

async function restoreFromSupabase() {
  if (!supabase) return;
  for (const file of TRACKED_FILES) {
    try {
      const { data, error } = await supabase.from('kv_store').select('data').eq('file_name', file).maybeSingle();
      if (!error && data && data.data !== undefined) {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data.data, null, 2));
        console.log(`☁️ Imerudishwa kutoka Supabase: ${file}`);
      }
    } catch (err) {
      console.error(`☁️ Supabase restore error (${file}):`, err.message);
    }
  }
}

// 🔐 SECURITY & PASSWORD HASHING
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return crypto.scryptSync(password, salt, 64).toString('hex') === hash;
}

// 🛑 RATE LIMITING & SECURITY LOGGING
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 10;
const securityFile = 'security.json';

function isBlocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.time > BLOCK_MINUTES * 60000) { 
    loginAttempts.delete(key); 
    return false; 
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFail(key) {
  const entry = loginAttempts.get(key) || { count: 0, time: Date.now() };
  entry.count += 1; 
  entry.time = Date.now();
  loginAttempts.set(key, entry);
}

function logSecurity(type, details, severity, ip) {
  const data = readJson(securityFile, { events: [], blocked: {} });
  data.events.push({ time: new Date().toISOString(), type, details, severity, ip: ip || 'unknown' });
  if (data.events.length > 500) data.events = data.events.slice(-500);
  writeJson(securityFile, data);
}

function getIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function blockIP(ip, minutes) {
  const data = readJson(securityFile, { events: [], blocked: {} });
  data.blocked = data.blocked || {};
  data.blocked[ip] = Date.now() + minutes * 60000;
  writeJson(securityFile, data);
  logSecurity('IP_BLOCKED', `IP imefungwa kwa dakika ${minutes}`, 'HIGH', ip);
}

function isSuspicious(input) {
  if (!input || typeof input !== 'string') return false;
  const patterns = /('|"|--|;|\/\*|\*\/|union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|<\s*script|onerror\s*=|javascript:)/i;
  return patterns.test(input);
}

// Security Middleware
app.use('/api', (req, res, next) => {
  const ip = getIP(req);
  const data = readJson(securityFile, { events: [], blocked: {} });
  const blocked = data.blocked || {};

  if (blocked[ip] && blocked[ip] > Date.now()) {
    logSecurity('BLOCKED_REQUEST', 'IP iliyofungwa ilijaribu kuingia tena', 'MEDIUM', ip);
    return res.status(403).json({ error: 'IP yako imefungwa. Wasiliana na admin.' });
  }

  const checkItems = [req.body, req.query];
  for (const obj of checkItems) {
    if (!obj) continue;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'string' && isSuspicious(val)) {
        logSecurity('SQLI_XSS', `Input ya mashaka katika: "${key}"`, 'HIGH', ip);
        blockIP(ip, 30);
        return res.status(400).json({ error: 'Input haikubaliki.' });
      }
    }
  }
  next();
});

// 👤 AUTHENTICATION UTILS
const usersFile = 'users.json';
const sessionsFile = 'sessions.json';

function getUserByToken(req) {
  const token = req.headers.authorization || req.query.token;
  if (!token) return null;
  const sessions = readJson(sessionsFile, {});
  const email = sessions[token];
  if (!email) return null;
  const users = readJson(usersFile, {});
  return users[email] || null;
}

// Register
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Jaza jina, email na password' });
  if (password.length < 4) return res.status(400).json({ error: 'Password iwe angalau herufi 4' });
  
  const users = readJson(usersFile, {});
  const cleanEmail = email.trim().toLowerCase();
  if (users[cleanEmail]) return res.status(400).json({ error: 'Email hii tayari iko. Ingia badala yake.' });

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gamehub.co.tz').toLowerCase();
  users[cleanEmail] = {
    name: name.trim(), email: cleanEmail, phone: phone || '',
    password: hashPassword(password), isAdmin: cleanEmail === adminEmail, isStaff: false,
    balance: 0, adminEarnings: 0,
    created: new Date().toISOString()
  };
  writeJson(usersFile, users);

  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJson(sessionsFile, {});
  sessions[token] = cleanEmail;
  writeJson(sessionsFile, sessions);

  res.json({ success: true, token, user: { name: name.trim(), email: cleanEmail, isAdmin: users[cleanEmail].isAdmin, isStaff: false } });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const ip = getIP(req);

  if (!cleanEmail || !password) return res.status(400).json({ error: 'Jaza email na password' });
  if (isBlocked(cleanEmail) || isBlocked(ip)) return res.status(429).json({ error: `Jaribio nyingi. Subiri dakika ${BLOCK_MINUTES}.` });

  const users = readJson(usersFile, {});
  const user = users[cleanEmail];
  if (!user || !verifyPassword(password, user.password)) {
    recordFail(cleanEmail);
    recordFail(ip);
    if ((loginAttempts.get(ip) || {}).count >= MAX_ATTEMPTS) {
      blockIP(ip, 60);
      logSecurity('BRUTE_FORCE', `Majaribio mengi ya kuingia kutoka IP ${ip}`, 'HIGH', ip);
    }
    return res.status(401).json({ error: 'Email au password si sahihi' });
  }

  loginAttempts.delete(cleanEmail);
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJson(sessionsFile, {});
  sessions[token] = cleanEmail;
  writeJson(sessionsFile, sessions);

  res.json({ success: true, token, user: { name: user.name, email: user.email, isAdmin: user.isAdmin, isStaff: !!user.isStaff } });
});

// Me Profile
app.get('/api/auth/me', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Huna token au token si sahihi' });
  res.json({ success: true, user: { name: user.name, email: user.email, balance: user.balance || 0, adminEarnings: user.adminEarnings || 0, isAdmin: user.isAdmin, isStaff: !!user.isStaff } });
});

// Admin Staff Provisioning
app.post('/api/admin/users/staff', (req, res) => {
  const admin = getUserByToken(req);
  if (!admin || !admin.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { email, makeStaff } = req.body;
  const users = readJson(usersFile, {});
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!users[cleanEmail]) return res.status(404).json({ error: 'Mtumiaji hajapatikana' });
  if (users[cleanEmail].isAdmin) return res.status(400).json({ error: 'Huyu tayari ni Admin kamili' });
  users[cleanEmail].isStaff = !!makeStaff;
  writeJson(usersFile, users);
  res.json({ success: true, message: makeStaff ? `✅ ${cleanEmail} sasa ni Staff.` : `✅ ${cleanEmail} si Staff tena.` });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token) { 
    const sessions = readJson(sessionsFile, {}); 
    delete sessions[token]; 
    writeJson(sessionsFile, sessions); 
  }
  res.json({ success: true });
});

// Promote Admin via Setup Key
app.get('/api/auth/promote', (req, res) => {
  const { email, key } = req.query;
  if (!process.env.ADMIN_SETUP_KEY || key !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({ error: 'Ufunguo si sahihi' });
  }
  const users = readJson(usersFile, {});
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!users[cleanEmail]) return res.status(404).json({ error: 'Mtumiaji huyo hajapatikana.' });
  users[cleanEmail].isAdmin = true;
  writeJson(usersFile, users);
  res.json({ success: true, message: `✅ ${cleanEmail} sasa ni Admin. Toka na uingie tena.` });
});

// 🏆 MATCH PAYOUT MANAGEMENT
async function completeMatchAndPayout(matchId, winnerUserId) {
  const matches = readJson('matches.json', []);
  const match = matches.find(m => m.id === matchId);

  if (!match) return { success: false, error: 'Mechi haipatikani' };
  if (match.status === 'completed') return { success: false, error: 'Mechi hii tayari imeshakamilika na kulipwa' };

  const totalPool = (match.entryFee || 0) * 2;
  const platformFee = totalPool * 0.10;
  const winnerPrize = totalPool - platformFee;

  match.status = 'completed';
  match.winnerId = winnerUserId;
  match.platformCommission = platformFee;
  match.winnerPayout = winnerPrize;

  const users = readJson(usersFile, {});
  let winnerKey = Object.keys(users).find(k => k === winnerUserId || users[k].email === winnerUserId);
  if (winnerKey) {
    users[winnerKey].balance = (users[winnerKey].balance || 0) + winnerPrize;
  }

  let adminKey = Object.keys(users).find(k => users[k].isAdmin === true);
  if (adminKey) {
    users[adminKey].adminEarnings = (users[adminKey].adminEarnings || 0) + platformFee;
  }

  writeJson('matches.json', matches);
  writeJson(usersFile, users);

  return { success: true, winnerPrize, platformFee };
}

app.get('/api/matches', (req, res) => {
  const matches = readJson('matches.json', []);
  res.json({ success: true, matches });
});

app.post('/api/matches', (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const { title, entryFee, player1Id, player2Id } = req.body;
  if (!title || entryFee === undefined) return res.status(400).json({ error: 'Jaza kichwa cha habari na kiingilio' });

  const matches = readJson('matches.json', []);
  const match = {
    id: 'm_' + Date.now(),
    title: title.trim(),
    entryFee: Number(entryFee),
    player1Id: player1Id || '',
    player2Id: player2Id || '',
    status: 'pending',
    winnerId: null,
    platformCommission: 0,
    winnerPayout: 0,
    date: new Date().toISOString()
  };
  matches.push(match);
  writeJson('matches.json', matches);
  res.json({ success: true, match });
});

app.post('/api/matches/:id/complete', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const { winnerUserId } = req.body;
  if (!winnerUserId) return res.status(400).json({ error: 'Weka ID au Email ya mshindi' });

  const result = await completeMatchAndPayout(req.params.id, winnerUserId);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true, message: '✅ Mechi imekamilishwa na zawadi zimetolewa!', ...result });
});

// 🎮 PRODUCT MANAGEMENT
app.get('/api/products', (req, res) => {
  const products = readJson('products.json', {});
  res.json({ success: true, products: Object.values(products) });
});

app.post('/api/products', (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const { name, type, price, emoji, desc, downloadLink, imageUrl, trailerUrl, category, section, accountUser, accountPassword } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Jaza jina na bei' });
  const products = readJson('products.json', {});
  const id = 'p' + Date.now();
  products[id] = {
    id, name, type: type || 'Bidhaa', price: Number(price), emoji: emoji || '🎮', desc: desc || '',
    downloadLink: downloadLink || '', imageUrl: imageUrl || '', trailerUrl: trailerUrl || '',
    category: category || 'Zote', section: section || 'shop',
    accountUser: accountUser || '', accountPassword: accountPassword || ''
  };
  writeJson('products.json', products);
  res.json({ success: true, id });
});

app.put('/api/products/:id', (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const products = readJson('products.json', {});
  const existing = products[req.params.id];
  if (!existing) return res.status(404).json({ error: 'Bidhaa haipatikani' });
  const { name, type, price, emoji, desc, downloadLink, imageUrl, trailerUrl, category, section, accountUser, accountPassword } = req.body;
  products[req.params.id] = {
    ...existing,
    name: name || existing.name,
    type: type || existing.type,
    price: price ? Number(price) : existing.price,
    emoji: emoji || existing.emoji,
    desc: desc !== undefined ? desc : existing.desc,
    downloadLink: downloadLink !== undefined ? downloadLink : existing.downloadLink,
    imageUrl: imageUrl !== undefined ? imageUrl : existing.imageUrl,
    trailerUrl: trailerUrl !== undefined ? trailerUrl : existing.trailerUrl,
    category: category || existing.category || 'Zote',
    section: section || existing.section || 'shop',
    accountUser: accountUser !== undefined ? accountUser : existing.accountUser,
    accountPassword: accountPassword !== undefined ? accountPassword : existing.accountPassword
  };
  writeJson('products.json', products);
  res.json({ success: true, product: products[req.params.id] });
});

app.delete('/api/products/:id', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const products = readJson('products.json', {});
  delete products[req.params.id];
  writeJson('products.json', products);
  res.json({ success: true });
});

// 📊 ANALYTICS & BACKUPS
app.get('/api/admin/analytics', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []).filter(o => o.status === 'successful');

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, label: d.toLocaleDateString('sw', { day: '2-digit', month: '2-digit' }), total: 0, count: 0 });
  }
  orders.forEach(o => {
    const key = (o.confirmedAt || o.date || '').slice(0, 10);
    const day = days.find(d => d.date === key);
    if (day) { day.total += (o.amount || 0); day.count += 1; }
  });

  const productSales = {};
  orders.forEach(o => (o.items || []).forEach(i => {
    productSales[i.name] = (productSales[i.name] || 0) + i.qty;
  }));
  const topProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({ success: true, days, topProducts });
});

app.get('/api/admin/backup', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const backup = {
    generatedAt: new Date().toISOString(),
    users: readJson(usersFile, {}),
    products: readJson('products.json', {}),
    orders: readJson('orders.json', []),
    requests: readJson('requests.json', []),
    matches: readJson('matches.json', []),
    security: readJson(securityFile, { events: [], blocked: {} })
  };
  res.setHeader('Content-Disposition', `attachment; filename="gamehub-backup-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

// 🏪 MARKETPLACE & COUPONS
app.get('/api/marketplace', (req, res) => {
  res.json({ success: true, listings: readJson('marketplace.json', []) });
});

app.post('/api/marketplace', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { businessName, description, contact, imageUrl, category } = req.body;
  if (!businessName || !contact) return res.status(400).json({ error: 'Jaza jina la biashara na mawasiliano' });
  const listings = readJson('marketplace.json', []);
  const listing = {
    id: 'm' + Date.now(), businessName, description: description || '', contact,
    imageUrl: imageUrl || '', category: category || 'Nyingine', date: new Date().toISOString()
  };
  listings.push(listing);
  writeJson('marketplace.json', listings);
  res.json({ success: true, id: listing.id });
});

app.delete('/api/marketplace/:id', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const listings = readJson('marketplace.json', []);
  writeJson('marketplace.json', listings.filter(l => l.id !== req.params.id));
  res.json({ success: true });
});

app.get('/api/admin/coupons', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, coupons: readJson('coupons.json', {}) });
});

app.post('/api/admin/coupons', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { code, percentOff, maxUses } = req.body;
  if (!code || !percentOff) return res.status(400).json({ error: 'Jaza kodi na asilimia ya punguzo' });
  const coupons = readJson('coupons.json', {});
  const cleanCode = code.trim().toUpperCase();
  coupons[cleanCode] = { code: cleanCode, percentOff: Number(percentOff), maxUses: maxUses ? Number(maxUses) : null, uses: 0, active: true };
  writeJson('coupons.json', coupons);
  res.json({ success: true });
});

app.delete('/api/admin/coupons/:code', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const coupons = readJson('coupons.json', {});
  delete coupons[req.params.code.toUpperCase()];
  writeJson('coupons.json', coupons);
  res.json({ success: true });
});

app.post('/api/coupons/check', (req, res) => {
  const { code } = req.body;
  const coupons = readJson('coupons.json', {});
  const key = (code || '').trim().toUpperCase();
  const c = coupons[key];
  if (!c || !c.active) return res.status(404).json({ error: 'Kodi si sahihi au imeisha muda' });
  if (c.maxUses && c.uses >= c.maxUses) return res.status(400).json({ error: 'Kodi hii imeisha kutumika' });
  c.uses += 1;
  writeJson('coupons.json', coupons);
  res.json({ success: true, percentOff: c.percentOff, code: c.code });
});

// ⭐ REVIEWS & REQUESTS
app.get('/api/reviews/:productId', (req, res) => {
  const reviews = readJson('reviews.json', {});
  const list = reviews[req.params.productId] || [];
  const avg = list.length ? (list.reduce((t, r) => t + r.rating, 0) / list.length) : 0;
  res.json({ success: true, reviews: list.slice().reverse(), average: Math.round(avg * 10) / 10, count: list.length });
});

app.post('/api/reviews/:productId', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kuacha maoni' });
  const { rating, comment } = req.body;
  const r = Number(rating);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'Chagua rating ya nyota 1-5' });
  const reviews = readJson('reviews.json', {});
  if (!reviews[req.params.productId]) reviews[req.params.productId] = [];
  const already = reviews[req.params.productId].find(x => x.email === user.email);
  if (already) return res.json({ success: false, message: 'Umeshaacha maoni kwenye bidhaa hii.' });
  reviews[req.params.productId].push({
    name: user.name, email: user.email, rating: r, comment: (comment || '').trim(), date: new Date().toISOString()
  });
  writeJson('reviews.json', reviews);
  res.json({ success: true, message: '✅ Asante kwa maoni yako!' });
});

app.get('/api/requests', (req, res) => {
  const requests = readJson('requests.json', []);
  res.json({ success: true, requests: requests.slice().sort((a, b) => b.votes - a.votes) });
});

app.post('/api/requests', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kuomba game' });

  const { gameName } = req.body;
  if (!gameName || !gameName.trim()) return res.status(400).json({ error: 'Andika jina la game' });

  const requests = readJson('requests.json', []);
  const name = gameName.trim();
  const existing = requests.find(r => r.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    if (!existing.voters.includes(user.email)) {
      existing.voters.push(user.email);
      existing.votes += 1;
      writeJson('requests.json', requests);
      return res.json({ success: true, message: 'Game hii tayari iko. Tumeongeza kura yako!' });
    }
    return res.json({ success: true, message: 'Game hii tayari iko na umeshaipigia kura.' });
  }

  const newReq = { id: 'r' + Date.now(), name, voters: [user.email], votes: 1, date: new Date().toISOString() };
  requests.push(newReq);
  writeJson('requests.json', requests);
  res.json({ success: true, message: '✅ Game yako imeongezwa! Wengine wanaweza kuipigia kura.' });
});

app.post('/api/requests/:id/vote', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kupiga kura' });

  const requests = readJson('requests.json', []);
  const item = requests.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Game haipatikani' });
  if (item.voters.includes(user.email)) {
    return res.json({ success: false, message: 'Umeshapiga kura kwenye game hii' });
  }
  item.voters.push(user.email);
  item.votes += 1;
  writeJson('requests.json', requests);
  res.json({ success: true, message: '✅ Kura yako imeongezwa!' });
});

app.delete('/api/requests/:id', (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const requests = readJson('requests.json', []);
  writeJson('requests.json', requests.filter(r => r.id !== req.params.id));
  res.json({ success: true });
});

// 🧾 ADMIN DATA ENDPOINTS
app.get('/api/admin/orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, orders: readJson('orders.json', []).slice().reverse() });
});

app.get('/api/admin/users', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, users: Object.values(readJson(usersFile, {})) });
});

app.get('/api/admin/stats', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []);
  const users = readJson(usersFile, {});
  res.json({
    success: true,
    stats: {
      orders: orders.length,
      total: orders.reduce((t, o) => t + (o.amount || 0), 0),
      customers: Object.keys(users).length,
      products: Object.keys(readJson('products.json', {})).length
    }
  });
});

// 🛡️ SECURITY MANAGEMENT
app.get('/api/security/events', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, events: readJson(securityFile, { events: [] }).events.slice().reverse() });
});

app.get('/api/security/stats', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const data = readJson(securityFile, { events: [], blocked: {} });
  const now = Date.now();
  const activeBlocks = {};
  for (const ip in (data.blocked || {})) {
    if (data.blocked[ip] > now) activeBlocks[ip] = data.blocked[ip];
  }
  res.json({
    success: true,
    stats: {
      totalEvents: data.events.length,
      high: data.events.filter(e => e.severity === 'HIGH').length,
      medium: data.events.filter(e => e.severity === 'MEDIUM').length,
      low: data.events.filter(e => e.severity === 'LOW').length,
      blockedIPs: Object.keys(activeBlocks).length
    },
    blocked: activeBlocks
  });
});

app.post('/api/security/block', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { ip, minutes } = req.body;
  if (!ip) return res.status(400).json({ error: 'Andika IP' });
  blockIP(ip, minutes || 60);
  res.json({ success: true, message: `🛡️ IP ${ip} imefungwa kwa dakika ${minutes || 60}.` });
});

app.post('/api/security/unblock', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { ip } = req.body;
  const data = readJson(securityFile, { events: [], blocked: {} });
  delete data.blocked[ip];
  writeJson(securityFile, data);
  logSecurity('IP_UNBLOCKED', `IP ${ip} imefunguliwa na admin`, 'LOW', getIP(req));
  res.json({ success: true, message: `✅ IP ${ip} imefunguliwa.` });
});

app.get('/api/security/report', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const data = readJson(securityFile, { events: [], blocked: {} });
  const events = data.events;
  const now = Date.now();
  const last24h = events.filter(e => now - new Date(e.time).getTime() < 86400000);
  const blockedCount = Object.keys(data.blocked || {}).filter(ip => data.blocked[ip] > now).length;
  const high = events.filter(e => e.severity === 'HIGH').length;

  const lines = [
    '🛡️ RIPOTI YA USALAMA — GameHub',
    'Tarehe: ' + new Date().toLocaleString(),
    '----------------------------------',
    'Matukio yote: ' + events.length,
    'Masaa 24 yaliyopita: ' + last24h.length,
    'Matukio makubwa (HIGH): ' + high,
    'IP zilizofungwa sasa: ' + blockedCount,
    '----------------------------------',
    'Hali: ' + (high > 0 ? 'Kuna hatari! Angalia matukio ya HIGH.' : 'Salama. Endelea kufanya kazi nzuri! ✅')
  ];
  res.json({ success: true, report: lines.join('\n') });
});

// 💳 FLUTTERWAVE GATEWAY
app.post('/api/pay', async (req, res) => {
  try {
    const { amount, email, phone, name, network, items } = req.body;
    if (!amount || !email || !phone || !name || !network) {
      return res.status(400).json({ error: 'Jaza taarifa zote za malipo' });
    }
    const tx_ref = 'GH-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    const payload = {
      tx_ref, amount: String(amount), currency: 'TZS', network,
      email, phone_number: phone, fullname: name,
      meta: { items: JSON.stringify(items || []) }
    };

    const response = await fetch('https://api.flutterwave.com/v3/charges?type=mobile_money_tanzania', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.FLW_SECRET_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.status !== 'success') return res.status(400).json({ error: data.message || 'Malipo hayakuanza' });
    res.json({ success: true, tx_ref });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/verify', async (req, res) => {
  try {
    const tx_ref = req.query.tx_ref;
    const response = await fetch('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' + tx_ref, {
      headers: { 'Authorization': 'Bearer ' + process.env.FLW_SECRET_KEY }
    });
    const data = await response.json();

    if (data.status === 'success' && data.data.status === 'successful') {
      const orders = readJson('orders.json', []);
      if (!orders.find(o => o.tx_ref === tx_ref)) {
        let items = [];
        try { items = JSON.parse(data.data.meta?.items || '[]'); } catch (e) { items = []; }
        orders.push({
          tx_ref, customer: data.data.customer?.email || '',
          amount: data.data.amount || 0, items, status: 'successful', date: new Date().toISOString()
        });
        writeJson('orders.json', orders);
        logSecurity('PAYMENT_SUCCESS', `Malipo yamefika: ${data.data.amount || 0} TZS`, 'LOW', getIP(req));
      }
      res.json({ success: true, status: 'successful' });
    } else {
      res.json({ success: false, status: data.data ? data.data.status : 'pending' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ⚡ AZAMPAY GATEWAY
const AZAM_ENV = (process.env.AZAMPAY_ENV || 'sandbox').toLowerCase();
const AZAM_AUTH_BASE = AZAM_ENV === 'production' ? 'https://authenticator.azampay.co.tz' : 'https://authenticator-sandbox.azampay.co.tz';
const AZAM_API_BASE = AZAM_ENV === 'production' ? 'https://checkout.azampay.co.tz' : 'https://sandbox.azampay.co.tz';

function azamConfigured() {
  return !!(process.env.AZAMPAY_APP_NAME && process.env.AZAMPAY_CLIENT_ID && process.env.AZAMPAY_CLIENT_SECRET);
}

let azamTokenCache = { token: null, expiresAt: 0 };

async function getAzamPayToken() {
  if (azamTokenCache.token && Date.now() < azamTokenCache.expiresAt - 60_000) {
    return azamTokenCache.token;
  }
  const r = await fetch(`${AZAM_AUTH_BASE}/AppRegistration/GenerateToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: process.env.AZAMPAY_APP_NAME,
      clientId: process.env.AZAMPAY_CLIENT_ID,
      clientSecret: process.env.AZAMPAY_CLIENT_SECRET
    })
  });
  const raw = await r.text();
  let data = {};
  try { data = JSON.parse(raw); } catch (e) {}

  const token = data?.data?.accessToken || data?.accessToken;
  if (!r.ok || !token) {
    throw new Error('AzamPay Token Error: ' + (data?.message || raw.slice(0, 200)));
  }
  const expire = data?.data?.expire ? Date.parse(data.data.expire) : 0;
  azamTokenCache = {
    token: token.startsWith('Bearer ') ? token : 'Bearer ' + token,
    expiresAt: expire && !isNaN(expire) ? expire : Date.now() + 50 * 60 * 1000
  };
  return azamTokenCache.token;
}

function detectAzamProvider(phoneFull) {
  const prefix = String(phoneFull).replace(/\D/g, '').slice(3, 5);
  if (['74', '75', '76'].includes(prefix)) return 'Mpesa';
  if (['71', '65', '67', '77'].includes(prefix)) return 'Tigo';
  if (['78', '68', '69'].includes(prefix)) return 'Airtel';
  if (['62', '61'].includes(prefix)) return 'Halopesa';
  if (['73'].includes(prefix)) return 'Azampesa';
  return null;
}

const AZAM_PROVIDERS = ['Mpesa', 'Tigo', 'Airtel', 'Halopesa', 'Azampesa'];

app.post('/api/azampay-pay', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kulipa' });
  if (!azamConfigured()) return res.status(503).json({ error: 'Malipo ya automatic hayapatikani, tumia manual.' });

  try {
    const { items, total, phone, name, provider } = req.body;
    if (!items || !items.length || !total) return res.status(400).json({ error: 'Kikapu ni tupu' });

    let phoneFull = String(phone || '').replace(/\D/g, '');
    if (!phoneFull.startsWith('255')) phoneFull = '255' + phoneFull.replace(/^0/, '');
    if (phoneFull.length !== 12) return res.status(400).json({ error: 'Namba ya simu si sahihi (Mfano: 0786095758)' });

    const mno = AZAM_PROVIDERS.includes(provider) ? provider : detectAzamProvider(phoneFull);
    if (!mno) return res.status(400).json({ error: 'Hatujaweza kutambua mtandao. Chagua mtandao wako.' });

    const orderReference = 'AZ' + Date.now() + crypto.randomBytes(3).toString('hex');
    const orders = readJson('orders.json', []);
    orders.push({
      tx_ref: orderReference, customer: user.email, customerPhone: phoneFull,
      customerName: name || user.name, amount: Number(total), items, provider: mno,
      status: 'pending_azampay', date: new Date().toISOString()
    });
    writeJson('orders.json', orders);

    const token = await getAzamPayToken();
    const payload = {
      accountNumber: phoneFull, amount: String(total), currency: 'TZS',
      externalId: orderReference, provider: mno, additionalProperties: { customerEmail: user.email }
    };

    const apiRes = await fetch(`${AZAM_API_BASE}/azampay/mno/checkout`, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json', 'X-API-Key': process.env.AZAMPAY_API_KEY || '' },
      body: JSON.stringify(payload)
    });

    const rawBody = await apiRes.text();
    let apiData = {};
    try { apiData = JSON.parse(rawBody); } catch (e) {}

    if (!apiRes.ok || apiData.success === false) {
      const all = readJson('orders.json', []);
      const idx = all.findIndex(o => o.tx_ref === orderReference);
      if (idx > -1) { all[idx].status = 'failed_to_start'; writeJson('orders.json', all); }
      return res.status(400).json({ error: 'AzamPay Checkout Error' });
    }

    res.json({ success: true, tx_ref: orderReference, provider: mno, transactionId: apiData.transactionId || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/api/azampay-callback', async (req, res) => {
  try {
    const expected = process.env.AZAMPAY_CALLBACK_TOKEN;
    if (expected) {
      const got = String(req.headers['authorization'] || req.headers['x-callback-token'] || '').replace(/^Bearer\s+/i, '');
      if (got !== expected) return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const orderReference = body.utilityref || body.externalId || body.reference;
    const status = String(body.transactionstatus || body.transactionStatus || body.status || '').toLowerCase();
    const collectedAmount = Number(body.amount ?? body.collectedAmount);

    if (orderReference && ['success', 'settled', 'completed'].includes(status)) {
      const orders = readJson('orders.json', []);
      const order = orders.find(o => o.tx_ref === orderReference);
      if (order && order.status !== 'successful') {
        if (isNaN(collectedAmount) || collectedAmount < (order.amount - 5)) {
          order.status = 'amount_mismatch';
          writeJson('orders.json', orders);
          return res.json({ success: false });
        }
        order.status = 'successful';
        order.confirmedAt = new Date().toISOString();
        order.azamTransactionId = body.transactionId || body.operatorreference || null;
        writeJson('orders.json', orders);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/azampay-check/:ref', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = readJson('orders.json', []);
  const order = orders.find(o => o.tx_ref === req.params.ref && o.customer === user.email);
  if (!order) return res.status(404).json({ error: 'Order haipatikani' });
  res.json({ success: true, status: order.status });
});

// 💵 MANUAL PAYMENTS
app.post('/api/manual-pay', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kutuma ripoti ya malipo' });

  const { items, total, txRef, phone } = req.body;
  if (!items || !items.length || !total || !txRef || !txRef.trim()) {
    return res.status(400).json({ error: 'Jaza taarifa zote pamoja na namba ya muamala' });
  }

  const orders = readJson('orders.json', []);
  const orderRef = 'MANUAL-' + Date.now();
  orders.push({
    tx_ref: orderRef, customer: user.email, customerPhone: phone || '',
    manualTxRef: txRef.trim(), amount: total, items, status: 'pending_manual', date: new Date().toISOString()
  });
  writeJson('orders.json', orders);
  res.json({ success: true, message: '✅ Ripoti imepokelewa! Admin atathibitisha hivi karibuni.', tx_ref: orderRef });
});

app.post('/api/admin/orders/confirm', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { tx_ref } = req.body;
  const orders = readJson('orders.json', []);
  const order = orders.find(o => o.tx_ref === tx_ref);
  if (!order) return res.status(404).json({ error: 'Order haipatikani' });
  order.status = 'successful';
  order.confirmedAt = new Date().toISOString();
  writeJson('orders.json', orders);
  res.json({ success: true, message: '✅ Malipo yamethibitishwa.' });
});

app.post('/api/admin/orders/reject', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { tx_ref } = req.body;
  const orders = readJson('orders.json', []);
  writeJson('orders.json', orders.filter(o => o.tx_ref !== tx_ref));
  res.json({ success: true });
});

app.get('/api/my-orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = readJson('orders.json', []);
  res.json({ success: true, orders: orders.filter(o => o.customer === user.email).reverse() });
});

// 🤖 GEMINI AI SERVICES
async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return 'GEMINI_API_KEY haijawekwa kwenye environment variables.';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
      })
    });
    const data = await response.json();
    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts.map(p => p.text).join('');
    }
    return data.error ? `AI Error: ${data.error.message}` : 'Samahani, AI haikujibu kwa sasa.';
  } catch (err) {
    console.error(err);
    return 'Hitilafu ya mtandao kwenye AI. Jaribu tena.';
  }
}

app.post('/api/ai/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Andika ujumbe' });

  const products = Object.values(readJson('products.json', {}));
  const productList = products.length
    ? products.map(p => `${p.name} (${p.type || 'Bidhaa'}) - ${Number(p.price).toLocaleString()} TZS`).join('\n')
    : 'Hakuna bidhaa bado kwenye duka';

  let transcript = '';
  if (Array.isArray(history) && history.length) {
    transcript = '\nMazungumzo ya awali:\n' + history.map(h => (h.role === 'user' ? 'Mteja: ' : 'Wewe: ') + h.text).join('\n') + '\n';
  }

  const prompt = `Wewe ni msaidizi wa duka la gaming Tanzania la GameHub.
Jibu kwa Kiswahili au Kiingereza kwa ufupi na kirafiki.
Bidhaa zilizopo:
${productList}
${transcript}
Mteja anasema: "${message}"`;

  const reply = await askGemini(prompt);
  res.json({ reply });
});

app.post('/api/ai/admin', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });

  const { command } = req.body;
  if (!command || !command.trim()) return res.status(400).json({ error: 'Andika amri' });

  const lower = command.toLowerCase();
  const addMatch = lower.match(/ongeza\s+(?:game|bidhaa|product)?\s*(.+?)\s+bei\s+(\d+)/i);
  if (addMatch) {
    const name = addMatch[1].trim();
    const price = Number(addMatch[2]);
    const products = readJson('products.json', {});
    const id = 'p' + Date.now();
    products[id] = { id, name, type: 'Game', price, emoji: '🎮', desc: 'Imeongezwa na AI' };
    writeJson('products.json', products);
    return res.json({ reply: `✅ Nimeongeza "${name}" kwa bei TZS ${price.toLocaleString()} kwenye duka.` });
  }

  const reply = await askGemini(`Wewe ni AI ya Admin wa GameHub. Admin anasema: "${command}"`);
  res.json({ reply });
});

// 🚀 START SERVER
restoreFromSupabase()
  .catch(err => console.error('☁️ Restore Error:', err.message))
  .finally(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🎮 GameHub server iko live kwenye port ${PORT}`);
    });
  });
