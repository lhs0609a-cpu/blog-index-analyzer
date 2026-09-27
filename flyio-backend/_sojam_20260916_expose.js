// 내원가능성 기저(40.5%) 이상 키워드를 "노출은 되게" 만드는 입찰 설정 (2026-09-16 사용자 지시).
// 노출 시작선 = 5위 추정가. 3위가는 클릭까지 노리는 값이라 비용이 크게 다르다 → 둘 다 계산해 보여준다.
// 사용: node _sojam_20260916_expose.js est | plan | actions
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = (p, o) => fs.writeFileSync(p, JSON.stringify(o));

// 치질·치루 영역은 소잠 진료범위가 아니다 (내 축 규칙이 '항문'으로 잘못 끌어왔다)
const PROCTO = /항문튀어나옴|항문종기|항문피$|항문출혈|항문농양|항문열상|치질|치핵|치루|탈항|항문외과|대장/;
const base = () => J(D16 + 'weak.json').filter(r => r.score >= 40 && !PROCTO.test(r.k));

async function est() {
  const rows = base();
  const F = D16 + 'expose_est.json';
  const est = fs.existsSync(F) ? J(F) : {};
  const texts = [...new Set(rows.map(r => r.k))];
  console.error('대상 텍스트', texts.length);
  for (const dev of ['MOBILE', 'PC']) for (const pos of [3, 5]) {
    const todo = texts.filter(t => est[dev + '|' + pos + '|' + t] === undefined);
    if (!todo.length) { console.error(dev, pos, '캐시'); continue; }
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
  // 월 예상 비용
  const pfF = D16 + 'expose_perf.json';
  const pf = fs.existsSync(pfF) ? J(pfF) : {};
  const items = [];
  for (const r of rows) for (const dev of ['MOBILE', 'PC']) {
    for (const [tag, bid] of [['cur', r.bid], ['p5', est[dev + '|5|' + r.k]], ['p3', est[dev + '|3|' + r.k]]]) {
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
      for (let j = 0; j < b.length; j++) { const x = o[j] || {}; pf[b[j].key] = { clk: x.clicks ?? null, cost: x.cost ?? null, imp: x.impressions ?? null }; }
    } catch (e) { }
    if ((i / 100) % 20 === 0) { W(pfF, pf); console.error('  perf', i, '/', items.length); }
    await sleep(300);
  }
  W(pfF, pf); console.error('perf 완료');
}

function scen() {
  const rows = base(), est = J(D16 + 'expose_est.json'), pf = J(D16 + 'expose_perf.json');
  const sum = tag => {
    let cost = 0, clk = 0, imp = 0, n = 0;
    for (const r of rows) {
      let c = 0, k = 0, i = 0, got = false;
      for (const dev of ['MOBILE', 'PC']) { const x = pf[dev + '|' + tag + '|' + r.k]; if (x) { c += x.cost || 0; k += x.clk || 0; i += x.imp || 0; got = true; } }
      if (got) { cost += c; clk += k; imp += i; n++; }
    }
    return { n, cost, clk, imp };
  };
  return { rows, est, pf, cur: sum('cur'), p5: sum('p5'), p3: sum('p3') };
}

function plan() {
  const { rows, est, cur, p5, p3 } = scen();
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('대상', rows.length, '개 (치질·치루 영역 제외) · 월검색 합', won(rows.reduce((a, r) => a + r.vol, 0)));
  console.log('');
  console.log('시나리오 (네이버 추정, 전국 기준 — 지역타기팅 그룹은 실제 더 낮다)');
  for (const [nm, s] of [['현재 입찰', cur], ['전부 5위가(노출 시작선)', p5], ['전부 3위가(클릭까지)', p3]])
    console.log('  ' + nm.padEnd(24) + '월 ' + won(s.cost).padStart(10) + '원 (일 ' + won(s.cost / 30).padStart(7) + ') · 월 클릭 ' + won(s.clk).padStart(6) + ' · 월 노출 ' + won(s.imp));
  console.log('');
  console.log('  5위가 전환 시 증분: 월 +' + won(p5.cost - cur.cost) + ' (일 +' + won((p5.cost - cur.cost) / 30) + ') · 클릭 +' + won(p5.clk - cur.clk));
  console.log('  3위가 전환 시 증분: 월 +' + won(p3.cost - cur.cost) + ' (일 +' + won((p3.cost - cur.cost) / 30) + ') · 클릭 +' + won(p3.clk - cur.clk));
  // 인상이 필요한 것만
  const up5 = rows.filter(r => { const t = est['MOBILE|5|' + r.k]; return t && t > r.bid; });
  console.log('');
  console.log('  5위가 기준 인상 필요:', up5.length, '개 / 이미 5위가 이상:', rows.length - up5.length);
  W(D16 + 'expose_scen.json', { cur, p5, p3, up5: up5.length });
}

function actions() {
  const { rows, est } = scen();
  const byText = J(D16 + 'inv/bytext.json');
  const groups = new Map(J(D16 + 'inv/groups.json').map(g => [g.id, g]));
  const camps = new Map(J(D16 + 'inv/campaigns.json').map(c => [c.id, c]));
  const ads = new Map();
  for (const l of fs.readFileSync(D16 + 'ads.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); ads.set(d.gid, d); }
  const day = J(path.join(__dirname, '../reports/sojam-20260915/day_20260915.json'));
  const CAP_BID = Number(process.argv[3] || 10000);
  const acts = [], skip = [];
  for (const r of rows) {
    const t = est['MOBILE|5|' + r.k];
    if (!t) { skip.push({ k: r.k, why: '5위가 추정 없음' }); continue; }
    if (t <= r.bid) { skip.push({ k: r.k, why: '이미 5위가 이상' }); continue; }
    if (t > CAP_BID) { skip.push({ k: r.k, why: '5위가가 상한 초과 ' + t }); continue; }
    const live = (byText[r.k] || []).filter(x => {
      const g = groups.get(x.gid) || {}, c = camps.get(g.cid) || {}, a = ads.get(x.gid) || { ok: 0 };
      return !x.lock && !g.lock && !c.lock && x.st !== 'PAUSED' && x.ins === 'APPROVED' && a.ok > 0;
    }).map(x => { const g = groups.get(x.gid) || {}; return { ...x, grp: g.name, mw: g.mw ?? 100, eff: Math.round((x.ugb ? (g.bid || 0) : (x.bid || 0)) * (g.mw ?? 100) / 100), imp: (day[x.id] || {}).imp || 0 }; });
    if (!live.length) { skip.push({ k: r.k, why: '도는 등록 없음(소재·검수)' }); continue; }
    live.sort((a, b) => b.imp - a.imp || b.eff - a.eff);
    const o = live[0];
    const bidAmt = Math.max(70, Math.round(t / (o.mw / 100) / 10) * 10);
    if (bidAmt <= (o.ugb ? 0 : o.bid)) { skip.push({ k: r.k, why: '이미 목표 이상' }); continue; }
    acts.push({ k: r.k, axis: r.axis, vol: r.vol, score: r.score, id: o.id, gid: o.gid, grpName: o.grp, mw: o.mw, curEff: o.eff, targetEff: t, bidAmt, fromBid: o.bid, useGrp: !!o.ugb });
  }
  W(D16 + 'expose_actions.json', { acts, skip });
  const won = n => Math.round(n || 0).toLocaleString('ko-KR');
  console.log('액션', acts.length, '| 건너뜀', skip.length);
  const by = {}; for (const s of skip) by[s.why.replace(/ \d+$/, '')] = (by[s.why.replace(/ \d+$/, '')] || 0) + 1;
  console.log('  건너뜀 사유:', JSON.stringify(by));
  const ax = {}; for (const a of acts) { const x = ax[a.axis] = ax[a.axis] || { n: 0, vol: 0 }; x.n++; x.vol += a.vol; }
  console.log('  축별:', Object.entries(ax).sort((a, b) => b[1].vol - a[1].vol).map(([k, v]) => k + ' ' + v.n + '개/월' + won(v.vol)).join(' · '));
  console.log('  bidAmt 최대', won(Math.max(...acts.map(a => a.bidAmt))), '| 10원 단위 위반', acts.filter(a => a.bidAmt % 10).length);
}

const m = process.argv[2];
({ est, plan: async () => plan(), actions: async () => actions() }[m] || (async () => console.log('est|plan|actions')))().catch(e => { console.error(e.stack); process.exitCode = 1; });
