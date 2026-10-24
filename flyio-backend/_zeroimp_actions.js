// zeroimp/plan.json + criteria.json → actions.json (입찰 인상 목록 + 복사 등록 목록).
// B2: 계획대로 등록본 입찰 인상. B3: 켜진 등록본이 전부 지역·시간 제한 그룹에만 있으면 무타기팅 승인 그룹으로 복사,
//     제한 없는 등록본이 있는데도 노출 0 이고 월 100+ 이면 그 등록본을 3위가로 인상(1만원 상한). 월 10~99 는 이틀 창으로는 판단이 약해 둔다.
// B1: 소재 노출불가 그룹에만 있는 것은 복사. '전문병원' 반려는 의료광고 표현 규정이라 손대지 않는다.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const D = R + 'zeroimp/';
const J = n => JSON.parse(fs.readFileSync(n, 'utf8'));
const plan = J(D + 'plan.json'), crit = J(D + 'criteria.json');
const { rows } = J(R + 'urgency.json'); const byK = new Map(rows.map(o => [o.k, o]));
const kw = J(R + 'kw.json'), grp = J(R + 'grp.json');
const CAP = 10000;
const PART = /항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|질입구|소음순|유두|엉덩이|겨드랑|생식기|성기/;
const ITCH = /가려|간지|소양/;
const r10 = n => Math.ceil(n / 10) * 10;
const bidFor = o => { const t = o && o.target ? o.target.bid : null; const v = o ? o.vol : 0;
  return Math.min(CAP, Math.max(t ? r10(t) : 0, v >= 100 ? 2500 : v >= 10 ? 2000 : 1000)); };
let a37room = 1000 - 962 - 5; // 오늘 등록 뒤 a37 962개, 여유 5 남김
const dest = k => PART.test(k) ? 'brand' : (ITCH.test(k) && a37room-- > 0) ? 'a37' : 'a31';

const raises = [], copies = [], notes = [];
for (const r of plan.raise) for (const n of r.need) raises.push({ id: n.id, gid: n.gid, k: r.k, from: n.from, to: n.to, why: 'B2 목표' + r.target.pos + '위가' });
for (const c of plan.copy) {
  const o = byK.get(c.k);
  const restricted = c.copies.map(x => { const cr = crit[x.gid] || {}; return !!(cr.region || cr.time || cr.age); });
  if (restricted.every(Boolean)) { copies.push({ k: c.k, grp: dest(c.k), bid: bidFor(o), why: 'B3 등록본이 전부 지역·시간 제한 그룹', from: c.copies.map(x => x.g).join('|') }); continue; }
  if (c.vol >= 100 && o && o.e3) {
    const free = c.copies.filter((x, i) => !restricted[i]);
    for (const x of free) {
      const k = kw[x.id] || {}, g = grp[x.gid] || {}, mw = (g.mw ?? 100) / 100;
      const base = k.useGrp ? g.bid : k.bid, to = Math.min(CAP, r10(o.e3 / mw));
      if (to > base) raises.push({ id: x.id, gid: x.gid, k: c.k, from: base, to, why: 'B3 무제한 그룹인데 노출0·월100+ → 3위가' });
    }
    continue;
  }
  notes.push({ k: c.k, vol: c.vol, why: '월 ' + c.vol + '회 — 이틀 창으로는 노출 0 이 정상 범위' });
}
for (const b of plan.blocked) {
  if (b.why === '소재 노출불가') copies.push({ k: b.k, grp: dest(b.k), bid: bidFor(byK.get(b.k)), why: 'B1 소재 노출불가 그룹에만 있음' });
  else notes.push({ k: b.k, why: b.why === '키워드 반려' ? "키워드 반려 — '전문병원' 표현은 의료광고 규정상 쓸 수 없음" : b.why });
}
// 같은 등록본 중복 인상 제거(높은 값 유지)
const rmap = new Map(); for (const r of raises) { const p = rmap.get(r.id); if (!p || r.to > p.to) rmap.set(r.id, r); }
const A = { raises: [...rmap.values()], copies, notes };
fs.writeFileSync(D + 'actions.json', JSON.stringify(A, null, 1));
const g = {}; for (const c of copies) g[c.grp] = (g[c.grp] || 0) + 1;
console.log('입찰 인상', A.raises.length, '(B2', A.raises.filter(r => r.why.startsWith('B2')).length, '/ B3', A.raises.filter(r => r.why.startsWith('B3')).length, ') | 1만원 상한', A.raises.filter(r => r.to === CAP).length);
console.log('복사 등록', copies.length, JSON.stringify(g), '| 입찰', JSON.stringify(copies.reduce((m, c) => (m[c.bid] = (m[c.bid] || 0) + 1, m), {})));
console.log('  복사 상위:', copies.sort((a, b) => (byK.get(b.k)?.vol || 0) - (byK.get(a.k)?.vol || 0)).slice(0, 20).map(c => c.k + '→' + c.grp + ' ' + c.bid).join(' '));
console.log('  B3 인상 상위:', A.raises.filter(r => r.why.startsWith('B3')).slice(0, 15).map(r => r.k + ' ' + r.from + '→' + r.to).join(' '));
console.log('손대지 않음', notes.length, '| 반려', notes.filter(n => n.why.startsWith('키워드 반려')).map(n => n.k).join(','));
