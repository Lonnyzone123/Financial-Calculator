'use strict';
// DMC: accountReturnForPeriod() clamps a drawn return to [-95%, +200%]. At the UI's maximum volatility (80%) that moves
// the mean return well above the entered expected return. Run: node mc-clamp-probe.js
const h = require('../harness.js'); const E = h.engine;
const p = h.plan({ years: 1, retireAge: 61, balance: 0, amount: 0 }); p.advanced.transferOn = false; p.advanced.assetsOn = false;
p.accounts = [h.account('brk', 'taxable', 1000000)];
Object.assign(p.assumptions, { method: 'monteCarlo', returnRate: 10, volatility: 80, fee: 0, inflation: 0, runs: 1, seed: 1 });
if (!h.validateScenario(structuredClone(p)).valid) throw new Error('invalid');
let s = 0; const n = 20000;
for (let i = 0; i < n; i++) { const r = E.simulatePlan(structuredClone(p), E.rng(1 + 2 * i), 0, E.rng(2 + 2 * i)); s += r.rows[1].total / 1e6 - 1; }
// hand: E[clamp(R,-0.95,2)] for R~N(0.10,0.80): mu + sigma*[phi(a)-a*(1-Phi(a))... ] written out as the two truncation terms
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
const Phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = phi(z) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z >= 0 ? 1 - d : d; };
const mu = 0.10, sg = 0.80, a = (-0.95 - mu) / sg, b = (2 - mu) / sg;
const lowerGain = sg * (phi(a) + a * Phi(a)), upperLoss = sg * (phi(b) - b * (1 - Phi(b)));
console.log(JSON.stringify({ paths: n, engineMeanReturn: s / n, statedExpected: mu, handClampedMean: mu + lowerGain - upperLoss, lowerGain, upperLoss }));
console.log('MC-CLAMP-PROBE DONE');
