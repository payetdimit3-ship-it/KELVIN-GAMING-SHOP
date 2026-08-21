// ============================================================
// GAMEHUB — Professional Gaming E-Commerce (Tanzania)
// Backend: Express + Supabase + Flutterwave + Gemini AI
// ============================================================

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===================== SUPABASE =====================
const SUPABASE_URL = 'https://zcviroqygjtautfsyahs.supabase.co';
const SUPABASE_SERVICE_KEY = 'PASTE_SERVICE_ROLE_KEY_HAPA'; // ← BADILISHA HII!
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ===================== FLUTTERWAVE =====================
const FLW_SECRET_KEY = 'PASTE_FLUTTERWAVE_SECRET_KEY_HAPA'; // ← BADILISHA HII!

// ===================== GEMINI AI =====================
const GEMINI_KEY = 'PASTE_GEMINI_API_KEY_HAPA'; // ← BADILISHA HII!

// ===================== ADMIN =====================
const ADMIN_EMAIL = 'admin@gamehub.co.tz'; // ← BADILISHA HII!

// ===================== DATA HELPERS (Supabase) =====================
async function getData(table, order) {
  const { data } = await supabase.from(table).select('*').order(order || 'id', { ascending: false });
  return data || [];
}

async function getDataEq(table, field, value) {
  const { data } = await supabase.from(table).select('*').eq(field, value);
  return data || [];
}

async function insertData(table, obj) {
  const { data, error } = await supabase.from(table).insert([obj]).select();
  return { data: data ? data[0] : null, error };
}

async function updateData(table, id, obj) {
  const { data, error } = await supabase.from(table).update(obj).eq('id', id).select();
  return { data: data ? data[0] : null, error };
}

async function deleteData(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  return !error;
}

// ===================== AUTH =====================
function generateToken() { return crypto.randomBytes(32).toString('hex'); }

async function getUserByToken(req) {
  const token = req.headers['authorization'] || req.query.token;
  if (!token) return null;
  const sessions = await getDataEq('sessions', 'token', token);
  if (!sessions.length) return null;
  const users = await getDataEq('users', 'email', sessions[0].email);
  return users.length ? users[0] : null;
}

// ===================== API ROUTES =====================

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
  const { type, search } = req.query;
  let query = supabase.from('products').select('*');
  if (type) query = query.eq('type', type);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data } = await query.order('id', { ascending: false });
  res.json(data || []);
});

app.post('/api/products', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const { name, type, price, emoji, description, link } = req.body;
  const result = await insertData('products', {
    name, type: type || 'game',
    price: parseInt(price), emoji: emoji || '🎮',
    description: description || '', link: link || ''
  });
  if (result.error) return res.status(500).json({ error: result.error.message });
  res.json({ success: true, product: result.data });
});

app.delete('/api/products/:id', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  await deleteData('products', parseInt(req.params.id));
  res.json({ success: true });
});

// --- USERS ---
app.post('/api/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  const existing = await getDataEq('users', 'email', email);
  if (existing.length) return res.status(400).json({ error: 'Email tayari ipo' });
  const hashed = crypto.createHash('sha256').update(password).digest('hex');
  const result = await insertData('users', {
    name, email, phone: phone || '', password: hashed, is_admin: email === ADMIN_EMAIL
  });
  if (result.error) return res.status(500).json({ error: result.error.message });
  const token = generateToken();
  await insertData('sessions', { token, email });
  res.json({ success: true, token, user: { name, email, phone, isAdmin: email === ADMIN_EMAIL } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const hashed = crypto.createHash('sha256').update(password).digest('hex');
  const users = await getDataEq('users', 'email', email);
  if (!users.length || users[0].password !== hashed) return res.status(400).json({ error: 'Email au password sio sahihi' });
  const token = generateToken();
  await insertData('sessions', { token, email });
  res.json({ success: true, token, user: { name: users[0].name, email, phone: users[0].phone, isAdmin: users[0].is_admin } });
});

app.get('/api/me', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Hujaingia' });
  res.json({ name: user.name, email: user.email, phone: user.phone, isAdmin: user.is_admin });
});

app.get('/api/users', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const users = await getData('users');
  res.json(users.map(u => ({ name: u.name, email: u.email, phone: u.phone, isAdmin: u.is_admin, created: u.created_at })));
});

// --- ORDERS ---
app.post('/api/orders', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const { amount, items, type, phone, name, email } = req.body;
  const tx_ref = 'GH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  // Flutterwave payment request
  try {
    const fetch = require('node-fetch');
    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tx_ref,
        amount,
        currency: 'TZS',
        payment_options: 'mpesa,tigo,airtel',
        redirect_url: `https://${req.headers.host || 'gamehub.glitch.me'}/success.html?tx_ref=${tx_ref}`,
        meta: { email: user.email, name: user.name },
        customer: { email: email || user.email, phonenumber: phone, name: name || user.name },
        customizations: { title: 'GameHub Tanzania', description: 'Malipo ya bidhaa za gaming', logo: '' }
      })
    });
    const flwData = await flwRes.json();
    if (!flwData.status || flwData.status === 'error') {
      return res.status(400).json({ error: 'Flutterwave: ' + (flwData.message || 'Hitilafu') });
    }

    // Save order
    await insertData('orders', {
      tx_ref, customer: user.email, email: email || user.email,
      phone: phone || user.phone, amount: parseInt(amount),
      items: JSON.stringify(items), status: 'pending', type: type || 'game'
    });

    res.json({ success: true, tx_ref, link: flwData.data.link });
  } catch (e) {
    res.status(500).json({ error: 'Hitilafu ya malipo: ' + e.message });
  }
});

// Flutterwave Webhook (malipo yanapofika)
app.post('/api/webhook', async (req, res) => {
  const hash = crypto.createHmac('sha256', FLW_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
  if (req.headers['verif-hash'] !== hash) return res.status(401).send('No hash');
  
  const event = req.body;
  if (event.event === 'charge.completed' && event.data.status === 'successful') {
    const tx_ref = event.data.tx_ref;
    const { data: orders } = await supabase.from('orders').update({ status: 'paid' }).eq('tx_ref', tx_ref).select();
    if (orders && orders.length) {
      // Send email with game info (simplified - just log)
      console.log(`✅ Malipo yamefika: ${tx_ref} = ${event.data.amount} TZS kutoka ${event.data.customer.email}`);
    }
  }
  res.sendStatus(200);
});

// Verify payment
app.post('/api/verify', async (req, res) => {
  const { tx_ref } = req.body;
  try {
    const fetch = require('node-fetch');
    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`, {
      headers: { 'Authorization': `Bearer ${FLW_SECRET_KEY}` }
    });
    const flwData = await flwRes.json();
    if (flwData.status === 'success' && flwData.data.status === 'successful') {
      await supabase.from('orders').update({ status: 'paid' }).eq('tx_ref', tx_ref);
      return res.json({ success: true, data: flwData.data });
    }
    res.json({ success: false, message: 'Malipo hayajakamilika' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const orders = await getData('orders');
  if (user.email !== ADMIN_EMAIL) return res.json(orders.filter(o => o.customer === user.email));
  res.json(orders);
});

// --- REQUESTS (Games Wateja Wanazoomba) ---
app.get('/api/requests', async (req, res) => {
  const { data } = await supabase.from('requests').select('*').order('votes', { ascending: false });
  res.json(data || []);
});

app.post('/api/requests', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const { name } = req.body;
  const existing = await getDataEq('requests', 'name', name);
  if (existing.length) return res.status(400).json({ error: 'Game hii tayari imeombwa' });
  await insertData('requests', { name, votes: 1, voters: JSON.stringify([user.email]) });
  res.json({ success: true });
});

app.post('/api/requests/vote', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const { id } = req.body;
  const reqs = await getDataEq('requests', 'id', id);
  if (!reqs.length) return res.status(404).json({ error: 'Haipo' });
  const r = reqs[0];
  let voters = typeof r.voters === 'string' ? JSON.parse(r.voters) : (r.voters || []);
  if (voters.includes(user.email)) return res.status(400).json({ error: 'Umeshapiga kura' });
  voters.push(user.email);
  await supabase.from('requests').update({ votes: r.votes + 1, voters: JSON.stringify(voters) }).eq('id', id);
  res.json({ success: true });
});

app.post('/api/requests/approve/:id', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const reqs = await getDataEq('requests', 'id', parseInt(req.params.id));
  if (!reqs.length) return res.status(404).json({ error: 'Haipo' });
  const r = reqs[0];
  await insertData('products', { name: r.name, type: 'game', price: 0, emoji: '🎮', description: 'Imeongezwa kutoka kwa ombi la wateja' });
  await deleteData('requests', parseInt(req.params.id));
  res.json({ success: true, message: `✅ '${r.name}' imeongezwa dukani!` });
});

// --- RENTALS ---
app.post('/api/rentals', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const { minutes, amount } = req.body;
  const now = new Date();
  const expires = new Date(now.getTime() + minutes * 60000);
  await insertData('rentals', {
    email: user.email, minutes, amount: parseInt(amount),
    started_at: now.toISOString(), expires_at: expires.toISOString(), active: true
  });
  res.json({ success: true, expires_at: expires.toISOString() });
});

// --- SECURITY LOGS ---
app.post('/api/security/log', async (req, res) => {
  const { type, details, severity, ip } = req.body;
  await insertData('security_logs', { type, details, severity: severity || 'medium', ip: ip || '' });
  res.json({ success: true });
});

app.get('/api/security/logs', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const logs = await getData('security_logs');
  res.json(logs);
});

app.post('/api/security/block', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const { ip, reason } = req.body;
  const expires = new Date(Date.now() + 24 * 60 * 60000).toISOString(); // 24 hours
  await insertData('blocked_ips', { ip, reason: reason || 'Security block', expires_at: expires });
  res.json({ success: true });
});

app.get('/api/security/blocked', async (req, res) => {
  const user = await getUserByToken(req);
  if (!user || user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin pekee' });
  const ips = await getData('blocked_ips');
  res.json(ips);
});

// --- AI (Gemini) ---
app.post('/api/ai/chat', async (req, res) => {
  const { message, isAdmin } = req.body;
  let context = 'Wewe ni msaidizi wa GameHub, duka la gaming la Tanzania. Unajibu kwa Kiswahili au Kiingereza.';
  
  // Get products for context
  const { data: products } = await supabase.from('products').select('*').limit(20);
  const productList = (products || []).map(p => `${p.emoji || '🎮'} ${p.name} = ${p.price} TZS`).join('\n');
  context += `\n\nBidhaa za duka:\n${productList || 'Hakuna bidhaa bado'}`;

  // Admin AI can execute commands
  if (isAdmin) {
    const addMatch = message.match(/ongeza (?:game|bidhaa)\s+(.+?)\s+bei\s+(\d+)/i);
    if (addMatch) {
      const name = addMatch[1].trim();
      const price = parseInt(addMatch[2]);
      await insertData('products', { name, type: 'game', price, emoji: '🎮' });
      return res.json({ reply: `✅ Nimeongeza '${name}' kwa bei ${price.toLocaleString()} TZS kwenye duka!`, action: 'reload' });
    }
    const deleteMatch = message.match(/futa (?:game|bidhaa)\s+(.+)/i);
    if (deleteMatch) {
      const name = deleteMatch[1].trim();
      const { data: found } = await supabase.from('products').select('id').ilike('name', `%${name}%`);
      if (found && found.length) {
        await deleteData('products', found[0].id);
        return res.json({ reply: `✅ Nimefuta '${name}' kutoka dukani.`, action: 'reload' });
      }
      return res.json({ reply: `❌ Sikuipata '${name}' kwenye duka.` });
    }
    if (message.match(/mauzo|orders|oda/i)) {
      const orders = await getData('orders');
      const total = orders.reduce((s, o) => s + (o.amount || 0), 0);
      return res.json({ reply: `📦 Mauzo yote: ${orders.length} oda\n💰 Jumla: ${total.toLocaleString()} TZS\n✅ Zilizolipwa: ${orders.filter(o => o.status === 'paid').length}` });
    }
    if (message.match(/wateja|users/i)) {
      const users = await getData('users');
      return res.json({ reply: `👥 Wateja wote: ${users.length}` });
    }
    if (message.match(/bidhaa|product/i)) {
      const { data: prods } = await supabase.from('products').select('*');
      return res.json({ reply: `🎮 Bidhaa zote: ${(prods || []).map(p => `${p.emoji} ${p.name} = ${p.price.toLocaleString()} TZS`).join('\n')}` });
    }
  }

  // Regular AI chat
  try {
    const fetch = require('node-fetch');
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${context}\n\nMteja: ${message}\n\nMsaidizi:`
          }]
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 300 }
      })
    });
    const aiData = await aiRes.json();
    const reply = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || 'Samahani, sina jibu sasa hivi.';
    res.json({ reply });
  } catch (e) {
    // Fallback if Gemini fails
    const fallback = productList ? 
      `Nina bidhaa hizi:\n${productList}\n\nUnataka kujua nini zaidi?` :
      'Karibu GameHub! Una swali lolote?';
    res.json({ reply: fallback });
  }
});

// ===================== SECURITY MIDDLEWARE =====================
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/') return next();
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const blocked = await getDataEq('blocked_ips', 'ip', ip);
  if (blocked.length && new Date(blocked[0].expires_at) > new Date()) {
    return res.status(403).send('🚫 IP yako imefungwa kwa sababu za usalama.');
  }
  // Simple XSS/SQLi detection
  const sensitive = req.url.match(/['"<>;()%]|(\bunion\b)|(\bselect\b)|(\bdrop\b)|(\balert\b)/i);
  if (sensitive) {
    await insertData('security_logs', {
      type: 'intrusion_attempt', details: `URL: ${req.url} | IP: ${ip}`,
      severity: 'high', ip
    });
    return res.status(403).send('🚫 Shughuli hii imefungwa.');
  }
  next();
});

// ===================== SERVE HTML =====================
const pages = ['index', 'shop', 'product', 'cart', 'checkout', 'success', 'login', 'register',
               'admin', 'account', 'mygames', 'rental', 'game-requests', 'security'];
pages.forEach(p => {
  app.get(`/${p}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', `${p}.html`));
  });
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

// ===================== START SERVER =====================
const listener = app.listen(0, () => {
  const port = listener.address().port;
  console.log(`🚀 GameHub inaendesha kwenye port ${port}`);
});
