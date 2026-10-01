const { h, plan } = require('./lib.js');
const E = h.engine;
function fraHand(by) { if (by <= 1937) return 65; if (by <= 1942) return 65 + (by - 1937) * 2 / 12; if (by <= 1954) return 66; if (by <= 1959) return 66 + (by - 1954) * 2 / 12; return 67; }
function ribHand(claim, fra) { const m = Math.round((fra - claim) * 12); if (m > 0) return 1 - Math.min(36, m) * 5 / 900 - Math.max(0, m - 36) * 5 / 1200; const d = Math.min(Math.round((claim - fra) * 12), Math.round((70 - fra) * 12)); return 1 + d * 2 / 300; }
function spHand(start, fra) { const m = Math.round((fra - start) * 12); if (m <= 0) return 1; return 1 - Math.min(36, m) * 25 / 3600 - Math.max(0, m - 36) * 5 / 1200; }
let bad = 0, n = 0;
for (const age of [50, 60, 62, 63.5, 66, 67, 68, 69, 70, 71]) for (const claim of [62, 62.5, 63, 64, 65.5, 66, 66.5, 67, 68, 69.5, 70]) {
  const p = plan({ age, endAge: 90, ssBenefit: 1000, ret: { ssClaim: claim } });
  const by = 2026 - Math.floor(age), fra = fraHand(by);
  const f = E.ssClaimFactor(p, 'self'), fh = ribHand(claim, fra); n++;
  if (Math.abs(f - fh) > 1e-12) { bad++; console.log('RIB', age, claim, f, fh); }
  const s = E.ssSpousalFactor(p, 'self', claim), sh = spHand(claim, fra); n++;
  if (Math.abs(s - sh) > 1e-12) { bad++; console.log('SP', age, claim, s, sh); }
  if (Math.abs(E.ssFullRetirementAge(p, 'self') - fra) > 1e-12) { bad++; console.log('FRA', age); }
  // survivor factor at start ages 60..fra
  for (const st of [60, 61, 63, 65, 66.5]) { const sfra = fraHand(by - 2); const early = Math.max(0, Math.min((sfra - st) * 12, (sfra - 60) * 12)); const hh = 1 - 0.285 * early / ((sfra - 60) * 12); n++;
    const ee = E.survivorReductionFactor(p, st, 'self'); if (Math.abs(ee - hh) > 1e-12) { bad++; console.log('SURV', age, st, ee, hh); } }
}
console.log('checked', n, 'mismatches', bad);
