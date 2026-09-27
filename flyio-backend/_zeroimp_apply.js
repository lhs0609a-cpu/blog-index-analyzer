// 소잠 — 노출 0 핵심 키워드 개선 적용 (2026-09-11 사용자 지시 "노출 없는거 전부 다 개선해").
// 입력 zeroimp/actions.json: { raises:[{id,gid,k,from,to}], copies:[{k,grp,bid}] }  (_zeroimp_actions.js 가 만든다)
// 입찰 인상: 적용 직전 재조회 → editTm·bidAmt 가 계획 시점과 같을 때만 → PUT /ncc/keywords?fields=bidAmt (20개씩, useGroupBidAmt:false) → 재조회 검증.
// 복사 등록: 대상 그룹 재조회로 중복 제외 → POST 40개씩 → 항목별 ID/resultStatus → 재조회 검증.
// 롤백: before.json(인상 전 bidAmt·useGroupBidAmt). 사용: node _zeroimp_apply.js apply | verify
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(m, p, b) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }), signal: AbortSignal.timeout(60000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error('rej ' + String(d.error || '').slice(0, 200)); return d.response; }
    catch (e) { if (a === 2 || m !== 'GET') throw e; await sleep(2500); }
  }
}
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/zeroimp/');
const J = n => JSON.parse(fs.readFileSync(D + n, 'utf8'));
const save = (n, o) => fs.writeFileSync(D + n, JSON.stringify(o, null, 1));
const GID = { a31: 'grp-a001-01-000000072328280', a37: 'grp-a001-01-000000072333190', brand: 'grp-a001-01-000000017627304' };

async function apply() {
  const A = J('actions.json');
  const st = fs.existsSync(D + 'result.json') ? J('result.json') : { raised: [], raiseSkip: [], raiseFail: [], created: [], rejected: [], copyFail: [], copySkip: [] };
  const doneR = new Set([...st.raised, ...st.raiseSkip].map(x => x.id));
  // 1) 입찰 인상
  const before = fs.existsSync(D + 'before.json') ? J('before.json') : {};
  const todo = A.raises.filter(r => !doneR.has(r.id));
  for (let i = 0; i < todo.length; i += 20) {
    const part = todo.slice(i, i + 20);
    const fresh = await api('GET', '/ncc/keywords?ids=' + encodeURIComponent(part.map(r => r.id).join(',')));
    const body = [];
    for (const r of part) {
      const k = (fresh || []).find(x => x.nccKeywordId === r.id);
      const curBase = k ? (k.useGroupBidAmt ? null : k.bidAmt) : null;
      // 계획 뒤 누가 바꿨으면(잠금·입찰 변동) 건너뛴다
      if (!k || k.userLock || (!k.useGroupBidAmt && k.bidAmt !== r.from)) { st.raiseSkip.push({ id: r.id, k: r.k, why: !k ? '없음' : k.userLock ? '꺼짐' : '입찰 변동 ' + k.bidAmt + '≠' + r.from }); continue; }
      if (!before[r.id]) before[r.id] = { bidAmt: k.bidAmt, useGroupBidAmt: k.useGroupBidAmt, editTm: k.editTm };
      body.push({ ...k, bidAmt: r.to, useGroupBidAmt: false });
    }
    save('before.json', before);
    if (body.length) {
      try {
        await api('PUT', '/ncc/keywords?fields=bidAmt', body);
        const after = await api('GET', '/ncc/keywords?ids=' + encodeURIComponent(body.map(b => b.nccKeywordId).join(',')));
        for (const b of body) { const k = (after || []).find(x => x.nccKeywordId === b.nccKeywordId); const r = part.find(p => p.id === b.nccKeywordId);
          (k && k.bidAmt === r.to && !k.useGroupBidAmt ? st.raised : st.raiseFail).push({ id: r.id, k: r.k, from: r.from, to: r.to, got: k && k.bidAmt }); }
      } catch (e) { for (const b of body) st.raiseFail.push({ id: b.nccKeywordId, k: b.keyword, err: String(e).slice(0, 200) }); }
    }
    save('result.json', st); console.error('  인상', st.raised.length, '실패', st.raiseFail.length, '건너뜀', st.raiseSkip.length);
    await sleep(1000);
  }
  // 2) 복사 등록
  const doneC = new Set([...st.created, ...st.rejected, ...st.copySkip].map(x => x.k + '|' + x.grp));
  for (const [n, g] of Object.entries(GID)) {
    const items = A.copies.filter(c => c.grp === n && !doneC.has(c.k + '|' + n));
    if (!items.length) continue;
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g);
    const exist = new Set(ks.map(k => k.keyword));
    const go = items.filter(c => { if (exist.has(c.k)) { st.copySkip.push({ k: c.k, grp: n, why: '이미 있음' }); return false; } return true; });
    if (ks.length + go.length > 1000) throw Error(n + ' 그룹 한도 초과 ' + (ks.length + go.length));
    for (let i = 0; i < go.length; i += 40) {
      const chunk = go.slice(i, i + 40);
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + g, chunk.map(x => ({ keyword: x.k, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
        for (const c of chunk) { const k = (Array.isArray(r) ? r : []).find(x => x && x.keyword === c.k) || {};
          if (k.nccKeywordId) st.created.push({ k: c.k, grp: n, id: k.nccKeywordId, bid: k.bidAmt, status: k.status, reason: k.statusReason });
          else st.rejected.push({ k: c.k, grp: n, res: k.resultStatus || k }); }
      } catch (e) { st.copyFail.push({ grp: n, kws: chunk.map(x => x.k), err: String(e).slice(0, 200) }); }
      save('result.json', st); await sleep(1200);
    }
  }
  console.log('APPLIED 인상', st.raised.length, '/ 실패', st.raiseFail.length, '/ 건너뜀', st.raiseSkip.length, '| 복사 생성', st.created.length, '/ 거부', st.rejected.length, '/ 실패', st.copyFail.length, '/ 이미 있음', st.copySkip.length);
}

async function verify() {
  const st = J('result.json');
  const ids = [...st.raised.map(r => r.id), ...st.created.map(c => c.id)];
  const got = new Map();
  for (let i = 0; i < ids.length; i += 20) { const r = await api('GET', '/ncc/keywords?ids=' + encodeURIComponent(ids.slice(i, i + 20).join(','))); for (const k of r || []) got.set(k.nccKeywordId, k); await sleep(250); }
  const badR = st.raised.filter(r => { const k = got.get(r.id); return !k || k.bidAmt !== r.to || k.useGroupBidAmt || k.userLock; });
  const badC = st.created.filter(c => !got.get(c.id));
  const stc = {}; for (const c of st.created) { const k = got.get(c.id); const s = k ? k.status + '/' + k.statusReason : '없음'; stc[s] = (stc[s] || 0) + 1; }
  save('verify.json', { badR, badC, stc });
  console.log('VERIFY 인상', st.raised.length, '불일치', badR.length, '| 복사', st.created.length, '누락', badC.length, JSON.stringify(stc));
}
const s = process.argv[2];
(s === 'apply' ? apply() : s === 'verify' ? verify() : Promise.reject(Error('apply|verify'))).catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
