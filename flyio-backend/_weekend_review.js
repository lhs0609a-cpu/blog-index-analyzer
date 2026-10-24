// 소잠 — 주말(9/12~9/13) 성과 점검 (2026-09-14 사용자 지시 "주말 소진·클릭 키워드·구글시트 확인해서 성과·문제·개선").
// 1) 9/11~9/14 일별 소진·클릭·노출(캠페인 /stats 합)
// 2) 주말 클릭 키워드: 그룹 /stats → 클릭 있는 그룹의 키워드만 /stats (전체 9만 키워드 조회를 피한다)
// 3) 지난주 조치 추적: 9/11 입찰 인상 117·복사 49·통증 등록 476 의 주말 노출/클릭
// 4) auto 캠페인(쓰레기 키워드 764개) 소진 여부 — 소재 검수가 통과했으면 돈이 샌다
// 사용: node _weekend_review.js
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b || null }), signal: AbortSignal.timeout(50000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 150)); return d.response; }
    catch (e) { if (a === 2) return null; await sleep(3000); }
  }
}
const D = path.join(__dirname, '../reports/sojam-20260914/');
fs.mkdirSync(D, { recursive: true });
const save = (n, o) => fs.writeFileSync(D + n, JSON.stringify(o, null, 1));
const enc = x => encodeURIComponent(JSON.stringify(x));
const R11 = path.join(__dirname, '../reports/sojam-20260911/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));

async function statsFor(ids, since, until) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 40) {
    const r = await api('GET', '/stats?ids=' + encodeURIComponent(ids.slice(i, i + 40).join(',')) + '&fields=' + enc(['impCnt', 'clkCnt', 'salesAmt', 'avgRnk']) + '&timeRange=' + enc({ since, until }));
    for (const x of (r && r.data) || []) out.set(x.id, { imp: +x.impCnt || 0, clk: +x.clkCnt || 0, cost: +x.salesAmt || 0, rank: x.avgRnk != null ? +x.avgRnk : null });
    await sleep(280);
  }
  return out;
}

(async () => {
  const camps = await api('GET', '/ncc/campaigns?recordSize=1000');
  if (!Array.isArray(camps)) throw Error('캠페인 조회 실패');
  const cid = camps.map(c => c.nccCampaignId), cname = new Map(camps.map(c => [c.nccCampaignId, c.name]));
  // 1) 일별
  const days = ['2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'];
  const daily = {};
  for (const d of days) {
    const s = await statsFor(cid, d, d);
    const t = { imp: 0, clk: 0, cost: 0 }, per = [];
    for (const [id, v] of s) { t.imp += v.imp; t.clk += v.clk; t.cost += v.cost; if (v.cost || v.clk) per.push({ name: cname.get(id), ...v }); }
    daily[d] = { total: t, camps: per.sort((a, b) => b.cost - a.cost) };
    console.log(d, JSON.stringify(t), '| 소진 캠페인', per.length, per.slice(0, 5).map(p => p.name + ':' + p.cost).join(' '));
  }
  save('daily.json', daily);
  // 4) auto 캠페인
  const auto = camps.find(c => c.name === 'auto_001_091264_0');
  if (auto) {
    const a = await statsFor([auto.nccCampaignId], '2026-09-11', '2026-09-14');
    const v = a.get(auto.nccCampaignId) || {};
    console.log('AUTO 캠페인 9/11~9/14:', JSON.stringify(v), v.cost ? '← 쓰레기 키워드에 소진 발생' : '← 소진 없음');
    save('auto.json', { camp: auto.nccCampaignId, stat: v });
  }
  // 2) 주말 클릭 키워드
  const groups = [];
  for (const c of camps) { const gs = await api('GET', '/ncc/adgroups?nccCampaignId=' + c.nccCampaignId + '&recordSize=1000'); if (Array.isArray(gs)) for (const g of gs) groups.push({ id: g.nccAdgroupId, name: g.name, camp: c.name }); await sleep(120); }
  console.error('그룹', groups.length);
  const gs = await statsFor(groups.map(g => g.id), '2026-09-12', '2026-09-13');
  const hot = groups.filter(g => { const v = gs.get(g.id); return v && (v.clk > 0 || v.cost > 0); });
  console.log('주말 소진 그룹', hot.length);
  const kwRows = [];
  for (const g of hot) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g.id);
    if (!Array.isArray(ks)) continue;
    const st = await statsFor(ks.map(k => k.nccKeywordId), '2026-09-12', '2026-09-13');
    for (const k of ks) { const v = st.get(k.nccKeywordId); if (v && (v.clk > 0 || v.cost > 0)) kwRows.push({ kw: k.keyword, id: k.nccKeywordId, g: g.name, camp: g.camp, bid: k.bidAmt, ...v }); }
    await sleep(200);
  }
  kwRows.sort((a, b) => b.cost - a.cost);
  save('weekend_keywords.json', kwRows);
  const sum = kwRows.reduce((a, r) => ({ clk: a.clk + r.clk, cost: a.cost + r.cost }), { clk: 0, cost: 0 });
  console.log('주말 클릭/소진 키워드', kwRows.length, JSON.stringify(sum));
  console.log(kwRows.slice(0, 40).map(r => r.kw + ' ' + r.clk + '클릭/' + r.cost + '원' + (r.rank != null ? '/' + r.rank + '위' : '')).join('\n'));
  // 3) 지난주 조치 추적
  const track = {};
  const zi = J(R11 + 'rankaudit/zeroimp/result.json');
  const pain = [...J(R11 + 'pain/apply/result.json').created, ...J(R11 + 'painx/apply/result.json').created].map(c => ({ kw: c.kw, id: c.id }));
  const sets = { '입찰인상117': zi.raised.map(r => ({ kw: r.k, id: r.id })), '복사등록49': zi.created.map(c => ({ kw: c.k, id: c.id })), '통증등록476': pain };
  for (const [n, arr] of Object.entries(sets)) {
    const st = await statsFor(arr.map(a => a.id), '2026-09-12', '2026-09-13');
    const live = arr.map(a => ({ ...a, ...(st.get(a.id) || { imp: 0, clk: 0, cost: 0 }) }));
    const t = live.reduce((x, r) => ({ imp: x.imp + r.imp, clk: x.clk + r.clk, cost: x.cost + r.cost }), { imp: 0, clk: 0, cost: 0 });
    track[n] = { n: arr.length, withImp: live.filter(r => r.imp > 0).length, ...t, top: live.filter(r => r.imp > 0).sort((a, b) => b.imp - a.imp).slice(0, 12).map(r => r.kw + ':노출' + r.imp + '·클릭' + r.clk) };
    console.log(n, JSON.stringify(track[n]));
  }
  save('track.json', track);
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
