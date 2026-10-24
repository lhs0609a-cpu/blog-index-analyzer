// 통합 개선 배분 (2026-09-16) — 방치 간절 + 켜짐·70원 을 한 판에 놓고 일 44,000원 안에서 배분한다.
// 공유예산 230,000 · 어제 소진 208,924 · 어제 인하로 -23,303 → 여유 약 44,000/일.
// 제외: 어제 지시로 내린 무좀·콜린성두드러기·검사 / 타지역 / 제품·미용·외과어
// 사용: node _sojam_20260916_final.js pool | est | plan | actions
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const { why } = require('./_sojam_d0828_rule');
const D15 = path.join(__dirname, '../reports/sojam-20260915/');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = (p, o) => fs.writeFileSync(p, JSON.stringify(o));
const norm = s => String(s).replace(/\s+/g, '');

const CUT = /무좀|백선|완선|어루러기|조갑|콜린성|검사|체질진단|알러지내과/;
const JUNK = /피부과|외과|항문암|항문출혈|항문농양|치질|치핵|치루|대장|내시경|흉터|유산균|세정제|스프레이|미용|관리실|에스테틱|필링|보험|실비|피부관리|보습제|클렌저|청결제|지성피부|닭살|재생|이식|장벽|민감성|연고|크림|로션|샴푸|비누|패치|에센스|화장품|영양제|음식|짜는|도구|압출|염증주사|아그네스/;
const NOISE = /간지럼(?!증)|간지럽히/;

// 상담일지 실측 — 축 문의→내원율
const AXRATE = { '아토피': 62 / 115, '가려움·소양': 55 / 116, '습진': 58 / 138, '두드러기': 48 / 102, '건선': 17 / 41, '피부질환 일반': 17 / 51,
  '여드름': 15 / 22, '지루성·두피': 14 / 34, '접촉성피부염': 13 / 23, '한포진': 12 / 29, '묘기증': 9 / 15, '은밀부위': 8 / 16,
  '모낭염·한선염': 1 / 2, '구내염·구순염': 1 / 4, '난치·자가면역': 1 / 6, '무좀·백선': 1 / 5, '다한증·땀띠': 1 / 2, '탈스테로이드': .3, '백반증': .05 };
// 상담일지 실측 리프트
const SIG = [['점점 심해짐', 1.66, /번지|퍼지|퍼졌|심해지|점점|갑자기|번짐|악화/], ['재발 반복', 1.64, /재발|자꾸|반복|또생|끊으면|중단하면|낫다가|안낫|안나아/],
  ['오래됨', 1.57, /만성|몇년|수년|오래된|년째/], ['타 치료처', 1.54, /한의원|한방|대학병원|병원|의원|클리닉|잘하는|명의|용한|전문|추천/],
  ['어릴때부터', 1.51, /성인아토피|어릴때|유아기|태열|소아|초등|중학생|고등학생/], ['막막·절박', 1.46, /어떻게해야|어떡|방법없|도와|살려|절박|막막|미치겠|죽겠/],
  ['가족 대리', 1.45, /아기|아이|신생아|영아|유아|돌쟁이|아들|딸|엄마|남편|아내|부모/], ['전신·온몸', 1.41, /전신|온몸|몸전체|여기저기/],
  ['스테로이드', 1.37, /스테로이드|탈스|약끊|리바운드/], ['진물·피', 1.19, /진물|피나|짓무|딱지|터져|갈라져|헐어/]];
const PEN = [['10년 이상', 0.94, /10년|십년|평생/], ['정보탐색', 0.70, /사진|종류|차이|전염|뜻|영어|무엇/]];
const scoreOf = k => {
  let m = 1; const s = [];
  for (const [n, w, r] of SIG) if (r.test(k)) { m *= w; s.push(n); }
  for (const [n, w, r] of PEN) if (r.test(k)) { m *= w; s.push('−' + n); }
  return { mult: m, sig: s };
};

function pool() {
  const gap = J(D16 + 'gap.json');
  const urg = J(D15 + 'urgency_rank.json');
  const byText = J(D16 + 'inv/bytext.json');
  const groups = new Map(J(D16 + 'inv/groups.json').map(g => [g.id, g]));
  const camps = new Map(J(D16 + 'inv/campaigns.json').map(c => [c.id, c]));
  const seen = new Map();
  const add = (k, axis, vol) => {
    k = norm(k);
    if (!k || CUT.test(k) || JUNK.test(k) || NOISE.test(k)) return;
    if (why(k) === '타지역') return;
    if (!AXRATE[axis]) return;
    if ((vol || 0) < 10) return;
    if (seen.has(k)) { if (vol > seen.get(k).vol) seen.get(k).vol = vol; return; }
    const regs = byText[k] || [];
    const live = regs.filter(r => { const g = groups.get(r.gid) || {}, c = camps.get(g.cid) || {}; return !r.lock && !g.lock && !c.lock && r.st !== 'PAUSED'; });
    if (!live.length) return;                        // 꺼진 것은 입찰만으로 못 살린다 → 별도 처리
    const bid = Math.max(...live.map(r => { const g = groups.get(r.gid) || {}; return Math.round((r.ugb ? (g.bid || 0) : (r.bid || 0)) * (g.mw ?? 100) / 100); }));
    const s = scoreOf(k);
    seen.set(k, { k, axis, vol, bid, nLive: live.length, mult: +s.mult.toFixed(2), sig: s.sig, score: +(40.5 * s.mult * AXRATE[axis] / 0.405).toFixed(1) });
  };
  for (const r of gap) add(r.k, r.axis, r.vol);
  for (const r of urg) add(r.k, r.axis, r.vol);
  const out = [...seen.values()].sort((a, b) => b.score - a.score || b.vol - a.vol);
  W(D16 + 'final_pool.json', out);
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('개선 후보(켜져 있고 입찰만 바꾸면 되는 것)', out.length, '· 월검색 합', won(out.reduce((a, r) => a + r.vol, 0)));
  console.log('  70원대', out.filter(r => r.bid <= 100).length, '· 월검색', won(out.filter(r => r.bid <= 100).reduce((a, r) => a + r.vol, 0)));
}

async function est() {
  const rows = J(D16 + 'final_pool.json');
  const F = D16 + 'final_est.json';
  const est = fs.existsSync(F) ? J(F) : {};
  const texts = [...new Set(rows.map(r => r.k))];
  for (const dev of ['MOBILE', 'PC']) for (const pos of [3]) {
    const todo = texts.filter(t => est[dev + '|' + pos + '|' + t] === undefined);
    if (!todo.length) { console.error(dev, pos, '캐시'); continue; }
    console.error(dev, pos, '남은', todo.length);
    for (let i = 0; i < todo.length; i += 100) {
      try {
        const r = await req('POST', '/estimate/average-position-bid/keyword', { device: dev, items: todo.slice(i, i + 100).map(k => ({ key: k, position: pos })) }, 3808925, 3);
        for (const e of (r && r.estimate) || []) est[dev + '|' + pos + '|' + e.keyword] = e.bid;
      } catch (e) { }
      await sleep(250);
    }
    for (const t of todo) if (est[dev + '|' + pos + '|' + t] === undefined) est[dev + '|' + pos + '|' + t] = null;
    W(F, est); console.error(dev, pos, '완료');
  }
  // 월 예상 비용/클릭
  const pfF = D16 + 'final_perf.json';
  const pf = fs.existsSync(pfF) ? J(pfF) : {};
  const items = [];
  for (const r of rows) for (const dev of ['MOBILE', 'PC']) {
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
      const o = (r && r.items) || [];
      for (let j = 0; j < b.length; j++) { const x = o[j] || {}; pf[b[j].key] = { clk: x.clicks ?? null, cost: x.cost ?? null }; }
    } catch (e) { }
    await sleep(300);
  }
  W(pfF, pf); console.error('perf 완료');
}

function plan() {
  const rows = J(D16 + 'final_pool.json'), est = J(D16 + 'final_est.json'), pf = J(D16 + 'final_perf.json');
  const CAP = 1320000, CAP_BID = 10000;
  const cand = [];
  for (const r of rows) {
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
  cand.sort((a, b) => Math.floor(b.score / 10) - Math.floor(a.score / 10) || a.cpc - b.cpc);
  let cost = 0, clk = 0; const take = [];
  for (const c of cand) if (cost + c.dc <= CAP) { cost += c.dc; clk += c.dk; take.push(c); }
  W(D16 + 'final_plan.json', { cap: CAP, cost, clk, take });
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('후보', cand.length, '→ 채택', take.length, '| 월 +' + won(cost) + '원 (일 +' + won(cost / 30) + ') | 월 클릭 +' + won(clk));
  const by = {}; for (const t of take) { const x = by[t.axis] = by[t.axis] || { n: 0, dc: 0, dk: 0, vol: 0 }; x.n++; x.dc += t.dc; x.dk += t.dk; x.vol += t.vol; }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].dc - a[1].dc)) console.log('  ' + k.padEnd(14) + v.n + '개 · 월검색 ' + won(v.vol) + ' · 월 +' + won(v.dc) + '원 · 클릭 +' + won(v.dk));
  const left = cand.filter(c => !take.includes(c)).sort((a, b) => b.vol - a.vol).slice(0, 15);
  console.log('\n예산 밖 대기 상위 15:');
  for (const c of left) console.log('  ' + c.k.padEnd(20) + ('월' + won(c.vol)).padStart(9) + '  ' + won(c.bid) + '→' + won(c.target) + '  월 +' + won(c.dc) + '원');
}

function actions() {
  const { take } = J(D16 + 'final_plan.json');
  const byText = J(D16 + 'inv/bytext.json');
  const groups = new Map(J(D16 + 'inv/groups.json').map(g => [g.id, g]));
  const camps = new Map(J(D16 + 'inv/campaigns.json').map(c => [c.id, c]));
  const day = J(D15 + 'day_20260915.json');
  const acts = [], skip = [];
  for (const t of take) {
    const regs = (byText[t.k] || []).filter(r => { const g = groups.get(r.gid) || {}, c = camps.get(g.cid) || {}; return !r.lock && !g.lock && !c.lock && r.st !== 'PAUSED'; });
    if (!regs.length) { skip.push({ k: t.k, why: '켜진 등록 없음' }); continue; }
    const scored = regs.map(r => {
      const g = groups.get(r.gid) || {};
      return { ...r, grp: g.name, mw: g.mw ?? 100, eff: Math.round((r.ugb ? (g.bid || 0) : (r.bid || 0)) * (g.mw ?? 100) / 100), imp: (day[r.id] || {}).imp || 0 };
    }).sort((a, b) => b.imp - a.imp || b.eff - a.eff);
    const o = scored[0];
    const bidAmt = Math.max(70, Math.round(t.target / (o.mw / 100) / 10) * 10);
    if (bidAmt <= (o.ugb ? 0 : o.bid)) { skip.push({ k: t.k, why: '이미 목표 이상' }); continue; }
    acts.push({ k: t.k, axis: t.axis, id: o.id, gid: o.gid, grpName: o.grp, mw: o.mw, curEff: o.eff, targetEff: t.target, bidAmt, fromBid: o.bid, useGrp: !!o.ugb, vol: t.vol, score: t.score, dc: t.dc, dk: t.dk });
  }
  W(D16 + 'final_actions.json', { acts, skip });
  console.log('액션', acts.length, '| 건너뜀', skip.length);
  console.log('bidAmt 최대', Math.max(...acts.map(a => a.bidAmt)).toLocaleString('ko-KR'), '| 10원 단위 위반', acts.filter(a => a.bidAmt % 10).length);
  const g = {}; for (const a of acts) g[a.grpName] = (g[a.grpName] || 0) + 1;
  console.log('그룹 분포:', Object.entries(g).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => k + ':' + v).join(' '));
}

const m = process.argv[2];
({ pool: async () => pool(), est, plan: async () => plan(), actions: async () => actions() }[m] || (async () => console.log('pool|est|plan|actions')))().catch(e => { console.error(e.stack); process.exitCode = 1; });
