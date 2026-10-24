// 방치된 간절 상위 키워드 교정 (2026-09-16).
// 대상: urgency_rank.json 상위 × (어제 노출 0 | 유효입찰 ≤100원 | 실순위 5위 밖)
// 제외: 어제 70원으로 내린 105건(무좀·콜린성두드러기·검사) · 타지역(원장 제외축) · 제품/정보어
// 사용: node _sojam_20260916_boost.js pick | est | plan
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const { why } = require('./_sojam_d0828_rule');
const D15 = path.join(__dirname, '../reports/sojam-20260915/');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
fs.mkdirSync(D16, { recursive: true });
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = s => String(s).replace(/\s+/g, '');

const CUT_CLASS = /무좀|백선|완선|어루러기|조갑|콜린성|검사|체질진단|알러지내과/;
const PRODUCT = /연고|크림|로션|샴푸|비누|세안제|패치|에센스|화장품|영양제|음식|짜는|도구|파스|바르는|먹는약|약추천|올리브영|다이소/;
const INFO = /사진|종류|차이|전염|뜻|영어|이란|무엇|디시|나무위키/;

function pick() {
  const rows = J(D15 + 'urgency_rank.json');
  const out = [];
  for (const r of rows) {
    if ((r.vol || 0) < 10) continue;                 // 볼륨이 0이면 입찰로 노출이 생기지 않는다
    if (CUT_CLASS.test(r.k)) continue;               // 어제 지시로 내린 축은 건드리지 않는다
    if (PRODUCT.test(r.k) || INFO.test(r.k)) continue;
    const scope = why(r.k);                          // '타지역' | '진료범위 밖' | '두드러기·건선'
    const idle = r.imp === 0 || (r.bidNow || 0) <= 100 || (r.rank != null && r.rank > 5);
    if (!idle) continue;
    out.push({ k: r.k, axis: r.axis, score: r.score, vol: r.vol, imp: r.imp, rank: r.rank, bid: r.bidNow, sig: r.sig, scope });
  }
  out.sort((a, b) => b.score - a.score || (b.vol || 0) - (a.vol || 0));
  fs.writeFileSync(D16 + 'boost_pick.json', JSON.stringify(out));
  const local = out.filter(r => r.scope !== '타지역');
  const other = out.filter(r => r.scope === '타지역');
  console.log('방치 간절 키워드', out.length, '| 강남권·전국어', local.length, '| 타지역', other.length);
  const by = {}; for (const r of local) by[r.axis] = (by[r.axis] || 0) + 1;
  console.log('축별(타지역 제외):', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('월검색 합', local.reduce((a, r) => a + r.vol, 0).toLocaleString('ko-KR'));
}

async function est() {
  const pickRows = J(D16 + 'boost_pick.json').filter(r => r.scope !== '타지역');
  const F = D16 + 'boost_est.json';
  const est = fs.existsSync(F) ? J(F) : {};
  const texts = [...new Set(pickRows.map(r => r.k))];
  for (const dev of ['MOBILE', 'PC']) for (const pos of [1, 2, 3, 5]) {
    const todo = texts.filter(t => est[dev + '|' + pos + '|' + t] === undefined);
    if (!todo.length) { console.error(dev, pos, '캐시'); continue; }
    for (let i = 0; i < todo.length; i += 100) {
      try {
        const r = await req('POST', '/estimate/average-position-bid/keyword', { device: dev, items: todo.slice(i, i + 100).map(k => ({ key: k, position: pos })) }, 3808925, 3);
        for (const e of (r && r.estimate) || []) est[dev + '|' + pos + '|' + e.keyword] = e.bid;
      } catch (e) { console.error(' fail', dev, pos, i, String(e).slice(0, 60)); }
      await sleep(250);
    }
    for (const t of todo) if (est[dev + '|' + pos + '|' + t] === undefined) est[dev + '|' + pos + '|' + t] = null;
    fs.writeFileSync(F, JSON.stringify(est)); console.error(dev, pos, '완료');
  }
}

async function plan() {
  const pickRows = J(D16 + 'boost_pick.json').filter(r => r.scope !== '타지역');
  const est = J(D16 + 'boost_est.json');
  const F = D16 + 'boost_perf.json';
  const pf = fs.existsSync(F) ? J(F) : {};
  const items = [];
  for (const r of pickRows) for (const dev of ['MOBILE', 'PC']) {
    const p3 = est[dev + '|3|' + r.k];
    for (const [tag, bid] of [['cur', r.bid], ['p3', p3]]) {
      if (!bid || bid < 70) continue;
      const key = dev + '|' + tag + '|' + r.k;
      if (pf[key] === undefined) items.push({ key, device: dev, keyword: r.k, bid: Math.min(100000, Math.max(70, Math.round(bid / 10) * 10)) });
    }
  }
  console.error('perf 남은', items.length);
  for (let i = 0; i < items.length; i += 100) {
    const b = items.slice(i, i + 100);
    try {
      const r = await req('POST', '/estimate/performance-bulk', { items: b.map(x => ({ device: x.device, keywordplus: false, keyword: x.keyword, bid: x.bid })) }, 3808925, 3);
      const out = (r && r.items) || [];
      for (let j = 0; j < b.length; j++) { const o = out[j] || {}; pf[b[j].key] = { bid: b[j].bid, clk: o.clicks ?? null, imp: o.impressions ?? null, cost: o.cost ?? null }; }
    } catch (e) { console.error(' fail', i, String(e).slice(0, 60)); }
    await sleep(300);
  }
  fs.writeFileSync(F, JSON.stringify(pf));
  // 탐욕 배분 — 일 44,000원(월 132만) 한도, 간절도 높은 순 우선, 같은 간절도면 추가 클릭당 싼 순
  const CAP = 1320000, CAP_BID = 10000;
  const cand = [];
  for (const r of pickRows) {
    const t = est['MOBILE|3|' + r.k];
    if (!t || t <= r.bid || t > CAP_BID) continue;
    let cc = 0, ck = 0, tc = 0, tk = 0, got = false;
    for (const dev of ['MOBILE', 'PC']) {
      const a = pf[dev + '|cur|' + r.k], b = pf[dev + '|p3|' + r.k];
      if (a) { cc += a.cost || 0; ck += a.clk || 0; }
      if (b) { tc += b.cost || 0; tk += b.clk || 0; got = true; }
    }
    if (!got) continue;
    const dc = tc - cc, dk = tk - ck;
    if (dc <= 0) continue;
    cand.push({ ...r, target: Math.round(t / 10) * 10, dc, dk, cpc: dk > 0 ? dc / dk : 1e9 });
  }
  // 간절도 구간(10점 단위)으로 묶고, 구간 안에서는 추가 클릭당 비용 싼 순
  cand.sort((a, b) => Math.floor(b.score / 10) - Math.floor(a.score / 10) || a.cpc - b.cpc);
  let cost = 0, clk = 0; const take = [];
  for (const c of cand) if (cost + c.dc <= CAP) { cost += c.dc; clk += c.dk; take.push(c); }
  fs.writeFileSync(D16 + 'boost_plan.json', JSON.stringify({ cap: CAP, cost, clk, take }, null, 1));
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('후보', cand.length, '→ 채택', take.length, '| 월 +' + won(cost) + '원 (일 +' + won(cost / 30) + ') | 월 클릭 +' + won(clk));
  const by = {}; for (const t of take) { const x = by[t.axis] = by[t.axis] || { n: 0, dc: 0, dk: 0 }; x.n++; x.dc += t.dc; x.dk += t.dk; }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].dc - a[1].dc)) console.log('  ' + k + ': ' + v.n + '개 · 월 +' + won(v.dc) + '원 · 클릭 +' + won(v.dk));
}

const m = process.argv[2];
({ pick: async () => pick(), est, plan }[m] || (async () => console.log('pick|est|plan')))().catch(e => { console.error(e.stack); process.exitCode = 1; });
