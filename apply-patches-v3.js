#!/usr/bin/env node
// Matumizi:  node apply-patches-v3.js [njia/ya/server.js]   (endesha BAADA ya v1 na v2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const file = path.resolve(process.argv[2] || 'server.js');
if (!fs.existsSync(file)) { console.error('✗ Sioni ' + file); process.exit(1); }
let src = fs.readFileSync(file, 'utf8');
const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');
if (!src.includes('LGZ-PATCH v2')) { console.error('✗ Endesha kwanza: node apply-patches.js kisha node apply-patches-v2.js'); process.exit(1); }
if (src.includes('LGZ-PATCH v3')) { console.log('Mabadiliko ya v3 tayari yamewekwa.'); process.exit(0); }
const routes = fs.readFileSync(path.join(__dirname, 'lgz-blocks-v3.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/^\/\/#BLOCK routes\n/, '');
const fail = m => { console.error('✗ ' + m + '\n  Hakuna mabadiliko yaliyohifadhiwa.'); process.exit(1); };
const anchor = "'squads.json', 'inquiries.json'";
if (src.split(anchor).length !== 2) fail('Sehemu ya TRACKED_FILES haikupatikana mara moja (je v2 imewekwa?).');
src = src.replace(anchor, () => anchor + ", 'tickets.json'");
const mk = src.indexOf('UPLOAD/API ERROR HANDLER');
if (mk < 0) fail('Sehemu ya "UPLOAD/API ERROR HANDLER" haipatikani.');
const ls = src.lastIndexOf('\n', mk) + 1;
src = src.slice(0, ls) + routes + '\n' + src.slice(ls);
const out = crlf ? src.replace(/\n/g, '\r\n') : src, tmp = file + '.new.js';
fs.writeFileSync(tmp, out);
const chk = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (chk.status !== 0) { fs.unlinkSync(tmp); fail('Msimbo mpya una kosa la syntax:\n' + chk.stderr); }
fs.copyFileSync(file, file + '.bak3'); fs.renameSync(tmp, file);
console.log('✓ Hifadhi ya tiketi kwenye Supabase\n✓ Routes mpya: /api/support-ticket na /api/admin/tickets\n\n✅ v3 imekamilika. Nakala ya zamani: ' + path.basename(file) + '.bak3');
