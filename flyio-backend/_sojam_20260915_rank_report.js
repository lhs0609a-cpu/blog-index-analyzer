// 소잠 2026-09-15 — 실순위 보고. 실순위 = /stats avgRnk(9/12~9/14 노출가중). 노출 0 이면 순위 없음(측정 불가).
// 내원가능성은 상담일지(1~9월 482행) 축별 내원 실적으로 가중한다.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '../reports/sojam-20260915/');
const load = n => JSON.parse(fs.readFileSync(D + n, 'utf8'));
const targets = JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260915_targets.json'), 'utf8'));
const win = load('stats_win.json'), day = load('stats_day.json');
const kwm = fs.existsSync(D + 'meta_kw.json') ? load('meta_kw.json') : {};
const grm = fs.existsSync(D + 'meta_grp.json') ? load('meta_grp.json') : {};
const vol = {};
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '../reports/sojam-20260910/_vol_exact.json'), 'utf8')))) vol[String(k).replace(/\s+/g, '')] = (v.pcLt ? 0 : v.pc) + (v.moLt ? 0 : v.mo); } catch (e) { }

const SIG = [
  ['치료처탐색', 4, /한의원|한방|병원|의원|클리닉|잘하는곳|잘하는|명의|전문|추천|어디|강남|역삼|신논현|논현|서초|교대|양재|선릉|도곡|한티|매봉|삼성동/],
  ['만성·재발', 3, /만성|재발|안낫|안나|오래|몇년|수년|평생|계속|자꾸|난치|반복|지속/],
  ['고통강도', 3, /심한|심할때|심해|극심|너무|미치|미칠|죽겠|잠못|못자|밤에|밤마다|새벽|진물|피나|피가|따가|쓰라|통증|아파|괴로|고통|참을수|긁어서|터져|헐어|헐었/],
  ['완치·근본', 2, /완치|낫는법|낫는방법|고치는법|근본|치료법|치료방법|치료제|치료|없애는|해결/],
  ['노출부위', 1, /얼굴|손|목|입술|입가|이마|턱|두피|머리|항문|똥꼬|외음부|음부|사타구니|고환|음낭|회음|질입구|유두|겨드랑|엉덩이/],
];
const NOISE = /간지럼(?!증)|간지럽히/;
// 상담일지 1~9월 축별 내원 건수 → 내원가능성 가중
const VISIT = { '아토피': 62, '가려움·소양': 55, '습진': 28, '지루성·두피': 14, '접촉성피부염': 13, '한포진': 12, '묘기증': 9, '은밀부위': 8, '모낭염·한선염': 1, '구내염·구순염': 1, '난치·자가면역': 1, '피부질환 일반': 17, '탈스테로이드': 0, '백반증': 0, '무좀·백선': 1, '다한증·땀띠': 1 };

const rows = [];
for (const [k, t] of Object.entries(targets)) {
  const s = NOISE.test(k) ? { sig: [], pts: 0 } : (() => { const m = SIG.filter(([, , r]) => r.test(k)); return { sig: m.map(x => x[0]), pts: m.reduce((a, x) => a + x[1], 0) }; })();
  const tier = (s.pts >= 6 || (s.sig.includes('치료처탐색') && s.sig.length >= 2)) ? '상' : s.pts >= 3 ? '중' : '하';
  let imp = 0, clk = 0, cost = 0, rsum = 0, rimp = 0, dimp = 0, dclk = 0, dcost = 0, bid = 0, on = 0;
  const per = [];
  for (const id of t.ids) {
    const w = win[id] || {}, d = day[id] || {};
    imp += w.imp || 0; clk += w.clk || 0; cost += w.cost || 0;
    if (w.rank && w.imp) { rsum += w.rank * w.imp; rimp += w.imp; }
    dimp += d.imp || 0; dclk += d.clk || 0; dcost += d.cost || 0;
    const m = kwm[id];
    if (m && !m.missing) {
      const g = grm[m.gid] || {};
      const base = m.useGrp ? (g.bid || 0) : (m.bid || 0);
      const live = !m.lock && !g.lock && m.st !== 'PAUSED';
      if (live) { on++; bid = Math.max(bid, Math.round(base * (g.mw ?? 100) / 100)); }
      per.push({ id, grp: g.name, bid: Math.round(base * (g.mw ?? 100) / 100), live, st: m.st, sr: m.sr, imp: w.imp || 0, rank: w.rank ?? null });
    }
  }
  rows.push({ k, axis: t.axis, vol: vol[k] ?? null, tier, pts: s.pts, sig: s.sig, visitW: VISIT[t.axis] ?? 0,
    rank: rimp ? +(rsum / rimp).toFixed(1) : null, imp, clk, cost, dimp, dclk, dcost, bid, on, nid: t.ids.length, per });
}
fs.writeFileSync(D + 'rows.json', JSON.stringify(rows));

const won = n => Math.round(n || 0).toLocaleString('ko-KR');
const pad = (s, n) => { s = String(s); let w = 0; for (const c of s) w += /[ㄱ-힝가-힣]/.test(c) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };

// 내원가능성 등급: 축 내원실적 + 간절도
const grade = r => {
  const v = r.visitW;
  if (v >= 12 && (r.tier === '상' || r.tier === '중')) return 'A';
  if (v >= 12) return 'B';
  if (r.tier === '상') return 'B';
  return 'C';
};
for (const r of rows) r.grade = grade(r);

const measured = rows.filter(r => r.rank != null);
console.log('내원축 키워드 텍스트', rows.length, '| 3일(9/12~14) 노출된 것', measured.length, '| 어제 노출', rows.filter(r => r.dimp > 0).length);
for (const g of ['A', 'B', 'C']) {
  const a = rows.filter(r => r.grade === g), m = a.filter(r => r.rank != null);
  const wr = m.reduce((x, r) => x + r.rank * r.imp, 0) / (m.reduce((x, r) => x + r.imp, 0) || 1);
  console.log(` ${g}급 ${a.length}개 · 노출된 것 ${m.length} · 노출가중 실순위 ${m.length ? wr.toFixed(2) : '-'} · 3일 소진 ${won(a.reduce((x, r) => x + r.cost, 0))}`);
}
console.log('\n=== A급(내원 실적 축 × 간절도 상·중) 중 3일 노출된 것 — 실순위 나쁜 순 ===');
const A = rows.filter(r => r.grade === 'A' && r.rank != null).sort((a, b) => b.rank - a.rank || b.imp - a.imp);
console.log(pad('키워드', 24) + pad('축', 16) + pad('실순위', 8) + pad('노출', 7) + pad('클릭', 5) + pad('3일소진', 10) + pad('입찰', 9) + pad('월검색', 8) + '간절');
for (const r of A.slice(0, 80)) console.log(pad(r.k, 24) + pad(r.axis, 16) + pad(r.rank.toFixed(1), 8) + pad(won(r.imp), 7) + pad(r.clk, 5) + pad(won(r.cost), 10) + pad(won(r.bid), 9) + pad(r.vol == null ? '-' : won(r.vol), 8) + r.tier + (r.sig.length ? '(' + r.sig.join('+') + ')' : ''));
console.log('\n=== A급인데 3일 노출 0 (순위 측정 불가) — 월검색 큰 순 ===');
const Z = rows.filter(r => r.grade === 'A' && r.rank == null).sort((a, b) => (b.vol || 0) - (a.vol || 0));
console.log('총', Z.length, '개 / 월검색 100+ 인 것', Z.filter(r => (r.vol || 0) >= 100).length);
for (const r of Z.filter(r => (r.vol || 0) >= 100).slice(0, 60)) console.log(pad(r.k, 24) + pad(r.axis, 16) + pad('월' + won(r.vol), 10) + pad('입찰 ' + won(r.bid), 12) + pad('등록 ' + r.on + '/' + r.nid, 10) + r.tier);
