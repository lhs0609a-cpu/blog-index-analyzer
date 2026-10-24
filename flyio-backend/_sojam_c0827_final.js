// 오늘 작업 최종 상태 — 라이브 전수 재조회
const fs = require('fs'), path = require('path');
const P = n => path.join(__dirname, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function raw(p, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: p, method: 'GET', body: null, customer_id: CID }),
        signal: AbortSignal.timeout(120000) });
      if (r.ok) { const d = await r.json(); if (d.success) return d.response; }
    } catch (e) {}
    await sleep(1500 * (t + 1));
  }
  return null;
}
const rows = L('_sojam_c0827_rebalance.json');
const snap = L('_sojam_c0827_ROLLBACK.json');
const groups = {}; for (const g of L('_sojam_b0827_groups.json')) groups[g.nccAdgroupId] = g;
const gbid = {}; for (const [gid, g] of Object.entries(L('_sojam_b0827_corekws.json'))) gbid[gid] = g.gbid || 0;
const vol = {}; for (const r of rows) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);
const gids = [...new Set(rows.map(r => r.gid))];
const won = n => (n || 0).toLocaleString('ko-KR');

(async () => {
  const live = {};
  for (const gid of gids) { const r = await raw(`/ncc/keywords?nccAdgroupId=${gid}`); if (r) for (const k of r) live[k.nccKeywordId] = k; }
  const byKw = {}, before = {};
  for (const r of rows) {
    const k = live[r.id]; if (!k) continue;
    const eff = k.useGroupBidAmt ? gbid[r.gid] : (k.bidAmt || 0);
    const g = groups[r.gid] || {};
    const alive = !k.userLock && k.status === 'ELIGIBLE' && !g.userLock && !g.delFlag && eff > 70;
    const u = (byKw[r.kw] ||= { vol: vol[r.kw] || 0, bid: 0, alive: false });
    if (alive) { u.alive = true; u.bid = Math.max(u.bid, eff); }
    const s = snap[r.id];
    if (s) { const be = s.ugb ? gbid[r.gid] : (s.bid || 0);
             const ba = !s.lock && s.st === 'ELIGIBLE' && !g.userLock && !g.delFlag && be > 70;
             const b = (before[r.kw] ||= { bid: 0, alive: false });
             if (ba) { b.alive = true; b.bid = Math.max(b.bid, be); } }
  }
  const all = Object.entries(byKw);
  const nowAlive = all.filter(([, u]) => u.alive);
  const wasAlive = all.filter(([k]) => before[k] && before[k].alive);
  console.log(`고유 키워드 ${all.length}개`);
  console.log(`노출 가능 — 오늘 아침 ${wasAlive.length}개 → 지금 ${nowAlive.length}개  (${nowAlive.length - wasAlive.length >= 0 ? '+' : ''}${nowAlive.length - wasAlive.length})`);
  const bids = nowAlive.map(([, u]) => u.bid).sort((a, b) => a - b);
  console.log(`입찰가 중앙 ${won(bids[Math.floor(bids.length / 2)])}원 · 최고 ${won(bids[bids.length - 1])}원`);
  console.log(`\n검색량 구간별 노출률`);
  for (const t of [10000, 3000, 1000, 300, 100]) {
    const s = all.filter(([, u]) => u.vol >= t);
    const a = s.filter(([, u]) => u.alive).length;
    const w = s.filter(([k]) => before[k] && before[k].alive).length;
    console.log(`  검색량>=${String(t).padEnd(6)} ${String(s.length).padStart(5)}개 · 아침 ${String(w).padStart(4)} → 지금 ${String(a).padStart(4)} (${Math.round(a * 100 / (s.length || 1))}%)`);
  }
  const up = all.filter(([k, u]) => u.alive && (!before[k] || !before[k].alive)).sort((a, b) => b[1].vol - a[1].vol);
  const dn = all.filter(([k, u]) => !u.alive && before[k] && before[k].alive).sort((a, b) => b[1].vol - a[1].vol);
  console.log(`\n=== 새로 열린 키워드 ${up.length}개 (검색량 상위 20) ===`);
  for (const [k, u] of up.slice(0, 20)) console.log(`   ${k.padEnd(20)} ${String(won(u.vol)).padStart(8)}회  ${String(won(u.bid)).padStart(7)}원`);
  console.log(`\n=== 내려서 닫힌 키워드 ${dn.length}개 (검색량 상위 20) ===`);
  for (const [k, u] of dn.slice(0, 20)) console.log(`   ${k.padEnd(20)} ${String(won(u.vol)).padStart(8)}회  ${String(won(before[k].bid)).padStart(7)}원 → 70원`);
})();
