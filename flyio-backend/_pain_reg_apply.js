// 소잠 — 고통 표현 발굴(2026-09-11) 미등록 실볼륨 어를 소재 승인 그룹 3곳에 등록.
// 사용자 지시(2026-09-11): 은밀부위·가려움일반·입술·임신갱년기노인·만성재발·따가움쓰라림·진물·밤수면 "전부 광고소재 붙어있는 캠페인에 넣어줘".
// 변경 전 백업 → 40개 배치(동시 1, 프록시 OOM 방지) → 항목별 ID/resultStatus 기록 → 그룹 재조회 검증.
// 사용: node _pain_reg_apply.js plan | apply | verify
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
const OUT = path.join(__dirname, '../reports/sojam-20260911/pain/apply/');
fs.mkdirSync(OUT, { recursive: true });

const GID = { brand: 'grp-a001-01-000000017627304', a37: 'grp-a001-01-000000072333190', a31: 'grp-a001-01-000000072328280' };
const TO = { '은밀부위': 'brand', '가려움 일반': 'a37', '밤·수면 가려움': 'a37', '따가움·쓰라림·작열': 'a37', '임신·갱년기·노인': 'a37',
  '만성·재발·치료실패': 'a31', '진물·짓무름': 'a31', '입술·구순·구내': 'a31' };
// 검토에서 뺀 비피부·타과·서류 맥락 어
// 생리전간지러움냉·질입구돌기따가움·질입구하얀색물집은 사용자 지시로 되살림(2026-09-11 "이것도 등록해줘")
const DROP = new Set(['치골염증상', '음경보형물삽입술', '서혜부림프절염증상', '구내염완치판정', '구내염완치후전염']);
const OVERRIDE = { '생리전간지러움냉': 'brand' };
const bidOf = r => Math.min(3000, (r.vol >= 100 ? 2500 : 2000) + (/병원|한의원|치료|치료법/.test(r.k) ? 500 : 0));

function plan() {
  const o = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260911/pain/_final.json'), 'utf8'));
  return o.filter(r => !r.ex && !r.reg && !r.hold && !r.lt && TO[r.fam] && !DROP.has(r.k))
    .map(r => ({ kw: r.k, vol: r.vol, fam: r.fam, grp: OVERRIDE[r.k] || TO[r.fam], bid: bidOf(r) }));
}

async function apply() {
  const P = plan();
  fs.writeFileSync(OUT + 'plan.json', JSON.stringify(P, null, 1));
  const before = {};
  for (const [n, g] of Object.entries(GID)) {
    const ks = await api('GET', '/ncc/keywords?nccAdgroupId=' + g);
    before[n] = { gid: g, count: ks.length, keywords: ks.map(k => k.keyword) };
    console.error('before', n, ks.length); await sleep(800);
  }
  fs.writeFileSync(OUT + 'before.json', JSON.stringify(before, null, 1));
  const st = fs.existsSync(OUT + 'result.json') ? JSON.parse(fs.readFileSync(OUT + 'result.json', 'utf8')) : { created: [], rejected: [], failed: [], skipped: [] };
  const done = new Set([...st.created.map(x => x.kw), ...st.rejected.map(x => x.kw)]);
  for (const [n, g] of Object.entries(GID)) {
    const exist = new Set(before[n].keywords);
    const items = P.filter(p => p.grp === n && !done.has(p.kw) && !exist.has(p.kw));
    for (const p of P.filter(p => p.grp === n && exist.has(p.kw))) if (!st.skipped.includes(p.kw)) st.skipped.push(p.kw);
    if (before[n].count + items.length > 1000) throw Error(n + ' 그룹 한도 초과 ' + (before[n].count + items.length));
    console.error(n, '등록대상', items.length);
    for (let i = 0; i < items.length; i += 40) {
      const chunk = items.slice(i, i + 40);
      try {
        const r = await api('POST', '/ncc/keywords?nccAdgroupId=' + g, chunk.map(x => ({ keyword: x.kw, bidAmt: x.bid, useGroupBidAmt: false, userLock: false })));
        if (!Array.isArray(r)) throw Error('배열 아님: ' + JSON.stringify(r).slice(0, 200));
        // HTTP 200 이어도 항목별로 금지어(resultStatus)가 섞여 온다 — ID 유무로 가른다
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
      if (k.bidAmt !== c.bid || k.useGroupBidAmt || k.userLock) bidBad.push({ kw: k.keyword, bid: k.bidAmt, want: c.bid, useGrp: k.useGroupBidAmt, lock: k.userLock });
    }
    await sleep(800);
  }
  const missing = [...want.values()].filter(c => !found.has(c.id)).map(c => c.kw);
  fs.writeFileSync(OUT + 'verify.json', JSON.stringify({ tally, missing, bidBad, found: [...found.values()].map(k => ({ kw: k.keyword, id: k.nccKeywordId, bid: k.bidAmt, status: k.status, reason: k.statusReason })) }, null, 1));
  console.log('VERIFY 생성', want.size, '재조회 확인', found.size, '누락', missing.length, '입찰불일치', bidBad.length);
  console.log(JSON.stringify(tally));
}

const st = process.argv[2];
(st === 'plan' ? Promise.resolve().then(() => { const P = plan(); const g = {}; for (const p of P) { g[p.grp] = g[p.grp] || { n: 0, bid: {} }; g[p.grp].n++; g[p.grp].bid[p.bid] = (g[p.grp].bid[p.bid] || 0) + 1; } console.log('PLAN', P.length, JSON.stringify(g)); })
  : st === 'apply' ? apply() : st === 'verify' ? verify() : Promise.reject(Error('plan|apply|verify')))
  .catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
