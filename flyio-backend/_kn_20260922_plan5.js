const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, 'reports', 'kiness_20260922');
const first = JSON.parse(fs.readFileSync(path.join(D, 'colloquial_final.json'), 'utf8'));
const second = JSON.parse(fs.readFileSync(path.join(D, 'colloquial_second_pass.json'), 'utf8'))
  .map(x => x.name).filter(x => !/(?:뉴시티|시티)$/.test(x));
const names = [...new Set([...first, ...second])].sort((a, b) => a.localeCompare(b, 'ko'));
const inventory = JSON.parse(fs.readFileSync(path.join(D, 'inventory_after3.json'), 'utf8'));
const existing = new Set(inventory.kw.map(x => x[2]));
for (const file of ['registered4.jsonl']) {
  for (const line of fs.readFileSync(path.join(D, file), 'utf8').split('\n')) {
    if (line.trim()) existing.add(JSON.parse(line).kw);
  }
}
const groups = JSON.parse(fs.readFileSync(path.join(D, 'pool_groups.json'), 'utf8'));
const desired = names.flatMap(name => [name + '성장클리닉', name + '키성장클리닉'])
  .filter(kw => !existing.has(kw));
const plan = desired.map((kw, i) => ({
  gid: groups[i % groups.length].gid,
  gname: groups[i % groups.length].name,
  kw,
  bid: 700,
  src: '생활권·상권 자동완성',
}));
fs.writeFileSync(path.join(D, 'register_plan5.json'), JSON.stringify(plan, null, 2));
console.log(JSON.stringify({names: names.length, desired: names.length * 2,
  alreadyExisting: names.length * 2 - plan.length, toRegister: plan.length}, null, 2));
