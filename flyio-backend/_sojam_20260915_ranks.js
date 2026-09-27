// 소잠 — 2026-09-15 지시: "어제 소진비 + 클릭 일어난 키워드 전부 + 간절하거나 중요한/내원가능성 높은 키워드 전부 실순위".
// 실순위는 네이버 /stats avgRnk(노출가중 평균순위). 이 PC 는 네이버가 창원으로 보고 주력 그룹이 지역/시간 타기팅이라
// SERP 직접 측정은 미노출로 오판한다([[sojam-rank-audit]]).
// 단계(각 단계 캐시, 재실행 시 건너뜀): inv → stats → report
//   inv    캠페인 → 그룹 → 키워드 전수(오늘 기준 라이브 인벤토리)
//   stats  키워드 /stats 2회: 어제(9/14) · 최근 창(9/12~9/14, 실순위 산출용)
//   report 간절도(5신호) + 내원축 분류 → 등급별 실순위표
const fs = require('fs'), path = require('path');
const { why } = require('./_sojam_d0828_rule');
const CID = '1858907';
const BASE = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=' + CID;
const DAY = '2026-09-14';
const WIN = { since: '2026-09-12', until: '2026-09-14' };
const D = path.join(__dirname, '../reports/sojam-20260915/');
fs.mkdirSync(D, { recursive: true });
const F = n => D + n, has = n => fs.existsSync(F(n));
const load = n => JSON.parse(fs.readFileSync(F(n), 'utf8'));
const save = (n, o) => fs.writeFileSync(F(n), JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enc = x => encodeURIComponent(JSON.stringify(x));

async function api(p, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: CID, method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(90000) });
      if (r.ok) { const d = await r.json(); if (d.success) return d.response; }
    } catch (e) { }
    await sleep(700 * (t + 1));
  }
  return null;
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function stInv() {
  if (has('inv.json')) return console.error('inv 캐시 사용');
  const camps = ((await api('/ncc/campaigns?recordSize=1000')) || []).filter(c => !c.delFlag);
  if (!camps.length) throw Error('캠페인 조회 실패');
  console.error('캠페인', camps.length);
  const gl = await pool(camps, 5, c => api('/ncc/adgroups?nccCampaignId=' + c.nccCampaignId));
  const grp = {}, cmp = {};
  camps.forEach((c, i) => {
    cmp[c.nccCampaignId] = { name: c.name, lock: !!c.userLock, st: c.status, type: c.campaignTp };
    for (const g of (gl[i] || [])) {
      if (g.delFlag) continue;
      grp[g.nccAdgroupId] = { name: g.name, cid: c.nccCampaignId, bid: g.bidAmt, mw: g.mobileChannelWeight ?? g.mobileNetworkBidWeight ?? 100, pw: g.pcChannelWeight ?? g.pcNetworkBidWeight ?? 100, lock: !!g.userLock, st: g.status };
    }
  });
  const gids = Object.keys(grp);
  console.error('그룹', gids.length, '→ 키워드 조회');
  let done = 0;
  const kl = await pool(gids, 6, async g => { const r = await api('/ncc/keywords?nccAdgroupId=' + g); if (++done % 100 === 0) console.error('  kw', done, '/', gids.length); return r; });
  const kw = {};
  gids.forEach((g, i) => { for (const k of (kl[i] || [])) { if (k.delFlag) continue; kw[k.nccKeywordId] = { k: k.keyword, gid: g, bid: k.bidAmt, useGrp: !!k.useGroupBidAmt, lock: !!k.userLock, st: k.status, sr: k.statusReason }; } });
  save('inv.json', { cmp, grp, kw, fetchedAt: new Date().toISOString() });
  console.error('키워드', Object.keys(kw).length);
}

async function statsFor(ids, tr, file) {
  const st = has(file) ? load(file) : {};
  const todo = ids.filter(i => !st[i]);
  console.error(file, '남은', todo.length);
  const groups = chunk(todo, 40);
  let done = 0;
  const res = await pool(groups, 5, async b => {
    const r = await api('/stats?ids=' + encodeURIComponent(b.join(',')) + '&fields=' + enc(['impCnt', 'clkCnt', 'salesAmt', 'avgRnk']) + '&timeRange=' + enc(tr));
    if (++done % 40 === 0) console.error('  ', file, done, '/', groups.length);
    return r;
  });
  groups.forEach((b, i) => {
    const got = new Map((((res[i] || {}).data) || []).map(x => [x.id, x]));
    if (!res[i]) return;
    for (const id of b) { const x = got.get(id) || {}; st[id] = { imp: +x.impCnt || 0, clk: +x.clkCnt || 0, cost: +x.salesAmt || 0, rank: (x.avgRnk != null && +x.impCnt > 0) ? +x.avgRnk : null }; }
  });
  save(file, st);
  console.error(file, '완료', Object.keys(st).length);
}

async function stStats() {
  const inv = load('inv.json');
  const live = Object.entries(inv.kw).filter(([, k]) => !k.lock && k.st !== 'PAUSED').map(([i]) => i);
  const all = Object.keys(inv.kw);
  console.error('키워드 전체', all.length, '| 켜진 것', live.length);
  await statsFor(all, WIN, 'stats_win.json');
  await statsFor(all, { since: DAY, until: DAY }, 'stats_day.json');
}

// ── 판정 규칙 (9/11 과 동일) ────────────────────────────────
const AXES = [
  ['아토피', /아토피|태열/], ['한포진', /한포진/], ['지루성·두피', /지루|두피염|두피가려|두피각질|비듬/], ['접촉성피부염', /접촉성/],
  ['묘기증', /묘기/], ['은밀부위', /항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|질입구|소음순|유두|엉덩이(가려|습진|간지)|겨드랑이(가려|습진|간지)|완선|칸디다/],
  ['습진', /습진|피부염|화폐상/], ['가려움·소양', /가려|간지|소양/], ['백반증', /백반/], ['무좀·백선', /무좀|백선|어루러기/],
  ['다한증·땀띠', /다한|땀띠/], ['구내염·구순염', /구내염|구순염|입술염|구각/], ['모낭염·한선염', /모낭염|한선염/],
  ['탈스테로이드', /탈스|스테로이드/], ['난치·자가면역', /난치성피부|자가면역|천포창|양진|태선|어린선/], ['피부질환 일반', /피부질환|피부병|피부한의원|피부질환한의원/],
];
const EXCL = /종기|절종|낭종|농양|멍울|대상포진|사마귀|홍조|주사비|딸기코|검사|(?<!공)진단|여드름|두드러기|건선|탈모|크림|로션|샴푸|비누|바디워시|스프레이|패치|에센스|쿠팡|강아지|고양이|반려|피부과|성형|레이저|제모/;
const SIG = [
  ['치료처탐색', 4, /한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문|추천|어디|강남|역삼|신논현|논현|서초|교대|양재|선릉|도곡|한티|매봉|삼성동/],
  ['만성·재발', 3, /만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|난치|반복|지속/],
  ['고통강도', 3, /심한|심할때|심해|극심|너무|미치|미칠|죽겠|잠못|못자|밤에|밤마다|새벽|진물|피나|피가|따가|쓰라|통증|아파|괴로|고통|참을수|긁어서|터져|헐어|헐었/],
  ['완치·근본', 2, /완치|낫는법|낫는방법|고치는법|근본|치료법|치료방법|치료제|치료|없애는|해결/],
  ['노출부위', 1, /얼굴|손|목|입술|입가|이마|턱|두피|머리|항문|똥꼬|외음부|음부|사타구니|고환|음낭|회음|질입구|유두|겨드랑|엉덩이/],
];
const NOISE = /간지럼(?!증)|간지럽히/;
const score = k => { const s = SIG.filter(([, , r]) => r.test(k)); return { sig: s.map(x => x[0]), pts: s.reduce((a, x) => a + x[1], 0) }; };
const tierOf = (pts, sig) => (pts >= 6 || (sig.includes('치료처탐색') && sig.length >= 2)) ? '상' : pts >= 3 ? '중' : '하';

function stReport() {
  const inv = load('inv.json'), win = load('stats_win.json'), day = load('stats_day.json');
  const vol = {};
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260910/_vol_exact.json'), 'utf8')))) vol[String(k).replace(/\s+/g, '')] = (v.pcLt ? 0 : v.pc) + (v.moLt ? 0 : v.mo); } catch (e) { }

  // 텍스트 단위로 합치기 (같은 키워드가 여러 그룹에 중복 등록)
  const byText = new Map();
  for (const [id, k] of Object.entries(inv.kw)) {
    const g = inv.grp[k.gid] || {}, c = inv.cmp[g.cid] || {};
    const base = k.useGrp ? (g.bid || 0) : (k.bid || 0);
    const on = !k.lock && !g.lock && !c.lock && k.st !== 'PAUSED' && g.st !== 'PAUSED';
    const w = win[id] || { imp: 0, clk: 0, cost: 0, rank: null }, d = day[id] || { imp: 0, clk: 0, cost: 0, rank: null };
    const t = String(k.k).replace(/\s+/g, '');
    if (!byText.has(t)) byText.set(t, { k: t, n: 0, nOn: 0, mob: 0, ids: [], imp: 0, clk: 0, cost: 0, rsum: 0, rimp: 0, dimp: 0, dclk: 0, dcost: 0, drsum: 0, drimp: 0 });
    const o = byText.get(t);
    o.n++; if (on) { o.nOn++; o.mob = Math.max(o.mob, Math.round(base * (g.mw ?? 100) / 100)); }
    o.ids.push({ id, grp: g.name, camp: c.name, bid: base, on, st: k.st, sr: k.sr, rank: w.rank, imp: w.imp });
    o.imp += w.imp; o.clk += w.clk; o.cost += w.cost; if (w.rank && w.imp) { o.rsum += w.rank * w.imp; o.rimp += w.imp; }
    o.dimp += d.imp; o.dclk += d.clk; o.dcost += d.cost; if (d.rank && d.imp) { o.drsum += d.rank * d.imp; o.drimp += d.imp; }
  }
  const rows = [];
  for (const o of byText.values()) {
    o.rank = o.rimp ? +(o.rsum / o.rimp).toFixed(1) : null;
    o.drank = o.drimp ? +(o.drsum / o.drimp).toFixed(1) : null;
    o.vol = vol[o.k] ?? null;
    const ax = AXES.find(([, r]) => r.test(o.k));
    o.axis = ax ? ax[0] : null;
    o.scope = why(o.k) || (EXCL.test(o.k) ? '제외어' : null);
    const s = NOISE.test(o.k) ? { sig: [], pts: 0 } : score(o.k);
    o.sig = s.sig; o.pts = s.pts; o.tier = tierOf(s.pts, s.sig);
    o.core = !!o.axis && !o.scope && !NOISE.test(o.k);
    rows.push(o);
  }
  save('rows.json', rows);
  return rows;
}

(async () => {
  const stage = process.argv[2] || 'all';
  if (stage === 'inv' || stage === 'all') await stInv();
  if (stage === 'stats' || stage === 'all') await stStats();
  if (stage === 'report' || stage === 'all') {
    const rows = stReport();
    const core = rows.filter(r => r.core && r.nOn);
    console.log('전체 텍스트', rows.length, '| 내원축 핵심(켜짐)', core.length);
    for (const t of ['상', '중', '하']) {
      const a = core.filter(r => r.tier === t);
      const m = a.filter(r => r.rank != null);
      console.log(` 간절 ${t}: ${a.length}개 · 3일 노출된 것 ${m.length} · 평균실순위 ${m.length ? (m.reduce((x, r) => x + r.rank * r.imp, 0) / m.reduce((x, r) => x + r.imp, 0)).toFixed(2) : '-'}`);
    }
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
