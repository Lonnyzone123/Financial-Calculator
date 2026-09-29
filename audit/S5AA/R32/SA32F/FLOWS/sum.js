let s = ''; process.stdin.on('data', d => s += d).on('end', () => { const j = JSON.parse(s);
  console.log(j.SEED, 'plans', j.plansRun, 'invalid', j.invalid, 'notOk', j.notOk, 'rows', j.rows, JSON.stringify(j.classes), 'leaks', j.failCount, JSON.stringify(j.firstFails.slice(0, 6)), JSON.stringify(j.invalidCodes)); });
