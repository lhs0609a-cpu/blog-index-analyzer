// 해울 입찰 재배분 적용. 사용: node _haeul_20260921_apply.js --dry | --apply
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const D = path.join(__dirname, 'reports', 'haeul_20260921');
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--dry') ? 'dry' : null;
assert(mode, '--dry 또는 --apply 를 붙여라');
const plan = JSON.parse(fs.readFileSync(path.join(D, 'bid_plan.json'), 'utf8'));
// 사전 검증 — 하나라도 어긋나면 아무것도 보내지 않는다
for (const p of plan) {
  assert(p.신입찰 % 10 === 0, '10원 단위 아님 ' + p.키워드 + ' ' + p.신입찰);
  assert(p.신입찰 >= 70, '하한 미만 ' + p.키워드);
  assert(p.신입찰 <= 25000, '상한 초과 ' + p.키워드 + ' ' + p.신입찰);
  assert(p.kid.startsWith('nkw-a001-01-'), 'kid 형식 ' + p.kid);
  assert(p.gid && p.gid.startsWith('grp-'), 'gid 형식 ' + p.gid);
}
console.log('계획', plan.length, '건 | 인상', plan.filter(p => p.증감 > 0).length, '| 인하', plan.filter(p => p.증감 < 0).length);
const items = plan.map(p => [p.kid.slice(12), p.gid, p.현재입찰, p.신입찰]);
const SZ = 100;
const src = fs.readFileSync(path.join(__dirname, '_haeul_20260921_apply.py'), 'utf8');
let fail = 0;
for (let i = 0; i < items.length; i += SZ) {
  const part = 'a' + (i / SZ);
  const script = src.replace('__PART__', JSON.stringify(part)).replace('__MODE__', JSON.stringify(mode)).replace('__ITEMS__', JSON.stringify(items.slice(i, i + SZ)));
  const quoted = "'" + script.replace(/\r/g, '').replace(/'/g, `'"'"'`) + "'";
  let r; for (let t = 0; t < 4; t++) { r = cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe', ['ssh', 'console', '-a', 'blog-index-analyzer', '-C', 'python -c ' + quoted], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 256, timeout: 900000, windowsHide: true }); if (/^(DONE|DRY|SKIP)/m.test(r.stdout || '')) break; console.log('  재시도', part, t + 1); }
  const out = (r.stdout || '').split(/\r?\n/).filter(l => /^(DONE|DRY|SKIP|BAD:|SKIPS:)/.test(l)).join('\n');
  console.log(out || ('FAIL ' + part + ' ' + (r.stderr || '').slice(-800)));
  if (!/^(DONE|DRY|SKIP)/m.test(r.stdout || '')) fail++;
}
console.log(fail ? ('실패 청크 ' + fail) : '전 청크 정상');
