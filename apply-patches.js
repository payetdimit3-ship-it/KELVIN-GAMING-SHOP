#!/usr/bin/env node
// Matumizi:  node apply-patches.js [njia/ya/server.js]
// Inatengeneza server.js.bak, kisha inaweka mabadiliko yote ya LIFEISGAMETZ kwenye server.js yako.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const file = path.resolve(process.argv[2] || 'server.js');
const blocksFile = path.join(__dirname, 'lgz-blocks.txt');
if (!fs.existsSync(file)) { console.error('✗ Sioni ' + file); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n');
src = src.replace(/\r\n/g, '\n');
if (src.includes('LGZ-PATCH v1')) { console.log('Mabadiliko tayari yamewekwa — hakuna cha kufanya.'); process.exit(0); }
const B = {};
fs.readFileSync(blocksFile, 'utf8').replace(/\r\n/g, '\n').split(/^\/\/#BLOCK (\w+)\n/m).slice(1)
  .forEach((v, i, a) => { if (i % 2 === 0) B[v] = a[i + 1].replace(/\n+$/, '\n'); });
const log = [];
const fail = m => { console.error('✗ ' + m + '\n  Hakuna mabadiliko yaliyohifadhiwa (server.js haijaguswa).'); process.exit(1); };
function rep(a, b, label) {
  const n = src.split(a).length - 1;
  if (n !== 1) fail(label + ': sehemu ya kubadilisha imepatikana ' + n + ' (inatakiwa 1). Server yako inaweza kuwa tofauti na toleo nililoliona.');
  src = src.replace(a, () => b); log.push('✓ ' + label);
}
function repHandler(start, code, label) {
  const i = src.indexOf(start);
  if (i < 0 || src.indexOf(start, i + 1) >= 0) fail(label + ': route haikupatikana au ipo zaidi ya mara moja.');
  const j = src.indexOf('\n});', i);
  if (j < 0) fail(label + ': mwisho wa route haupatikani.');
  src = src.slice(0, i) + code.trim() + src.slice(j + 4); log.push('✓ ' + label);
}
function insertAfterLine(anchor, code, label) {
  const i = src.indexOf(anchor);
  if (i < 0 || src.indexOf(anchor, i + 1) >= 0) fail(label + ': anchor haikupatikana.');
  const e = src.indexOf('\n', i); src = src.slice(0, e + 1) + '\n' + code + src.slice(e + 1); log.push('✓ ' + label);
}
insertAfterLine("const MEDIA_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'gamehub-media';", B.helpers, 'Helpers (bei, codes, coupons, AI limit, upload)');
rep('.then(() => ensureMediaBucket())', '.then(() => ensureMediaBucket())\n  .then(() => ensureGamesBucket())', 'Bucket ya faragha ya games');
repHandler("app.get('/api/products', (req, res) => {", B.get_products, 'GET /api/products (ficha links/codes za kulipia)');
repHandler("app.post('/api/products', async (req, res) => {", B.post_products, 'POST /api/products (free, links, codes, faili)');
repHandler("app.put('/api/products/:id', async (req, res) => {", B.put_products, 'PUT /api/products/:id');
repHandler("app.delete('/api/products/:id', (req, res) => {", B.delete_products, 'DELETE /api/products/:id');
repHandler("app.post('/api/public-chat/messages', async (req, res) => {", B.public_chat, 'Community chat + AI (@ai)');
repHandler("app.get('/api/tournaments', (req, res) => {", B.tournaments, 'Ficha simu za washiriki wa tournament');
rep('res.json({ success: true, users: Object.values(users) });', 'res.json({ success: true, users: Object.values(users).map(({ password, ...u }) => u) });', 'Usitume password hash kwa browser');
rep("  c.uses += 1;\n  writeJson('coupons.json', coupons);\n  res.json({ success: true, percentOff: c.percentOff, code: c.code });", "  res.json({ success: true, percentOff: c.percentOff, code: c.code });", 'Coupon check isiongeze matumizi');
rep('const { items, total, phone, name } = req.body;', B.clickpesa_vars.trim(), 'ClickPesa: jumla inahesabiwa na server + coupon');
rep('const { items, total, txRef, phone } = req.body;', B.manual_vars.trim(), 'Manual pay: jumla inahesabiwa na server + coupon');
rep("order.confirmedAt = new Date().toISOString();\n  await writeJson('orders.json', orders);\n  logSecurity('MANUAL_PAYMENT_CONFIRMED'", "order.confirmedAt = new Date().toISOString();\n  fulfillOrder(order);\n  await writeJson('orders.json', orders);\n  logSecurity('MANUAL_PAYMENT_CONFIRMED'", 'Toa code unapo-Confirm oda');
rep('order.clickpesaRef = data.id || null;', 'order.clickpesaRef = data.id || null; fulfillOrder(order);', 'Toa code malipo ya ClickPesa yakithibitishwa');
rep("app.post('/api/ai/chat', async (req, res) => {", "app.post('/api/ai/chat', aiLimit, async (req, res) => {", 'Kikomo cha AI chat');
rep("app.post('/api/ai/health', async (req, res) => {", "app.post('/api/ai/health', aiLimit, async (req, res) => {", 'Kikomo cha AI health');
const mk = src.indexOf('UPLOAD/API ERROR HANDLER');
if (mk < 0) fail('Sehemu ya "UPLOAD/API ERROR HANDLER" haipatikani (ya kuweka routes mpya).');
const ls = src.lastIndexOf('\n', mk) + 1;
src = src.slice(0, ls) + B.routes + '\n' + src.slice(ls); log.push('✓ Routes mpya: my-library, coupons/preview, game-advisor, game-files/sign, download');
const out = crlf ? src.replace(/\n/g, '\r\n') : src;
const tmp = file + '.new.js';
fs.writeFileSync(tmp, out);
const chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (chk.status !== 0) { fs.unlinkSync(tmp); fail('Msimbo mpya una kosa la syntax:\n' + chk.stderr); }
fs.copyFileSync(file, file + '.bak');
fs.renameSync(tmp, file);
console.log(log.join('\n') + '\n\n✅ Imekamilika. Nakala ya zamani: ' + path.basename(file) + '.bak\nSasa: git add -A && git commit -m "LIFEISGAMETZ" && git push');
