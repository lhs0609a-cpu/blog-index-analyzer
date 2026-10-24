const fs = require('fs');
const path = require('path');

const D = path.join(__dirname, 'reports', 'kiness_20260922');
const rows = fs.readFileSync(path.join(D, 'ac_raw2.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse);
const seedQueries = JSON.parse(fs.readFileSync(path.join(D, 'ac_seeds2.json'), 'utf8'));
const firstPass = JSON.parse(fs.readFileSync(path.join(D, 'colloquial_final.json'), 'utf8'));
const official = new Set(seedQueries.map(q => q.slice(0, -1)));
const suffix = /(?:지구|신도시|뉴타운|시티)$/;
const candidates = new Map();

for (const {q, r} of rows) {
  const base = q.slice(0, -1);
  for (const suggestion of r || []) {
    const token = suggestion.replace(/\s+/g, ' ').trim().split(' ')[0];
    if (!/^[가-힣]{2,20}$/.test(token) || !suffix.test(token)) continue;
    if (!token.startsWith(base) || official.has(token)) continue;
    if (!candidates.has(token)) candidates.set(token, new Set());
    candidates.get(token).add(q);
  }
}

const secondPass = [...candidates].sort(([a], [b]) => a.localeCompare(b, 'ko')).map(([name, queries]) => ({
  name,
  queries: [...queries].sort(),
}));
const combined = [...new Set([...firstPass, ...secondPass.map(x => x.name)])]
  .sort((a, b) => a.localeCompare(b, 'ko'));
fs.writeFileSync(path.join(D, 'colloquial_second_pass.json'), JSON.stringify(secondPass, null, 2));
fs.writeFileSync(path.join(D, 'colloquial_all.json'), JSON.stringify(combined, null, 2));
console.log(JSON.stringify({rows: rows.length, uniqueQueries: new Set(rows.map(x => x.q)).size,
  firstPass: firstPass.length, secondPass: secondPass.length, combined: combined.length}, null, 2));
console.log(secondPass.map(x => x.name).join('\n'));
