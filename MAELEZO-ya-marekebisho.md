> **Kumbuka:** huu ni muhtasari wa kumbukumbu tu. Marekebisho yote sasa yanawekwa moja kwa moja na `node patches/apply-all.js`; huhitaji kufuata hatua hizi kwa mkono.

# Marekebisho ya server.js (nakili/badilisha kwenye server yako)

Ukurasa mpya (`lifeisgametz.html`) unatumia API zako zilizopo: `/api/auth/*`, `/api/products`, `/api/clickpesa-pay`, `/api/clickpesa-check`, `/api/manual-pay`, `/api/my-orders`, `/api/admin/orders`. Hapa chini ni mabadiliko 5 madogo ya server ili games za bure, links nyingi na usalama wa malipo vifanye kazi.

## 1) Weka juu ya routes za products (helpers)
```js
const cleanLinks = a => (Array.isArray(a) ? a : [])
  .filter(l => l && /^https?:\/\//i.test(String(l.u)))
  .slice(0, 20)
  .map(l => ({ l: String(l.l || 'Link').slice(0, 60), u: String(l.u).slice(0, 2000) }));

// Bei inahesabiwa na SERVER, si na browser
function priceItems(items) {
  const products = readJson('products.json', {});
  const list = Object.values(products);
  let total = 0; const clean = [];
  for (const i of (Array.isArray(items) ? items : [])) {
    const p = products[i.id] || list.find(x => x.name === i.name);
    if (!p || p.status === 'Draft' || p.free) continue;
    const q = Math.max(1, Math.min(10, parseInt(i.quantity || i.qty || 1, 10) || 1));
    clean.push({ id: p.id, name: p.name, price: p.price, quantity: q });
    total += p.price * q;
  }
  return { items: clean, total };
}
```

## 2) Badilisha `GET /api/products`
Kwa sasa kila mtu anaona `downloadLink`, `accountUser` na `accountPassword` za bidhaa za kulipia. Hii inaficha hizo kwa wasio staff/admin (games za bure zinabaki na links).
```js
app.get('/api/products', (req, res) => {
  const u = getUserByToken(req);
  const staff = !!(u && (u.isAdmin || u.isStaff));
  const list = Object.values(readJson('products.json', {})).filter(p => staff || p.status !== 'Draft');
  res.json({ success: true, products: list.map(p => staff || p.free ? p : { ...p, downloadLink: '', accountUser: '', accountPassword: '', links: [] }) });
});
```
Tahadhari: kama kurasa zako za zamani (store.html n.k.) zinasoma `downloadLink` moja kwa moja kutoka `/api/products`, zitaacha kuiona. Ziunganishe na `/api/my-library` hapa chini.

## 3) Badilisha `POST /api/products` na `PUT /api/products/:id`
```js
app.post('/api/products', async (req, res) => {
  const user = getUserByToken(req);
  if (!user || (!user.isAdmin && !user.isStaff)) return res.status(403).json({ error: 'Huna ruhusa' });
  const b = req.body || {};
  const free = !!b.free;
  if (!b.name || (!free && !Number(b.price))) return res.status(400).json({ error: 'Jaza jina na bei (au chagua Free)' });
  const products = readJson('products.json', {});
  const id = 'p' + Date.now();
  products[id] = { id, name: String(b.name).slice(0, 160), type: b.type || 'Bidhaa', platform: String(b.platform || '').slice(0, 40),
    price: free ? 0 : Number(b.price), oldPrice: free ? 0 : Number(b.oldPrice || 0), free,
    status: b.status === 'Draft' ? 'Draft' : 'Active', emoji: b.emoji || '🎮', desc: String(b.desc || '').slice(0, 2000),
    downloadLink: b.downloadLink || '', imageUrl: b.imageUrl || '', trailerUrl: b.trailerUrl || '',
    category: b.category || 'Zote', section: b.section || 'shop',
    accountUser: b.accountUser || '', accountPassword: b.accountPassword || '', links: cleanLinks(b.links) };
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
  const pick = (k) => (b[k] !== undefined ? b[k] : e[k]);
  products[req.params.id] = { ...e, name: b.name || e.name, type: b.type || e.type, platform: pick('platform'),
    price: free ? 0 : (b.price !== undefined && b.price !== '' ? Number(b.price) : e.price),
    oldPrice: b.oldPrice !== undefined ? Number(b.oldPrice) || 0 : e.oldPrice, free,
    status: b.status ? (b.status === 'Draft' ? 'Draft' : 'Active') : (e.status || 'Active'),
    emoji: b.emoji || e.emoji, desc: pick('desc'), downloadLink: pick('downloadLink'), imageUrl: pick('imageUrl'),
    trailerUrl: pick('trailerUrl'), category: b.category || e.category || 'Zote', section: b.section || e.section || 'shop',
    accountUser: pick('accountUser'), accountPassword: pick('accountPassword'),
    links: b.links !== undefined ? cleanLinks(b.links) : (e.links || []) };
  const saved = await writeJson('products.json', products);
  res.json({ success: true, product: products[req.params.id], persistent: saved.cloud !== false });
});
```

## 4) Malipo — usiamini `total` kutoka kwa browser
Sasa `total` inatoka kwa mteja, hivyo mtu anaweza kutuma `total: 1` na kulipia kidogo. Badilisha mistari miwili:

Ndani ya `app.post('/api/clickpesa-pay', ...)` badilisha
`const { items, total, phone, name } = req.body;` kuwa
```js
const { phone, name } = req.body;
const priced = priceItems(req.body.items);
const items = priced.items, total = priced.total;
```
Ndani ya `app.post('/api/manual-pay', ...)` badilisha
`const { items, total, txRef, phone } = req.body;` kuwa
```js
const { txRef, phone } = req.body;
const priced = priceItems(req.body.items);
const items = priced.items, total = priced.total;
```

## 5) Library ya mteja (links za bidhaa alizolipia)
```js
app.get('/api/my-library', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const products = readJson('products.json', {});
  const ids = new Set();
  readJson('orders.json', []).filter(o => o.customer === user.email && o.status === 'successful')
    .forEach(o => (o.items || []).forEach(i => { if (i.id) ids.add(i.id); }));
  res.json({ success: true, products: [...ids].map(id => products[id]).filter(Boolean) });
});
```

## Kuweka ukurasa
Weka `lifeisgametz.html` kwenye root ya project (folda moja na `index.html`). Server yako tayari inaihudumia kupitia `express.static('.')`, kwa hiyo utaifungua kwa `https://JINA-LAKO.onrender.com/lifeisgametz.html`. Ukipenda iwe ukurasa wa kwanza, ibadilishe jina kuwa `index.html` (utafunika ya zamani, hifadhi nakala kwanza).

## 6) Ficha namba za simu za washiriki wa tournament
`GET /api/tournaments` sasa inarudisha majina na simu za wote waliojisajili kwa kila mtu. Badilisha iwe:
```js
app.get('/api/tournaments', (req, res) => {
  const u = getUserByToken(req);
  const data = readJson('tournaments.json', []);
  res.json({ success: true, tournaments: data.map(t => u && u.isAdmin ? t : { ...t, registrations: (t.registrations || []).map(() => ({})) }) });
});
```
(Ukurasa unaonyesha idadi ya washiriki tu, kwa hiyo hii haiuvunji.)

## 7) Usitume password hashes kwa browser
`GET /api/admin/users` inarudisha kila field ya user, pamoja na `password` (hash). Hata kwa admin, si lazima. Badilisha mstari wa `res.json` kuwa:
```js
res.json({ success: true, users: Object.values(users).map(({ password, ...u }) => u) });
```

## 8) Video za Academy hazijalindwa
`GET /api/courses` inarudisha URL za video zote kwa kila mtu, na `price` ya kozi haitumiki popote kuzuia. Kwa sasa Academy ni ya bure kwa wote. Kama unataka kozi za kulipia, tuongeze kufungua video kwa wateja waliolipa tu (kama `/api/my-library`).

## 9) Coupons zifanye kazi kweli kwenye malipo
Sasa kodi zinaundwa lakini hazipunguzi bei. Pia `/api/coupons/check` ya sasa inaongeza `uses` kila mtu akiangalia tu (kodi inaisha bila mtu kununua). Fanya haya:

**a)** Ongeza helpers (karibu na `priceItems`):
```js
function applyCoupon(total, code) {
  if (!code) return { total, code: '' };
  const coupons = readJson('coupons.json', {});
  const c = coupons[String(code).trim().toUpperCase()];
  if (!c || !c.active || (c.maxUses && c.uses >= c.maxUses)) throw new Error('Kodi si sahihi au imeisha');
  const pct = Math.min(90, Math.max(1, Number(c.percentOff) || 0));
  c.uses += 1; writeJson('coupons.json', coupons);
  return { total: Math.max(1, Math.round(total * (100 - pct) / 100)), code: c.code };
}
```

**b)** Njia mpya ya kuangalia kodi bila kuitumia:
```js
app.post('/api/coupons/preview', (req, res) => {
  const coupons = readJson('coupons.json', {});
  const c = coupons[String(req.body.code || '').trim().toUpperCase()];
  if (!c || !c.active || (c.maxUses && c.uses >= c.maxUses)) return res.status(404).json({ error: 'Kodi si sahihi au imeisha' });
  res.json({ success: true, code: c.code, percentOff: Math.min(90, Math.max(1, Number(c.percentOff) || 0)) });
});
```
Kwenye `/api/coupons/check` ya zamani futa mistari `c.uses += 1;` na `writeJson('coupons.json', coupons);`.

**c)** Kwenye `/api/clickpesa-pay` na `/api/manual-pay`, mistari uliyoongeza kwenye namba 4:
```js
const priced = priceItems(req.body.items);
const items = priced.items, total = priced.total;
```
ibadilishwe kuwa:
```js
const priced = priceItems(req.body.items);
let cp; try { cp = applyCoupon(priced.total, req.body.coupon); } catch (e) { return res.status(400).json({ error: e.message }); }
const items = priced.items, total = cp.total;
```
(Kodi inahesabiwa utumiaji pale oda inapoanzishwa, hata malipo yakishindwa baadaye.)

## 10) AI na Health ni wazi kwa kila mtu
`/api/ai/chat` na `/api/ai/health` hazihitaji kuingia wala kikomo, kwa hiyo mtu yeyote (au bot) anaweza kumaliza kikomo cha Cerebras/Groq/Claude yako. Weka kikomo cha maombi kwa IP, juu ya routes hizo mbili:
```js
const aiRate = new Map();
function aiLimit(req, res, next) {
  const ip = getIP(req), now = Date.now();
  const hits = (aiRate.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 8) return res.status(429).json({ error: 'Subiri kidogo kabla ya swali lingine.' });
  hits.push(now); aiRate.set(ip, hits); next();
}
app.use(['/api/ai/chat', '/api/ai/health'], aiLimit);
```
Pia `/api/ai/health` inahifadhi maswali ya afya ya watu (herufi 200 za kwanza, na email ukiingia) kwenye `health_chats.json`. Kama huhitaji kumbukumbu hizo, ondoa mistari ya `healthLog` ili usihifadhi taarifa nyeti za watumiaji.

## 11) AI kwenye Community + Game Advisor (kila category na kila game)
Hizi zinahitaji `askAI` na `getIP` zilizopo kwenye server yako. Kikomo cha maswali: tumia toleo hili la kikomo (linachukua nafasi ya `aiLimit` ya namba 10):
```js
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
app.use(['/api/ai/chat', '/api/ai/health'], aiLimit);
```

### a) Badilisha `POST /api/public-chat/messages` (AI ijibu kwenye chat ya wote)
Mtu akianza ujumbe na `@ai` (au akibonyeza "🤖 Uliza AI"), AI inajibu hadharani kwenye chat hiyohiyo, swali lolote.
```js
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
```

### b) Njia mpya: `POST /api/ai/game-advisor`
Inajibu kwa kategoria (PSP, PS2, PS3, Switch, Android, PC, Store) au kwa game moja (ukurasa wa bidhaa), kwa kuangalia kifaa cha mteja.
```js
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
```

## 12) Gift Cards, Keys na Akaunti — kila mteja apate code yake
Gift card, Steam key au akaunti ni vitu vya pekee: mteja mmoja akinunua, mwingine asipewe code ileile. Server yako haina stock ya codes, kwa hiyo hii inaongeza: stock ya codes kwa kila bidhaa, kutoa code moja kwa kila ununuzi unapothibitishwa, na kuonyesha code kwenye Library ya mnunuzi tu. **Sehemu hii inachukua nafasi ya #5 (`/api/my-library`) na inabadilisha #1, #2 na #3.**

**a)** Helper mpya (karibu na `cleanLinks`):
```js
const cleanCodes = a => (Array.isArray(a) ? a : []).map(x => String(x).trim().slice(0, 300)).filter(Boolean).slice(0, 500);
```

**b)** `priceItems` mpya (inachukua nafasi ya ile ya #1) — inakataa bidhaa zilizoisha:
```js
function priceItems(items) {
  const products = readJson('products.json', {});
  const list = Object.values(products);
  let total = 0; const clean = [], soldOut = [];
  for (const i of (Array.isArray(items) ? items : [])) {
    const p = products[i.id] || list.find(x => x.name === i.name);
    if (!p || p.status === 'Draft' || p.free) continue;
    const q = Math.max(1, Math.min(10, parseInt(i.quantity || i.qty || 1, 10) || 1));
    if (p.usesCodes && (p.codes || []).length < q) { soldOut.push(p.name); continue; }
    clean.push({ id: p.id, name: p.name, price: p.price, quantity: q });
    total += p.price * q;
  }
  return { items: clean, total, soldOut };
}
```
Kwenye `/api/clickpesa-pay` na `/api/manual-pay`, mara tu baada ya `const priced = priceItems(...)` ongeza:
```js
if (priced.soldOut.length) return res.status(400).json({ error: 'Zimeisha stock: ' + priced.soldOut.join(', ') });
```

**c)** `POST /api/products`: ndani ya object ya `products[id] = {...}` ongeza
```js
codes: cleanCodes(b.codes), usesCodes: cleanCodes(b.codes).length > 0,
```
na kwenye `PUT /api/products/:id` ongeza (codes mpya zinaongezwa kwenye stock iliyopo):
```js
codes: cleanCodes(b.codes).length ? [...(e.codes || []), ...cleanCodes(b.codes)] : (e.codes || []),
usesCodes: !!e.usesCodes || cleanCodes(b.codes).length > 0,
```

**d)** `GET /api/products` (inachukua nafasi ya #2): codes zisitoke kwa mtu yeyote, ila idadi ya stock itoke:
```js
app.get('/api/products', (req, res) => {
  const u = getUserByToken(req);
  const staff = !!(u && (u.isAdmin || u.isStaff));
  const list = Object.values(readJson('products.json', {})).filter(p => staff || p.status !== 'Draft');
  const base = p => ({ ...p, codes: undefined, stock: (p.codes || []).length });
  res.json({ success: true, products: list.map(p => staff || p.free ? base(p) : { ...base(p), downloadLink: '', accountUser: '', accountPassword: '', links: [] }) });
});
```

**e)** Toa code malipo yanapothibitishwa. Ongeza function:
```js
function fulfillOrder(order) {
  if (order.delivered) return;
  const products = readJson('products.json', {});
  const delivered = [];
  for (const i of order.items || []) {
    const p = products[i.id];
    if (!p || !p.usesCodes) continue;
    for (let n = 0; n < (i.quantity || 1); n++) delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null });
  }
  order.delivered = delivered;
  writeJson('products.json', products);
}
```
Kisha weka `fulfillOrder(order);` mahali pawili: kwenye `/api/admin/orders/confirm` baada ya `order.status = 'successful';`, na kwenye `/api/clickpesa-webhook` baada ya `order.status = 'successful';`. (Oda itahifadhiwa na `writeJson('orders.json', ...)` iliyopo.)

**f)** `GET /api/my-library` mpya (inachukua nafasi ya #5):
```js
app.get('/api/my-library', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ error: 'Ingia kwanza' });
  const products = readJson('products.json', {});
  const mine = readJson('orders.json', []).filter(o => o.customer === user.email && o.status === 'successful');
  const ids = new Set(), delivered = [];
  mine.forEach(o => { (o.items || []).forEach(i => { if (i.id) ids.add(i.id); }); (o.delivered || []).forEach(d => delivered.push(d)); });
  res.json({ success: true, delivered, products: [...ids].map(id => products[id]).filter(Boolean).map(p => ({ ...p, codes: undefined })) });
});
```
Kama oda ilithibitishwa **kabla** ya mabadiliko haya, haina codes; uitoe mkono au ongeza codes uzitume kwa mteja.

## 13) Upload ya game (faili la game) — private na salama
Admin anaweza kuweka **links** (Option 1) au **kuupload faili** (Option 2), au yote mawili. Faili linahifadhiwa kwenye Supabase Storage bucket **ya faragha** (`gamehub-games`), si ile ya wazi ya movies. Mteja anadownload kupitia link ya muda mfupi (dakika 10) inayotolewa na server **kwa waliolipia tu** (au game ya bure akiwa ameingia, au admin).

Faili linaenda **moja kwa moja** kutoka kwenye browser ya admin hadi Supabase (halipiti Render), kwa hiyo halimalizi memory ya Render. Ukurasa unahitaji `SUPABASE_URL` na `SUPABASE_ANON_KEY` ziwe kwenye Render (route yako ya `/api/auth/social/config` inazitoa).

**a)** Weka juu ya server (karibu na `MEDIA_BUCKET`):
```js
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
```
Kwenye mwisho wa server badilisha `.then(() => ensureMediaBucket())` kuwa `.then(() => ensureMediaBucket()).then(() => ensureGamesBucket())`.

**b)** Njia mbili mpya:
```js
// Admin/staff anaomba ruhusa ya kuupload (browser inapeleka faili moja kwa moja Supabase)
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

// Mteja anadownload (aliyelipia, au game ya bure, au admin)
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
```

**c)** `POST /api/products`: ndani ya object ongeza `file: cleanFile(b.file),`. `PUT /api/products/:id`: ongeza
```js
file: b.removeFile ? null : (cleanFile(b.file) || e.file || null),
```

**d)** Usitume `path` ya faili kwa wote: kwenye `base` ya #12(d) na kwenye `.map` ya `/api/my-library` (#12f) ongeza:
```js
file: undefined, hasFile: !!p.file, fileName: p.file ? p.file.name : '', fileSize: p.file ? p.file.size : 0
```
(yaani `base = p => ({ ...p, codes: undefined, file: undefined, hasFile: !!p.file, fileName: p.file ? p.file.name : '', fileSize: p.file ? p.file.size : 0, stock: (p.codes || []).length })`)

**e)** (Hiari) Futa faili kutoka Storage unapofuta bidhaa, ndani ya `app.delete('/api/products/:id', ...)` kabla ya `delete products[...]`:
```js
const old = products[req.params.id];
if (old && old.file && supabase) await supabase.storage.from(GAMES_BUCKET).remove([old.file.path]).catch(() => {});
```
(na ufanye handler iwe `async`).

**Vikomo vya Supabase unavyopaswa kujua:**
- Mpango wa **Free**: kila faili hadi **50 MB** tu. Games nyingi ni kubwa kuliko hapo, kwa hiyo utahitaji **Pro**, kisha **Storage → Settings** ongeza "Global file size limit" (hadi 50 GB).
- Bandwidth ya downloads (egress) inahesabiwa: Free ina 5 GB tu kwa mwezi, Pro 250 GB. Games kubwa zenye wateja wengi zinaweza kuzidi haraka.
- Kwa faili kubwa sana au trafiki kubwa, links (Option 1) za Google Drive/Mega au hifadhi ya bei nafuu kama Cloudflare R2 zinaweza kuwa za bei nafuu zaidi. Ndiyo maana nimekuachia chaguo zote mbili.
