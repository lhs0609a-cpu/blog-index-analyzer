// ▲ UP 버킷 입찰가 직접 적용 — 프록시 /ncc/ PUT (DB 미등록 레거시 인스턴스까지 전부 커버).
//   농가진·구순염·구각염 계열 → 1위가, 나머지 → 3위가. 바닥 500 / 상한 20000.
//   node _sojam_c0827_up2.js [--apply]
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const APPLY = process.argv.includes('--apply');
const FLOOR = 500, CAP = 20000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function raw(p, method, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method, body, customer_id: CID }),
        signal: AbortSignal.timeout(180000) });
      if (r.ok) { const d = await r.json(); if (d.success) return [true, d.response];
                  if (/BAD_REQUEST|11001/.test(String(d.error))) return [false, d.error]; }
    } catch (e) {}
    await sleep(Math.min(2000 * (t + 1), 12000));
  }
  return [false, 'retry exhausted'];
}

const rows = L('_sojam_c0827_rebalance.json');
const ladder = L('_sojam_c0827_ladder.json');
const snap = L('_sojam_c0827_ROLLBACK.json');
const JUNK = ['여드름', '렌즈삽입', '티셔츠', '두꺼워지는', '물탱크', '청소', '레이저후', '무좀'];
// 원장 지목 — 1위로 올릴 계열
const TOP1 = ['농가진', '구순염', '구각염'];
const isTop1 = k => TOP1.some(t => k.includes(t));
const r10 = v => Math.max(70, Math.round(v / 10) * 10);

const up = rows.filter(r => (r.bucket === '▲농가진계열' || r.bucket === '▲구순염계열')
                         && !JUNK.some(j => r.kw.includes(j)));
const items = [], unlock = [], plan = [];
for (const r of up) {
  const lad = ladder[r.kw]; if (!lad) continue;
  const pos = isTop1(r.kw) ? 1 : 3;
  const est = lad[pos] ?? lad[3] ?? lad[5];
  if (est == null) continue;
  const nb = r10(Math.min(CAP, Math.max(FLOOR, est)));
  const cur = snap[r.id] ? (snap[r.id].ugb ? 0 : (snap[r.id].bid || 0)) : r.eff;
  items.push({ nccKeywordId: r.id, nccAdgroupId: r.gid, bidAmt: nb, useGroupBidAmt: false });
  if (snap[r.id] && snap[r.id].lock) unlock.push({ nccKeywordId: r.id, nccAdgroupId: r.gid, userLock: false });
  plan.push({ kw: r.kw, vol: r.vol, pos, est, cur, nb, g: r.g });
}
const byKw = {};
for (const p of plan) { const u = (byKw[p.kw] ||= { vol: p.vol, pos: p.pos, est: p.est, nb: p.nb, n: 0 }); u.n++; }
const list = Object.entries(byKw).sort((a, b) => b[1].vol - a[1].vol);
console.log(`대상 인스턴스 ${items.length}개 / 키워드 ${list.length}개 · 잠금해제 ${unlock.length}개`);
console.log(`   1위 적용 ${list.filter(([, u]) => u.pos === 1).length}개 · 3위 적용 ${list.filter(([, u]) => u.pos === 3).length}개`);
console.log('\n=== 검색량 상위 25 ===');
console.log('   키워드                 검색량  목표  추정가   적용가  인스턴스');
for (const [k, u] of list.slice(0, 25))
  console.log(`   ${k.padEnd(20)} ${String(u.vol).padStart(7)} ${String(u.pos + '위').padStart(4)} ${String(u.est).padStart(7)} ${String(u.nb).padStart(7)}원 ${String(u.n).padStart(4)}`);
console.log('\n=== 지목 키워드(농가진·구순염·구각염) 전체 ===');
for (const [k, u] of list.filter(([k]) => isTop1(k)).sort((a, b) => b[1].vol - a[1].vol))
  console.log(`   ${k.padEnd(20)} ${String(u.vol).padStart(7)}회  1위가 ${String(u.est).padStart(6)} → 적용 ${String(u.nb).padStart(6)}원`);
fs.writeFileSync(P('_sojam_c0827_up2_plan.json'), JSON.stringify(plan), 'utf8');

if (!APPLY) { console.log('\ndry-run — 적용하려면 --apply'); process.exit(0); }
(async () => {
  for (const [label, arr, fields] of [['잠금 해제', unlock, 'userLock'], ['입찰가', items, 'bidAmt']]) {
    if (!arr.length) continue;
    let ok = 0, bad = 0;
    for (let i = 0; i < arr.length; i += 100) {
      const b = arr.slice(i, i + 100);
      const [o, e] = await raw(`/ncc/keywords?fields=${fields}`, 'PUT', b);
      if (o) ok += b.length; else { bad += b.length; console.log(`  ${label} 배치 실패`, String(e).slice(0, 90)); }
      await sleep(200);
    }
    console.log(`${label} 완료 — 성공 ${ok} / 실패 ${bad}`);
  }
})();
