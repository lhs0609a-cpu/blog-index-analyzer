// 적용 결과 검증 — 변경 대상 인스턴스를 라이브로 다시 읽어 before/after 비교
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function raw(p, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method: 'GET', body: null, customer_id: CID }),
        signal: AbortSignal.timeout(180000) });
      if (r.ok) { const d = await r.json(); if (d.success) return d.response; }
    } catch (e) {}
    await sleep(2000 * (t + 1));
  }
  return null;
}
const rows = L('_sojam_c0827_rebalance.json');
const snap = L('_sojam_c0827_ROLLBACK.json');
const groups = {}; for (const g of L('_sojam_b0827_groups.json')) groups[g.nccAdgroupId] = g;
const gbid = {}; for (const [gid, g] of Object.entries(L('_sojam_b0827_corekws.json'))) gbid[gid] = g.gbid || 0;

const changed = rows.filter(r => ['▼타지역', '▼서울비강남', '▲농가진계열', '▲구순염계열'].includes(r.bucket));
const gids = [...new Set(changed.map(r => r.gid))];
(async () => {
  const live = {};
  for (let i = 0; i < gids.length; i++) {
    const resp = await raw(`/ncc/keywords?nccAdgroupId=${gids[i]}`);
    if (resp) for (const k of resp) live[k.nccKeywordId] = k;
    else console.log(`  그룹 조회 실패 ${gids[i]}`);
  }
  console.log(`라이브 재조회 ${Object.keys(live).length}개 인스턴스\n`);

  const chk = (label, sel, test) => {
    const got = sel.filter(r => live[r.id]);
    const ok = got.filter(r => test(live[r.id]));
    console.log(`${label}: ${ok.length}/${got.length} 반영`);
    const bad = got.filter(r => !test(live[r.id])).slice(0, 8);
    for (const r of bad) console.log(`   미반영 ${r.kw} bid=${live[r.id].bidAmt} lock=${live[r.id].userLock} ugb=${live[r.id].useGroupBidAmt}`);
  };
  chk('▼ 타지역 → 70원',
      changed.filter(r => r.bucket.startsWith('▼')),
      k => (k.useGroupBidAmt ? 0 : k.bidAmt) <= 70);
  chk('▲ 잠금 해제',
      changed.filter(r => r.bucket.startsWith('▲') && snap[r.id] && snap[r.id].lock),
      k => !k.userLock);

  // 잠금 푼 키워드가 지금 실제로 노출 가능한 상태인지 (입찰가 70원이면 아직 안 됨)
  console.log('\n=== 잠금 푼 키워드 현재 상태 ===');
  const un = changed.filter(r => r.bucket.startsWith('▲') && snap[r.id] && snap[r.id].lock && live[r.id]);
  const byKw = {};
  for (const r of un) {
    const k = live[r.id];
    const eff = k.useGroupBidAmt ? gbid[r.gid] : (k.bidAmt || 0);
    const g = groups[r.gid] || {};
    const st = k.userLock ? '아직잠김' : (k.status !== 'ELIGIBLE' ? `상태 ${k.status}`
              : (g.userLock || g.delFlag) ? '그룹 off' : (eff <= 70 ? '70원묶임(입찰가 필요)' : '노출가능'));
    const u = (byKw[r.kw] ||= { vol: r.vol, best: '', eff: 0 });
    if (st === '노출가능' || !u.best) { u.best = st; u.eff = Math.max(u.eff, eff); }
  }
  for (const [kw, u] of Object.entries(byKw).sort((a, b) => b[1].vol - a[1].vol))
    console.log(`   ${kw.padEnd(18)} ${String(u.vol).padStart(7)}회  ${String(u.eff).padStart(6)}원  ${u.best}`);
})();
