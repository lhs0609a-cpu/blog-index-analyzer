// 소잠 — 내원 핵심 키워드 실순위·입찰 검토 (2026-09-11). 입력: rankaudit/candidates.json (_rankaudit_candidates.js).
// 실순위는 네이버 /stats avgRnk(실제 노출 가중 평균순위). 이 PC는 네이버가 창원으로 보고, 주력 그룹은 서울·경기·강남반경 타기팅이라 SERP 직접 측정은 쓸 수 없다.
// 단계(각각 캐시 파일, 재실행 시 건너뜀):
//   kw     프록시 /ncc/keywords?ids= (20개씩) → 현재 입찰·그룹입찰사용·잠금·상태·그룹
//   grp    프록시 /ncc/adgroups/{id} → 그룹 기본입찰·PC/모바일 가중치·잠금 (+ 캠페인 잠금, 소재 스윕 결과)
//   stats  프록시 /stats (40개씩) 9/10~9/11 노출·클릭·지출·평균순위  ← 9/9 저녁 재세팅 이후 구간만
//   est    로컬키 1~5위 추정입찰가 (MOBILE·PC) + 검색량(keywordstool)
//   perf   로컬키 performance-bulk: 현재 유효입찰 / 5위가 / 3위가 에서의 월 예상 클릭·비용 (MOBILE·PC)
// 사용: node _rankaudit_measure.js [kw|grp|stats|est|perf|all]
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b || null }), signal: AbortSignal.timeout(60000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 150)); return d.response; }
    catch (e) { if (a === 2) return null; await sleep(3000); }
  }
}
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const F = n => D + n;
const has = n => fs.existsSync(F(n));
const load = n => JSON.parse(fs.readFileSync(F(n), 'utf8'));
const save = (n, o) => fs.writeFileSync(F(n), JSON.stringify(o));
const enc = x => encodeURIComponent(JSON.stringify(x));
const pv = s => { s = String(s); const lt = s.indexOf('<') >= 0; return lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10); };
const cand = load('candidates.json');
const allIds = [...new Set(cand.flatMap(c => c.ids))];

async function stKw() {
  const kw = has('kw.json') ? load('kw.json') : {};
  const todo = allIds.filter(i => !kw[i]);
  console.error('kw 남은', todo.length);
  for (let i = 0; i < todo.length; i += 20) {
    const r = await api('GET', '/ncc/keywords?ids=' + encodeURIComponent(todo.slice(i, i + 20).join(',')));
    for (const k of Array.isArray(r) ? r : []) kw[k.nccKeywordId] = { kw: k.keyword, gid: k.nccAdgroupId, cid: k.nccCampaignId, bid: k.bidAmt, useGrp: k.useGroupBidAmt, lock: k.userLock, st: k.status, sr: k.statusReason, ins: k.inspectStatus, del: k.delFlag };
    if ((i / 20) % 25 === 0) { save('kw.json', kw); console.error('  kw', i, '/', todo.length); }
    await sleep(250);
  }
  // 조회되지 않은 ID = 삭제됨
  for (const i of todo) if (!kw[i]) kw[i] = { missing: true };
  save('kw.json', kw);
}

async function stGrp() {
  const kw = load('kw.json'), grp = has('grp.json') ? load('grp.json') : {};
  const gids = [...new Set(Object.values(kw).filter(k => k.gid).map(k => k.gid))].filter(g => !grp[g]);
  console.error('grp 남은', gids.length);
  for (const g of gids) {
    const r = await api('GET', '/ncc/adgroups/' + g);
    if (r) grp[g] = { name: r.name, bid: r.bidAmt, mw: r.mobileChannelWeight ?? r.mobileNetworkBidWeight ?? 100, pw: r.pcChannelWeight ?? r.pcNetworkBidWeight ?? 100, lock: r.userLock, st: r.status, cid: r.nccCampaignId };
    await sleep(200);
  }
  // 캠페인 잠금 + 소재 스윕(오늘) 결과 붙이기
  const camps = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260911/creative/campaigns.json'), 'utf8')).map(c => [c.id, c]));
  const adRows = fs.readFileSync(path.join(__dirname, '../reports/sojam-20260911/creative/ads.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const adOk = new Map(adRows.map(r => [r.gid, r.ads.some(a => !a.lock && a.ins === 'APPROVED' && a.st === 'ELIGIBLE')]));
  for (const [g, o] of Object.entries(grp)) { const c = camps.get(o.cid) || {}; o.camp = c.name; o.campLock = !!c.lock; o.adOk = adOk.has(g) ? adOk.get(g) : null; }
  save('grp.json', grp);
}

async function stStats() {
  const st = has('stats.json') ? load('stats.json') : {};
  const todo = allIds.filter(i => !st[i]);
  console.error('stats 남은', todo.length);
  for (let i = 0; i < todo.length; i += 40) {
    const b = todo.slice(i, i + 40);
    const r = await api('GET', '/stats?ids=' + encodeURIComponent(b.join(',')) + '&fields=' + enc(['impCnt', 'clkCnt', 'salesAmt', 'avgRnk']) + '&timeRange=' + enc({ since: '2026-09-10', until: '2026-09-11' }));
    if (!r) continue; // 실패분은 재실행에서 다시
    const got = new Map(((r && r.data) || []).map(x => [x.id, x]));
    for (const id of b) { const x = got.get(id) || {}; st[id] = { imp: +x.impCnt || 0, clk: +x.clkCnt || 0, cost: +x.salesAmt || 0, rank: x.avgRnk != null && +x.impCnt > 0 ? +x.avgRnk : null }; }
    if ((i / 40) % 20 === 0) { save('stats.json', st); console.error('  stats', i, '/', todo.length); }
    await sleep(300);
  }
  save('stats.json', st);
}

async function stEst() {
  const texts = [...new Set(cand.map(c => c.k))];
  const est = has('est.json') ? load('est.json') : {};
  for (const dev of ['MOBILE', 'PC']) for (const pos of [1, 2, 3, 4, 5]) {
    const todo = texts.filter(t => est[dev + '|' + pos + '|' + t] === undefined);
    for (let i = 0; i < todo.length; i += 100) {
      try {
        const r = await req('POST', '/estimate/average-position-bid/keyword', { device: dev, items: todo.slice(i, i + 100).map(k => ({ key: k, position: pos })) }, 3808925, 3);
        for (const e of (r && r.estimate) || []) est[dev + '|' + pos + '|' + e.keyword] = e.bid;
      } catch (e) { console.error('  est fail', dev, pos, i, String(e).slice(0, 80)); }
      await sleep(250);
    }
    save('est.json', est); console.error('  est', dev, pos, 'done');
  }
  const vol = has('vol.json') ? load('vol.json') : {};
  const todoV = texts.filter(t => vol[t] === undefined);
  console.error('vol 남은', todoV.length);
  for (let i = 0; i < todoV.length; i += 5) {
    const h = todoV.slice(i, i + 5);
    try {
      const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(h.join(',')) + '&showDetail=1', null, 3808925, 3);
      for (const k of (r && r.keywordList) || []) if (h.includes(k.relKeyword)) vol[k.relKeyword] = { pc: pv(k.monthlyPcQcCnt), mo: pv(k.monthlyMobileQcCnt), comp: k.compIdx };
    } catch (e) {}
    for (const t of h) if (vol[t] === undefined) vol[t] = null; // 도구에 없음(=월 10 미만으로 취급)
    if ((i / 5) % 100 === 0) { save('vol.json', vol); console.error('  vol', i, '/', todoV.length); }
    await sleep(280);
  }
  save('vol.json', vol);
}

// 텍스트별 대표 ID(켜진 것 중 유효입찰 최대)의 유효입찰 계산
function effective() {
  const kw = load('kw.json'), grp = load('grp.json');
  const rows = [];
  for (const c of cand) {
    const live = c.ids.map(i => ({ id: i, ...kw[i] })).filter(k => k.gid && !k.missing && !k.del);
    const opts = live.map(k => { const g = grp[k.gid] || {}; const base = k.useGrp ? g.bid : k.bid;
      const on = !k.lock && !g.lock && !g.campLock && g.adOk !== false && k.st === 'ELIGIBLE';
      return { ...k, base, mob: Math.round(base * (g.mw ?? 100) / 100), pcb: Math.round(base * (g.pw ?? 100) / 100), on, gname: g.name, camp: g.camp, adOk: g.adOk, glock: g.lock, clock: g.campLock }; });
    const best = opts.filter(o => o.on).sort((a, b) => b.mob - a.mob)[0] || opts.sort((a, b) => b.mob - a.mob)[0] || null;
    rows.push({ k: c.k, axis: c.axis, tiers: c.tiers, best, n: opts.length, nOn: opts.filter(o => o.on).length, opts: opts.map(o => ({ id: o.id, g: o.gname, mob: o.mob, pcb: o.pcb, on: o.on, st: o.st, sr: o.sr })) });
  }
  return rows;
}

async function stPerf() {
  const est = load('est.json'), rows = effective();
  const pf = has('perf.json') ? load('perf.json') : {};
  const items = [];
  for (const r of rows) {
    if (!r.best) continue;
    for (const dev of ['MOBILE', 'PC']) {
      const cur = dev === 'MOBILE' ? r.best.mob : r.best.pcb;
      const p5 = est[dev + '|5|' + r.k], p3 = est[dev + '|3|' + r.k];
      for (const [tag, bid] of [['cur', cur], ['p5', p5], ['p3', p3]]) {
        if (!bid || bid < 70) continue;
        const key = dev + '|' + tag + '|' + r.k;
        if (pf[key] === undefined) items.push({ key, device: dev, keyword: r.k, bid: Math.min(100000, Math.max(70, Math.round(bid / 10) * 10)) });
      }
    }
  }
  console.error('perf 남은', items.length);
  for (let i = 0; i < items.length; i += 100) {
    const b = items.slice(i, i + 100);
    try {
      const r = await req('POST', '/estimate/performance-bulk', { items: b.map(x => ({ device: x.device, keywordplus: false, keyword: x.keyword, bid: x.bid })) }, 3808925, 3);
      const out = (r && r.items) || [];
      for (let j = 0; j < b.length; j++) { const o = out[j] || {}; pf[b[j].key] = { bid: b[j].bid, clk: o.clicks ?? null, imp: o.impressions ?? null, cost: o.cost ?? null }; }
    } catch (e) { console.error('  perf fail', i, String(e).slice(0, 100)); }
    if ((i / 100) % 10 === 0) { save('perf.json', pf); console.error('  perf', i, '/', items.length); }
    await sleep(300);
  }
  save('perf.json', pf);
}

module.exports = { effective };
if (require.main === module) {
  const s = process.argv[2] || 'all';
  (async () => {
    if (s === 'kw' || s === 'all') await stKw();
    if (s === 'grp' || s === 'all') await stGrp();
    if (s === 'stats' || s === 'all') await stStats();
    if (s === 'est' || s === 'all') await stEst();
    if (s === 'perf' || s === 'all') await stPerf();
    console.log('MEASURE DONE', s);
  })().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
}
