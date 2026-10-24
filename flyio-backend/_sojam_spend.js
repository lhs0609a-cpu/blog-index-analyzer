// 소잠 광고비 소진 현황 — 캠페인별 /stats 직접 조회
const { req, pool } = require('./_sojam_naver');
const CID = '1858907';
const args = process.argv.slice(2);
const since = args[0] || '2026-08-01';
const until = args[1] || '2026-08-27';

(async () => {
  const camps = await req('GET', '/ncc/campaigns', null, CID);
  const live = camps.filter(c => !c.delFlag);
  console.log(`캠페인 ${camps.length}개 (활성 대상 ${live.length}) · 기간 ${since} ~ ${until}\n`);

  const FIELDS = JSON.stringify(['impCnt', 'clkCnt', 'salesAmt', 'ctr', 'cpc', 'avgRnk']);
  const TR = JSON.stringify({ since, until });
  const res = await pool(live, 4, async c => {
    const q = `/stats?ids=${encodeURIComponent(c.nccCampaignId)}&fields=${encodeURIComponent(FIELDS)}&timeRange=${encodeURIComponent(TR)}`;
    const r = await req('GET', q, null, CID);
    const d = (r && r.data && r.data[0]) || {};
    return { name: c.name, id: c.nccCampaignId, tp: c.campaignTp,
             off: !!c.userLock, budget: c.useDailyBudget ? c.dailyBudget : 0,
             imp: d.impCnt || 0, clk: d.clkCnt || 0, cost: d.salesAmt || 0,
             cpc: d.cpc || 0, rnk: d.avgRnk || 0 };
  });
  const rows = res.filter(r => r && !r.__err);
  const err = res.filter(r => r && r.__err);
  rows.sort((a, b) => b.cost - a.cost);
  const won = n => Math.round(n).toLocaleString('ko-KR');

  const T = rows.reduce((s, r) => ({ imp: s.imp + r.imp, clk: s.clk + r.clk, cost: s.cost + r.cost }), { imp: 0, clk: 0, cost: 0 });
  console.log('=== 캠페인별 (비용 있는 것만) ===');
  for (const r of rows.filter(r => r.cost > 0))
    console.log(`   ${r.name.slice(0, 26).padEnd(28)} 노출 ${String(won(r.imp)).padStart(9)} · 클릭 ${String(won(r.clk)).padStart(6)} · 비용 ${String(won(r.cost)).padStart(10)}원 · CPC ${String(won(r.cpc)).padStart(6)}원 · 평균순위 ${r.rnk.toFixed(1)}${r.off ? '  [OFF]' : ''}`);
  console.log(`\n합계 — 노출 ${won(T.imp)} · 클릭 ${won(T.clk)} · 소진 ${won(T.cost)}원`);
  if (T.clk) console.log(`평균 CPC ${won(T.cost / T.clk)}원`);
  const days = (new Date(until) - new Date(since)) / 86400000 + 1;
  console.log(`일평균 ${won(T.cost / days)}원 (${days}일)`);
  const dailyCap = rows.filter(r => !r.off).reduce((s, r) => s + r.budget, 0);
  console.log(`활성 캠페인 일예산 합 ${won(dailyCap)}원`);
  if (err.length) console.log(`\n조회 실패 ${err.length}건: ${err[0].__err}`);
})();
