// 소잠 — 은밀부위 축 적용 (사용자 지시 2026-09-10: "1번 바로 넣어줘 3번도 조정하고").
//  1) 미등록·보류표시 없는 80개를 '브랜드키워드' 그룹에 등록 (승인 소재 있음, 은밀부위 어가 이미 노출 중)
//  2) 노출 0 / 3위 밖 등록본 60건 입찰 인상 — 계획 시점 입찰과 지금 입찰이 다르면 건너뛴다
// 변경 전 백업 → 적용 → 재조회 검증. 결과는 reports/sojam-20260910/private/apply/
const fs = require('fs');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }),
        signal: AbortSignal.timeout(60000),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error(String(d.error || '').slice(0, 250));
      return d.response;
    } catch (e) { if (a === 2) throw e; await new Promise(s => setTimeout(s, 3000)); }
  }
}
const DIR = '../reports/sojam-20260910/private/apply/';
fs.mkdirSync(DIR, { recursive: true });
const save = (n, o) => fs.writeFileSync(DIR + n, JSON.stringify(o, null, 1));

(async () => {
  const plan = JSON.parse(fs.readFileSync('../reports/sojam-20260910/private/_apply_plan.json', 'utf8'));
  const gids = [...new Set([...plan.register.map(p => p.gid), ...plan.bids.map(p => p.gid)])];

  // 0) 변경 전 백업 — 관련 그룹의 키워드 전체
  const before = {};
  for (const g of gids) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g + '&recordSize=1000');
    before[g] = Array.isArray(ks) ? ks : [];
    await new Promise(s => setTimeout(s, 150));
  }
  save('before.json', before);
  const byId = {};
  for (const ks of Object.values(before)) for (const k of ks) byId[k.nccKeywordId] = k;
  const result = { registered: [], regFailed: [], regSkipped: [], bids: [], bidSkipped: [], bidFailed: [] };

  // 1) 등록
  const brand = plan.register[0] && plan.register[0].gid;
  if (brand) {
    const exist = new Set(before[brand].map(k => k.keyword));
    if (before[brand].length + plan.register.length > 1000) throw Error('그룹 용량 초과');
    const items = plan.register.filter(p => { if (exist.has(p.kw)) { result.regSkipped.push(p.kw); return false; } return true; });
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + brand,
          chunk.map(x => ({ keyword: x.kw, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
        for (const k of r) result.registered.push({ kw: k.keyword, id: k.nccKeywordId, bid: k.bidAmt });
      } catch (e) { result.regFailed.push({ batch: i, n: chunk.length, err: String(e).slice(0, 250) }); }
      save('result.json', result);
    }
    console.error('등록', result.registered.length, '실패배치', result.regFailed.length, '중복스킵', result.regSkipped.length);
  }

  // 2) 입찰 인상 — 사전 상태 대조
  const ok = [];
  for (const p of plan.bids) {
    const k = byId[p.kid];
    if (!k) { result.bidSkipped.push({ kw: p.kw, kid: p.kid, why: '키워드 없음' }); continue; }
    if (k.userLock) { result.bidSkipped.push({ kw: p.kw, kid: p.kid, why: '잠김' }); continue; }
    const curNow = k.useGroupBidAmt ? null : k.bidAmt;
    if (!p.ugb && curNow !== p.cur) { result.bidSkipped.push({ kw: p.kw, kid: p.kid, why: `입찰 변동 ${p.cur}→${curNow}` }); continue; }
    ok.push({ p, k });
  }
  for (let i = 0; i < ok.length; i += 50) {
    const part = ok.slice(i, i + 50);
    try {
      await api('PUT', '/ncc/keywords?fields=bidAmt', part.map(({ p, k }) => ({ ...k, bidAmt: p.new, useGroupBidAmt: false })));
      for (const { p } of part) result.bids.push({ kw: p.kw, kid: p.kid, gid: p.gid, from: p.cur, to: p.new });
    } catch (e) { for (const { p } of part) result.bidFailed.push({ kw: p.kw, kid: p.kid, err: String(e).slice(0, 200) }); }
    save('result.json', result);
  }
  console.error('입찰 변경', result.bids.length, '스킵', result.bidSkipped.length, '실패', result.bidFailed.length);

  // 3) 재조회 검증
  const after = {};
  for (const g of gids) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g + '&recordSize=1000');
    for (const k of (ks || [])) after[k.nccKeywordId] = k;
    await new Promise(s => setTimeout(s, 150));
  }
  const regOk = result.registered.filter(r => after[r.id] && after[r.id].bidAmt === r.bid && !after[r.id].userLock);
  const bidOk = result.bids.filter(b => after[b.kid] && after[b.kid].bidAmt === b.to && !after[b.kid].useGroupBidAmt);
  const status = {};
  for (const r of result.registered) { const s = after[r.id] ? after[r.id].status : '없음'; status[s] = (status[s] || 0) + 1; }
  const verify = { registered: result.registered.length, registeredVerified: regOk.length, regStatus: status,
    bids: result.bids.length, bidsVerified: bidOk.length, bidSkipped: result.bidSkipped, regFailed: result.regFailed, bidFailed: result.bidFailed };
  save('verify.json', verify);
  console.log('DONE 등록', regOk.length, '/', plan.register.length, '검증 | 입찰', bidOk.length, '/', plan.bids.length, '검증 | 등록상태', JSON.stringify(status));
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
