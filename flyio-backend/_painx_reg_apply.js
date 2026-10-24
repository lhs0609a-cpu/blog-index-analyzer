// 소잠 — 피부 통증 대량 발굴(2026-09-11 2차) 즉시가능 어를 소재 승인 그룹 3곳에 등록.
// 사용자 지시(2026-09-11): "갈라짐, 물집, 코헐었을때, 연고, 이런거 빼고 다 넣어줘 광고소재 있는 캠페인에".
//   빼는 것: 갈라짐·찢어짐 축 전체, 한포진·물집 축 전체, 코/콧구멍 헐음, 연고 + 같은 결의 상품·브랜드 약명(후시딘·마데카솔…).
//   일반 '약'·'진통제' 는 치료 의도라 남긴다. <10 도 넣는다(사용자 "검색량 20미만이어도 상관없으니까") — 실재 확인된 것만(_painx_classify 판정).
// 백업 → 40개 배치(동시 1) → 항목별 ID/resultStatus → 그룹 재조회 검증. 사용: node _painx_reg_apply.js plan | apply | verify
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m, p, b) {
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customer_id: '1858907', method: m, path: p, body: b === undefined ? null : b }), signal: AbortSignal.timeout(60000) });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error('rej ' + String(d.error || '').slice(0, 200));
      return d.response;
    } catch (e) { if (a === 3 || m !== 'GET') throw e; await new Promise(s => setTimeout(s, 2500)); }
  }
}
const sleep = ms => new Promise(s => setTimeout(s, ms));
const OUT = path.join(__dirname, '../reports/sojam-20260911/painx/apply/');
fs.mkdirSync(OUT, { recursive: true });

const GID = { brand: 'grp-a001-01-000000017627304', a31: 'grp-a001-01-000000072328280', a37: 'grp-a001-01-000000072333190' };
const CAP = 995; // 네이버 그룹당 1,000 — 여유 5
const DROP_FAM = new Set(['갈라짐·찢어짐', '한포진·물집']);
const DROP_KW = /갈라|찢어|벗겨|까짐|까졌|거스러미|물집|수포|^코헐|^코안헐|콧구멍헐|연고|후시딘|마데카솔|비판텐|에스로반|알보칠|오라메디|바세린|타이레놀|탁센|가글/;
const TO = fam => fam === '은밀부위 통증' ? 'brand' : fam === '구강·입술 통증' ? 'a31' : 'a37';
const bidOf = r => Math.min(3000, (r.lt ? 1000 : r.vol >= 100 ? 2500 : 2000) + (/병원|한의원|치료/.test(r.k) ? 500 : 0));

function plan() {
  const o = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260911/painx/_final.json'), 'utf8'));
  const keep = [], dropped = [];
  for (const r of o) {
    if (r.ex || r.reg || r.hold) continue;
    if (DROP_FAM.has(r.fam) || DROP_KW.test(r.k)) { dropped.push(r.k); continue; }
    keep.push({ kw: r.k, vol: r.vol, lt: r.lt, fam: r.fam, grp: TO(r.fam), bid: bidOf(r) });
  }
  return { keep, dropped };
}

async function apply() {
  const { keep: P, dropped } = plan();
  const before = {};
  for (const [n, g] of Object.entries(GID)) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g);
    before[n] = { gid: g, count: ks.length, keywords: ks.map(k => k.keyword) };
    console.error('before', n, ks.length); await sleep(800);
  }
  // a37 가 차면 a31 로 넘긴다(재실행 시 기존 결과를 존중하려고 result 에 이미 있는 어는 그 그룹 그대로)
  const st = fs.existsSync(OUT + 'result.json') ? JSON.parse(fs.readFileSync(OUT + 'result.json', 'utf8')) : { created: [], rejected: [], failed: [], skipped: [] };
  const prevGrp = new Map([...st.created, ...st.rejected].map(x => [x.kw, x.grp]));
  const room = { brand: CAP - before.brand.count, a31: CAP - before.a31.count, a37: CAP - before.a37.count };
  for (const p of P) {
    if (prevGrp.has(p.kw)) { p.grp = prevGrp.get(p.kw); continue; }
    if (before[p.grp].keywords.includes(p.kw)) continue;
    if (room[p.grp] <= 0) p.grp = p.grp === 'a37' ? 'a31' : p.grp;
    if (room[p.grp] <= 0) throw Error('그룹 여유 없음 ' + p.grp);
    room[p.grp]--;
  }
  fs.writeFileSync(OUT + 'plan.json', JSON.stringify({ keep: P, dropped }, null, 1));
  fs.writeFileSync(OUT + 'before.json', JSON.stringify(before, null, 1));
  const done = new Set(prevGrp.keys());
  for (const [n, g] of Object.entries(GID)) {
    const exist = new Set(before[n].keywords);
    const items = P.filter(p => p.grp === n && !done.has(p.kw) && !exist.has(p.kw));
    for (const p of P.filter(p => p.grp === n && exist.has(p.kw))) if (!st.skipped.includes(p.kw)) st.skipped.push(p.kw);
    console.error(n, '등록대상', items.length);
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40);
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + g, chunk.map(x => ({ keyword: x.kw, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
        if (!Array.isArray(r)) throw Error('배열 아님: ' + JSON.stringify(r).slice(0, 200));
        // HTTP 200 이어도 금지어는 ID 없이 resultStatus 로 섞여 온다 — 항목별로 가른다
        for (let j = 0; j < chunk.length; j++) {
          const k = r.find(x => x && x.keyword === chunk[j].kw) || r[j] || {};
          if (k.nccKeywordId) st.created.push({ kw: chunk[j].kw, id: k.nccKeywordId, gid: g, grp: n, bid: k.bidAmt, status: k.status, reason: k.statusReason });
          else st.rejected.push({ kw: chunk[j].kw, grp: n, res: k.resultStatus || k });
        }
        console.error('  +', chunk.length, '누적 생성', st.created.length, '거부', st.rejected.length);
      } catch (e) {
        st.failed.push({ grp: n, batch: i, kws: chunk.map(x => x.kw), err: String(e).slice(0, 300) });
        console.error('  FAIL batch', n, i, String(e).slice(0, 150));
      }
      fs.writeFileSync(OUT + 'result.json', JSON.stringify(st, null, 1));
      await sleep(1200);
    }
  }
  console.log('APPLIED 계획', P.length, '생성', st.created.length, '거부', st.rejected.length, '배치실패', st.failed.length, '기존중복', st.skipped.length);
}

async function verify() {
  const st = JSON.parse(fs.readFileSync(OUT + 'result.json', 'utf8'));
  const want = new Map(st.created.map(c => [c.id, c]));
  const found = new Map(), tally = {}, bidBad = [];
  for (const [n, g] of Object.entries(GID)) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g);
    console.error('after', n, ks.length);
    for (const k of ks) if (want.has(k.nccKeywordId)) {
      found.set(k.nccKeywordId, k);
      const key = n + ' ' + k.status + '/' + k.statusReason; tally[key] = (tally[key] || 0) + 1;
      const c = want.get(k.nccKeywordId);
      if (k.bidAmt !== c.bid || k.useGroupBidAmt || k.userLock) bidBad.push({ kw: k.keyword, bid: k.bidAmt, want: c.bid });
    }
    await sleep(800);
  }
  const missing = [...want.values()].filter(c => !found.has(c.id)).map(c => c.kw);
  fs.writeFileSync(OUT + 'verify.json', JSON.stringify({ tally, missing, bidBad, found: [...found.values()].map(k => ({ kw: k.keyword, id: k.nccKeywordId, bid: k.bidAmt, status: k.status, reason: k.statusReason })) }, null, 1));
  console.log('VERIFY 생성', want.size, '재조회 확인', found.size, '누락', missing.length, '입찰불일치', bidBad.length);
  console.log(JSON.stringify(tally));
  if (st.rejected.length) console.log('거부', JSON.stringify(st.rejected.map(r => r.kw + ':' + JSON.stringify(r.res).slice(0, 80))));
}

const s = process.argv[2];
(s === 'plan' ? Promise.resolve().then(() => { const { keep, dropped } = plan(); const g = {}; for (const p of keep) { g[p.grp] = g[p.grp] || { n: 0, bid: {} }; g[p.grp].n++; g[p.grp].bid[p.bid] = (g[p.grp].bid[p.bid] || 0) + 1; }
    console.log('PLAN 등록', keep.length, '| 뺀 것', dropped.length, JSON.stringify(g)); console.log('뺀 것:', dropped.join(' ')); })
  : s === 'apply' ? apply() : s === 'verify' ? verify() : Promise.reject(Error('plan|apply|verify')))
  .catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
