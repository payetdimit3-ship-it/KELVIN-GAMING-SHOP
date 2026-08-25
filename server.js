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

// ═══════════ ☁️ SUPABASE — Hifadhi ya kudumu (backup automatic) ═══════════
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log('☁️ Supabase imeunganishwa — data itahifadhiwa kudumu.');
} else {
  console.log('⚠️ Supabase HAIJAWEKWA — data itapotea kila deploy mpya kwenye Render free tier!');
}

const TRACKED_FILES = ['users.json', 'sessions.json', 'products.json', 'orders.json', 'requests.json', 'security.json', 'marketplace.json', 'coupons.json', 'reviews.json'];

// ═══════════ HIFADHI YA DATA (.data folder) ═══════════
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch (e) { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
  if (supabase) {
    supabase.from('kv_store').upsert({ file_name: file, data, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.error('☁️ Supabase backup error (' + file + '):', error.message); })
      .catch(err => console.error('☁️ Supabase backup error (' + file + '):', err.message));
  }
}

// Wakati server inapoanza: rudisha data zote kutoka Supabase (kama zipo)
async function restoreFromSupabase() {
  if (!supabase) return;
  for (const file of TRACKED_FILES) {
    try {
      const { data, error } = await supabase.from('kv_store').select('data').eq('file_name', file).maybeSingle();
      if (!error && data && data.data !== undefined) {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data.data, null, 2));
        console.log('☁️ Imerudishwa kutoka Supabase: ' + file);
      }
    } catch (err) {
      console.error('☁️ Supabase restore error (' + file + '):', err.message);
    }
  }
}

// ═══════════ PASSWORD SALAMA ═══════════
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.scryptSync(password, salt, 64).toString('hex') === hash;
}

// ═══════════ ULINZI WA LOGIN (brute-force / rate limiting, kwa email) ═══════════
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 10;

function isBlocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.time > BLOCK_MINUTES * 60000) { loginAttempts.delete(key); return false; }
  return entry.count >= MAX_ATTEMPTS;
}
function recordFail(key) {
  const entry = loginAttempts.get(key) || { count: 0, time: Date.now() };
  entry.count += 1; entry.time = Date.now();
  loginAttempts.set(key, entry);
}

// ═══════════ 🛡️ HACKERAI — SECURITY MODULE (Mlinzi wa Website) ═══════════

const securityFile = 'security.json';

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
  logSecurity('IP_BLOCKED', 'IP imefungwa kwa dakika ' + minutes, 'HIGH', ip);
}

function isSuspicious(input) {
  if (!input || typeof input !== 'string') return false;
  const patterns = /('|"|--|;|\/\*|\*\/|union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|<\s*script|onerror\s*=|javascript:)/i;
  return patterns.test(input);
}

// ===== MLINZI: Inachunguza kila ombi linalofika kwenye API =====
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
        logSecurity('SQLI_XSS', 'Input ya mashaka katika: "' + key + '"', 'HIGH', ip);
        blockIP(ip, 30);
        return res.status(400).json({ error: 'Input haikubaliki.' });
      }
    }
  }
  next();
});

// ═══════════ USERS + SESSIONS ═══════════
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

// ===== KUJIUNGA =====
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
    created: new Date().toISOString()
  };
  writeJson(usersFile, users);

  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJson(sessionsFile, {});
  sessions[token] = cleanEmail;
  writeJson(sessionsFile, sessions);

  res.json({ success: true, token, user: { name: name.trim(), email: cleanEmail, isAdmin: users[cleanEmail].isAdmin, isStaff: false } });
});

// ===== KUINGIA (na ulinzi wa IP + logSecurity) =====
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const ip = getIP(req);

  if (!cleanEmail || !password) return res.status(400).json({ error: 'Jaza email na password' });
  if (isBlocked(cleanEmail) || isBlocked(ip)) return res.status(429).json({ error: 'Jaribio nyingi. Subiri dakika ' + BLOCK_MINUTES + '.' });

  const users = readJson(usersFile, {});
  const user = users[cleanEmail];
  if (!user || !verifyPassword(password, user.password)) {
    recordFail(cleanEmail);
    recordFail(ip);
    if ((loginAttempts.get(ip) || {}).count >= MAX_ATTEMPTS) {
      blockIP(ip, 60);
      logSecurity('BRUTE_FORCE', 'Majaribio mengi ya kuingia kutoka IP ' + ip, 'HIGH', ip);
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

// ===== NANI ALIYEINGIA =====
app.get('/api/auth/me', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Huna token au token si sahihi' });
  res.json({ success: true, user: { name: user.name, email: user.email, isAdmin: user.isAdmin, isStaff: !!user.isStaff } });
});

// ===== ADMIN: fanya mtumiaji kuwa Staff (ruhusa ndogo) au ondoa =====
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
  res.json({ success: true, message: makeStaff ? '✅ ' + cleanEmail + ' sasa ni Staff (ruhusa ndogo).' : '✅ ' + cleanEmail + ' si Staff tena.' });
});

// ===== KUTOKA =====
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token) { const sessions = readJson(sessionsFile, {}); delete sessions[token]; writeJson(sessionsFile, sessions); }
  res.json({ success: true });
});

// ===== KUPANDISHA MTUMIAJI KUWA ADMIN (mara moja, kwa ufunguo wa siri) =====
// Tumia hii kama akaunti yako haikuwa Admin automatic. Fungua kwenye browser:
// https://yourdomain.onrender.com/api/auth/promote?email=EMAIL_YAKO&key=ADMIN_SETUP_KEY
app.get('/api/auth/promote', (req, res) => {
  const { email, key } = req.query;
  if (!process.env.ADMIN_SETUP_KEY || key !== process.env.ADMIN_SETUP_KEY) {
    return res.status(403).json({ error: 'Ufunguo si sahihi' });
  }
  const users = readJson(usersFile, {});
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!users[cleanEmail]) return res.status(404).json({ error: 'Mtumiaji huyo hajapatikana. Jisajili kwanza kwenye tovuti.' });
  users[cleanEmail].isAdmin = true;
  writeJson(usersFile, users);
  res.json({ success: true, message: '✅ ' + cleanEmail + ' sasa ni Admin. Toka (logout) na uingie tena ili ibadilike.' });
});

// ═══════════ BIDHAA (PRODUCTS) ═══════════
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

// ═══════════ 📊 ANALYTICS — Mauzo kwa siku (kwa chati) ═══════════
app.get('/api/admin/analytics', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []).filter(o => o.status === 'successful');

  // Mauzo ya siku 14 zilizopita
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

  // Bidhaa zinazouzwa zaidi
  const productSales = {};
  orders.forEach(o => (o.items || []).forEach(i => {
    productSales[i.name] = (productSales[i.name] || 0) + i.qty;
  }));
  const topProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  res.json({ success: true, days, topProducts });
});

// ═══════════ 💾 BACKUP — Pakua data yote (Admin pekee) ═══════════
app.get('/api/admin/backup', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const backup = {
    generatedAt: new Date().toISOString(),
    users: readJson(usersFile, {}),
    products: readJson('products.json', {}),
    orders: readJson('orders.json', []),
    requests: readJson('requests.json', []),
    security: readJson(securityFile, { events: [], blocked: {} })
  };
  res.setHeader('Content-Disposition', 'attachment; filename="gamehub-backup-' + Date.now() + '.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

// ═══════════ GAME REQUESTS (Oda za Games Zisizopo — inahitaji login) ═══════════

// ═══════════ 🏪 MARKETPLACE (Biashara Zingine — Admin pekee anaongeza) ═══════════
app.get('/api/marketplace', (req, res) => {
  const listings = readJson('marketplace.json', []);
  res.json({ success: true, listings });
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

// ═══════════ 🎟️ DISCOUNT CODES ═══════════
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

// Mteja anaangalia kodi kabla ya kulipa
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

// ═══════════ ⭐ MAONI NA RATING (Reviews) ═══════════
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

  const newReq = {
    id: 'r' + Date.now(),
    name: name,
    voters: [user.email],
    votes: 1,
    date: new Date().toISOString()
  };
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

// ═══════════ MAUZO (ORDERS) ═══════════
app.get('/api/admin/orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []);
  res.json({ success: true, orders: orders.slice().reverse() });
});

app.get('/api/admin/users', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const users = readJson(usersFile, {});
  res.json({ success: true, users: Object.values(users) });
});

app.get('/api/admin/stats', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []);
  const users = readJson(usersFile, {});
  const total = orders.reduce((t, o) => t + (o.amount || 0), 0);
  res.json({
    success: true,
    stats: {
      orders: orders.length,
      total: total,
      customers: Object.keys(users).length,
      products: Object.keys(readJson('products.json', {})).length
    }
  });
});

// ═══════════ 🛡️ SECURITY ADMIN ENDPOINTS ═══════════
app.get('/api/security/events', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const data = readJson(securityFile, { events: [], blocked: {} });
  res.json({ success: true, events: data.events.slice().reverse() });
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
  res.json({ success: true, message: '🛡️ IP ' + ip + ' imefungwa kwa dakika ' + (minutes || 60) + '.' });
});

app.post('/api/security/unblock', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { ip } = req.body;
  const data = readJson(securityFile, { events: [], blocked: {} });
  delete data.blocked[ip];
  writeJson(securityFile, data);
  logSecurity('IP_UNBLOCKED', 'IP ' + ip + ' imefunguliwa na admin', 'LOW', getIP(req));
  res.json({ success: true, message: '✅ IP ' + ip + ' imefunguliwa.' });
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
  const attacks = events.filter(e => ['SQLI_XSS', 'BRUTE_FORCE', 'BLOCKED_REQUEST'].includes(e.type));

  const lines = [
    '🛡️ RIPOTI YA USALAMA — GameHub',
    'Tarehe: ' + new Date().toLocaleString(),
    '----------------------------------',
    'Matukio yote: ' + events.length,
    'Masaa 24 yaliyopita: ' + last24h.length,
    'Matukio makubwa (HIGH): ' + high,
    'Mashambulizi yaliyogunduliwa: ' + attacks.length,
    'IP zilizofungwa sasa: ' + blockedCount,
    '----------------------------------',
    'Hali: ' + (high > 0 ? 'Kuna hatari! Angalia matukio ya HIGH.' : 'Salama. Endelea kufanya kazi nzuri! ✅')
  ];
  res.json({ success: true, report: lines.join('\n') });
});

// ═══════════ MALIPO YA FLUTTERWAVE — TANZANIA ═══════════
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
        const meta = data.data.meta || {};
        let items = [];
        try { items = JSON.parse(meta.items || '[]'); } catch (e) { items = []; }
        orders.push({
          tx_ref,
          customer: (data.data.customer && data.data.customer.email) || '',
          amount: data.data.amount || 0,
          items,
          status: 'successful',
          date: new Date().toISOString()
        });
        writeJson('orders.json', orders);

        // 🛡️ HackerAI: rekodi malipo + angalia ulaghai
        logSecurity('PAYMENT_SUCCESS', 'Malipo yamefika: ' + (data.data.amount || 0) + ' TZS', 'LOW', getIP(req));

        const recentOrders = orders.filter(o => new Date(o.date).getTime() > Date.now() - 10 * 60000);
        const sameCustomer = recentOrders.filter(o => o.customer === (data.data.customer && data.data.customer.email));
        if (sameCustomer.length >= 3) {
          logSecurity('FRAUD_SUSPECT', 'Malipo ya haraka-haraka: ' + sameCustomer.length + ' orders kwa dakika 10', 'HIGH', getIP(req));
        }
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

// ═══════════ ⚡ MALIPO YA CLICKPESA (Automatic — M-Pesa/Tigo/Airtel/HaloPesa/Kadi) ═══════════

async function getClickPesaToken() {
  const res = await fetch('https://api.clickpesa.com/third-parties/generate-token', {
    method: 'POST',
    headers: {
      'client-id': process.env.CLICKPESA_CLIENT_ID,
      'api-key': process.env.CLICKPESA_API_KEY
    }
  });
  const data = await res.json();
  if (!data.success || !data.token) throw new Error(data.message || 'ClickPesa: imeshindwa kupata token');
  return data.token; // tayari ina "Bearer " mwanzoni
}

app.post('/api/clickpesa-pay', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kulipa' });

  try {
    const { items, total, phone, name, email } = req.body;
    if (!items || !items.length || !total) return res.status(400).json({ error: 'Kikapu ni tupu' });

    const orderReference = 'CP' + Date.now() + crypto.randomBytes(3).toString('hex');

    const orders = readJson('orders.json', []);
    orders.push({
      tx_ref: orderReference,
      customer: user.email,
      customerPhone: phone || '',
      amount: total,
      items,
      status: 'pending_clickpesa',
      date: new Date().toISOString()
    });
    writeJson('orders.json', orders);

    const token = await getClickPesaToken();
    const host = req.protocol + '://' + req.get('host');

    const cpRes = await fetch('https://api.clickpesa.com/third-parties/checkout-link/generate-checkout-url', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderItems: items.map(i => ({ name: i.name, price: String(i.num), quantity: i.qty })),
        orderReference,
        orderCurrency: 'TZS',
        customerName: name || user.name,
        customerEmail: email || user.email,
        customerPhone: (phone || '').replace(/^\+/, '').replace(/^0/, '255'),
        description: 'GameHub Order',
        callbackUrl: host + '/api/clickpesa-callback'
      })
    });
    const cpData = await cpRes.json();

    if (!cpData.checkoutLink) {
      return res.status(400).json({ error: cpData.message || 'Imeshindwa kutengeneza link ya malipo' });
    }

    res.json({ success: true, checkoutLink: cpData.checkoutLink, tx_ref: orderReference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/api/clickpesa-callback', async (req, res) => {
  try {
    const { orderReference, status } = req.body;
    if (orderReference && (status === 'SUCCESS' || status === 'SETTLED')) {
      const orders = readJson('orders.json', []);
      const order = orders.find(o => o.tx_ref === orderReference);
      if (order && order.status !== 'successful') {
        order.status = 'successful';
        order.confirmedAt = new Date().toISOString();
        writeJson('orders.json', orders);
        logSecurity('CLICKPESA_PAYMENT_CONFIRMED', 'Malipo ya ClickPesa yamethibitishwa: ' + orderReference, 'LOW', getIP(req));
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/clickpesa-check/:ref', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  try {
    const orders = readJson('orders.json', []);
    const order = orders.find(o => o.tx_ref === req.params.ref && o.customer === user.email);
    if (!order) return res.status(404).json({ error: 'Order haipatikani' });
    if (order.status === 'successful') return res.json({ success: true, status: 'successful' });

    const token = await getClickPesaToken();
    const cpRes = await fetch('https://api.clickpesa.com/third-parties/payments/' + req.params.ref, {
      headers: { 'Authorization': token }
    });
    const cpData = await cpRes.json();
    const found = Array.isArray(cpData) ? cpData.find(p => p.status === 'SUCCESS' || p.status === 'SETTLED') : null;
    if (found) {
      order.status = 'successful';
      order.confirmedAt = new Date().toISOString();
      writeJson('orders.json', orders);
      return res.json({ success: true, status: 'successful' });
    }
    res.json({ success: true, status: order.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════ 💵 MALIPO YA MANUAL (namba: 0786095758 — Amina Mwinyi) ═══════════

// Mteja anatuma ripoti ya malipo ya manual (inahitaji awe ameingia)
app.post('/api/manual-pay', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kutuma ripoti ya malipo' });

  const { items, total, txRef, phone } = req.body;
  if (!items || !items.length || !total) return res.status(400).json({ error: 'Kikapu ni tupu' });
  if (!txRef || !txRef.trim()) return res.status(400).json({ error: 'Andika namba ya muamala (tx ref) uliyopewa baada ya kutuma pesa' });

  const orders = readJson('orders.json', []);
  const orderRef = 'MANUAL-' + Date.now();
  orders.push({
    tx_ref: orderRef,
    customer: user.email,
    customerPhone: phone || '',
    manualTxRef: txRef.trim(),
    amount: total,
    items,
    status: 'pending_manual',
    date: new Date().toISOString()
  });
  writeJson('orders.json', orders);
  logSecurity('MANUAL_PAYMENT_SUBMITTED', 'Ripoti ya malipo manual kutoka ' + user.email, 'LOW', getIP(req));

  res.json({ success: true, message: '✅ Ripoti imepokelewa! Admin atathibitisha malipo yako hivi karibuni. Angalia "My Orders" baadaye.', tx_ref: orderRef });
});

// Admin: thibitisha malipo ya manual
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
  logSecurity('MANUAL_PAYMENT_CONFIRMED', 'Admin amethibitisha malipo: ' + tx_ref, 'LOW', getIP(req));
  res.json({ success: true, message: '✅ Malipo yamethibitishwa. Mteja ataona bidhaa yake kwenye My Orders.' });
});

// Admin: kataa/futa ripoti ya malipo ya manual isiyo sahihi
app.post('/api/admin/orders/reject', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { tx_ref } = req.body;
  const orders = readJson('orders.json', []);
  const filtered = orders.filter(o => o.tx_ref !== tx_ref);
  writeJson('orders.json', filtered);
  res.json({ success: true });
});

// Mteja: angalia oda zake mwenyewe (My Orders)
app.get('/api/my-orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = readJson('orders.json', []);
  const mine = orders.filter(o => o.customer === user.email).slice().reverse();
  res.json({ success: true, orders: mine });
});


async function askGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return 'GEMINI_API_KEY haijawekwa kwenye .env. Weka kwanza.';
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + key, {
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
    if (data.error) return 'AI error: ' + data.error.message;
    return 'Samahani, AI haikujibu. Jaribu tena.';
  } catch (err) {
    console.error(err);
    return 'Hitilafu ya mtandao kwenye AI. Jaribu tena.';
  }
}

// ===== CHAT YA WATEJA (hakuna login inahitajika) =====
app.post('/api/ai/chat', async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Andika ujumbe' });

  const products = Object.values(readJson('products.json', {}));
  const productList = products.length
    ? products.map(p => p.name + ' (' + (p.type || 'Bidhaa') + ') - ' + Number(p.price).toLocaleString() + ' TZS' + (p.downloadLink ? ' [inadownload moja kwa moja]' : ' [Steam key/account]')).join('\n')
    : 'Hakuna bidhaa bado kwenye duka';

  let transcript = '';
  if (Array.isArray(history) && history.length) {
    transcript = '\n\nMazungumzo ya awali (kwa muktadha, usirudie kujitambulisha):\n' +
      history.map(h => (h.role === 'user' ? 'Mteja: ' : 'Wewe: ') + h.text).join('\n') + '\n';
  }

  const prompt = 'Wewe ni msaidizi wa duka la gaming la Tanzania liitwalo GameHub.\n' +
    'Unaweza kusaidia wateja kwa Kiswahili au Kiingereza.\n\n' +
    'MUHIMU — KANUNI ZA USAHIHI:\n' +
    '- Jibu tu kutokana na taarifa halisi zilizopo hapa chini. Usibuni bei, huduma, au njia za kucheza zisizotajwa.\n' +
    '- GameHub HAITOI wala HAIPENDEKEZI emulator za watu wengine (kama Winlator, n.k.) au njia nyingine za "kupiga" mfumo wa malipo ya games. Njia PEKEE ya kucheza bila kudownload/kununua PC ni kukodi muda kwenye GeForce NOW (rental yetu).\n' +
    '- Bidhaa zenye "[inadownload moja kwa moja]" ni games za kudownload wenyewe baada ya malipo (link inatolewa My Orders). Bidhaa zenye "[Steam key/account]" zinahitaji Steam.\n' +
    '- Kama mteja anauliza kitu nje ya huduma zetu, sema wazi hatutoi hilo, usijaribu "kusaidia" kwa kubuni jibu.\n\n' +
    'Bidhaa zinazopatikana:\n' + productList + '\n\n' +
    'Bei za kukodi muda wa kucheza (GeForce NOW — njia pekee ya kucheza bila kununua/kudownload):\n' +
    '- Dakika 20 = 300 TZS\n' +
    '- Dakika 50 = 500 TZS\n' +
    '- Masaa 2 = 1,000 TZS\n' +
    '(Muda mwingine wowote: mfumo unakokotoa bei kwa kanuni ya bei nafuu zaidi kwa dakika — mteja anaweka muda anaotaka kwenye ukurasa wa Rental.)\n\n' +
    'Malipo: M-Pesa (Vodacom), Tigo Pesa, Airtel Money, HaloPesa kupitia ClickPesa (automatic), au malipo ya moja kwa moja (manual) kwa namba tuliyotoa kwenye checkout.\n' +
    'Baada ya malipo, bidhaa/download link inapatikana kwenye "My Orders".\n' +
    transcript +
    '\nJibu kwa ufupi, kirafiki na kwa lugha rahisi. Mteja anasema sasa: "' + message + '"';

  const reply = await askGemini(prompt);
  res.json({ reply });
});

// ===== AMRI ZA ADMIN (wewe pekee!) =====
app.post('/api/ai/admin', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });

  const { command } = req.body;
  if (!command || !command.trim()) return res.status(400).json({ error: 'Andika amri' });

  const lower = command.toLowerCase();

  const addMatch = lower.match(/ongeza\s+(?:game|bidhaa|product)?\s*(.+?)\s+bei\s+(\d+)/i)
    || lower.match(/ongeza\s+(?:game|bidhaa|product)?\s*(.+?)\s+(\d{3,})/i);
  if (addMatch) {
    const name = addMatch[1].trim();
    const price = Number(addMatch[2]);
    const products = readJson('products.json', {});
    const id = 'p' + Date.now();
    products[id] = { id: id, name: name, type: 'Game', price: price, emoji: '🎮', desc: 'Imeongezwa na AI ya admin' };
    writeJson('products.json', products);
    return res.json({ reply: '✅ Nimeongeza "' + name + '" kwa bei ' + price.toLocaleString() + ' TZS kwenye duka.' });
  }

  const delMatch = lower.match(/futa\s+(?:bidhaa|game|product)?\s*(.+)/i);
  if (delMatch) {
    const name = delMatch[1].trim().toLowerCase();
    const products = readJson('products.json', {});
    const found = Object.values(products).find(p => p.name.toLowerCase().includes(name));
    if (found) {
      delete products[found.id];
      writeJson('products.json', products);
      return res.json({ reply: '🗑️ Nimefuta "' + found.name + '" kwenye duka.' });
    }
    return res.json({ reply: 'Siipati bidhaa hiyo kwenye duka. Angalia jina.' });
  }

  if (/(mauzo|sales|mapato|income|orders)/.test(lower)) {
    const orders = readJson('orders.json', []);
    const total = orders.reduce((t, o) => t + (o.amount || 0), 0);
    return res.json({ reply: '📦 Mauzo yote: ' + orders.length + ' orders. Jumla ya mapato: ' + total.toLocaleString() + ' TZS.' });
  }

  if (/(wateja|customers|users)/.test(lower)) {
    const users = readJson(usersFile, {});
    const list = Object.values(users).map(u => u.name + ' (' + u.email + ')' + (u.isAdmin ? ' 👑' : '')).join('\n') || 'Hakuna wateja bado';
    return res.json({ reply: '👥 Wateja: ' + Object.keys(users).length + '\n' + list });
  }

  if (/(bidhaa|products)/.test(lower)) {
    const products = Object.values(readJson('products.json', {}));
    if (!products.length) return res.json({ reply: 'Duka halina bidhaa bado.' });
    return res.json({ reply: '🎮 Bidhaa zote:\n' + products.map(p => p.emoji + ' ' + p.name + ' - ' + Number(p.price).toLocaleString() + ' TZS').join('\n') });
  }

  if (/(request|ombi|maombi)/.test(lower)) {
    const requests = readJson('requests.json', []).slice().sort((a, b) => b.votes - a.votes);
    if (!requests.length) return res.json({ reply: 'Hakuna maombi ya games bado.' });
    return res.json({ reply: '🔍 Maombi ya games (kwa kura):\n' + requests.map(r => r.name + ' — kura ' + r.votes).join('\n') });
  }

  const stats = readJson('orders.json', []);
  const productsCount = Object.keys(readJson('products.json', {})).length;
  const prompt = 'Wewe ni msaidizi wa AI wa Admin wa duka la gaming GameHub (Tanzania).\n' +
    'Mauzo: ' + stats.length + ' orders. Bidhaa: ' + productsCount + '.\n' +
    'Admin ameuliza: "' + command + '"\n' +
    'Msaidi: jibu kwa Kiswahili kwa ufupi, toa ushauri wa biashara. Ukibaini amri ya kuongeza bidhaa mwambie atumie maneno: "ongeza game JINA bei BEI" (mfano: ongeza game FIFA 26 bei 50000).';

  const reply = await askGemini(prompt);
  res.json({ reply });
});

// Server inaanza — rudisha data kutoka Supabase KWANZA (kama imewekwa)
restoreFromSupabase()
  .catch(err => console.error('☁️ Imeshindwa kurudisha data kutoka Supabase:', err.message))
  .finally(() => {
    const listener = app.listen(process.env.PORT || 3000, () => {
      console.log('🎮 GameHub iko live kwenye port', listener.address().port);
    });
  });
