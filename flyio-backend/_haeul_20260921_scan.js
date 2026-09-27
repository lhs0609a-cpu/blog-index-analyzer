// 해울 2026-09-21 점검 — ① 클릭이 일어난 것의 내원 가능성 ② 내원 가능성 높은데 안 뜨는 것
// 입력: win.json(30일 AD_DETAIL+EXPKEYWORD), day.json(오늘 kw_master·그룹·캠페인), visit_state.json(9/17 확정 내원키워드 1,159)
const fs = require('fs'), path = require('path'), assert = require('assert');
const D = path.join(__dirname, 'reports', 'haeul_20260921');
const J = n => JSON.parse(fs.readFileSync(path.join(D, n), 'utf8'));
const { bucket } = require('./_haeul_20260921_intent.js');
const win = J('win.json'), day = J('day.json'), vs = J('visit_state.json');
assert(win.days.length === 30, 'days=' + win.days.length);
console.log('기간', win.days[0], '~', win.days[win.days.length - 1], '| 일수', win.days.length);

const cm = new Map(day.campaigns.map(c => [c.id, c]));
const gm = new Map(day.adgroups.map(g => [g.id, g]));
const km = new Map(day.kw_master.map(r => [r[0], { kid: r[0], gid: r[1], kw: r[2], bid: +r[3], off: r[4] === '1' }]));
const N = s => String(s).replace(/\s+/g, '').toLowerCase();
const byText = new Map();
for (const k of km.values()) { const n = N(k.kw); if (!byText.has(n)) byText.set(n, []); byText.get(n).push(k); }
const csv = (n, a) => {
  if (!a.length) { console.log('(빈 CSV 생략)', n); return; }
  const c = Object.keys(a[0]);
  fs.writeFileSync(path.join(D, n + '.csv'), '﻿' + [c, ...a.map(r => c.map(x => r[x] ?? ''))].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n'));
  console.log('CSV', n + '.csv', a.length + '행');
};
const won = n => Math.round(n).toLocaleString();

// ───────── ① 클릭이 일어난 검색어 (EXPKEYWORD 30일) ─────────
const T = win.exp_tot;
console.log('\n30일 검색어 총계: 노출', T[0].toLocaleString(), '클릭', T[1], '비용', won(T[2]), '원 (고유 검색어', T[3].toLocaleString(), ')');
const terms = new Map();
for (const [term, match, imp, clk, cost, gids, last] of win.exp) {
  const n = N(term);
  const t = terms.get(n) || { term, imp: 0, clk: 0, cost: 0, exact: 0, broad: 0, gids: new Set(), last: '' };
  t.imp += imp; t.clk += clk; t.cost += cost; t[match === '1' ? 'broad' : 'exact'] += clk;
  gids.forEach(g => t.gids.add(g)); if (last > t.last) t.last = last; terms.set(n, t);
}
const clicked = [...terms.values()].filter(t => t.clk > 0).map(t => {
  const b = bucket(t.term); const g = [...t.gids].map(x => gm.get(x)).filter(Boolean);
  return {
    검색어: t.term, 버킷: b.b, 범위: b.scope, 신호: b.sig, 내원: b.visit, 노출: t.imp, 클릭: t.clk, 비용: Math.round(t.cost),
    CPC: Math.round(t.cost / t.clk), 'CTR%': +(t.clk / t.imp * 100).toFixed(2),
    키워드클릭: t.exact, 확장클릭: t.broad, 최근노출: t.last,
    그룹: [...new Set(g.map(x => x.name))].slice(0, 3).join(' | '),
    캠페인: [...new Set(g.map(x => cm.get(x.cid) && cm.get(x.cid).name))].join(' | ')
  };
}).sort((a, b) => b.비용 - a.비용);
const CT = clicked.reduce((s, x) => ({ c: s.c + x.클릭, m: s.m + x.비용 }), { c: 0, m: 0 });
console.log('클릭 발생 검색어', clicked.length, '개 | 클릭', CT.c, '| 비용', won(CT.m), '원');

const bk = {};
for (const r of clicked) { const b = bk[r.버킷] || (bk[r.버킷] = { 버킷: r.버킷, 검색어: 0, 클릭: 0, 비용: 0, 노출: 0 }); b.검색어++; b.클릭 += r.클릭; b.비용 += r.비용; b.노출 += r.노출; }
const bt = Object.values(bk).sort((a, b) => a.버킷.localeCompare(b.버킷))
  .map(b => ({ ...b, '비용%': +(b.비용 / CT.m * 100).toFixed(1), '클릭%': +(b.클릭 / CT.c * 100).toFixed(1), CPC: Math.round(b.비용 / b.클릭) }));
console.log('\n=== 클릭 검색어의 내원 가능성 분포 (30일) ==='); console.table(bt);
const low = clicked.filter(r => !r.내원);
console.log('내원 가능성 낮음 합계: 검색어', low.length, '/', clicked.length, '| 클릭', low.reduce((s, x) => s + x.클릭, 0), '| 비용', won(low.reduce((s, x) => s + x.비용, 0)), '원');
console.log('\n=== 내원 가능성 낮은데 돈 쓴 검색어 상위 30 ===');
console.table(low.slice(0, 40).map(({ 그룹, 캠페인, 신호, 최근노출, 키워드클릭, 확장클릭, ...r }) => r));
csv('①_클릭검색어_전체_30일_20260920', clicked);
csv('①_클릭검색어_내원낮음_30일_20260920', low);

// 키워드 귀속(AD_DETAIL) 클릭
const adClicked = win.ad.filter(r => r[4] > 0).map(r => {
  const k = km.get(r[0]); const g = gm.get(r[1]); const b = k ? bucket(k.kw) : null;
  return {
    키워드: k ? k.kw : (r[0] === '-' ? '(확장검색·비귀속)' : '(삭제됨 ' + r[0] + ')'), 버킷: b ? b.b : '', 내원: b ? b.visit : '',
    노출: r[3], 클릭: r[4], 비용: Math.round(r[5]), CPC: Math.round(r[5] / r[4]), 평균순위: r[3] ? +(r[6] / r[3]).toFixed(1) : '',
    입찰가: k ? k.bid : '', 상태: k ? (k.off ? 'OFF' : 'ON') : '', 최근노출: r[7],
    그룹: g ? g.name : '', 캠페인: g && cm.get(g.cid) ? cm.get(g.cid).name : ''
  };
}).sort((a, b) => b.비용 - a.비용);
csv('①_클릭키워드_30일_20260920', adClicked);
console.log('\n키워드 귀속 클릭', adClicked.filter(r => r.버킷).reduce((s, x) => s + x.클릭, 0), '| 비귀속(확장·플레이스)', adClicked.filter(r => !r.버킷).reduce((s, x) => s + x.클릭, 0));

// ───────── ② 내원 가능성 높은데 안 뜨는 것 ─────────
const impByText = new Map();
for (const r of win.ad) {
  const k = km.get(r[0]); if (!k) continue; const n = N(k.kw);
  const p = impByText.get(n) || { imp: 0, clk: 0, cost: 0, last: '' };
  p.imp += r[3]; p.clk += r[4]; p.cost += r[5]; if (r[7] > p.last) p.last = r[7]; impByText.set(n, p);
}
// 그룹별 30일 실소진 — '예산이 막았나 입찰이 못 붙었나'를 추측하지 않고 실측으로 가른다
const gSpend = new Map();
for (const r of win.ad) { const p = gSpend.get(r[1]) || { imp: 0, clk: 0, cost: 0 }; p.imp += r[3]; p.clk += r[4]; p.cost += r[5]; gSpend.set(r[1], p); }
const cSpend = new Map();
for (const r of win.ad) { const g = gm.get(r[1]); if (!g) continue; const p = cSpend.get(g.cid) || { cost: 0 }; p.cost += r[5]; cSpend.set(g.cid, p); }

// 라이브 키워드 상태(2026-09-21 조회) — 심의반려/검수중/일시중지는 추측하지 않고 API 값을 쓴다
const live = new Map();
for (const k of J('kwstatus.json').kw) live.set(k[0], { kid: k[0], kw: k[1], bid: +k[2], useGroupBid: !!k[3], off: !!k[4], status: k[5], reason: k[6], inspect: k[7], gid: k[8] });

const rows = vs.map(v => {
  const n = N(v.키워드);
  const inst = (byText.get(n) || []).map(k => {
    const l = live.get(k.kid);
    if (!l) return { ...k, status: '', reason: '', eff: k.bid };
    const g = gm.get(l.gid);
    return { ...k, status: l.status, reason: l.reason, off: l.off, bid: l.bid, eff: l.useGroupBid && g ? g.bid : l.bid };
  });
  const on = inst.filter(k => k.status ? k.status === 'ELIGIBLE' : !k.off);
  const rep = (on.length ? on : inst).slice().sort((a, b) => b.eff - a.eff)[0];
  const g = rep ? gm.get(rep.gid) : null; const c = g ? cm.get(g.cid) : null;
  const w = impByText.get(n) || { imp: 0, clk: 0, cost: 0, last: '' };
  const tot90 = v['90일노출'] || 0;
  const gs = g ? (gSpend.get(g.id) || { cost: 0, imp: 0 }) : { cost: 0, imp: 0 };
  const gcap = g && g.useBudget ? g.budget * win.days.length : 0;     // 30일 그룹예산 총량
  const gUse = gcap ? gs.cost / gcap : null;                           // 그룹예산 소진율
  const ccap = c ? c.budget * win.days.length : 0;
  const cUse = ccap ? ((cSpend.get(c.id) || { cost: 0 }).cost) / ccap : null;
  const R2 = { KEYWORD_DISAPPROVED: '키워드 심의반려', KEYWORD_UNDER_REVIEW: '키워드 검수중', KEYWORD_PAUSED: '키워드 일시중지(userLock)' };
  let 원인 = '';
  if (!inst.length) 원인 = '등록없음';
  else if (!on.length) 원인 = R2[rep.reason] || ('키워드 ' + (rep.reason || 'OFF'));
  else if (g && g.status !== 'ELIGIBLE') 원인 = '그룹 ' + g.status;
  else if (c && c.status !== 'ELIGIBLE') 원인 = '캠페인 ' + c.status;
  else if (rep.eff <= 300) 원인 = '입찰 ' + rep.eff + '원' + (gUse !== null && gUse < 0.2 ? '(그룹예산 ' + g.budget + '원은 남아돎)' : '');
  else if (gUse !== null && gUse >= 0.8) 원인 = '그룹예산 소진(' + g.budget + '원/일, 30일 소진율 ' + Math.round(gUse * 100) + '%)';
  else if (cUse !== null && cUse >= 0.8) 원인 = '캠페인예산 소진(' + c.budget + '원/일)';
  else 원인 = '입찰 ' + rep.eff + '원인데 미노출(원인 미판별)';
  return {
    키워드: v.키워드, 등급: v.등급, 신호: v.신호, 증거: v.증거, 월검색: v.월검색,
    '90일노출': tot90, '90일클릭': v['90일클릭'], '30일노출': w.imp, '30일클릭': w.clk, '30일비용': Math.round(w.cost),
    최근노출: w.last, 입찰가: rep ? rep.eff : '', 키워드상태: rep ? (rep.status || '') : '', 검수사유: rep ? (rep.reason || '') : '', 등록수: inst.length, ON수: on.length,
    그룹: g ? g.name : '', 그룹입찰: g ? g.bid : '', 그룹예산: g && g.useBudget ? g.budget : '', 그룹상태: g ? g.status : '',
    그룹30일소진: Math.round(gs.cost), 그룹예산소진율: gUse === null ? '' : Math.round(gUse * 100) + '%',
    캠페인: c ? c.name : '', 캠페인예산: c ? c.budget : '', 원인: 원인,
    총노출: tot90 + w.imp
  };
});
const never = rows.filter(r => r.총노출 === 0).sort((a, b) => (+b.월검색 || 0) - (+a.월검색 || 0));
const stalled = rows.filter(r => r.총노출 > 0 && r['30일노출'] === 0).sort((a, b) => (+b.월검색 || 0) - (+a.월검색 || 0));
const fading = rows.filter(r => r['30일노출'] > 0 && r.최근노출 < '20260918');
console.log('\n=== ② 내원 키워드', rows.length, '개 중 안 뜨는 것 ===');
console.log('완전 미노출(90일+30일 노출 0):', never.length, '| 월검색 합', never.reduce((s, x) => s + (+x.월검색 || 0), 0).toLocaleString());
console.log('과거엔 떴으나 최근 30일 노출 0:', stalled.length, '| 월검색 합', stalled.reduce((s, x) => s + (+x.월검색 || 0), 0).toLocaleString());
console.log('30일 안엔 떴으나 9/18 이후 끊김:', fading.length);
const cause = a => {
  const m = {};
  for (const r of a) { const k = r.원인.replace(/\d+원/g, 'N원').replace(/\d+%/g,'N%'); m[k] = m[k] || { 원인: k, 개수: 0, 월검색: 0 }; m[k].개수++; m[k].월검색 += (+r.월검색 || 0); }
  return Object.values(m).sort((x, y) => y.개수 - x.개수);
};
console.log('\n[완전 미노출의 원인]'); console.table(cause(never));
console.log('\n[최근 30일 끊김의 원인]'); console.table(cause(stalled));
console.log('\n=== 완전 미노출 중 실수요 상위 25 ===');
console.table(never.slice(0, 25).map(r => ({ 키워드: r.키워드, 등급: r.등급, 월검색: r.월검색, 입찰가: r.입찰가, 그룹예산: r.그룹예산, 원인: r.원인, 그룹: r.그룹 })));
console.log('\n=== 최근 30일 끊김 중 과거 클릭 있던 것 ===');
const hadClick = stalled.filter(r => r['90일클릭'] > 0).sort((a, b) => b['90일클릭'] - a['90일클릭']);
console.table(hadClick.slice(0, 25).map(r => ({ 키워드: r.키워드, 월검색: r.월검색, '90일클릭': r['90일클릭'], 입찰가: r.입찰가, 그룹: r.그룹, 캠페인: r.캠페인, 원인: r.원인 })));
csv('②_내원_완전미노출_20260920', never);
csv('②_내원_최근30일_노출0_20260920', stalled);
csv('②_내원_전수_상태_20260920', rows.slice().sort((a, b) => a.총노출 - b.총노출 || (+b.월검색 || 0) - (+a.월검색 || 0)));

// ③ 확장검색으로만 잡히는 고의도 검색어(등록 없음)
const unreg = [...terms.values()].map(t => {
  const b = bucket(t.term); const n = N(t.term);
  return { 검색어: t.term, 버킷: b.b, 내원: b.visit, 노출: t.imp, 클릭: t.clk, 비용: Math.round(t.cost), 등록: byText.has(n) ? 'Y' : 'N', 최근노출: t.last };
}).filter(r => r.내원 && r.등록 === 'N').sort((a, b) => b.노출 - a.노출);
console.log('\n=== ③ 내원 의도인데 등록조차 안 된 검색어(확장검색으로만 잡힘)', unreg.length, '개 ===');
console.table(unreg.slice(0, 25));
csv('③_내원의도_미등록검색어_30일_20260920', unreg);

// ④ 1,159 밖에 있는데 실제로 노출·클릭이 붙은 내원 의도 키워드(목록 신선도 점검)
const vsSet = new Set(vs.map(v => N(v.키워드)));
const extra = new Map();
for (const r of win.ad) {
  const k = km.get(r[0]); if (!k) continue; const n = N(k.kw); if (vsSet.has(n)) continue;
  const b = bucket(k.kw); if (!b.visit) continue;
  const p = extra.get(n) || { kw: k.kw, b: b.b, sig: b.sig, imp: 0, clk: 0, cost: 0, bid: 0, gid: k.gid };
  p.imp += r[3]; p.clk += r[4]; p.cost += r[5]; p.bid = Math.max(p.bid, k.bid); extra.set(n, p);
}
const ex4 = [...extra.values()].filter(x => x.imp > 0).map(x => {
  const g = gm.get(x.gid);
  return { 키워드: x.kw, 버킷: x.b, 신호: x.sig, '30일노출': x.imp, '30일클릭': x.clk, '30일비용': Math.round(x.cost), 입찰가: x.bid, 그룹: g ? g.name : '', 캠페인: g && cm.get(g.cid) ? cm.get(g.cid).name : '' };
}).sort((a, b) => b['30일노출'] - a['30일노출']);
console.log('\n=== ④ 1,159 목록 밖인데 30일 노출이 붙은 내원 의도 키워드', ex4.length, '개 ===');
console.table(ex4.slice(0, 20));
csv('④_목록밖_내원의도_노출있음_20260920', ex4);
