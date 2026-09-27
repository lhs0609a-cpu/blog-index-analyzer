// _creative_sweep.js 결과 → "키워드는 켜져 있는데 노출 가능한 소재가 없는 그룹" 보고.
// 사유: 소재0 / 전부반려 / 전부검수중 / 전부꺼짐 / 기타. 그룹·캠페인 꺼짐은 따로(어차피 안 나감).
// 영향도: 켜진 키워드 수 + 최근 9일(9/2~9/10) 그룹 노출·지출(/stats, 노출불가 그룹만 조회).
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p) { for (let a = 0; a < 3; a++) { try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(45000) }); const d = await r.json(); if (!d.success) throw Error(d.error); return d.response; } catch (e) { if (a === 2) return null; await sleep(3000); } } }
const D = path.join(__dirname, '../reports/sojam-20260911/creative');
const readL = f => fs.existsSync(path.join(D, f)) ? fs.readFileSync(path.join(D, f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const okAd = a => !a.lock && a.ins === 'APPROVED' && a.st === 'ELIGIBLE';

function reason(ads) {
  if (!ads.length) return '소재 0개';
  if (ads.every(a => a.ins === 'REJECTED' || a.st === 'AD_DISAPPROVED' || a.sr === 'AD_DISAPPROVED')) return '소재 전부 반려';
  if (ads.every(a => a.ins === 'UNDER_REVIEW' || a.ins === 'PENDING' && a.sr !== 'AD_DISAPPROVED')) return '소재 전부 검수중';
  if (ads.every(a => a.lock)) return '소재 전부 꺼짐(userLock)';
  const s = {}; for (const a of ads) { const k = a.ins + '/' + a.sr + (a.lock ? '/off' : ''); s[k] = 1; }
  return '혼합: ' + Object.keys(s).join(', ');
}

(async () => {
  const camps = new Map(JSON.parse(fs.readFileSync(path.join(D, 'campaigns.json'), 'utf8')).map(c => [c.id, c]));
  const inv = new Map(); for (const r of readL('inv.jsonl')) for (const g of r.groups) inv.set(g.id, { ...g, cid: r.cid });
  const adRows = readL('ads.jsonl'), kwRows = new Map(readL('kw.jsonl').map(r => [r.gid, r]));
  const bad = adRows.filter(r => !r.ads.some(okAd)).map(r => {
    const g = inv.get(r.gid) || {}, c = camps.get(g.cid) || {}, k = kwRows.get(r.gid);
    return { gid: r.gid, group: g.name, camp: c.name, campOff: !!c.lock || c.st === 'PAUSED', groupOff: !!g.lock, reason: reason(r.ads),
      nAds: r.ads.length, adStates: r.ads.map(a => a.ins + '/' + a.st + (a.lock ? '/off' : '')), kwTotal: k ? k.total : null, kwOn: k ? k.on : null, sample: k ? k.onKw.slice(0, 8) : [] };
  });
  // 9일 성과(노출불가 그룹만, 50개 배치)
  const enc = x => encodeURIComponent(JSON.stringify(x)), perf = new Map();
  const ids = bad.filter(b => b.kwOn > 0).map(b => b.gid);
  for (let i = 0; i < ids.length; i += 50) {
    const r = await api('/stats?ids=' + encodeURIComponent(ids.slice(i, i + 50).join(',')) + '&fields=' + enc(['impCnt', 'clkCnt', 'salesAmt']) + '&timeRange=' + enc({ since: '2026-09-02', until: '2026-09-10' }));
    for (const x of (r && r.data) || []) perf.set(x.id, { imp: +x.impCnt || 0, clk: +x.clkCnt || 0, cost: +x.salesAmt || 0 });
    await sleep(400);
  }
  for (const b of bad) Object.assign(b, perf.get(b.gid) || { imp: 0, clk: 0, cost: 0 });
  bad.sort((a, b) => (b.kwOn || 0) - (a.kwOn || 0));
  fs.writeFileSync(path.join(D, '_report.json'), JSON.stringify(bad, null, 1));

  const live = bad.filter(b => b.kwOn > 0 && !b.campOff && !b.groupOff);
  const off = bad.filter(b => b.kwOn > 0 && (b.campOff || b.groupOff));
  const nokw = bad.filter(b => !(b.kwOn > 0));
  const S = (a, f) => a.reduce((x, b) => x + (b[f] || 0), 0);
  console.log('소재 조회 그룹', adRows.length, '| 노출가능 소재 없음', bad.length);
  console.log(' ★ 켜진 키워드 있고 그룹·캠페인도 켜짐 =', live.length, '그룹 / 켜진 키워드', S(live, 'kwOn'));
  console.log('   그룹·캠페인이 꺼져 있어 원래 안 나감 =', off.length, '그룹 / 키워드', S(off, 'kwOn'));
  console.log('   켜진 키워드 0 =', nokw.length, '그룹');
  const byR = {}; for (const b of live) { byR[b.reason] = byR[b.reason] || { g: 0, kw: 0 }; byR[b.reason].g++; byR[b.reason].kw += b.kwOn; }
  console.log(' 사유별', JSON.stringify(byR));
  const byC = {}; for (const b of live) { byC[b.camp] = byC[b.camp] || { g: 0, kw: 0 }; byC[b.camp].g++; byC[b.camp].kw += b.kwOn; }
  console.log(' 캠페인별', JSON.stringify(Object.entries(byC).sort((a, b) => b[1].kw - a[1].kw)));
  console.log(' 9일 노출이 있던 그룹', live.filter(b => b.imp > 0).length, '(노출', S(live, 'imp'), '지출', S(live, 'cost'), ') — 최근에 소재가 막힌 것');
  console.log('\n상위 30');
  for (const b of live.slice(0, 30)) console.log([b.camp, b.group, b.reason, 'kwOn ' + b.kwOn, 'imp9 ' + b.imp, b.sample.slice(0, 5).join('·')].join(' | '));
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
