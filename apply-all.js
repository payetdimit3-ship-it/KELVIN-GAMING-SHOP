#!/usr/bin/env node
// Matumizi (ukiwa kwenye root ya project yako, folda yenye server.js):
//   node patches/apply-all.js
// Inaendesha marekebisho yote kwa mpangilio: v1 hadi v5. Yaliyokwisha wekwa yanarukwa.
const { spawnSync } = require('child_process');
const path = require('path');
const steps = ['apply-patches.js', 'apply-patches-v2.js', 'apply-patches-v3.js', 'apply-patches-v4.js', 'apply-patches-v5.js'];
const target = process.argv[2] || 'server.js';
for (const s of steps) {
  console.log('\n=== ' + s + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, s), target], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\n✗ Imesimama kwenye ' + s + '. Hakuna mabadiliko yaliyohifadhiwa kwenye hatua hii; yaliyotangulia yamehifadhiwa (nakala *.bak zipo).');
    process.exit(r.status || 1);
  }
}
console.log('\n✅ Marekebisho yote (v1-v5) yamewekwa. Sasa: git add -A && git commit -m "LIFEISGAMETZ" && git push');
