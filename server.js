require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

// 🎬 MEDIA STORAGE
const MEDIA_DIR = path.join(__dirname, 'uploads');
const TMP_MEDIA_DIR = path.join(MEDIA_DIR, 'tmp');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(TMP_MEDIA_DIR)) fs.mkdirSync(TMP_MEDIA_DIR, { recursive: true });
app.use('/uploads', express.static(MEDIA_DIR));

const upload = multer({
  dest: TMP_MEDIA_DIR,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const ok = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/mov'].includes(mime)
      || /\.(mp4|webm|mov|m4v)$/.test(name);
    if (!ok) return cb(new Error('Aina ya file hairuhusiwi. Tumia MP4, WebM, MOV au M4V.'));
    cb(null, true);
  }
});

const MEDIA_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'gamehub-media';

/* LGZ-PATCH v1 — msimbo wa LIFEISGAMETZ (Free games, links, codes, upload, coupons, AI) */
const GAMES_BUCKET = process.env.SUPABASE_GAMES_BUCKET || 'gamehub-games';
const GAME_EXT = /\.(apk|xapk|apks|obb|zip|rar|7z|iso|exe|msi|pkg|nsp|xci|cia|cso|pbp|bin|dmg)$/i;
const cleanFile = f => (f && typeof f.path === 'string' && /^games\/[A-Za-z0-9._-]+$/.test(f.path))
  ? { path: f.path, name: String(f.name || 'game').slice(0, 200), size: Number(f.size) || 0 } : null;
async function ensureGamesBucket() {
  if (!supabase) return;
  try {
    const { data } = await supabase.storage.getBucket(GAMES_BUCKET);
    if (data) return;
    const c = await supabase.storage.createBucket(GAMES_BUCKET, { public: false });
    if (c.error && !/already exists|duplicate/i.test(c.error.message || '')) console.warn('Games bucket:', c.error.message);
  } catch (e) { console.warn('Games bucket:', e.message); }
}
const cleanLinks = a => (Array.isArray(a) ? a : [])
  .filter(l => l && /^https?:\/\//i.test(String(l.u)))
  .slice(0, 20)
  .map(l => ({ l: String(l.l || 'Link').slice(0, 60), u: String(l.u).slice(0, 2000) }));
const cleanCodes = a => (Array.isArray(a) ? a : []).map(x => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 500);
// Bei inahesabiwa na SERVER, si na browser
function priceItems(items) {
  const products = readJson('products.json', {});
  const list = Object.values(products);
  let total = 0; const clean = [], soldOut = [];
  for (const i of (Array.isArray(items) ? items : [])) {
    const p = products[i.id] || list.find(x => x.name === i.name);
    if (!p || p.status === 'Draft' || p.free) continue;
    const q = Math.max(1, Math.min(10, parseInt(i.quantity || i.qty || 1, 10) || 1));
    if (p.unique && p.reservation && p.reservation.until > Date.now()) { soldOut.push(p.name + ' (imehifadhiwa kwa mnunuzi mwingine, jaribu tena baadaye)'); continue; }
    if (p.usesCodes && (p.codes || []).length < q) { soldOut.push(p.name); continue; }
    clean.push({ id: p.id, name: p.name, price: p.price, quantity: q });
    total += p.price * q;
  }
  return { items: clean, total, soldOut };
}
function applyCoupon(total, code) {
  if (!code) return { total, code: '' };
  const coupons = readJson('coupons.json', {});
  const c = coupons[String(code).trim().toUpperCase()];
  if (!c || !c.active || (c.maxUses && c.uses >= c.maxUses)) throw new Error('Kodi si sahihi au imeisha');
  const pct = Math.min(90, Math.max(1, Number(c.percentOff) || 0));
  c.uses += 1; writeJson('coupons.json', coupons);
  return { total: Math.max(1, Math.round(total * (100 - pct) / 100)), code: c.code };
}
const aiRate = new Map();
function aiHit(ip) {
  const now = Date.now();
  const hits = (aiRate.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 8) return false;
  hits.push(now); aiRate.set(ip, hits); return true;
}
function aiLimit(req, res, next) {
  if (!aiHit(getIP(req))) return res.status(429).json({ error: 'Subiri kidogo kabla ya swali lingine.' });
  next();
}
function fulfillOrder(order) {
  if (order.delivered) return;
  const products = readJson('products.json', {});
  const delivered = [];
  for (const i of order.items || []) {
    const p = products[i.id];
    if (!p || !p.usesCodes) continue;
    for (let n = 0; n < (i.quantity || 1); n++) delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null }); p.reservation = null;
      if (p.squadId) creditSquadSale(order, p, i);
  }
  order.delivered = delivered;
  writeJson('products.json', products);
}
const pubProduct = p => ({ ...p, codes: undefined, file: undefined, hasFile: !!p.file, fileName: p.file ? p.file.name : '', fileSize: p.file ? p.file.size : 0, stock: (p.codes || []).length });

/* LGZ-PATCH v2 — squads salama, biashara/washirika, AI mwalimu */
// Usimbaji wa credentials (AES-256-GCM). Weka SQUAD_KEY (herufi ndefu za siri) kwenye Render na uihifadhi mahali salama.
const SQUAD_KEY = process.env.SQUAD_KEY ? crypto.createHash('sha256').update(process.env.SQUAD_KEY).digest() : null;
function enc(text) {
  if (!SQUAD_KEY) throw new Error('SQUAD_KEY haijawekwa kwenye Render — squads haziwezi kuhifadhiwa kwa usalama.');
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', SQUAD_KEY, iv);
  const e = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'ENC:' + Buffer.concat([iv, c.getAuthTag(), e]).toString('base64');
}
function dec(s) {
  if (typeof s !== 'string' || !s.startsWith('ENC:')) return s;
  if (!SQUAD_KEY) return null;
  try {
    const b = Buffer.from(s.slice(4), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', SQUAD_KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return null; }
}
function reserveUnique(items, ref, minutes) {
  const products = readJson('products.json', {}); let ch = false;
  for (const i of items || []) { const p = products[i.id]; if (p && p.unique) { p.reservation = { ref, until: Date.now() + minutes * 60000 }; ch = true; } }
  if (ch) writeJson('products.json', products);
}
function releaseReserved(ref) {
  const products = readJson('products.json', {}); let ch = false;
  Object.values(products).forEach(p => { if (p.reservation && p.reservation.ref === ref) { p.reservation = null; ch = true; } });
  if (ch) writeJson('products.json', products);
}
const imgUrls = a => (Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(x => /^https?:\/\//i.test(x)).slice(0, 6).map(x => x.slice(0, 1000));
const clip = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().slice(0, n);
function publishSquad(s, email, password) {
  const products = readJson('products.json', {});
  const id = 'sq' + Date.now() + crypto.randomBytes(2).toString('hex');
  products[id] = { id, name: s.title, type: 'eFootball Squad', platform: 'Android', category: 'eFootball Squad', section: 'shop',
    price: s.price, oldPrice: 0, free: false, status: 'Active', emoji: '⚽', desc: s.desc, imageUrl: (s.proofs || [])[0] || '',
    proofs: s.proofs || [], stats: s.stats || '', unique: true, usesCodes: true, reservation: null, squadId: s.id,
    codes: [enc('Gmail: ' + email + '\nPassword: ' + password)], links: [], downloadLink: '', trailerUrl: '', accountUser: '', accountPassword: '', file: null };
  writeJson('products.json', products);
  return id;
}
const inqRate = new Map();
function inqAllowed(ip) {
  const now = Date.now(), a = (inqRate.get(ip) || []).filter(t => now - t < 3600000);
  if (a.length >= 3) return false;
  a.push(now); inqRate.set(ip, a); return true;
}

// ☁️ SUPABASE CLIENT SETUP
let supabase = null;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('☁️ Supabase imeunganishwa — data itahifadhiwa kudumu.');
} else {
  console.log('⚠️ Supabase HAIJAWEKWA — data itapotea kila deploy mpya kwenye Render free tier!');
}

async function ensureMediaBucket() {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.storage.getBucket(MEDIA_BUCKET);
    if (!error && data) return true;
    const created = await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    if (created.error && !/already exists|duplicate/i.test(created.error.message || '')) {
      console.warn('⚠️ Supabase Storage bucket:', created.error.message);
      return false;
    }
    console.log('☁️ Supabase Storage bucket iko tayari: ' + MEDIA_BUCKET);
    return true;
  } catch (e) {
    console.warn('⚠️ Storage bucket check:', e.message);
    return false;
  }
}

async function saveUploadedVideo(file, folder) {
  if (!file) throw new Error('Chagua video kwanza.');
  const ext = path.extname(file.originalname || '') || '.mp4';
  const safeBase = (path.basename(file.originalname || 'video', ext).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'video');
  const filename = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safeBase + ext.toLowerCase();
  const objectPath = folder + '/' + filename;
  const localPath = file.path;
  try {
    if (supabase) {
      try {
        const buffer = fs.readFileSync(localPath);
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(objectPath, buffer, {
          contentType: file.mimetype || 'video/mp4', upsert: false, cacheControl: '3600'
        });
        if (!error) {
          const pub = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(objectPath);
          return { url: pub.data.publicUrl, storage: 'supabase', path: objectPath, filename };
        }
        console.warn('⚠️ Supabase Storage upload failed:', error.message);
        throw new Error('Supabase Storage imekataa upload: ' + error.message + '. Hakikisha bucket ' + MEDIA_BUCKET + ' ipo na ukubwa wa file unaruhusiwa.');
      } catch (e) {
        if (e.message && e.message.startsWith('Supabase Storage imekataa')) throw e;
        throw new Error('Supabase Storage imekataa upload: ' + e.message);
      }
    }
    const targetDir = path.join(MEDIA_DIR, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    const target = path.join(targetDir, filename);
    fs.renameSync(localPath, target);
    return { url: '/uploads/' + folder + '/' + filename, storage: 'local', path: target, filename };
  } finally {
    try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch (e) {}
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Canonical page compatibility routes. The project stores the HTML files at the
// project root, while older sitemap/docs use /user/* and /admin/* paths.
const USER_PAGE_ALIASES = {
  'home':'index.html','store':'store.html','games':'games.html','psp-gaming':'psp-gaming.html',
  'ps2-gaming':'ps2-gaming.html','ps3-gaming':'ps3-gaming.html','winlator-gamehub':'winlator-gamehub.html',
  'nintendo-switch':'nintendo-switch.html','android-gaming':'android-gaming.html','pc-gaming':'pc-gaming.html',
  'movies':'movies.html','live-tv-esports':'live-tv-esports.html','live-scores':'live-scores.html',
  'tournament':'tournament.html','betting':'betting.html','academy':'academy.html','courses':'courses.html',
  'cloud-gaming':'cloud-gaming.html','efootball-topup':'efootball-topup.html','gift-cards':'gift-cards.html',
  'community-chat':'community-chat.html','health-assistant':'health-assistant.html','ai-assistant':'ai-assistant.html',
  'marketplace':'marketplace.html','wishlist':'wishlist.html','cart':'cart.html','my-games-library':'my-games-library.html',
  'profile':'profile.html','login':'login.html','register':'register.html','product-details':'product-details.html',
  'checkout':'checkout.html','live-football-watch':'live-football-watch.html','live-movies-player':'live-movies-player.html',
  'game-trailer':'game-trailer.html','sports-tv':'sports-tv.html','sports-news':'sports-news.html',
  'my-orders':'my-orders.html','requests-transactions':'requests-transactions.html','contact-support':'contact-support.html',
  'faq-help':'faq-help.html'
};
const ADMIN_PAGE_ALIASES = {
  'dashboard':'dashboard.html','games-management':'games-management.html','products-management':'products-management.html',
  'movies-management':'movies-management.html','trailers-management':'trailers-management.html','hero-homepage-management':'hero-homepage-management.html',
  'live-matches-management':'live-matches-management.html','efootball-topup-management':'efootball-topup-management.html',
  'cloud-gaming-management':'cloud-gaming-management.html','gift-cards-management':'gift-cards-management.html',
  'marketplace-management':'marketplace-management.html','users-management':'users-management.html','orders-sales':'orders-sales.html',
  'coupons-discounts':'coupons-discounts.html','withdraw-requests':'withdraw-requests.html','support-tickets':'support-tickets.html',
  'courses-management':'courses-management.html','lessons-videos-management':'lessons-videos-management.html','students-management':'students-management.html',
  'sports-tv-management':'sports-tv-management.html','sports-news-management':'sports-news-management.html',
  'analytics':'analytics.html','reports':'reports.html','storage-server':'storage-server.html','settings':'settings.html'
};
function servePageAlias(map, req, res) {
  const key = String(req.params.page || '').replace(/\.html$/i, '').toLowerCase();
  const file = map[key];
  if (!file) return res.status(404).send('Page haipatikani.');
  res.sendFile(path.join(__dirname, file));
}
app.get('/user/:page', (req,res) => servePageAlias(USER_PAGE_ALIASES, req, res));
app.get('/admin/:page', (req,res) => servePageAlias(ADMIN_PAGE_ALIASES, req, res));
app.get('/user/:page.html', (req,res) => servePageAlias(USER_PAGE_ALIASES, req, res));
app.get('/admin/:page.html', (req,res) => servePageAlias(ADMIN_PAGE_ALIASES, req, res));

// 📁 HIFADHI YA DATA
const DATA_DIR = path.join(__dirname, '.data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const TRACKED_FILES = [
  'users.json', 'sessions.json', 'products.json',
  'orders.json', 'requests.json', 'security.json',
  'marketplace.json', 'coupons.json', 'reviews.json',
  'matches.json', 'tournaments.json', 'live_streams.json',
  'courses.json', 'movies.json', 'media.json',
  'ai_builder_runs.json', 'banners.json', 'settings.json',
  'public_chat.json', 'health_chats.json', 'boss_approvals.json', 'squads.json', 'inquiries.json', 'payouts.json', 'withdrawals.json', 'news.json', 'tickets.json'
];

function readJson(file, fallback) {
  try {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { return fallback; }
}

async function writeJson(file, data) {
  const filePath = path.join(DATA_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  if (!supabase) return { local: true, cloud: false };
  try {
    const { error } = await supabase.from(process.env.SUPABASE_KV_TABLE || 'kv_store').upsert({
      file_name: file, data, updated_at: new Date().toISOString()
    });
    if (error) { console.error('☁️ Supabase backup error (' + file + '):', error.message); return { local: true, cloud: false, error: error.message }; }
    return { local: true, cloud: true };
  } catch (err) { console.error('☁️ Supabase backup error (' + file + '):', err.message); return { local: true, cloud: false, error: err.message }; }
}

async function restoreFromSupabase() {
  if (!supabase) return;
  for (const file of TRACKED_FILES) {
    try {
      const { data, error } = await supabase.from(process.env.SUPABASE_KV_TABLE || 'kv_store').select('data').eq('file_name', file).maybeSingle();
      if (!error && data && data.data !== undefined) {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data.data, null, 2));
        console.log('☁️ Imerudishwa kutoka Supabase: ' + file);
      }
    } catch (err) { console.error('☁️ Supabase restore error (' + file + '):', err.message); }
  }
}

function ensureTournamentSeed() {
  const current = readJson('tournaments.json', null);
  if (!Array.isArray(current)) {
    writeJson('tournaments.json', [
      { id: 't1', name: 'GameHub eFootball Cup', game: 'eFootball', date: 'Tarehe itawekwa', status: 'OPEN', description: 'Mashindano ya eFootball kwa community ya GameHub.', registrations: [] },
      { id: 't2', name: 'GameHub FC Challenge', game: 'EA SPORTS FC', date: 'Tarehe itawekwa', status: 'OPEN', description: 'Challenge ya football gaming.', registrations: [] }
    ]);
  }
}

// 💬 PUBLIC COMMUNITY CHAT
const publicChatRate = new Map();
function cleanPublicText(value, max) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/<[^>]*>/g, '').trim().slice(0, max);
}
function publicChatAllowed(ip) {
  const now = Date.now();
  const last = publicChatRate.get(ip) || 0;
  if (now - last < 3500) return false;
  publicChatRate.set(ip, now);
  return true;
}

app.get('/api/public-chat/messages', (req, res) => {
  const messages = readJson('public_chat.json', []);
  res.json({ success: true, messages: Array.isArray(messages) ? messages.slice(-100) : [] });
});

app.post('/api/public-chat/messages', async (req, res) => {
  const ip = getIP(req);
  if (!publicChatAllowed(ip)) return res.status(429).json({ error: 'Tafadhali subiri sekunde chache kabla ya kutuma ujumbe mwingine.' });
  const name = cleanPublicText(req.body?.name, 32) || 'Mgeni';
  const message = cleanPublicText(req.body?.message, 500);
  if (!message) return res.status(400).json({ error: 'Andika ujumbe kwanza.' });
  const wantsAI = /^@ai\b/i.test(message);
  if (wantsAI && !aiHit(ip)) return res.status(429).json({ error: 'AI imechoka kidogo — jaribu tena baada ya dakika moja.' });
  const messages = readJson('public_chat.json', []);
  const row = { id: 'chat_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'), name, message, time: new Date().toISOString() };
  messages.push(row);
  if (wantsAI) {
    const q = message.replace(/^@ai\b[\s,:]*/i, '').slice(0, 500) || 'Habari';
    const recent = messages.slice(-7, -1).map(m => m.name + ': ' + String(m.message).slice(0, 150)).join('\n');
    const prompt = `Wewe ni "AI", msaidizi ndani ya chat ya jamii ya LIFEISGAMETZ (Tanzania).
Jibu swali lolote kwa usahihi, liwe la gaming au la (elimu, teknolojia, maisha, n.k.).
Jibu kwa lugha aliyotumia muulizaji, kwa ufupi (sentensi 2-6).
Kama hujui au huna uhakika, sema hivyo wazi — usibuni majibu.
Kwa mambo ya afya, sheria au fedha toa taarifa za jumla pamoja na tahadhari.
Kataa kwa heshima maombi hatari au haramu.
Mazungumzo ya karibuni (kwa muktadha tu):
${recent}
Swali la ${name}: ${q}`;
    const reply = await askAI(prompt, process.env.NEXUS_COMMUNITY_PROVIDER);
    messages.push({ id: 'chat_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'), name: 'AI 🤖', message: String(reply).replace(/<[^>]*>/g, '').trim().slice(0, 1500), isAi: true, time: new Date().toISOString() });
  }
  await writeJson('public_chat.json', messages.slice(-300));
  res.json({ success: true, message: row });
});

app.delete('/api/admin/public-chat/:id', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const messages = readJson('public_chat.json', []);
  const filtered = messages.filter(x => x.id !== req.params.id);
  await writeJson('public_chat.json', filtered);
  res.json({ success: true });
});

// 🔐 PASSWORD SALAMA
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  return crypto.scryptSync(password, salt, 64).toString('hex') === hash;
}

// 🛑 ULINZI WA LOGIN
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

// 🛡️ HACKERAI — SECURITY MODULE
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

// ═══════════ 🛡️ IMPROVED isSuspicious — Ruhusu URLs ndefu ═══════════
// Ruhusu URLs za Google Drive, YouTube, n.k. — angalia SQL/XSS halisi pekee
function isSuspicious(input) {
  if (!input || typeof input !== 'string') return false;
  
  // Ruhusu URLs ndefu (hadi 2000 chars) — kwa Google Drive, YouTube, n.k.
  if (input.length > 2000) return true;
  
  // Angalia TU patterns za SQL injection na XSS halisi
  // (Ondoa ' | " | -- | ; kwa sababu URLs zina hizi)
  const patterns = /(union\s+select|insert\s+into|drop\s+table|delete\s+from|update\s+.*\s+set|<\s*script|javascript:|onerror\s*=|onload\s*=|<iframe|<embed|<object)/i;
  return patterns.test(input);
}

// ═══════════ 🛡️ IMPROVED /api middleware — Whitelist URL fields ═══════════
app.use('/api', (req, res, next) => {
  const ip = getIP(req);
  const data = readJson(securityFile, { events: [], blocked: {} });
  const blocked = data.blocked || {};
  if (blocked[ip] && blocked[ip] > Date.now()) {
    logSecurity('BLOCKED_REQUEST', 'IP iliyofungwa ilijaribu kuingia tena', 'MEDIUM', ip);
    return res.status(403).json({ error: 'IP yako imefungwa. Wasiliana na admin.' });
  }

  // ✅ Fields zinazoruhusiwa URLs ndefu (downloadLink, imageUrl, trailerUrl, n.k.)
  const URL_FIELDS = [
    'downloadLink', 'imageUrl', 'trailerUrl', 'videoUrl', 'streamUrl', 
    'poster', 'thumbnail', 'buttonUrl', 'url', 'image'
  ];

  const checkItems = [req.body, req.query];
  for (const obj of checkItems) {
    if (!obj) continue;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val !== 'string') continue;

      // Ruka URL fields kwenye kikomo cha urefu
      if (URL_FIELDS.includes(key)) {
        if (val.length > 2000) {
          logSecurity('URL_TOO_LONG', 'URL ndefu sana katika: "' + key + '"', 'MEDIUM', ip);
          return res.status(400).json({ error: 'URL ni ndefu sana.' });
        }
        continue; // Ruka SQL/XSS check kwa URL fields
      }

      // Angalia SQL/XSS kwa fields nyingine zote
      if (isSuspicious(val)) {
        logSecurity('SQLI_XSS', 'Input ya mashaka katika: "' + key + '"', 'HIGH', ip);
        blockIP(ip, 30);
        return res.status(400).json({ error: 'Input haikubaliki.' });
      }
    }
  }
  next();
});

// 👤 USERS + SESSIONS
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
    balance: 0, adminEarnings: 0, created: new Date().toISOString()
  };
  writeJson(usersFile, users);
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJson(sessionsFile, {});
  sessions[token] = cleanEmail;
  writeJson(sessionsFile, sessions);
  res.json({ success: true, token, user: { name: name.trim(), email: cleanEmail, isAdmin: users[cleanEmail].isAdmin, isStaff: false } });
});

app.get('/api/auth/social/config', (req, res) => {
  res.json({ success: true, enabled: !!(SUPABASE_URL && SUPABASE_ANON_KEY), url: SUPABASE_URL || '', anonKey: SUPABASE_ANON_KEY || '' });
});

app.post('/api/auth/social/complete', async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Social login haijawekwa. Weka SUPABASE_URL na SUPABASE_SERVICE_ROLE_KEY.' });
    const accessToken = String(req.body.accessToken || '').trim();
    const provider = String(req.body.provider || '').trim().toLowerCase();
    if (!accessToken || !['google','facebook','apple'].includes(provider)) return res.status(400).json({ error: 'Provider au access token si sahihi.' });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.email) return res.status(401).json({ error: 'Social account haikuthibitishwa.' });
    const authUser = data.user;
    const email = String(authUser.email).trim().toLowerCase();
    const meta = authUser.user_metadata || {};
    const displayName = String(meta.full_name || meta.name || [meta.first_name, meta.last_name].filter(Boolean).join(' ') || email.split('@')[0]).trim();
    const users = readJson(usersFile, {});
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@gamehub.co.tz').toLowerCase();
    if (!users[email]) {
      users[email] = { name: displayName || 'LIFEISGAMETZ User', email, phone: '', password: null, authProvider: provider, providerId: authUser.id, isAdmin: email === adminEmail, isStaff: false, balance: 0, adminEarnings: 0, created: new Date().toISOString() };
      writeJson(usersFile, users);
    } else {
      users[email].authProvider = users[email].authProvider || provider;
      users[email].providerId = users[email].providerId || authUser.id;
      if (!users[email].name || users[email].name === email.split('@')[0]) users[email].name = displayName;
      writeJson(usersFile, users);
    }
    const token = crypto.randomBytes(24).toString('hex');
    const sessions = readJson(sessionsFile, {});
    sessions[token] = email;
    writeJson(sessionsFile, sessions);
    const user = users[email];
    res.json({ success:true, token, user:{ name:user.name, email:user.email, isAdmin:!!user.isAdmin, isStaff:!!user.isStaff, provider } });
  } catch (e) { console.error('Social login:', e); res.status(500).json({ error: 'Social login imeshindikana.' }); }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const ip = getIP(req);
  if (!cleanEmail || !password) return res.status(400).json({ error: 'Jaza email na password' });
  if (isBlocked(cleanEmail) || isBlocked(ip)) return res.status(429).json({ error: 'Jaribio nyingi. Subiri dakika ' + BLOCK_MINUTES + '.' });
  const users = readJson(usersFile, {});
  const user = users[cleanEmail];
  if (!user || !user.password || !verifyPassword(password, user.password)) {
    recordFail(cleanEmail); recordFail(ip);
    if ((loginAttempts.get(ip) || {}).count >= MAX_ATTEMPTS) { blockIP(ip, 60); logSecurity('BRUTE_FORCE', 'Majaribio mengi ya kuingia kutoka IP ' + ip, 'HIGH', ip); }
    return res.status(401).json({ error: 'Email au password si sahihi' });
  }
  loginAttempts.delete(cleanEmail);
  const token = crypto.randomBytes(24).toString('hex');
  const sessions = readJson(sessionsFile, {});
  sessions[token] = cleanEmail;
  writeJson(sessionsFile, sessions);
  res.json({ success: true, token, user: { name: user.name, email: user.email, isAdmin: user.isAdmin, isStaff: !!user.isStaff } });
});

app.get('/api/auth/me', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Huna token au token si sahihi' });
  res.json({ success: true, user: { name: user.name, email: user.email, phone: user.phone || '', created: user.created || null, balance: user.balance || 0, adminEarnings: user.adminEarnings || 0, isAdmin: !!user.isAdmin, isStaff: !!user.isStaff } });
});

app.put('/api/auth/profile', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Tafadhali ingia kwanza.' });
  const users = readJson(usersFile, {});
  const email = String(user.email || '').trim().toLowerCase();
  const current = users[email];
  if (!current) return res.status(404).json({ error: 'Akaunti haikupatikana.' });
  const name = String(req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Jina liwe na angalau herufi 2.' });
  if (name.length > 80) return res.status(400).json({ error: 'Jina ni refu sana.' });
  if (phone.length > 30) return res.status(400).json({ error: 'Namba ya simu si sahihi.' });
  current.name = name; current.phone = phone;
  users[email] = current;
  writeJson(usersFile, users);
  res.json({ success: true, user: { name: current.name, email: current.email, phone: current.phone || '', balance: current.balance || 0, isAdmin: !!current.isAdmin, isStaff: !!current.isStaff } });
});

app.post('/api/auth/change-password', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Tafadhali ingia kwanza.' });
  const oldPassword = String(req.body?.oldPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ error: 'Jaza password zote.' });
  if (!user.password || !verifyPassword(oldPassword, user.password)) return res.status(400).json({ error: 'Password ya sasa si sahihi.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password mpya iwe na angalau herufi 6.' });
  if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Password mpya hazifanani.' });
  if (newPassword === oldPassword) return res.status(400).json({ error: 'Tumia password mpya tofauti na ya zamani.' });
  const users = readJson(usersFile, {});
  const email = String(user.email || '').trim().toLowerCase();
  if (!users[email]) return res.status(404).json({ error: 'Akaunti haikupatikana.' });
  users[email].password = hashPassword(newPassword);
  writeJson(usersFile, users);
  res.json({ success: true, message: 'Password imebadilishwa kikamilifu.' });
});

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
  res.json({ success: true, message: makeStaff ? '✅ ' + cleanEmail + ' sasa ni Staff.' : '✅ ' + cleanEmail + ' si Staff tena.' });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization;
  if (token) { const sessions = readJson(sessionsFile, {}); delete sessions[token]; writeJson(sessionsFile, sessions); }
  res.json({ success: true });
});

app.get('/api/auth/promote', (req, res) => {
  const { email, key } = req.query;
  if (!process.env.ADMIN_SETUP_KEY || key !== process.env.ADMIN_SETUP_KEY) return res.status(403).json({ error: 'Ufunguo si sahihi' });
  const users = readJson(usersFile, {});
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!users[cleanEmail]) return res.status(404).json({ error: 'Mtumiaji huyo hajapatikana. Jisajili kwanza kwenye tovuti.' });
  users[cleanEmail].isAdmin = true;
  writeJson(usersFile, users);
  res.json({ success: true, message: '✅ ' + cleanEmail + ' sasa ni Admin. Toka (logout) na uingie tena ili ibadilike.' });
});

// 🏆 KUKAMILISHA MECHI
async function completeMatchAndPayout(matchId, winnerUserId) {
  const matches = readJson('matches.json', []);
  const match = matches.find(m => m.id === matchId);
  if (!match || match.status === 'completed') return { success: false, error: 'Mechi haipatikani au imeshakamilika' };
  const totalPool = (match.entryFee || 0) * 2;
  const platformFee = totalPool * 0.10;
  const winnerPrize = totalPool - platformFee;
  match.status = 'completed'; match.winnerId = winnerUserId; match.platformCommission = platformFee; match.winnerPayout = winnerPrize;
  const users = readJson(usersFile, {});
  let winnerKey = Object.keys(users).find(k => k === winnerUserId || users[k].email === winnerUserId);
  if (winnerKey) users[winnerKey].balance = (users[winnerKey].balance || 0) + winnerPrize;
  let adminKey = Object.keys(users).find(k => users[k].isAdmin === true);
  if (adminKey) users[adminKey].adminEarnings = (users[adminKey].adminEarnings || 0) + platformFee;
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
  const match = { id: 'm_' + Date.now(), title: title.trim(), entryFee: Number(entryFee), player1Id: player1Id || '', player2Id: player2Id || '', status: 'pending', winnerId: null, platformCommission: 0, winnerPayout: 0, date: new Date().toISOString() };
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
  if (!result.success) return res.status(400).json({ error: result.error || 'Imeshindikana kukamilisha mechi' });
  res.json({ success: true, message: '✅ Mechi imekamilishwa na zawadi zimetolewa!', ...result });
});

// 🎮 BIDHAA (PRODUCTS)
app.get('/api/products', (req, res) => {
  const u = getUserByToken(req);
  const staff = !!(u && (u.isAdmin || u.isStaff));
  const list = Object.values(readJson('products.json', {})).filter(p => staff || p.status !== 'Draft');
  res.json({ success: true, products: list.map(p => staff || p.free ? pubProduct(p) : { ...pubProduct(p), downloadLink: '', accountUser: '', accountPassword: '', links: [] }) });
});

app.post('/api/products', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const b = req.body || {};
  const free = !!b.free;
  if (!b.name || (!free && !Number(b.price))) return res.status(400).json({ error: 'Jaza jina na bei (au chagua Free)' });
  const codes = cleanCodes(b.codes);
  const products = readJson('products.json', {});
  const id = 'p' + Date.now();
  products[id] = { id, name: String(b.name).slice(0, 160), type: b.type || 'Bidhaa', platform: String(b.platform || '').slice(0, 40),
    price: free ? 0 : Number(b.price), oldPrice: free ? 0 : Number(b.oldPrice || 0), free,
    status: b.status === 'Draft' ? 'Draft' : 'Active', emoji: b.emoji || '🎮', desc: String(b.desc || '').slice(0, 2000),
    downloadLink: b.downloadLink || '', imageUrl: b.imageUrl || '', trailerUrl: b.trailerUrl || '',
    category: b.category || 'Zote', section: b.section || 'shop',
    accountUser: b.accountUser || '', accountPassword: b.accountPassword || '',
    links: cleanLinks(b.links), codes, usesCodes: codes.length > 0, file: cleanFile(b.file) };
  const saved = await writeJson('products.json', products);
  res.json({ success: true, id, persistent: saved.cloud !== false });
});

app.put('/api/products/:id', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const products = readJson('products.json', {});
  const e = products[req.params.id];
  if (!e) return res.status(404).json({ error: 'Bidhaa haipatikani' });
  const b = req.body || {};
  const free = b.free !== undefined ? !!b.free : !!e.free;
  const pick = k => (b[k] !== undefined ? b[k] : e[k]);
  const newCodes = cleanCodes(b.codes);
  const newFile = b.removeFile ? null : (cleanFile(b.file) || e.file || null);
  if (e.file && (!newFile || newFile.path !== e.file.path) && supabase) supabase.storage.from(GAMES_BUCKET).remove([e.file.path]).catch(() => {});
  products[req.params.id] = { ...e, name: b.name || e.name, type: b.type || e.type, platform: pick('platform'),
    price: free ? 0 : (b.price !== undefined && b.price !== '' ? Number(b.price) : e.price),
    oldPrice: b.oldPrice !== undefined ? Number(b.oldPrice) || 0 : e.oldPrice, free,
    status: b.status ? (b.status === 'Draft' ? 'Draft' : 'Active') : (e.status || 'Active'),
    emoji: b.emoji || e.emoji, desc: pick('desc'), downloadLink: pick('downloadLink'), imageUrl: pick('imageUrl'),
    trailerUrl: pick('trailerUrl'), category: b.category || e.category || 'Zote', section: b.section || e.section || 'shop',
    accountUser: pick('accountUser'), accountPassword: pick('accountPassword'),
    links: b.links !== undefined ? cleanLinks(b.links) : (e.links || []),
    codes: newCodes.length ? [...(e.codes || []), ...newCodes] : (e.codes || []),
    usesCodes: !!e.usesCodes || newCodes.length > 0, file: newFile };
  const saved = await writeJson('products.json', products);
  res.json({ success: true, product: pubProduct(products[req.params.id]), persistent: saved.cloud !== false });
});

app.delete('/api/products/:id', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const products = readJson('products.json', {});
  const old = products[req.params.id];
  if (old && old.file && supabase) await supabase.storage.from(GAMES_BUCKET).remove([old.file.path]).catch(() => {});
  delete products[req.params.id];
  await writeJson('products.json', products);
  res.json({ success: true });
});

// 📊 ANALYTICS
app.get('/api/admin/analytics', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []).filter(o => o.status === 'successful');
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, label: d.toLocaleDateString('sw', { day: '2-digit', month: '2-digit' }), total: 0, count: 0 });
  }
  orders.forEach(o => { const key = (o.confirmedAt || o.date || '').slice(0, 10); const day = days.find(d => d.date === key); if (day) { day.total += (o.amount || 0); day.count += 1; } });
  const productSales = {};
  orders.forEach(o => (o.items || []).forEach(i => { const qty = Number(i.quantity || i.qty || 1); productSales[i.name] = (productSales[i.name] || 0) + qty; }));
  const topProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
  res.json({ success: true, days, topProducts });
});

app.get('/api/admin/backup', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const backup = { generatedAt: new Date().toISOString(), users: readJson(usersFile, {}), products: readJson('products.json', {}), orders: readJson('orders.json', []), requests: readJson('requests.json', []), matches: readJson('matches.json', []), security: readJson(securityFile, { events: [], blocked: {} }) };
  res.setHeader('Content-Disposition', 'attachment; filename="gamehub-backup-' + Date.now() + '.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

// 🏪 MARKETPLACE
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
  const listing = { id: 'm' + Date.now(), businessName, description: description || '', contact, imageUrl: imageUrl || '', category: category || 'Nyingine', date: new Date().toISOString() };
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

// 🎟️ DISCOUNT CODES
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
  res.json({ success: true, percentOff: c.percentOff, code: c.code });
});

// ⭐ MAONI NA RATING
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
  reviews[req.params.productId].push({ name: user.name, email: user.email, rating: r, comment: (comment || '').trim(), date: new Date().toISOString() });
  writeJson('reviews.json', reviews);
  res.json({ success: true, message: '✅ Asante kwa maoni yako!' });
});

// 📌 GAME REQUESTS
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
    if (!existing.voters.includes(user.email)) { existing.voters.push(user.email); existing.votes += 1; writeJson('requests.json', requests); return res.json({ success: true, message: 'Game hii tayari iko. Tumeongeza kura yako!' }); }
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
  if (item.voters.includes(user.email)) return res.json({ success: false, message: 'Umeshapiga kura kwenye game hii' });
  item.voters.push(user.email); item.votes += 1;
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

// 🧾 MAUZO & STATS (ADMIN)
app.get('/api/admin/orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []);
  res.json({ success: true, orders: orders.slice().reverse() });
});

app.get('/api/admin/overview', (req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const orders=readJson('orders.json',[]); const products=Object.values(readJson('products.json',{})); const users=Object.values(readJson(usersFile,{}));
  const paid=orders.filter(o=>o.status==='successful');
  const pending=orders.filter(o=>String(o.status||'').startsWith('pending'));
  const revenue=paid.reduce((n,o)=>n+Number(o.amount||0),0);
  const byMethod={}; paid.forEach(o=>{const k=o.provider||'Other';byMethod[k]=(byMethod[k]||0)+Number(o.amount||0)});
  const top={}; paid.forEach(o=>(o.items||[]).forEach(i=>{const k=i.name||'Bidhaa';top[k]=(top[k]||0)+(Number(i.quantity||i.qty)||1)}));
  res.json({success:true,revenue,paidOrders:paid.length,pendingOrders:pending.length,customers:users.filter(u=>!u.isAdmin).length,products:products.length,byMethod,topProducts:Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,8),recent:orders.slice().reverse().slice(0,20)});
});

app.get('/api/admin/users', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const users = readJson(usersFile, {});
  res.json({ success: true, users: Object.values(users).map(({ password, ...u }) => u) });
});

app.get('/api/admin/storage-status', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const table = process.env.SUPABASE_KV_TABLE || 'kv_store';
  if (!supabase) return res.json({success:true,persistent:false,provider:'Local .data only',warning:'Weka SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL na SUPABASE_SERVICE_ROLE_KEY kwenye Render ili data isifutike baada ya restart/deploy.',kvTable:table});
  try {
    const { error } = await supabase.from(table).select('file_name').limit(1);
    if (error) return res.json({success:true,persistent:false,provider:'Supabase configured but KV unavailable',warning:'Supabase imeunganishwa lakini table '+table+' haipatikani au RLS/permissions zimezuia server.',kvTable:table});
    res.json({success:true,persistent:true,provider:'Supabase KV + local cache',warning:null,kvTable:table});
  } catch(e) { res.json({success:true,persistent:false,provider:'Supabase error',warning:e.message,kvTable:table}); }
});

app.get('/api/admin/stats', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const orders = readJson('orders.json', []);
  const users = readJson(usersFile, {});
  const total = orders.reduce((t, o) => t + (o.amount || 0), 0);
  res.json({ success: true, stats: { orders: orders.length, total, customers: Object.keys(users).length, products: Object.keys(readJson('products.json', {})).length } });
});

// 🛡️ SECURITY ADMIN ENDPOINTS
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
  for (const ip in (data.blocked || {})) { if (data.blocked[ip] > now) activeBlocks[ip] = data.blocked[ip]; }
  res.json({ success: true, stats: { totalEvents: data.events.length, high: data.events.filter(e => e.severity === 'HIGH').length, medium: data.events.filter(e => e.severity === 'MEDIUM').length, low: data.events.filter(e => e.severity === 'LOW').length, blockedIPs: Object.keys(activeBlocks).length }, blocked: activeBlocks });
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

// ═══════════════════════════════════════════════════════════════
// ⚡ CLICKPESA PAYMENTS
// ═══════════════════════════════════════════════════════════════
const CLICKPESA_BASE = 'https://api.clickpesa.com/third-parties';
let clickpesaTokenCache = { token: null, expiresAt: 0 };

async function getClickPesaToken() {
  if (clickpesaTokenCache.token && Date.now() < clickpesaTokenCache.expiresAt - 60_000) {
    return clickpesaTokenCache.token;
  }
  const r = await fetch(CLICKPESA_BASE + '/generate-token', {
    method: 'POST',
    headers: { 'client-id': process.env.CLICKPESA_CLIENT_ID, 'api-key': process.env.CLICKPESA_API_KEY }
  });
  const data = await r.json();
  if (!r.ok || !data.token) throw new Error('ClickPesa: imeshindwa kupata token — ' + (data.message || 'Unknown error'));
  clickpesaTokenCache = { token: data.token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return clickpesaTokenCache.token;
}

app.post('/api/clickpesa-pay', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kulipa' });
  try {
    const { phone, name } = req.body;
    const priced = priceItems(req.body.items);
    if (priced.soldOut.length) return res.status(400).json({ error: 'Zimeisha stock: ' + priced.soldOut.join(', ') });
    if (!priced.items.length) return res.status(400).json({ error: 'Kikapu ni tupu' });
    let cp; try { cp = applyCoupon(priced.total, req.body.coupon); } catch (e) { return res.status(400).json({ error: e.message }); }
    const items = priced.items, total = cp.total;
    if (!items || !items.length || !total) return res.status(400).json({ error: 'Kikapu ni tupu' });
    if (!phone) return res.status(400).json({ error: 'Weka namba ya simu' });
    let phoneFull = String(phone).replace(/\D/g, '');
    if (!phoneFull.startsWith('255')) phoneFull = '255' + phoneFull.replace(/^0/, '');
    if (phoneFull.length !== 12) return res.status(400).json({ error: 'Namba ya simu si sahihi. Mfano: 0786095758' });
    const orderReference = 'GH' + Date.now().toString().slice(-10);
    reserveUnique(items, orderReference, 20);
    const orders = readJson('orders.json', []);
    orders.push({ tx_ref: orderReference, customer: user.email, customerPhone: phoneFull, customerName: name || user.name, amount: Number(total), items, provider: 'ClickPesa', status: 'pending_clickpesa', date: new Date().toISOString() });
    await writeJson('orders.json', orders);
    const token = await getClickPesaToken();
    const previewRes = await fetch(CLICKPESA_BASE + '/payments/preview-ussd-push-request', { method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: String(total), currency: 'TZS', orderReference, phoneNumber: phoneFull }) });
    const previewData = await previewRes.json();
    if (!previewRes.ok || previewData.success === false) { console.error('ClickPesa preview error:', previewData); return res.status(400).json({ error: 'ClickPesa: ' + (previewData.message || 'Malipo hayakuanza') }); }
    const payRes = await fetch(CLICKPESA_BASE + '/payments/initiate-ussd-push-request', { method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: String(total), currency: 'TZS', orderReference, phoneNumber: phoneFull }) });
    const payData = await payRes.json();
    if (!payRes.ok || payData.success === false) {
      console.error('ClickPesa payment error:', payData);
      const all = readJson('orders.json', []);
      const o = all.find(x => x.tx_ref === orderReference);
      if (o) { o.status = 'failed_to_start'; await writeJson('orders.json', all); }
      releaseReserved(orderReference);
      return res.status(400).json({ error: 'ClickPesa: ' + (payData.message || 'Malipo hayakuanza') });
    }
    res.json({ success: true, tx_ref: orderReference, provider: 'ClickPesa', transactionId: payData.id || null });
  } catch (err) { console.error('ClickPesa error:', err); res.status(500).json({ error: 'Server error: ' + err.message }); }
});

app.post('/api/clickpesa-webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const event = body.event || body.eventType;
    const data = body.data || {};
    console.log('ClickPesa webhook:', event, JSON.stringify(data).slice(0, 500));
    if (event === 'PAYMENT RECEIVED') {
      const orderRef = data.orderReference;
      const orders = readJson('orders.json', []);
      const order = orders.find(o => o.tx_ref === orderRef);
      if (order && order.status !== 'successful') {
        const collected = Number(data.collectedAmount || data.amount || 0);
        if (collected >= (order.amount - 5)) { order.status = 'successful'; order.confirmedAt = new Date().toISOString(); order.clickpesaRef = data.id || null; fulfillOrder(order); await writeJson('orders.json', orders); logSecurity('CLICKPESA_PAYMENT_CONFIRMED', 'Malipo yamethibitishwa: ' + orderRef, 'LOW', getIP(req)); }
        else { order.status = 'amount_mismatch'; await writeJson('orders.json', orders); }
      }
    } else if (event === 'PAYMENT FAILED') {
      const orderRef = data.orderReference;
      const orders = readJson('orders.json', []);
      const order = orders.find(o => o.tx_ref === orderRef);
      if (order && order.status !== 'successful') { order.status = 'failed'; await writeJson('orders.json', orders); releaseReserved(orderRef); }
    }
    res.json({ success: true });
  } catch (err) { console.error('ClickPesa webhook error:', err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/clickpesa-check/:ref', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = readJson('orders.json', []);
  const o = orders.find(x => x.tx_ref === req.params.ref && x.customer === user.email);
  if (!o) return res.status(404).json({ error: 'Order haipatikani' });
  res.json({ success: true, status: o.status === 'successful' ? 'successful' : (o.status === 'failed' || o.status === 'failed_to_start' ? 'failed' : o.status === 'amount_mismatch' ? 'amount_mismatch' : 'pending') });
});

// 💵 MALIPO YA MANUAL
app.post('/api/manual-pay', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza kutuma ripoti ya malipo' });
  const { txRef, phone } = req.body;
  const priced = priceItems(req.body.items);
  if (priced.soldOut.length) return res.status(400).json({ error: 'Zimeisha stock: ' + priced.soldOut.join(', ') });
  if (!priced.items.length) return res.status(400).json({ error: 'Kikapu ni tupu' });
  let cp; try { cp = applyCoupon(priced.total, req.body.coupon); } catch (e) { return res.status(400).json({ error: e.message }); }
  const items = priced.items, total = cp.total;
  if (!items || !items.length || !total) return res.status(400).json({ error: 'Kikapu ni tupu' });
  if (!txRef || !txRef.trim()) return res.status(400).json({ error: 'Andika namba ya muamala (tx ref) uliyopewa baada ya kutuma pesa' });
  const orders = readJson('orders.json', []);
  const orderRef = 'MANUAL-' + Date.now();
  reserveUnique(items, orderRef, 1440);
  orders.push({ tx_ref: orderRef, customer: user.email, customerPhone: phone || '', manualTxRef: txRef.trim(), amount: Number(total), items, status: 'pending_manual', date: new Date().toISOString() });
  await writeJson('orders.json', orders);
  logSecurity('MANUAL_PAYMENT_SUBMITTED', 'Ripoti ya malipo manual kutoka ' + user.email, 'LOW', getIP(req));
  res.json({ success: true, message: '✅ Ripoti imepokelewa! Admin atathibitisha malipo yako hivi karibuni. Angalia "My Orders" baadaye.', tx_ref: orderRef });
});

app.post('/api/admin/orders/confirm', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { tx_ref } = req.body;
  const orders = readJson('orders.json', []);
  const order = orders.find(o => o.tx_ref === tx_ref);
  if (!order) return res.status(404).json({ error: 'Order haipatikani' });
  order.status = 'successful';
  order.confirmedAt = new Date().toISOString();
  fulfillOrder(order);
  await writeJson('orders.json', orders);
  logSecurity('MANUAL_PAYMENT_CONFIRMED', 'Admin amethibitisha malipo: ' + tx_ref, 'LOW', getIP(req));
  res.json({ success: true, message: '✅ Malipo yamethibitishwa. Mteja ataona bidhaa yake kwenye My Orders.' });
});

app.post('/api/admin/orders/reject', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { tx_ref } = req.body;
  const orders = readJson('orders.json', []);
  const filtered = orders.filter(o => o.tx_ref !== tx_ref);
  releaseReserved(tx_ref);
  await writeJson('orders.json', filtered);
  res.json({ success: true });
});

app.get('/api/my-orders', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = readJson('orders.json', []);
  const mine = orders.filter(o => o.customer === user.email).slice().reverse();
  res.json({ success: true, orders: mine });
});

// ═══════════════════════════════════════════════════════════════
// 🤖 AI INTEGRATION — CEREBRAS + PROVIDERS WOTE
// ═══════════════════════════════════════════════════════════════
async function askAI(prompt, preferred) {
  const providers = {
    // 🥇 CEREBRAS — Bure, kikomo kikubwa (1M tokens/siku)
    cerebras: {
      key: process.env.CEREBRAS_API_KEY,
      model: process.env.NEXUS_CEREBRAS_MODEL || 'gpt-oss-120b',
      base: 'https://api.cerebras.ai/v1'
    },
    // 🥈 GROQ — Bure, haraka sana
    groq: {
      key: process.env.GROQ_API_KEY,
      model: process.env.NEXUS_GROQ_MODEL || 'openai/gpt-oss-120b',
      base: 'https://api.groq.com/openai/v1'
    },
    // 🥉 GOOGLE GEMINI
    google: {
      key: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
      model: process.env.NEXUS_GOOGLE_MODEL || 'gemini-2.0-flash-exp'
    },
    openrouter: {
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.NEXUS_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      base: 'https://openrouter.ai/api/v1'
    },
    deepseek: {
      key: process.env.DEEPSEEK_API_KEY,
      model: process.env.NEXUS_DEEPSEEK_MODEL || 'deepseek-chat',
      base: 'https://api.deepseek.com'
    },
    openai: {
      key: process.env.OPENAI_API_KEY,
      model: process.env.NEXUS_OPENAI_MODEL || 'gpt-4o-mini',
      base: 'https://api.openai.com'
    },
    anthropic: {
      key: process.env.ANTHROPIC_API_KEY,
      model: process.env.NEXUS_ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'
    }
  };

  const configured = Object.keys(providers).filter(p => providers[p].key);
  if (!configured.length) {
    return 'AI API key haijawekwa. Weka CEREBRAS_API_KEY au GROQ_API_KEY kwenye Render.';
  }

  const primary = preferred && providers[preferred] && providers[preferred].key
    ? preferred
    : (process.env.NEXUS_AI_PRIMARY && providers[process.env.NEXUS_AI_PRIMARY]?.key
      ? process.env.NEXUS_AI_PRIMARY : configured[0]);

  const fallbackEnv = process.env.NEXUS_AI_FALLBACK;
  const order = [primary]
    .concat(fallbackEnv && providers[fallbackEnv]?.key && fallbackEnv !== primary ? [fallbackEnv] : [])
    .concat(configured.filter(p => p !== primary && p !== fallbackEnv));

  const clean = (value) => String(value || '').slice(0, 12000);

  for (const provider of order) {
    try {
      const cfg = providers[provider];
      let text = '';

      if (['cerebras', 'groq', 'openrouter', 'deepseek', 'openai'].includes(provider)) {
        const base = cfg.base || (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com');
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.key
        };
        if (provider === 'openrouter') {
          headers['HTTP-Referer'] = process.env.RENDER_EXTERNAL_URL || 'https://form-ecosystem.onrender.com';
          headers['X-Title'] = 'GameHub Tanzania';
        }

        const response = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: 'system', content: 'Wewe ni msaidizi wa GameHub Tanzania. Jibu kwa Kiswahili au Kiingereza kulingana na mteja. Kuwa mfupi, rafiki na wa kweli.' },
              { role: 'user', content: clean(prompt) }
            ],
            temperature: 0.7,
            max_tokens: 900
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || ('HTTP ' + response.status));
        text = data?.choices?.[0]?.message?.content || '';
      }

      if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: cfg.model, max_tokens: 900, temperature: 0.7, messages: [{ role: 'user', content: clean(prompt) }] })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || ('HTTP ' + response.status));
        text = data?.content?.map(x => x.text || '').join('') || '';
      }

      if (provider === 'google') {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.model) + ':generateContent?key=' + encodeURIComponent(cfg.key),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: clean(prompt) }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 900 } })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || ('HTTP ' + response.status));
        text = data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || '';
      }

      if (text.trim()) {
        console.log('✅ AI imejibu kwa: ' + provider);
        return text.trim();
      }
      throw new Error('Provider returned an empty response');
    } catch (err) {
      console.error('❌ AI provider failed [' + provider + ']:', err.message);
    }
  }

  return 'Samahani, AI haikupatikana kwa sasa. Kagua API key kwenye Render.';
}

async function askGemini(prompt) {
  return askAI(prompt, 'google');
}

// 🧪 AI DIAGNOSTIC — Jaribu providers wote (Cerebras imeongezwa)
app.get('/api/ai/test', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });

  const results = {};
  const testPrompt = 'Sema "AI inafanya kazi" kwa Kiswahili.';

  const providers = {
    cerebras: { key: process.env.CEREBRAS_API_KEY, model: process.env.NEXUS_CEREBRAS_MODEL || 'gpt-oss-120b', base: 'https://api.cerebras.ai/v1' },
    groq: { key: process.env.GROQ_API_KEY, model: process.env.NEXUS_GROQ_MODEL || 'openai/gpt-oss-120b', base: 'https://api.groq.com/openai/v1' },
    google: { key: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY, model: process.env.NEXUS_GOOGLE_MODEL || 'gemini-2.0-flash-exp' },
    openrouter: { key: process.env.OPENROUTER_API_KEY, model: process.env.NEXUS_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', base: 'https://openrouter.ai/api/v1' },
    deepseek: { key: process.env.DEEPSEEK_API_KEY, model: process.env.NEXUS_DEEPSEEK_MODEL || 'deepseek-chat', base: 'https://api.deepseek.com' },
    openai: { key: process.env.OPENAI_API_KEY, model: process.env.NEXUS_OPENAI_MODEL || 'gpt-4o-mini', base: 'https://api.openai.com' },
    anthropic: { key: process.env.ANTHROPIC_API_KEY, model: process.env.NEXUS_ANTHROPIC_MODEL || 'claude-3-5-haiku-latest' }
  };

  for (const [name, cfg] of Object.entries(providers)) {
    if (!cfg.key) { results[name] = { status: 'NO_KEY', model: cfg.model }; continue; }
    try {
      let text = '';
      if (['cerebras', 'groq', 'openrouter', 'deepseek', 'openai'].includes(name)) {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key };
        if (name === 'openrouter') { headers['HTTP-Referer'] = process.env.RENDER_EXTERNAL_URL || 'https://form-ecosystem.onrender.com'; headers['X-Title'] = 'GameHub Tanzania'; }
        const r = await fetch(cfg.base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: testPrompt }], max_tokens: 100 }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error?.message || ('HTTP ' + r.status));
        text = data?.choices?.[0]?.message?.content || '';
      } else if (name === 'google') {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.model) + ':generateContent?key=' + encodeURIComponent(cfg.key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: testPrompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 100 } }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error?.message || ('HTTP ' + r.status));
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (name === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model, max_tokens: 100, messages: [{ role: 'user', content: testPrompt }] }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error?.message || ('HTTP ' + r.status));
        text = data?.content?.[0]?.text || '';
      }
      results[name] = { status: 'OK', model: cfg.model, reply: text.slice(0, 100) };
    } catch (e) { results[name] = { status: 'FAILED', model: cfg.model, error: e.message }; }
  }

  res.json({ success: true, results, env: { primary: process.env.NEXUS_AI_PRIMARY || 'auto', fallback: process.env.NEXUS_AI_FALLBACK || 'auto' }});
});

// ═══════════ 🩺 HEALTH SAFETY LAYER ═══════════
const HEALTH_FORBIDDEN = ['orders.json', 'users.json', 'products.json', 'coupons.json', 'sessions.json'];
function healthSafetyLayer(prompt) {
  let cleaned = String(prompt);
  for (const f of HEALTH_FORBIDDEN) { if (cleaned.includes(f)) { cleaned = cleaned.replace(new RegExp(f.replace(/\./g, '\\.'), 'g'), '[DATA_ILIYOFICHWA]'); } }
  cleaned = cleaned.replace(/toa dawa|agiza dawa|andika prescription|diagnosis ya uhakika/gi, '[KANUNI: Hauruhusiwi]');
  return cleaned;
}

// ═══════════ 💬 AI CHAT ═══════════
app.post('/api/ai/chat', aiLimit, async (req, res) => {
  const { message, history } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Andika ujumbe' });
  const products = Object.values(readJson('products.json', {}));
  const productList = products.length ? products.map(p => '• ' + p.name + ' (' + (p.type || 'Bidhaa') + ') — ' + Number(p.price).toLocaleString() + ' TZS' + (p.downloadLink ? ' [download moja kwa moja]' : ' [Steam key/account]')).join('\n') : 'Hakuna bidhaa bado kwenye duka';
  let transcript = '';
  if (Array.isArray(history) && history.length) {
    const recent = history.slice(-4);
    transcript = '\n[Mazungumzo ya awali — kwa muktadha tu, USIJIBU yale maswali tena]:\n' + recent.map(h => (h.role === 'user' ? 'Mteja alisema: ' : 'Wewe ulijibu: ') + String(h.text).slice(0, 200)).join('\n') + '\n[Mwisho wa mazungumzo ya awali]\n\n';
  }
  const prompt = `Wewe ni msaidizi wa duka la gaming la Tanzania liitwalo GameHub.

🔴 KANUNI YA MSINGI: Jibu SWALI LA SASA HIVI tu. Usijibu maswali ya awali. Ukiona swali jipya, jibu jipya.

Bidhaa zilizopo:
${productList}

Bei za kukodi muda (GeForce NOW):
- Dakika 20 = 300 TZS
- Dakika 50 = 500 TZS
- Masaa 2 = 1,000 TZS

Malipo: M-Pesa, Tigo Pesa, Airtel Money, HaloPesa kupitia ClickPesa au Malipo Manual.

${transcript}Jibu swali hili la sasa HIVI: "${message}"

Jibu kwa ufupi (sentensi 2-4), kirafiki, kwa Kiswahili.`;
  const reply = await askAI(prompt);
  res.json({ reply });
});

// ═══════════ 🎮 AI RECOMMENDATIONS ═══════════
app.post('/api/ai/recommendations', async (req, res) => {
  const { message } = req.body;
  const products = Object.values(readJson('products.json', {}));
  const catalog = products.map(p => `${p.name} | ${p.type || 'Game'} | ${Number(p.price || 0).toLocaleString()} TZS`).join('\n');
  const prompt = `Wewe ni AI Recommendation wa GameHub Tanzania.
Msaidie mteja kuchagua bidhaa kutoka kwenye catalog halisi tu. Usibuni bidhaa au bei.
Mteja: ${String(message || '').slice(0, 3000)}
Catalog:
${catalog || 'Hakuna bidhaa bado.'}
Jibu kwa Kiswahili kwa ufupi, toa chaguo hadi 3 na sababu.`;
  const reply = await askAI(prompt);
  res.json({ reply });
});

// ═══════════ 🩺 AI HEALTH ═══════════
app.post('/api/ai/health', aiLimit, async (req, res) => {
  const { message, history } = req.body;
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Andika swali' });
  const safeMessage = healthSafetyLayer(String(message).slice(0, 5000));
  const transcript = Array.isArray(history) ? history.slice(-8).map(h => `${h.role}: ${h.text}`).join('\n') : '';
  const prompt = `Wewe ni msaidizi wa taarifa za afya wa jamii ndani ya GameHub.
Jibu kwa Kiswahili rahisi na kwa usalama. Toa taarifa za jumla tu; usijidai kuwa daktari, usifanye diagnosis ya uhakika, na usiagize dawa kwa mtu binafsi.
Kama kuna dalili kali au dharura (kupumua kwa shida, maumivu makali ya kifua, kupoteza fahamu, kutokwa damu nyingi, degedege, au hatari ya kujiumiza), mshauri mtumiaji kutafuta huduma ya dharura mara moja.
Usiombe taarifa nyeti zisizo muhimu.
Mazungumzo:
${transcript}
Swali jipya: ${safeMessage}`;
  const reply = await askAI(prompt, process.env.NEXUS_HEALTH_PROVIDER || 'cerebras');
  const healthLog = readJson('health_chats.json', []);
  healthLog.push({ id: 'hc_' + Date.now(), user: getUserByToken(req)?.email || 'anonymous', question: safeMessage.slice(0, 200), time: new Date().toISOString() });
  if (healthLog.length > 500) healthLog.splice(0, healthLog.length - 500);
  writeJson('health_chats.json', healthLog);
  res.json({ reply });
});

// ═══════════ 🤖 AI ADMIN ═══════════
app.post('/api/ai/admin', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { command } = req.body;
  if (!command || !command.trim()) return res.status(400).json({ error: 'Andika amri' });
  const lower = command.toLowerCase();
  const addMatch = lower.match(/ongeza\s+(?:game|bidhaa|product)?\s*(.+?)\s+bei\s+(\d+)/i) || lower.match(/ongeza\s+(?:game|bidhaa|product)?\s*(.+?)\s+(\d{3,})/i);
  if (addMatch) {
    const name = addMatch[1].trim(); const price = Number(addMatch[2]);
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
    if (found) { delete products[found.id]; writeJson('products.json', products); return res.json({ reply: '🗑️ Nimefuta "' + found.name + '" kwenye duka.' }); }
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
    'Msaidi: jibu kwa Kiswahili kwa ufupi, toa ushauri wa biashara.';
  const reply = await askAI(prompt);
  res.json({ reply });
});

// ═══════════ 🎙️ AI BOSS ASSISTANT ═══════════
app.post('/api/ai/boss', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si Boss (Admin).' });
  const { message, mode } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Andika au sema amri yako.' });
  const orders = readJson('orders.json', []);
  const paid = orders.filter(o => o.status === 'successful');
  const usersCount = Object.keys(readJson('users.json', {})).length;
  const revenue = paid.reduce((t, o) => t + Number(o.amount || 0), 0);
  const pending = orders.filter(o => String(o.status || '').startsWith('pending'));
  const needsApproval = /payout|refund|withdraw|kutoa pesa|kufuta user|delete user|badilisha wallet|futa data/i.test(message);
  const prompt = `Wewe ni AI Boss Assistant wa GameHub Tanzania. Boss (${user.name}) amekuuliza:
"${message}"

TAARIFA ZA SASA:
- Mauzo yote: ${orders.length} orders
- Mauzo yaliyofanikiwa: ${paid.length} orders
- Mapato: ${revenue.toLocaleString()} TZS
- Wateja: ${usersCount}
- Orders zinazosubiri: ${pending.length}

KANUNI:
1. Jibu kwa Kiswahili kifupi na kwa heshima.
2. Kama ombi linahitaji mabadiliko ya pesa (payout/refund/delete), SEMSA: "⚠️ Hii inahitaji idhini yako ya moja kwa moja (Boss Approval)."
3. Kama ni ripoti tu, itoe kwa ufupi.

${needsApproval ? '⚠️ TAMBUA: Ombi hili linahitaji Boss Approval — lisifanye lolote lenyewe.' : ''}`;
  const reply = await askAI(prompt, process.env.NEXUS_BOSS_PROVIDER || 'cerebras');
  if (needsApproval) {
    const approvals = readJson('boss_approvals.json', []);
    approvals.push({ id: 'appr_' + Date.now(), command: message.slice(0, 500), status: 'pending', time: new Date().toISOString(), requestedBy: user.email });
    await writeJson('boss_approvals.json', approvals);
  }
  res.json({ success: true, reply, needsApproval, mode: mode || 'chat', timestamp: new Date().toISOString() });
});

app.get('/api/ai/boss/approvals', (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si Boss.' });
  const approvals = readJson('boss_approvals.json', []);
  res.json({ success: true, approvals: approvals.slice().reverse() });
});

app.post('/api/ai/boss/approvals/:id/decide', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si Boss.' });
  const { decision } = req.body;
  const approvals = readJson('boss_approvals.json', []);
  const item = approvals.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Approval haipatikani.' });
  item.status = decision === 'approve' ? 'approved' : 'rejected';
  item.decidedAt = new Date().toISOString();
  item.decidedBy = user.email;
  await writeJson('boss_approvals.json', approvals);
  res.json({ success: true, approval: item });
});

// ═══════════ BANNERS ═══════════
app.get('/api/banners', (req, res) => {
  res.json({ success: true, banners: readJson('banners.json', []).filter(x => x.status !== 'hidden').slice(-20).reverse() });
});

// ═══════════ LIVE MATCHES / STREAMS ═══════════
const cleanScore = v => (v === '' || v == null || isNaN(Number(v))) ? null : Math.max(0, Math.min(99, Math.floor(Number(v))));

app.get('/api/live-streams', (req, res) => {
  const streams = readJson('live_streams.json', []);
  res.json({ success: true, streams: streams.filter(x => x.status !== 'hidden').sort((a,b) => String(b.createdAt||'').localeCompare(String(a.createdAt||''))) });
});

app.post('/api/admin/live-streams', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const { title, league, homeTeam, awayTeam, status, streamUrl, videoUrl, startTime, description, homeScore, awayScore, minute } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Weka jina la mechi.' });
  const streams = readJson('live_streams.json', []);
  const item = { id: 'live_' + Date.now(), title: String(title).slice(0,160), league: String(league||'Football').slice(0,100), homeTeam: String(homeTeam||'').slice(0,80), awayTeam: String(awayTeam||'').slice(0,80), status: String(status||'LIVE').slice(0,30), streamUrl: String(streamUrl||'').slice(0,2000), videoUrl: String(videoUrl||'').slice(0,2000), startTime: String(startTime||'').slice(0,80), description: String(description||'').slice(0,1000), createdAt: new Date().toISOString(), homeScore: cleanScore(homeScore), awayScore: cleanScore(awayScore), minute: String(minute||'').slice(0,10) };
  streams.push(item); await writeJson('live_streams.json', streams);
  res.json({ success:true, stream:item });
});

app.post('/api/admin/live-streams/:id/score', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || !user.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const streams = readJson('live_streams.json', []);
  const s = streams.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Match haipatikani.' });
  const { homeScore, awayScore, minute, status } = req.body || {};
  if (homeScore !== undefined) s.homeScore = cleanScore(homeScore);
  if (awayScore !== undefined) s.awayScore = cleanScore(awayScore);
  if (minute !== undefined) s.minute = String(minute || '').slice(0, 10);
  if (status !== undefined && ['LIVE', 'UPCOMING', 'ENDED'].includes(String(status).toUpperCase())) s.status = String(status).toUpperCase();
  s.updatedAt = new Date().toISOString();
  await writeJson('live_streams.json', streams);
  res.json({ success: true, stream: s });
});

app.delete('/api/admin/live-streams/:id', (req,res) => {
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const data=readJson('live_streams.json',[]); writeJson('live_streams.json', data.filter(x=>x.id!==req.params.id)); res.json({success:true});
});

// ═══════════ COURSES + VIDEOS ═══════════
app.get('/api/courses', (req,res) => {
  const courses=readJson('courses.json',[]);
  res.json({success:true,courses});
});

app.post('/api/admin/courses', (req,res) => {
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const {name,description,thumbnail,price,level}=req.body||{};
  if(!name) return res.status(400).json({error:'Weka jina la course.'});
  const courses=readJson('courses.json',[]);
  const course={id:'course_'+Date.now(),name:String(name).slice(0,160),description:String(description||'').slice(0,1000),thumbnail:String(thumbnail||'').slice(0,1000),price:Number(price||0),level:String(level||'Beginner').slice(0,50),videos:[],createdAt:new Date().toISOString()};
  courses.push(course); writeJson('courses.json',courses); res.json({success:true,course});
});

app.post('/api/admin/courses/:id/videos/upload', upload.single('video'), async (req,res) => {
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const courses=readJson('courses.json',[]); const course=courses.find(x=>x.id===req.params.id);
  if(!course) return res.status(404).json({error:'Course haipatikani.'});
  try {
    const saved=await saveUploadedVideo(req.file,'courses');
    const video={id:'cv_'+Date.now(),title:String(req.body.title||req.file.originalname).slice(0,160),description:String(req.body.description||'').slice(0,1000),url:saved.url,duration:String(req.body.duration||'').slice(0,30),createdAt:new Date().toISOString()};
    course.videos=course.videos||[]; course.videos.push(video); writeJson('courses.json',courses);
    res.json({success:true,course,video});
  } catch(e){res.status(400).json({error:e.message});}
});

app.delete('/api/admin/courses/:id/videos/:videoId', (req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const courses=readJson('courses.json',[]); const course=courses.find(x=>x.id===req.params.id);
  if(!course) return res.status(404).json({error:'Course haipatikani.'});
  course.videos=(course.videos||[]).filter(v=>v.id!==req.params.videoId); writeJson('courses.json',courses); res.json({success:true});
});

// ═══════════ MOVIES ═══════════
app.get('/api/movies',(req,res)=>{
  const movies=readJson('movies.json',[]);
  res.json({success:true,movies:movies.filter(m=>m.status!=='hidden')});
});

app.post('/api/admin/movies/upload', upload.single('video'), async (req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  if(!req.file && !req.body.videoUrl) return res.status(400).json({error:'Chagua movie/video kwanza au weka URL.'});
  try{
    const remoteUrl=String(req.body.videoUrl||'').trim();
    const saved=remoteUrl ? {url:remoteUrl,storage:'remote',path:remoteUrl,filename:''} : await saveUploadedVideo(req.file,'movies');
    const movies=readJson('movies.json',[]);
    const movie={id:'movie_'+Date.now(),title:String(req.body.title||req.file?.originalname||'Movie').slice(0,180),description:String(req.body.description||'').slice(0,1200),genre:String(req.body.genre||'General').slice(0,80),year:String(req.body.year||'2026').slice(0,10),poster:String(req.body.poster||'').slice(0,1000),videoUrl:saved.url,storage:saved.storage,createdAt:new Date().toISOString()};
    movies.push(movie); await writeJson('movies.json',movies); res.json({success:true,movie});
  }catch(e){res.status(400).json({error:e.message});}
});

app.delete('/api/admin/movies/:id',(req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const movies=readJson('movies.json',[]); writeJson('movies.json',movies.filter(x=>x.id!==req.params.id)); res.json({success:true});
});

app.post('/api/admin/media/upload', upload.single('video'), async (req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  try{
    const saved=await saveUploadedVideo(req.file,'media');
    const media=readJson('media.json',[]);
    const item={id:'media_'+Date.now(),title:String(req.body.title||req.file.originalname).slice(0,180),type:String(req.body.type||'video').slice(0,40),url:saved.url,storage:saved.storage,createdAt:new Date().toISOString()};
    media.push(item); writeJson('media.json',media); res.json({success:true,media:item});
  }catch(e){res.status(400).json({error:e.message});}
});

// ═══════════ INTERNAL AI WEB DEVELOPER & MANAGER ═══════════
function extractJson(text) {
  const raw=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(raw);}catch(e){}
  const a=raw.indexOf('{'), b=raw.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1));}catch(e){}}
  return null;
}

async function askClaudeBuilder(command) {
  const key=process.env.ANTHROPIC_API_KEY;
  if(!key) throw new Error('Weka ANTHROPIC_API_KEY kwenye Render.');
  const model=process.env.NEXUS_ANTHROPIC_BUILDER_MODEL || process.env.NEXUS_ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  const system=`Wewe ni AI Web Developer & Manager wa GameHub. Tengeneza JSON TU, bila markdown.
Allowed actions pekee:
1) add_product: {name,price,productType,desc,section,image}
2) add_banner: {title,description,buttonText,buttonUrl}
3) add_movie: {title,description,genre,year,videoUrl,poster}
4) add_course_video: {courseName,title,description,videoUrl}
5) add_live_match: {title,league,homeTeam,awayTeam,status,streamUrl,videoUrl,startTime,description}
6) update_settings: {key,value}
Usiweke JavaScript/HTML/SQL/raw code inayotekelezwa moja kwa moja.
Jibu: {"summary":"...","actions":[...]}.`;
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:1800,temperature:0.2,system,messages:[{role:'user',content:String(command).slice(0,6000)}]})});
  const data=await r.json(); if(!r.ok) throw new Error(data?.error?.message||('Claude HTTP '+r.status));
  return extractJson(data?.content?.map(x=>x.text||'').join(''));
}

app.post('/api/admin/ai-builder', async (req,res)=>{
  const user=getUserByToken(req); if(!user||!user.isAdmin) return res.status(403).json({error:'Wewe si admin'});
  const {command,execute=true}=req.body||{}; if(!command||!String(command).trim()) return res.status(400).json({error:'Andika amri.'});
  try{
    const plan=await askClaudeBuilder(command); if(!plan||!Array.isArray(plan.actions)) return res.status(422).json({error:'Claude hakutoa JSON sahihi.',raw:plan});
    const results=[];
    if (!execute) return res.json({success:true,summary:plan.summary||'Plan imeandaliwa.',actions:plan.actions,results:[],executed:false});
    for(const action of plan.actions.slice(0,10)){
      const type=String(action.type||action.action||'');
      if(type==='add_product'){
        const products=readJson('products.json',{}), id='p'+Date.now()+crypto.randomBytes(2).toString('hex');
        products[id]={ id, name:String(action.name||'New Product').slice(0,160), type:String(action.productType||action.itemType||action.section||'Game').slice(0,80), price:Number(action.price||0), desc:String(action.desc||'').slice(0,800), imageUrl:String(action.image||action.imageUrl||'').slice(0,1000), section:String(action.section||'shop').slice(0,30) };
        await writeJson('products.json',products); results.push('Bidhaa: '+products[id].name); continue;
      }
      if(type==='add_banner'){
        const banners=readJson('banners.json',[]); const b={id:'banner_'+Date.now(),title:String(action.title||'').slice(0,180),description:String(action.description||'').slice(0,800),buttonText:String(action.buttonText||'Angalia').slice(0,60),buttonUrl:String(action.buttonUrl||'index.html').slice(0,500),createdAt:new Date().toISOString()}; banners.push(b); await writeJson('banners.json',banners); results.push('Banner: '+b.title); continue;
      }
      if(type==='add_movie'){
        const movies=readJson('movies.json',[]); const m={id:'movie_'+Date.now(),title:String(action.title||'').slice(0,180),description:String(action.description||'').slice(0,1200),genre:String(action.genre||'General').slice(0,80),year:String(action.year||'2026').slice(0,10),videoUrl:String(action.videoUrl||'').slice(0,2000),poster:String(action.poster||'').slice(0,1000),createdAt:new Date().toISOString()}; movies.push(m); await writeJson('movies.json',movies); results.push('Movie: '+m.title); continue;
      }
      if(type==='add_live_match'){
        const streams=readJson('live_streams.json',[]); const x={id:'live_'+Date.now(),title:String(action.title||'Live Match').slice(0,160),league:String(action.league||'Football').slice(0,100),homeTeam:String(action.homeTeam||'').slice(0,80),awayTeam:String(action.awayTeam||'').slice(0,80),status:String(action.status||'LIVE').slice(0,30),streamUrl:String(action.streamUrl||'').slice(0,2000),videoUrl:String(action.videoUrl||'').slice(0,2000),startTime:String(action.startTime||'').slice(0,80),description:String(action.description||'').slice(0,1000),createdAt:new Date().toISOString()}; streams.push(x); await writeJson('live_streams.json',streams); results.push('Mechi: '+x.title); continue;
      }
      if(type==='add_course_video'){
        const courses=readJson('courses.json',[]); let c=courses.find(x=>x.name.toLowerCase()===String(action.courseName||'').toLowerCase());
        if(!c){c={id:'course_'+Date.now(),name:String(action.courseName||'New Course').slice(0,160),description:'Course iliyoundwa na AI Builder',price:0,level:'Beginner',videos:[],createdAt:new Date().toISOString()}; courses.push(c);}
        c.videos=c.videos||[]; c.videos.push({id:'cv_'+Date.now(),title:String(action.title||'Video').slice(0,160),description:String(action.description||'').slice(0,1000),url:String(action.videoUrl||'').slice(0,2000),createdAt:new Date().toISOString()}); await writeJson('courses.json',courses); results.push('Course video: '+action.title); continue;
      }
      if(type==='update_settings'){
        const settings=readJson('settings.json',{});
        settings[String(action.key||'').slice(0,80)]=String(action.value||'').slice(0,500);
        await writeJson('settings.json',settings);
        results.push('Setting: '+action.key); continue;
      }
    }
    const runs=readJson('ai_builder_runs.json',[]); const run={id:'run_'+Date.now(),command:String(command).slice(0,6000),plan,results,executed:Boolean(execute),createdAt:new Date().toISOString()}; runs.push(run); await writeJson('ai_builder_runs.json',runs);
    res.json({success:true,summary:plan.summary||'Mabadiliko yameandaliwa.',actions:plan.actions,results,executed:Boolean(execute)});
  }catch(e){console.error('AI Builder:',e);res.status(500).json({error:e.message});}
});

// ═══════════ TOURNAMENTS ═══════════
app.get('/api/tournaments', (req, res) => {
  const u = getUserByToken(req);
  const data = readJson('tournaments.json', []);
  res.json({ success: true, tournaments: data.map(t => (u && u.isAdmin) ? t : { ...t, registrations: (t.registrations || []).map(() => ({})) }) });
});

app.post('/api/tournaments/register', (req, res) => {
  const { tournamentId, name, phone, game, userToken } = req.body;
  if (!tournamentId || !name || !phone) return res.status(400).json({ error: 'Jaza jina, simu na tournament.' });
  const tournaments = readJson('tournaments.json', []);
  const t = tournaments.find(x => String(x.id) === String(tournamentId));
  if (!t) return res.status(404).json({ error: 'Tournament haipatikani.' });
  t.registrations = t.registrations || [];
  if (t.registrations.some(x => x.phone === phone)) return res.status(409).json({ error: 'Namba hii tayari imesajiliwa.' });
  t.registrations.push({ name: String(name).slice(0,100), phone: String(phone).slice(0,30), game: String(game || t.game || '').slice(0,100), userToken: userToken || null, createdAt: new Date().toISOString() });
  writeJson('tournaments.json', tournaments);
  res.json({ success: true, message: 'Umefanikiwa kusajiliwa kwenye tournament.' });
});

ensureTournamentSeed();

// ═══════════ LIFEISGAMETZ — njia mpya ═══════════
app.get('/api/my-library', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const products = readJson('products.json', {});
  const mine = readJson('orders.json', []).filter(o => o.customer === user.email && o.status === 'successful');
  const ids = new Set(), delivered = [];
  mine.forEach(o => { (o.items || []).forEach(i => { if (i.id) ids.add(i.id); }); (o.delivered || []).forEach(d => delivered.push(d)); });
  res.json({ success: true, delivered: delivered.map(d => ({ ...d, code: dec(d.code) })), products: [...ids].map(id => products[id]).filter(Boolean).map(pubProduct) });
});

app.post('/api/coupons/preview', (req, res) => {
  const coupons = readJson('coupons.json', {});
  const c = coupons[String(req.body.code || '').trim().toUpperCase()];
  if (!c || !c.active || (c.maxUses && c.uses >= c.maxUses)) return res.status(404).json({ error: 'Kodi si sahihi au imeisha' });
  res.json({ success: true, code: c.code, percentOff: Math.min(90, Math.max(1, Number(c.percentOff) || 0)) });
});

app.post('/api/ai/game-advisor', aiLimit, async (req, res) => {
  const b = req.body || {};
  const msg = String(b.message || '').trim().slice(0, 1000);
  if (!msg) return res.status(400).json({ error: 'Andika swali.' });
  const platform = String(b.platform || 'Gaming').slice(0, 40);
  const game = String(b.game || '').slice(0, 120);
  const d = b.device || {};
  const device = ['type', 'specs', 'ram', 'storage'].map(k => k + ': ' + (String(d[k] || '').trim().slice(0, 120) || 'haijatajwa')).join('; ');
  const list = Object.values(readJson('products.json', {}))
    .filter(p => p.status !== 'Draft' && (!b.platform || platform === 'Store' || String(p.platform || p.type || '').toLowerCase() === platform.toLowerCase()))
    .slice(0, 25).map(p => '• ' + p.name + (p.desc ? ' — ' + String(p.desc).slice(0, 100) : '')).join('\n') || 'Hakuna bidhaa bado.';
  const transcript = (Array.isArray(b.history) ? b.history : []).slice(-6).map(h => (h.role === 'user' ? 'Mteja: ' : 'Advisor: ') + String(h.text).slice(0, 300)).join('\n');
  const prompt = `Wewe ni "Game Advisor", mtaalamu wa gaming kwa kategoria ya ${platform} katika duka la LIFEISGAMETZ (Tanzania).
Kazi yako: kumsaidia mteja kujua KABLA YA KUNUNUA kama game litacheza kwenye kifaa chake (simu au PC), na kumpa settings bora.
KANUNI:
1. Tumia specs alizotoa mteja. Kama hazitoshi (chipset/CPU/GPU/RAM havijatajwa), uliza kwa ufupi — usibuni.
2. Toa uamuzi wazi: "Litacheza vizuri", "Litacheza kwa settings za chini" au "Sidhani litacheza" — na sababu fupi (RAM, GPU/chipset, nafasi ya storage, joto na betri kwa simu).
3. Toa settings zinazopendekezwa (resolution, graphics, FPS, vitu vya kuzima). Kwa simu ongeza vidokezo vya joto na betri.
4. Kama huna uhakika na mahitaji rasmi ya game fulani, sema wazi na umshauri aangalie mahitaji rasmi (Steam, Play Store au mchapishaji). USIBUNI namba za mahitaji.
5. Kumbuka game nyingi za PC/console hazichezwi moja kwa moja kwenye simu (zinahitaji emulator, Winlator au cloud) — sema ukweli huo.
6. Jibu kwa Kiswahili (au lugha ya mteja), kwa ufupi, kwa orodha fupi inapofaa.
Kifaa cha mteja: ${device}
${game ? 'Game analotaka kujua: ' + game : 'Hajataja game maalum.'}
Bidhaa za kategoria hii dukani:
${list}
Mazungumzo ya awali:
${transcript}
Swali la mteja: ${msg}`;
  const reply = await askAI(prompt, process.env.NEXUS_GAME_PROVIDER);
  res.json({ reply });
});

app.post('/api/admin/game-files/sign', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  if (!supabase) return res.status(503).json({ error: 'Supabase haijawekwa' });
  const name = String(req.body?.filename || '').slice(0, 200);
  if (!GAME_EXT.test(name)) return res.status(400).json({ error: 'Aina ya faili hairuhusiwi (tumia APK, ZIP, RAR, 7Z, ISO, EXE...)' });
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100);
  const path = 'games/' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '-' + safe;
  const { data, error } = await supabase.storage.from(GAMES_BUCKET).createSignedUploadUrl(path);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, bucket: GAMES_BUCKET, path, token: data.token });
});

app.get('/api/download/:id', async (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  if (!supabase) return res.status(503).json({ error: 'Supabase haijawekwa' });
  const p = readJson('products.json', {})[req.params.id];
  if (!p || !p.file || p.status === 'Draft') return res.status(404).json({ error: 'Faili halipo' });
  let allowed = p.free || user.isAdmin || user.isStaff;
  if (!allowed) allowed = readJson('orders.json', []).some(o => o.customer === user.email && o.status === 'successful' && (o.items || []).some(i => i.id === p.id));
  if (!allowed) return res.status(403).json({ error: 'Hujanunua game hii' });
  const { data, error } = await supabase.storage.from(GAMES_BUCKET).createSignedUrl(p.file.path, 600, { download: p.file.name });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, url: data.signedUrl });
});

// ═══════════ LIFEISGAMETZ v2 — squads, biashara, AI mwalimu ═══════════
// --- eFootball Squads: muuzaji anawasilisha, admin anakagua na kuchukua umiliki, kisha live ---
app.post('/api/squads/submit', async (req, res) => {
  const u = getUserByToken(req);
  if (!u) return res.status(401).json({ error: 'Ingia kwanza' });
  const b = req.body || {};
  const title = clip(b.title, 120), price = Math.round(Number(b.price) || 0), email = clip(b.email, 120), password = String(b.password || '').slice(0, 200);
  if (title.length < 3 || price < 1000) return res.status(400).json({ error: 'Weka jina na bei (kuanzia 1,000)' });
  if (!/^\S+@\S+\.\S+$/.test(email) || !password) return res.status(400).json({ error: 'Weka Gmail na password ya akaunti' });
  const squads = readJson('squads.json', []);
  if (squads.filter(s => s.seller === u.email && s.status === 'pending_review').length >= 5) return res.status(429).json({ error: 'Una maombi 5 yanayosubiri ukaguzi tayari' });
  let cred; try { cred = enc(JSON.stringify({ email, password })); } catch (e) { return res.status(503).json({ error: e.message }); }
  const s = { id: 'sq_' + Date.now() + crypto.randomBytes(2).toString('hex'), seller: u.email, sellerName: u.name, sellerPhone: u.phone || '', title, price,
    desc: clip(b.desc, 2000), stats: clip(b.stats, 200), proofs: imgUrls(b.proofs), cred, status: 'pending_review', createdAt: new Date().toISOString() };
  squads.push(s);
  await writeJson('squads.json', squads);
  logSecurity('SQUAD_SUBMITTED', 'Kikosi kipya kimewasilishwa na ' + u.email, 'LOW', getIP(req));
  res.json({ success: true, id: s.id });
});
app.get('/api/squads/mine', (req, res) => {
  const u = getUserByToken(req);
  if (!u) return res.status(401).json({ error: 'Ingia kwanza' });
  res.json({ success: true, squads: readJson('squads.json', []).filter(s => s.seller === u.email).map(s => ({ id: s.id, title: s.title, price: s.price, status: s.status, note: s.note || '', productId: s.productId || '', createdAt: s.createdAt })).reverse() });
});
app.get('/api/admin/squads', (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, squads: readJson('squads.json', []).map(s => ({ id: s.id, title: s.title, price: s.price, desc: s.desc, stats: s.stats, proofs: s.proofs || [], status: s.status, note: s.note || '', sellerName: s.sellerName, sellerEmail: s.seller, sellerPhone: s.sellerPhone, createdAt: s.createdAt, productId: s.productId || '' })).reverse() });
});
app.get('/api/admin/squads/:id/reveal', (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const s = readJson('squads.json', []).find(x => x.id === req.params.id);
  if (!s || !s.cred) return res.status(404).json({ error: 'Hakuna credentials (tayari zimefutwa au kikosi hakipo)' });
  const c = dec(s.cred); if (!c) return res.status(500).json({ error: 'Imeshindwa kufungua (SQUAD_KEY si sahihi?)' });
  logSecurity('SQUAD_CRED_REVEALED', 'Admin ' + u.email + ' alifungua credentials za ' + s.id, 'MEDIUM', getIP(req));
  res.json({ success: true, ...JSON.parse(c) });
});
app.post('/api/admin/squads/:id/secure', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const b = req.body || {}, ck = b.checklist || {};
  if (!(ck.a && ck.b && ck.c && ck.d)) return res.status(400).json({ error: 'Kamilisha hatua zote nne za ukaguzi kwanza' });
  const email = clip(b.email, 120), password = String(b.password || '').slice(0, 200);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'Weka Gmail na password mpya (herufi 8+)' });
  const squads = readJson('squads.json', []), s = squads.find(x => x.id === req.params.id);
  if (!s || s.status !== 'pending_review') return res.status(404).json({ error: 'Kikosi hakipo au kimeshashughulikiwa' });
  let pid; try { pid = publishSquad(s, email, password); } catch (e) { return res.status(503).json({ error: e.message }); }
  s.status = 'live'; s.productId = pid; s.cred = null; s.securedAt = new Date().toISOString(); s.securedBy = u.email;
  await writeJson('squads.json', squads);
  logSecurity('SQUAD_SECURED', 'Kikosi ' + s.id + ' kimewekwa live na ' + u.email, 'LOW', getIP(req));
  res.json({ success: true, productId: pid });
});
app.post('/api/admin/squads/:id/reject', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const squads = readJson('squads.json', []), s = squads.find(x => x.id === req.params.id);
  if (!s || s.status !== 'pending_review') return res.status(404).json({ error: 'Kikosi hakipo au kimeshashughulikiwa' });
  s.status = 'rejected'; s.note = clip(req.body?.note, 300); s.cred = null;
  await writeJson('squads.json', squads);
  res.json({ success: true });
});
app.post('/api/admin/squads/create', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const b = req.body || {}, title = clip(b.title, 120), price = Math.round(Number(b.price) || 0), email = clip(b.email, 120), password = String(b.password || '').slice(0, 200);
  if (title.length < 3 || price < 1000 || !/^\S+@\S+\.\S+$/.test(email) || !password) return res.status(400).json({ error: 'Jaza jina, bei, Gmail na password' });
  const s = { id: 'sq_' + Date.now() + crypto.randomBytes(2).toString('hex'), seller: u.email, sellerName: u.name, sellerPhone: u.phone || '', title, price, desc: clip(b.desc, 2000), stats: clip(b.stats, 200), proofs: imgUrls(b.proofs), status: 'live', createdAt: new Date().toISOString() };
  try { s.productId = publishSquad(s, email, password); } catch (e) { return res.status(503).json({ error: e.message }); }
  const squads = readJson('squads.json', []); squads.push(s);
  await writeJson('squads.json', squads);
  res.json({ success: true, productId: s.productId });
});
app.post('/api/admin/squads/:id/ai-review', aiLimit, async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const s = readJson('squads.json', []).find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Kikosi hakipo' });
  const prompt = `Wewe ni mkaguzi wa hatari (anti-scam) wa soko la akaunti za eFootball la LIFEISGAMETZ. Hupewi password yoyote.
Kagua maombi haya ya muuzaji na toa: (1) alama za hatari/utapeli, (2) maswali 4-6 ya kumuuliza muuzaji, (3) vitu vya kuthibitisha unapoingia kwenye akaunti (mfano jina la kikosi, wachezaji, coins, kama imeunganishwa na Konami ID/Google/Facebook/Apple, historia ya kubadilishwa), (4) pendekezo: Kubali / Omba ushahidi zaidi / Kataa. Kuwa mfupi, kwa Kiswahili. USIBUNI ukweli kuhusu akaunti — ni maelezo ya muuzaji tu.
Jina: ${s.title}
Bei: ${s.price} TZS
Muhtasari: ${s.stats}
Maelezo: ${s.desc}
Idadi ya picha za ushahidi: ${(s.proofs || []).length}
Akaunti ya muuzaji kwenye duka letu: ${s.sellerName} (iliundwa na ana simu: ${s.sellerPhone ? 'ndiyo' : 'hapana'})`;
  res.json({ reply: await askAI(prompt, process.env.NEXUS_GAME_PROVIDER) });
});
app.post('/api/ai/squad', aiLimit, async (req, res) => {
  const b = req.body || {}, msg = clip(b.message, 1000);
  if (!msg) return res.status(400).json({ error: 'Andika swali.' });
  const transcript = (Array.isArray(b.history) ? b.history : []).slice(-6).map(h => (h.role === 'user' ? 'Mteja: ' : 'Msaidizi: ') + String(h.text).slice(0, 300)).join('\n');
  const prompt = `Wewe ni msaidizi wa Soko la Vikosi vya eFootball la LIFEISGAMETZ (Tanzania).
Jinsi mfumo wetu unavyofanya kazi:
- Muuzaji anawasilisha kikosi (picha za ushahidi, maelezo na akaunti). Credentials zinahifadhiwa kwa usimbaji (encrypted).
- Admin anakagua, anaingia kwenye akaunti, anathibitisha kikosi, anabadilisha password, anaondoa recovery ya muuzaji na kuweka akaunti chini ya umiliki wa duka KABLA kikosi hakijawekwa live. Muuzaji hawezi kuingia tena.
- Mnunuzi analipa kupitia duka tu (ClickPesa au Manual). Malipo yakithibitishwa, mfumo unamwonyesha Gmail na password kwenye Library yake. Anaweza kuendelea kutumia Gmail hiyo au kuweka yake mwenyewe (kubadilisha password, recovery na kuunganisha Konami ID/Google yake).
- Kikosi kimoja kinaweza kuuzwa mara moja tu.
Kanuni zako:
1. Kuwa mkweli: hakuna dhamana ya 100%. Masharti ya Konami na Google yanaweza kukataza kuhamisha akaunti, na akaunti inaweza kufungwa. Taja hatari hii kwa ufupi pale inapofaa.
2. USIWAHI kumwomba mtu aandike password kwenye chat. Mshauri asilipe nje ya duka wala kutuma pesa kwa muuzaji moja kwa moja.
3. Kwa mnunuzi: eleza hatua za kwanza baada ya kupokea akaunti (ingia, badilisha password, weka recovery yako, toa devices zingine, unganisha ID yako, angalia kikosi).
4. Kwa muuzaji: eleza jinsi ya kuwasilisha, ushahidi unaohitajika (screenshots za kikosi, coins, na wachezaji), na kwamba atapoteza ufikiaji baada ya ukaguzi.
5. Jibu kwa Kiswahili (au lugha ya mteja), kwa ufupi.
Mazungumzo ya awali:
${transcript}
Swali: ${msg}`;
  res.json({ reply: await askAI(prompt, process.env.NEXUS_GAME_PROVIDER) });
});

// --- Biashara na Washirika ---
app.post('/api/business-inquiry', async (req, res) => {
  const ip = getIP(req);
  if (!inqAllowed(ip)) return res.status(429).json({ error: 'Umetuma maombi mengi. Jaribu tena baadaye.' });
  const b = req.body || {};
  const row = { id: 'inq_' + Date.now() + crypto.randomBytes(2).toString('hex'), company: clip(b.company, 120), contact: clip(b.contact, 80), phone: clip(b.phone, 30), email: clip(b.email, 120), website: clip(b.website, 200), budget: clip(b.budget, 60), message: clip(b.message, 1500), status: 'new', createdAt: new Date().toISOString() };
  if (!row.company || (!row.phone && !row.email)) return res.status(400).json({ error: 'Weka jina la biashara na simu au email' });
  const list = readJson('inquiries.json', []); list.push(row);
  await writeJson('inquiries.json', list.slice(-500));
  res.json({ success: true, message: 'Ombi limepokelewa. Tutawasiliana nawe.' });
});
app.get('/api/admin/inquiries', (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, inquiries: readJson('inquiries.json', []).slice().reverse() });
});
app.delete('/api/admin/inquiries/:id', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  await writeJson('inquiries.json', readJson('inquiries.json', []).filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/api/ai/partner', aiLimit, async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const b = req.body || {}, msg = clip(b.message, 1500), mode = ['find', 'proposal', 'outreach', 'packages', 'vet'].includes(b.mode) ? b.mode : 'find';
  if (!msg) return res.status(400).json({ error: 'Andika swali au maelezo.' });
  const orders = readJson('orders.json', []), users = Object.keys(readJson('users.json', {})).length, prods = Object.keys(readJson('products.json', {})).length;
  const inq = readJson('inquiries.json', []).slice(-5).map(x => x.company).join(', ') || 'hakuna';
  const task = {
    find: 'Pendekeza AINA 8-10 za washirika/kampuni zinazofaa kwa duka la gaming na burudani la kidigitali Tanzania (mfano: watoa huduma za pesa za simu, mitandao ya simu na vifurushi vya data, internet cafes na gaming centers, waandaaji wa esports na tournaments, wauzaji wa simu na vifaa vya gaming, chapa za vinywaji na bidhaa za vijana, vyuo na tech hubs, wasanii na streamers). Kwa kila aina: kwa nini inafaa, unaweza kuwapa nini, wanaweza kukupa nini, na jinsi ya kuwafikia rasmi. USIBUNI majina ya kampuni, namba au barua pepe; ukitaja chapa maarufu, sema athibitishe mawasiliano rasmi mwenyewe.',
    proposal: 'Andika proposal kamili ya ushirikiano (muhtasari, tatizo/fursa, wateja wetu, tunachotoa, vifurushi, vipimo vya mafanikio, masharti ya malipo, hatua zinazofuata). Tumia [mabano] kwa taarifa ambazo hujapewa. USIBUNI takwimu za wateja, mapato wala mafanikio.',
    outreach: 'Andika ujumbe mfupi wa kwanza wa kuwasiliana (WhatsApp na email) kwa mshirika mtarajiwa, kwa sauti ya kitaalamu na rafiki; toa matoleo 2.',
    packages: 'Tengeneza muundo wa vifurushi vya matangazo (mfano Basic/Featured/Premium) vikionyesha kinachotolewa kwa kila kimoja kulingana na kinachowezekana kwenye tovuti yetu (orodha ya biashara, banner, post kwenye Community, kampeni). Pendekeza njia ya kupanga bei lakini USIBUNI bei kamili.',
    vet: 'Toa orodha ya kukagua mshirika au mtangazaji kabla ya kufanya kazi naye ili kuepuka utapeli (usajili wa biashara BRELA, TIN, marejeo, mkataba ulioandikwa, masharti ya malipo, epuka kulipa ada kabla ya makubaliano, kuthibitisha mawasiliano rasmi, kuanza na jaribio dogo, n.k.), na alama za hatari.'
  }[mode];
  const prompt = `Wewe ni mshauri wa biashara na ushirikiano wa LIFEISGAMETZ (duka la gaming Tanzania). Huna ufikiaji wa internet, hivyo hutoi taarifa za moja kwa moja za kampuni.
Takwimu halisi za mfumo (usiongeze zingine): watumiaji ${users}, oda ${orders.length}, bidhaa ${prods}. Maombi ya biashara ya karibuni: ${inq}.
Kazi: ${task}
Jibu kwa Kiswahili (au lugha ya admin), kwa mpangilio mzuri.
Mazungumzo ya awali:
${(Array.isArray(b.history) ? b.history : []).slice(-6).map(h => (h.role === 'user' ? 'Admin: ' : 'Wewe: ') + String(h.text).slice(0, 400)).join('\n')}
Ombi la admin: ${msg}`;
  res.json({ reply: await askAI(prompt, process.env.NEXUS_PARTNER_PROVIDER) });
});

// --- AI Mwalimu wa kozi ---
app.post('/api/ai/course-tutor', aiLimit, async (req, res) => {
  const b = req.body || {}, msg = clip(b.message, 1000);
  if (!msg) return res.status(400).json({ error: 'Andika swali.' });
  const courses = readJson('courses.json', []), c = courses.find(x => x.id === b.courseId);
  const syl = c ? `Kozi: ${c.name} (level: ${c.level || 'Beginner'})\nMaelezo: ${c.description || '—'}\nVideo za kozi: ${(c.videos || []).map((v, i) => (i + 1) + '. ' + v.title + (v.description ? ' — ' + String(v.description).slice(0, 120) : '')).join('; ') || 'bado hakuna'}`
    : 'Mwanafunzi hajachagua kozi maalum. Kozi zilizopo: ' + (courses.map(x => x.name).slice(0, 30).join(', ') || 'bado hakuna') + '. Msaidie kuchagua kozi inayomfaa au jibu mada ya jumla.';
  const transcript = (Array.isArray(b.history) ? b.history : []).slice(-6).map(h => (h.role === 'user' ? 'Mwanafunzi: ' : 'Mwalimu: ') + String(h.text).slice(0, 400)).join('\n');
  const prompt = `Wewe ni "AI Mwalimu" wa Academy ya LIFEISGAMETZ. Unamfundisha mwanafunzi kozi hii.
${syl}
Kanuni:
1. Fundisha hatua kwa hatua, kwa lugha rahisi, kwa mifano, na kwa ufupi (sentensi 4-8).
2. Mwishoni uliza swali dogo la kuangalia ameelewa, au mpe zoezi dogo la kufanya.
3. Rejea video za kozi pale zinapohusika (kwa jina la video).
4. Usidai kozi inafundisha kitu kisichokuwepo kwenye orodha ya video; kama mada iko nje ya kozi, jibu kwa ufupi kisha mrudishe kwenye kozi.
5. Usibuni ukweli; kama huna uhakika sema hivyo.
6. Jibu kwa lugha ya mwanafunzi (Kiswahili au Kiingereza).
Mazungumzo ya awali:
${transcript}
Swali la mwanafunzi: ${msg}`;
  res.json({ reply: await askAI(prompt, process.env.NEXUS_TUTOR_PROVIDER) });
});

// ═══════════ LIFEISGAMETZ v3 — Support (tiketi za wateja) ═══════════
/* LGZ-PATCH v3 */
const TICKET_CATS = ['Malipo', 'Oda / Library', 'Akaunti', 'Download / Game', 'Squad Market', 'Biashara / Matangazo', 'Nyingine'];
const tkRate = new Map();
function ticketAllowed(ip) {
  const now = Date.now(), a = (tkRate.get(ip) || []).filter(t => now - t < 3600000);
  if (a.length >= 5) return false;
  a.push(now); tkRate.set(ip, a); return true;
}
app.post('/api/support-ticket', async (req, res) => {
  const ip = getIP(req);
  if (!ticketAllowed(ip)) return res.status(429).json({ error: 'Umetuma maombi mengi. Jaribu tena baadaye.' });
  const u = getUserByToken(req), b = req.body || {};
  const row = {
    id: 'tk_' + Date.now() + crypto.randomBytes(2).toString('hex'),
    name: clip(b.name, 80), contact: clip(b.contact, 120),
    category: TICKET_CATS.includes(b.category) ? b.category : 'Nyingine',
    orderRef: clip(b.orderRef, 40), message: clip(b.message, 2000),
    user: u ? u.email : '', status: 'open', createdAt: new Date().toISOString()
  };
  if (row.message.length < 5 || (!row.contact && !row.user)) return res.status(400).json({ error: 'Andika ujumbe na namba ya simu au email ya kukujibu' });
  const list = readJson('tickets.json', []); list.push(row);
  await writeJson('tickets.json', list.slice(-1000));
  res.json({ success: true, message: 'Ombi lako limepokelewa. Tutakujibu hivi karibuni.' });
});
app.get('/api/admin/tickets', (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  res.json({ success: true, tickets: readJson('tickets.json', []).slice().reverse() });
});
app.patch('/api/admin/tickets/:id', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const list = readJson('tickets.json', []), t = list.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Tiketi haipo' });
  t.status = req.body?.status === 'resolved' ? 'resolved' : 'open';
  await writeJson('tickets.json', list);
  res.json({ success: true });
});
app.delete('/api/admin/tickets/:id', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  await writeJson('tickets.json', readJson('tickets.json', []).filter(x => x.id !== req.params.id));
  res.json({ success: true });
});


// ═══════════ LIFEISGAMETZ v4 — Settings za duka na Habari za Michezo ═══════════
/* LGZ-PATCH v4 */
const PUBLIC_SETTINGS = ['siteName', 'announcement', 'whatsapp', 'supportPhone', 'supportEmail', 'manualPayInstructions', 'squadCommission', 'payoutHoldDays', 'minWithdraw'];
app.get('/api/settings', (req, res) => {
  const s = readJson('settings.json', {}), o = {};
  PUBLIC_SETTINGS.forEach(k => { o[k] = typeof s[k] === 'string' ? s[k] : ''; });
  res.json({ success: true, settings: o });
});
app.put('/api/admin/settings', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const s = readJson('settings.json', {}), b = req.body || {};
  PUBLIC_SETTINGS.forEach(k => {
    if (b[k] !== undefined) s[k] = clip(b[k], (k === 'announcement' || k === 'manualPayInstructions') ? 500 : 120);
  });
  await writeJson('settings.json', s);
  res.json({ success: true });
});
app.get('/api/news', (req, res) => {
  res.json({ success: true, news: readJson('news.json', []).slice().reverse().slice(0, 100) });
});
app.post('/api/admin/news', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const b = req.body || {}, url = v => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim().slice(0, 1000) : '');
  const row = { id: 'news_' + Date.now() + crypto.randomBytes(2).toString('hex'), title: clip(b.title, 160), summary: clip(b.summary, 300), body: String(b.body || '').replace(/<[^>]*>/g, '').trim().slice(0, 5000), imageUrl: url(b.imageUrl), sourceUrl: url(b.sourceUrl), createdAt: new Date().toISOString() };
  if (!row.title || !row.summary) return res.status(400).json({ error: 'Weka kichwa na muhtasari' });
  const list = readJson('news.json', []); list.push(row);
  await writeJson('news.json', list.slice(-300));
  res.json({ success: true });
});
app.delete('/api/admin/news/:id', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  await writeJson('news.json', readJson('news.json', []).filter(x => x.id !== req.params.id));
  res.json({ success: true });
});


// ═══════════ LIFEISGAMETZ v5 — Mapato na malipo kwa wauzaji wa Squad ═══════════
/* LGZ-PATCH v5 */
const PAYOUT_METHODS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'HaloPesa'];
function numSetting(v, def, min, max) {
  const n = Number(v);
  return (String(v == null ? '' : v).trim() !== '' && Number.isFinite(n)) ? Math.min(max, Math.max(min, n)) : def;
}
function payoutCfg() {
  const s = readJson('settings.json', {});
  return { pct: numSetting(s.squadCommission, 10, 0, 50), hold: numSetting(s.payoutHoldDays, 3, 0, 30), min: numSetting(s.minWithdraw, 5000, 1000, 1000000) };
}
// Inaitwa na fulfillOrder pale kikosi kinapotolewa kwa mnunuzi (malipo yamethibitishwa)
function creditSquadSale(order, p, item) {
  const sq = readJson('squads.json', []).find(x => x.id === p.squadId);
  if (!sq || !sq.seller) return;
  const seller = readJson('users.json', {})[sq.seller];
  if (!seller || seller.isAdmin) return; // vikosi vya admin havilipwi kwa muuzaji
  const cfg = payoutCfg(), gross = Number(item.price) || 0, fee = Math.round(gross * cfg.pct / 100), now = Date.now();
  const list = readJson('payouts.json', []);
  list.push({
    id: 'po_' + now + crypto.randomBytes(2).toString('hex'), seller: sq.seller, squadId: sq.id, title: p.name,
    orderRef: order.tx_ref, gross, fee, net: gross - fee, pct: cfg.pct,
    availableAt: new Date(now + cfg.hold * 86400000).toISOString(), createdAt: new Date(now).toISOString()
  });
  writeJson('payouts.json', list);
}
function sellerBalance(email) {
  const now = Date.now();
  let held = 0, avail = 0, paid = 0, pending = 0;
  readJson('payouts.json', []).filter(x => x.seller === email).forEach(x => {
    if (new Date(x.availableAt).getTime() <= now) avail += x.net; else held += x.net;
  });
  readJson('withdrawals.json', []).filter(w => w.seller === email).forEach(w => {
    if (w.status === 'paid') { paid += w.amount; avail -= w.amount; }
    else if (w.status === 'pending') { pending += w.amount; avail -= w.amount; }
  });
  return { held, available: Math.max(0, avail), paid, pending };
}
app.get('/api/payouts/me', (req, res) => {
  const u = getUserByToken(req);
  if (!u) return res.status(401).json({ error: 'Ingia kwanza' });
  res.json({
    success: true, cfg: payoutCfg(), balance: sellerBalance(u.email),
    sales: readJson('payouts.json', []).filter(x => x.seller === u.email).slice().reverse(),
    withdrawals: readJson('withdrawals.json', []).filter(w => w.seller === u.email).slice().reverse()
      .map(w => ({ id: w.id, amount: w.amount, method: w.method, phone: w.phone, status: w.status, ref: w.ref || '', note: w.note || '', createdAt: w.createdAt }))
  });
});
app.post('/api/payouts/withdraw', async (req, res) => {
  const u = getUserByToken(req);
  if (!u) return res.status(401).json({ error: 'Ingia kwanza' });
  const b = req.body || {}, cfg = payoutCfg(), bal = sellerBalance(u.email);
  const amount = Math.round(Number(b.amount) || 0), name = clip(b.name, 80);
  const pm = String(b.phone || '').replace(/[\s-]/g, '').match(/^(?:\+?255|0)(\d{9})$/);
  if (!PAYOUT_METHODS.includes(b.method)) return res.status(400).json({ error: 'Chagua njia ya malipo' });
  if (!pm) return res.status(400).json({ error: 'Namba ya simu si sahihi (mfano 0712345678)' });
  if (!name) return res.status(400).json({ error: 'Weka jina lililosajiliwa kwenye namba hiyo' });
  const list = readJson('withdrawals.json', []);
  if (list.some(w => w.seller === u.email && w.status === 'pending')) return res.status(400).json({ error: 'Una ombi lingine linalosubiri. Subiri lishughulikiwe.' });
  if (amount < cfg.min) return res.status(400).json({ error: 'Kiwango cha chini cha kutoa ni ' + cfg.min + ' TZS' });
  if (amount > bal.available) return res.status(400).json({ error: 'Salio linalopatikana ni ' + bal.available + ' TZS' });
  list.push({ id: 'wd_' + Date.now() + crypto.randomBytes(2).toString('hex'), seller: u.email, sellerName: u.name, amount, method: b.method, phone: '255' + pm[1], name, status: 'pending', createdAt: new Date().toISOString() });
  await writeJson('withdrawals.json', list);
  res.json({ success: true });
});
app.get('/api/admin/withdrawals', (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const users = readJson('users.json', {}), withdrawals = readJson('withdrawals.json', []);
  const sellers = new Set(readJson('payouts.json', []).map(x => x.seller).concat(withdrawals.map(w => w.seller)));
  const balances = [...sellers].map(e => ({ seller: e, name: (users[e] || {}).name || e, ...sellerBalance(e) }));
  res.json({ success: true, withdrawals: withdrawals.slice().reverse(), balances });
});
app.post('/api/admin/withdrawals/:id/decide', async (req, res) => {
  const u = getUserByToken(req);
  if (!u || !u.isAdmin) return res.status(403).json({ error: 'Wewe si admin' });
  const list = readJson('withdrawals.json', []), w = list.find(x => x.id === req.params.id), b = req.body || {};
  if (!w || w.status !== 'pending') return res.status(404).json({ error: 'Ombi halipo au limeshashughulikiwa' });
  const paid = b.decision === 'paid', ref = clip(b.ref, 60);
  if (paid && !ref) return res.status(400).json({ error: 'Weka namba ya muamala wa malipo uliyotuma' });
  w.status = paid ? 'paid' : 'rejected'; w.ref = ref; w.note = clip(b.note, 300);
  w.decidedAt = new Date().toISOString(); w.decidedBy = u.email;
  await writeJson('withdrawals.json', list);
  logSecurity(paid ? 'WITHDRAWAL_PAID' : 'WITHDRAWAL_REJECTED', 'Ombi ' + w.id + ' (' + w.amount + ' TZS) na ' + u.email, 'LOW', getIP(req));
  res.json({ success: true });
});


// ═══════════ UPLOAD/API ERROR HANDLER ═══════════
app.use((err, req, res, next) => {
  if (err) {
    console.error('API error:', err.message);
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Video ni kubwa sana. Kikomo cha upload ni 1GB.' });
      return res.status(400).json({ error: 'Upload error: ' + err.message });
    }
    if (String(err.message || '').includes('Aina ya file hairuhusiwi')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: err.message || 'Server error' });
  }
  next();
});

// ═══════════ START SERVER ═══════════
restoreFromSupabase()
  .then(() => ensureMediaBucket())
  .then(() => ensureGamesBucket())
  .catch(err => console.error('☁️ Imeshindwa kurudisha data kutoka Supabase:', err.message))
  .finally(() => {
    const listener = app.listen(process.env.PORT || 3000, () => {
      const address = listener.address();
      const port = typeof address === 'object' && address ? address.port : (process.env.PORT || 3000);
      console.log('🎮 GameHub iko live kwenye port', port);
    });
  });
