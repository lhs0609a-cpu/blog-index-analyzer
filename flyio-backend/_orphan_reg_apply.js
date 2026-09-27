// 소잠 — 소재 전부 반려 그룹에만 있던 키워드 22개를 소재 승인 그룹으로 옮겨 등록 (2026-09-11 사용자 지시 "22개를 살리려면 소재가 승인된 그룹(a31 등)으로 옮겨 등록해줘").
// 뺀 3개: 건선피부염치료(원장 제외축 건선), 피부따가움연고·가려움패치(사용자 "연고, 이런거 빼고" — 약·상품어 기본 제외).
// 반려 그룹의 원본은 건드리지 않는다(같은 문구 등록은 그룹이 다르면 허용). 사용: node _orphan_reg_apply.js plan | apply | verify
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }), signal: AbortSignal.timeout(60000) });
      const d = await r.json(); if (!r.ok || !d.success) throw Error('rej ' + String(d.error || '').slice(0, 200)); return d.response; }
    catch (e) { if (a === 3 || m !== 'GET') throw e; await sleep(2500); }
  }
}
const R = path.join(__dirname, '../reports/sojam-20260911/creative/');
const OUT = R + 'orphan_apply/';
fs.mkdirSync(OUT, { recursive: true });
const GID = { a37: 'grp-a001-01-000000072333190', a31: 'grp-a001-01-000000072328280' };
const SKIP = { '건선피부염치료': '원장 제외축(건선)', '피부따가움연고': '연고·상품어 제외(사용자 지시)', '가려움패치': '연고·상품어 제외(사용자 지시)' };
const toGrp = k => /가려|간지|소양/.test(k) ? 'a37' : 'a31';
const pv = s => { s = String(s); const lt = s.indexOf('<') >= 0; return { v: lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10), lt }; };

async function plan() {
  const orphan = JSON.parse(fs.readFileSync(R + '_orphan_rejected.json', 'utf8'));
  const keep = orphan.filter(k => !SKIP[k]);
  // 검색량: 로컬 키워드도구(3808925) 로 정확일치만 읽는다. 없으면 <10 로 둔다(원래 등록돼 있던 실재어라 실재는 확인됨).
  const vol = {};
  for (let i = 0; i < keep.length; i += 5) {
    const h = keep.slice(i, i + 5);
    const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(h.join(',')) + '&showDetail=1', null, 3808925, 3);
    for (const k of (r && r.keywordList) || []) if (h.includes(k.relKeyword)) { const a = pv(k.monthlyPcQcCnt), b = pv(k.monthlyMobileQcCnt); vol[k.relKeyword] = { v: a.v + b.v, lt: a.lt && b.lt }; }
    await sleep(300);
  }
  const P = keep.map(k => { const x = vol[k] || { v: 0, lt: true }; return { kw: k, vol: x.v, lt: x.lt, grp: toGrp(k),
    bid: Math.min(3000, (x.lt ? 1000 : x.v >= 100 ? 2500 : 2000) + (/병원|한의원|치료/.test(k) ? 500 : 0)) }; });
  fs.writeFileSync(OUT + 'plan.json', JSON.stringify({ keep: P, skipped: SKIP }, null, 1));
  return P;
}

async function apply() {
  const P = JSON.parse(fs.readFileSync(OUT + 'plan.json', 'utf8')).keep;
  const before = {};
  for (const [n, g] of Object.entries(GID)) { const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g); before[n] = { gid: g, count: ks.length, keywords: ks.map(k => k.keyword) }; await sleep(800); }
  fs.writeFileSync(OUT + 'before.json', JSON.stringify(before, null, 1));
  const st = { created: [], rejected: [], failed: [], skipped: [] };
  for (const [n, g] of Object.entries(GID)) {
    const items = P.filter(p => p.grp === n && !before[n].keywords.includes(p.kw));
    for (const p of P.filter(p => p.grp === n && before[n].keywords.includes(p.kw))) st.skipped.push(p.kw);
    if (before[n].count + items.length > 1000) throw Error(n + ' 한도 초과');
    if (!items.length) continue;
    try {
      const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + g, items.map(x => ({ keyword: x.kw, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
      for (let j = 0; j < items.length; j++) {
        const k = (Array.isArray(r) ? r : []).find(x => x && x.keyword === items[j].kw) || {};
        if (k.nccKeywordId) st.created.push({ kw: items[j].kw, id: k.nccKeywordId, grp: n, bid: k.bidAmt, status: k.status, reason: k.statusReason });
        else st.rejected.push({ kw: items[j].kw, grp: n, res: k.resultStatus || k });
      }
    } catch (e) { st.failed.push({ grp: n, kws: items.map(x => x.kw), err: String(e).slice(0, 300) }); }
    fs.writeFileSync(OUT + 'result.json', JSON.stringify(st, null, 1));
    await sleep(1200);
  }
  fs.writeFileSync(OUT + 'result.json', JSON.stringify(st, null, 1));
  console.log('APPLIED 계획', P.length, '생성', st.created.length, '거부', st.rejected.length, '실패', st.failed.length, '기존중복', st.skipped.length);
}

async function verify() {
  const st = JSON.parse(fs.readFileSync(OUT + 'result.json', 'utf8'));
  const want = new Map(st.created.map(c => [c.id, c])); const rows = [];
  for (const [n, g] of Object.entries(GID)) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g);
    for (const k of ks) if (want.has(k.nccKeywordId)) rows.push({ kw: k.keyword, grp: n, bid: k.bidAmt, want: want.get(k.nccKeywordId).bid, lock: k.userLock, status: k.status + '/' + k.statusReason });
    console.error('after', n, ks.length); await sleep(800);
  }
  fs.writeFileSync(OUT + 'verify.json', JSON.stringify(rows, null, 1));
  console.log('VERIFY 생성', want.size, '재조회', rows.length, '누락', want.size - rows.length, '입찰불일치', rows.filter(r => r.bid !== r.want || r.lock).length);
  for (const r of rows) console.log(' ', r.grp, r.kw, r.bid + '원', r.status);
}

const s = process.argv[2];
(s === 'plan' ? plan().then(P => { console.log('PLAN', P.length, '| 뺀 것', Object.keys(SKIP).join(', ')); for (const p of P) console.log(' ', p.grp, p.kw, p.lt ? '<10' : p.vol, p.bid + '원'); })
  : s === 'apply' ? apply() : s === 'verify' ? verify() : Promise.reject(Error('plan|apply|verify')))
  .catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
