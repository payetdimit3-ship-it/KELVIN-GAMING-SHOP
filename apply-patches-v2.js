#!/usr/bin/env node
// Matumizi:  node apply-patches-v2.js [njia/ya/server.js]   (endesha BAADA ya apply-patches.js ya kwanza)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const file = path.resolve(process.argv[2] || 'server.js');
if (!fs.existsSync(file)) { console.error('✗ Sioni ' + file); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');
if (!src.includes('LGZ-PATCH v1')) { console.error('✗ Endesha kwanza: node apply-patches.js'); process.exit(1); }
if (src.includes('LGZ-PATCH v2')) { console.log('Mabadiliko ya v2 tayari yamewekwa.'); process.exit(0); }
const B = {};
fs.readFileSync(path.join(__dirname, 'lgz-blocks-v2.txt'), 'utf8').replace(/\r\n/g, '\n').split(/^\/\/#BLOCK (\w+)\n/m).slice(1)
  .forEach((v, i, a) => { if (i % 2 === 0) B[v] = a[i + 1].replace(/\n+$/, '\n'); });
const log = [];
const fail = m => { console.error('✗ ' + m + '\n  Hakuna mabadiliko yaliyohifadhiwa.'); process.exit(1); };
function rep(a, b, label) {
  const n = src.split(a).length - 1;
  if (n !== 1) fail(label + ': sehemu ya kubadilisha imepatikana ' + n + ' (inatakiwa 1).');
  src = src.replace(a, () => b); log.push('✓ ' + label);
}
rep("'public_chat.json', 'health_chats.json', 'boss_approvals.json'", "'public_chat.json', 'health_chats.json', 'boss_approvals.json', 'squads.json', 'inquiries.json'", 'Hifadhi ya squads na maombi ya biashara kwenye Supabase');
const pa = src.indexOf('const pubProduct = p => ({');
if (pa < 0) fail('Helpers za v1 hazipatikani.');
const pe = src.indexOf('\n', pa);
src = src.slice(0, pe + 1) + '\n' + B.helpers + src.slice(pe + 1); log.push('✓ Helpers (usimbaji, reservation, squads)');
rep("if (p.usesCodes && (p.codes || []).length < q) { soldOut.push(p.name); continue; }", "if (p.unique && p.reservation && p.reservation.until > Date.now()) { soldOut.push(p.name + ' (imehifadhiwa kwa mnunuzi mwingine, jaribu tena baadaye)'); continue; }\n    if (p.usesCodes && (p.codes || []).length < q) { soldOut.push(p.name); continue; }", 'Kikosi kimoja kisiuzwe mara mbili (reservation)');
rep("delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null });", "delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null }); p.reservation = null;", 'Ondoa reservation baada ya kutoa code');
rep("res.json({ success: true, delivered, products:", "res.json({ success: true, delivered: delivered.map(d => ({ ...d, code: dec(d.code) })), products:", 'Library: fungua code iliyosimbwa kwa mnunuzi pekee');
rep("const orderReference = 'GH' + Date.now().toString().slice(-10);", "const orderReference = 'GH' + Date.now().toString().slice(-10);\n    reserveUnique(items, orderReference, 20);", 'ClickPesa: hifadhi kikosi kwa dakika 20');
rep("const orderRef = 'MANUAL-' + Date.now();", "const orderRef = 'MANUAL-' + Date.now();\n  reserveUnique(items, orderRef, 1440);", 'Manual: hifadhi kikosi kwa saa 24');
rep("if (o) { o.status = 'failed_to_start'; await writeJson('orders.json', all); }", "if (o) { o.status = 'failed_to_start'; await writeJson('orders.json', all); }\n      releaseReserved(orderReference);", 'Malipo yasipoanza: fungua kikosi');
rep("if (order && order.status !== 'successful') { order.status = 'failed'; await writeJson('orders.json', orders); }", "if (order && order.status !== 'successful') { order.status = 'failed'; await writeJson('orders.json', orders); releaseReserved(orderRef); }", 'Malipo yakishindwa: fungua kikosi');
rep("const filtered = orders.filter(o => o.tx_ref !== tx_ref);", "const filtered = orders.filter(o => o.tx_ref !== tx_ref);\n  releaseReserved(tx_ref);", 'Admin akikataa oda: fungua kikosi');
const mk = src.indexOf('UPLOAD/API ERROR HANDLER');
if (mk < 0) fail('Sehemu ya "UPLOAD/API ERROR HANDLER" haipatikani.');
const ls = src.lastIndexOf('\n', mk) + 1;
src = src.slice(0, ls) + B.routes + '\n' + src.slice(ls); log.push('✓ Routes mpya: squads, biashara/washirika, AI mwalimu');
const out = crlf ? src.replace(/\n/g, '\r\n') : src, tmp = file + '.new.js';
fs.writeFileSync(tmp, out);
const chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (chk.status !== 0) { fs.unlinkSync(tmp); fail('Msimbo mpya una kosa la syntax:\n' + chk.stderr); }
fs.copyFileSync(file, file + '.bak2'); fs.renameSync(tmp, file);
console.log(log.join('\n') + '\n\n✅ v2 imekamilika. Nakala ya zamani: ' + path.basename(file) + '.bak2\n⚠️ Weka SQUAD_KEY (maneno marefu ya siri) kwenye Render kabla ya kutumia squads.');
