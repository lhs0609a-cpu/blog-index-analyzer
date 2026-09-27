// ▲ UP 버킷 312개 키워드의 적용 결과 전수 확인
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
const groups = {}; for (const g of L('_sojam_b0827_groups.json')) groups[g.nccAdgroupId] = g;
const gbid = {}; for (const [gid, g] of Object.entries(L('_sojam_b0827_corekws.json'))) gbid[gid] = g.gbid || 0;
const up = rows.filter(r => r.bucket === '▲농가진계열' || r.bucket === '▲구순염계열');
const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);
const gids = [...new Set(up.map(r => r.gid))];

(async () => {
  const live = {};
  for (const gid of gids) {
    const resp = await raw(`/ncc/keywords?nccAdgroupId=${gid}`);
    if (resp) for (const k of resp) live[k.nccKeywordId] = k;
  }
  const byKw = {};
  for (const r of up) {
    const k = live[r.id]; if (!k) continue;
    const eff = k.useGroupBidAmt ? gbid[r.gid] : (k.bidAmt || 0);
    const g = groups[r.gid] || {};
    const alive = !k.userLock && k.status === 'ELIGIBLE' && !g.userLock && !g.delFlag && eff > 70;
    const u = (byKw[r.kw] ||= { vol: vol[r.kw] || 0, bid: 0, alive: false, why: '' });
    if (alive) { u.alive = true; u.bid = Math.max(u.bid, eff); }
    if (!u.why || alive) u.why = k.userLock ? '잠김' : k.status !== 'ELIGIBLE' ? k.status
                         : (g.userLock || g.delFlag) ? '그룹off' : eff <= 70 ? '70원' : '';
  }
  const all = Object.entries(byKw);
  const ok = all.filter(([, u]) => u.alive);
  console.log(`UP 키워드 ${all.length}개 중 노출가능 ${ok.length}개 / 미달 ${all.length - ok.length}개`);
  const bids = ok.map(([, u]) => u.bid).sort((a, b) => a - b);
  if (bids.length) console.log(`적용 입찰가 중앙 ${bids[Math.floor(bids.length / 2)]}원 · 최고 ${bids[bids.length - 1]}원`);
  console.log('\n=== 검색량 상위 25 ===');
  for (const [kw, u] of all.sort((a, b) => b[1].vol - a[1].vol).slice(0, 25))
    console.log(`   ${kw.padEnd(18)} ${String(u.vol).padStart(7)}회  ${String(u.bid || 0).padStart(6)}원  ${u.alive ? '노출' : '미달(' + u.why + ')'}`);
  const bad = all.filter(([, u]) => !u.alive).sort((a, b) => b[1].vol - a[1].vol);
  console.log(`\n=== 미달 ${bad.length}개 중 검색량 상위 20 ===`);
  for (const [kw, u] of bad.slice(0, 20)) console.log(`   ${kw.padEnd(18)} ${String(u.vol).padStart(7)}회  ${u.why}`);
})();
