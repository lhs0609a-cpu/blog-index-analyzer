// 소잠 광고비 소진 — 프록시의 /stats (허용 경로) 경유
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
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
const since = process.argv[2] || '2026-08-01', until = process.argv[3] || '2026-08-27';
const won = n => Math.round(n || 0).toLocaleString('ko-KR');

(async () => {
  const camps = (await raw('/ncc/campaigns')) || [];
  const live = camps.filter(c => !c.delFlag);
  console.log(`캠페인 ${camps.length}개 · 기간 ${since} ~ ${until}\n`);
  const F = encodeURIComponent(JSON.stringify(['impCnt', 'clkCnt', 'salesAmt', 'cpc', 'avgRnk']));
  const T = encodeURIComponent(JSON.stringify({ since, until }));
  const rows = await pool(live, 3, async c => {
    const r = await raw(`/stats?ids=${encodeURIComponent(c.nccCampaignId)}&fields=${F}&timeRange=${T}`);
    const d = (r && r.data && r.data[0]) || {};
    return { name: c.name || '', off: !!c.userLock,
             budget: c.useDailyBudget ? (c.dailyBudget || 0) : 0,
             imp: d.impCnt || 0, clk: d.clkCnt || 0, cost: d.salesAmt || 0,
             cpc: d.cpc || 0, rnk: d.avgRnk || 0 };
  });
  const ok = rows.filter(Boolean);
  ok.sort((a, b) => b.cost - a.cost);
  const S = ok.reduce((s, r) => ({ imp: s.imp + r.imp, clk: s.clk + r.clk, cost: s.cost + r.cost }), { imp: 0, clk: 0, cost: 0 });
  console.log('=== 캠페인별 (비용순) ===');
  for (const r of ok.filter(r => r.cost > 0 || r.clk > 0))
    console.log(`   ${r.name.slice(0, 24).padEnd(26)} 노출 ${String(won(r.imp)).padStart(9)} · 클릭 ${String(won(r.clk)).padStart(6)} · 비용 ${String(won(r.cost)).padStart(10)}원 · CPC ${String(won(r.cpc)).padStart(6)}원 · 순위 ${(r.rnk || 0).toFixed(1)}${r.off ? ' [OFF]' : ''}`);
  const days = Math.round((new Date(until) - new Date(since)) / 86400000) + 1;
  console.log(`\n합계 — 노출 ${won(S.imp)} · 클릭 ${won(S.clk)} · **소진 ${won(S.cost)}원**`);
  if (S.clk) console.log(`평균 CPC ${won(S.cost / S.clk)}원 · 일평균 ${won(S.cost / days)}원 (${days}일)`);
  console.log(`활성 캠페인 일예산 합 ${won(ok.filter(r => !r.off).reduce((s, r) => s + r.budget, 0))}원`);
})();
