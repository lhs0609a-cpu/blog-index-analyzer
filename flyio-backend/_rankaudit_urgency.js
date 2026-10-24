// 소잠 — 핵심 키워드를 '간절한 정도'로 판정하고 일 15만 안의 3위 배분을 간절도 순으로 다시 짠다 (2026-09-11 사용자: "핵심키워드는 간절한 정도야").
// 간절도 신호는 9/10 _intent_final.json 의 5개 신호를 그대로 쓴다: 치료처탐색 · 완치·근본 · 만성·재발 · 고통강도 · 노출부위.
// 가중치: 치료처탐색 4(내원 직전 행동) · 만성·재발 3 · 고통강도 3 · 완치·근본 2 · 노출부위 1 → 합 0~13.
// 등급: 상(≥6 또는 치료처탐색+다른 신호) · 중(3~5) · 하(0~2).
// 배분: 노출가능 전부 5위가에서 출발 → 남는 예산으로 간절도 상 → 중 순으로 3위가 승격(같은 등급 안에서는 추가 클릭당 비용이 싼 순). 월 450만 한도.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const rep = JSON.parse(fs.readFileSync(D + 'report.json', 'utf8'));
const LIMIT = 4500000;

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

const rows = rep.filter(o => !NOISE.test(o.k)).map(o => { const s = score(o.k); return { ...o, sig: s.sig, pts: s.pts, tier: tierOf(s.pts, s.sig) }; });
const live = rows.filter(o => o.cls !== '노출불가');

// 배분
let total = live.reduce((x, o) => x + o.cost5, 0), clicks = live.reduce((x, o) => x + o.clk5, 0);
const start = { cost: total, clk: clicks };
const order = { '상': 0, '중': 1, '하': 2 };
const cands = live.filter(o => o.tier !== '하' && (o.cost3 - o.cost5 >= 0) && (o.e3 || 0) > (o.e5 || 0))
  .map(o => ({ o, dc: o.cost3 - o.cost5, dk: Math.max(0, o.clk3 - o.clk5) }))
  .sort((a, b) => order[a.o.tier] - order[b.o.tier] || b.o.pts - a.o.pts || (a.dc / Math.max(a.dk, 0.1)) - (b.dc / Math.max(b.dk, 0.1)));
const up = new Set(), left = [];
for (const c of cands) { if (total + c.dc <= LIMIT) { total += c.dc; clicks += c.dk; up.add(c.o.k); } else left.push(c); }
for (const o of rows) { o.target = o.cls === '노출불가' ? null : up.has(o.k) ? { pos: 3, bid: o.e3 } : { pos: 5, bid: o.e5 || 70 };
  o.move = !o.target ? '노출불가' : o.mob < o.target.bid ? '인상' : o.mob > o.target.bid ? '인하' : '유지'; }

const T = t => rows.filter(o => o.tier === t);
const cls = ['1~3위 입찰', '4~5위 입찰', '입찰 5위 밖', '노출불가'];
const matrix = {}; for (const t of ['상', '중', '하']) { matrix[t] = {}; for (const c of cls) { const a = T(t).filter(o => o.cls === c); matrix[t][c] = { n: a.length, vol: a.reduce((x, o) => x + o.vol, 0) }; } }
const summary = {
  n: rows.length, matrix, start, alloc: { cost: total, clk: clicks, up: up.size, upByTier: { 상: [...up].filter(k => rows.find(o => o.k === k).tier === '상').length, 중: [...up].filter(k => rows.find(o => o.k === k).tier === '중').length } },
  leftTop: left.sort((a, b) => order[a.o.tier] - order[b.o.tier] || b.o.vol - a.o.vol).slice(0, 25).map(c => ({ k: c.o.k, tier: c.o.tier, vol: c.o.vol, dc: c.dc, dk: c.dk })),
  moves: { 인상: rows.filter(o => o.move === '인상').length, 인하: rows.filter(o => o.move === '인하').length, 유지: rows.filter(o => o.move === '유지').length },
  scen: {
    cur: [live.reduce((x, o) => x + o.costCur, 0), live.reduce((x, o) => x + o.clkCur, 0)],
    all5: [start.cost, start.clk], all3: [live.reduce((x, o) => x + o.cost3, 0), live.reduce((x, o) => x + o.clk3, 0)],
    urgent: [total, clicks],
  },
};
fs.writeFileSync(D + 'urgency.json', JSON.stringify({ summary, rows }));
console.log('간절도 등급', JSON.stringify({ 상: T('상').length, 중: T('중').length, 하: T('하').length }));
console.log('등급×분류', JSON.stringify(matrix));
console.log('배분: 5위가 출발', start.cost, '→ 3위 승격', up.size, JSON.stringify(summary.alloc.upByTier), '합계', total, '(일', Math.round(total / 30) + ') 클릭', clicks);
console.log('예산 밖 간절 상 남은 것', left.filter(c => c.o.tier === '상').length, '/ 중', left.filter(c => c.o.tier === '중').length, '| 상위:', summary.leftTop.slice(0, 12).map(x => x.k + '[' + x.tier + ',월' + x.vol + ',+' + x.dc + ']').join(' '));
console.log('입찰 변경', JSON.stringify(summary.moves));
const hot = rows.filter(o => o.tier === '상' && (o.cls === '입찰 5위 밖' || o.cls === '4~5위 입찰')).sort((a, b) => b.vol - a.vol);
console.log('간절 상인데 4위 이하', hot.length, hot.slice(0, 20).map(o => o.k + ':' + o.vol + '(' + o.cls + ',' + o.sig.join('+') + ')').join(' '));
