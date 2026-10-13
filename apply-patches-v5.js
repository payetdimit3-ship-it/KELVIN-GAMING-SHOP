#!/usr/bin/env node
// Matumizi:  node apply-patches-v5.js [njia/ya/server.js]   (endesha BAADA ya v1, v2 na v4)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const file = path.resolve(process.argv[2] || 'server.js');
if (!fs.existsSync(file)) { console.error('✗ Sioni ' + file); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');
if (!src.includes('LGZ-PATCH v2') || !src.includes('LGZ-PATCH v4')) { console.error('✗ Endesha kwanza v1, v2 na v4 (node patches/apply-all.js)'); process.exit(1); }
if (src.includes('LGZ-PATCH v5')) { console.log('Mabadiliko ya v5 tayari yamewekwa.'); process.exit(0); }
const routes = fs.readFileSync(path.join(__dirname, 'lgz-blocks-v5.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/^\/\/#BLOCK routes\n/, '');
const log = [];
const fail = m => { console.error('✗ ' + m + '\n  Hakuna mabadiliko yaliyohifadhiwa.'); process.exit(1); };
function rep(a, b, label) {
  const n = src.split(a).length - 1;
  if (n !== 1) fail(label + ': sehemu ya kubadilisha imepatikana ' + n + ' (inatakiwa 1).');
  src = src.replace(a, () => b); log.push('✓ ' + label);
}
rep("'squads.json', 'inquiries.json'", "'squads.json', 'inquiries.json', 'payouts.json', 'withdrawals.json'", 'Hifadhi ya mapato na maombi ya kutoa kwenye Supabase');
rep("'supportEmail', 'manualPayInstructions'];", "'supportEmail', 'manualPayInstructions', 'squadCommission', 'payoutHoldDays', 'minWithdraw'];", 'Settings za kamisheni, siku za ulinzi na kiwango cha chini');
rep("delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null }); p.reservation = null;", "delivered.push({ id: i.id, name: p.name, code: (p.codes || []).shift() || null }); p.reservation = null;\n      if (p.squadId) creditSquadSale(order, p, i);", 'Weka mapato ya muuzaji kikosi kinapouzwa');
const mk = src.indexOf('UPLOAD/API ERROR HANDLER');
if (mk < 0) fail('Sehemu ya "UPLOAD/API ERROR HANDLER" haipatikani.');
const ls = src.lastIndexOf('\n', mk) + 1;
src = src.slice(0, ls) + routes + '\n' + src.slice(ls); log.push('✓ Routes mpya: /api/payouts/*, /api/admin/withdrawals');
const out = crlf ? src.replace(/\n/g, '\r\n') : src, tmp = file + '.new.js';
fs.writeFileSync(tmp, out);
const chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (chk.status !== 0) { fs.unlinkSync(tmp); fail('Msimbo mpya una kosa la syntax:\n' + chk.stderr); }
fs.copyFileSync(file, file + '.bak5'); fs.renameSync(tmp, file);
console.log(log.join('\n') + '\n\n✅ v5 imekamilika. Nakala ya zamani: ' + path.basename(file) + '.bak5');
