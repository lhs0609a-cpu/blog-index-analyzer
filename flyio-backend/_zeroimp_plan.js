// 소잠 — 핵심 키워드 중 9/10~9/11 노출 0 전수 개선 계획 (2026-09-11 사용자 지시 "노출 없는거 전부 다 개선해").
// 입력: rankaudit/urgency.json(간절도·목표순위), kw.json·grp.json·stats.json(등록본별 현재 상태).
// 원인별 버킷:
//   B1 노출불가 — 등록본 전부 반려/꺼짐/소재없음 → 사유별 처리
//   B2 입찰 부족 — 켜진 등록본의 모바일 유효입찰 < 목표 추정가(간절 배치 3위가, 나머지 5위가) → 키워드 입찰 인상(인상만, 1만원 상한)
//   B3 입찰 충분·검색 있음(월 10+)인데 노출 0 — 등록본이 지역·시간 타기팅 그룹에만 있는지 확인 대상 → 무타기팅 승인 그룹에 복사 등록
//   B4 검색 없음(월 10 미만)·입찰 충분 — 입찰로는 노출이 생기지 않는다 → 손대지 않음
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const OUT = D + 'zeroimp/';
fs.mkdirSync(OUT, { recursive: true });
const L = n => JSON.parse(fs.readFileSync(D + n, 'utf8'));
const { rows } = L('urgency.json'); const kw = L('kw.json'), grp = L('grp.json'), stats = L('stats.json'), cand = L('candidates.json'), perf = L('perf.json');
const idsOf = new Map(cand.map(c => [c.k, c.ids]));
const CAP = 10000;
const NOFIX = /타투|문신|기기|간지럼(?!증)|간지럽히/; // 원장 제외(문신)·상품(기기)·잡음

const zero = rows.filter(o => !o.imp);
const plan = { raise: [], copy: [], blocked: [], none: [], skip: [] };
for (const o of zero) {
  if (NOFIX.test(o.k)) { plan.skip.push({ k: o.k, why: '제외축·상품·잡음' }); continue; }
  const copies = (idsOf.get(o.k) || []).map(id => ({ id, ...kw[id] })).filter(k => k.gid && !k.missing && !k.del);
  const live = copies.filter(k => { const g = grp[k.gid] || {}; return !k.lock && !g.lock && !g.campLock && g.adOk !== false && k.st === 'ELIGIBLE'; });
  if (!live.length) {
    const c0 = copies[0] || {}, g0 = grp[c0.gid] || {};
    const why = !copies.length ? '등록본 없음' : copies.every(k => k.sr === 'KEYWORD_DISAPPROVED' || k.ins === 'REJECTED') ? '키워드 반려' : copies.every(k => k.lock) ? '키워드 꺼짐'
      : copies.every(k => (grp[k.gid] || {}).adOk === false) ? '소재 노출불가' : (c0.sr || c0.st || '기타');
    plan.blocked.push({ k: o.k, vol: o.v ?? o.vol, tier: o.tier, why, copies: copies.map(k => ({ id: k.id, gid: k.gid, g: (grp[k.gid] || {}).name, sr: k.sr })) });
    continue;
  }
  const target = o.target ? o.target.bid : null;
  // 켜진 등록본별 유효입찰 → 목표에 못 미치면 인상
  const need = [];
  for (const k of live) {
    const g = grp[k.gid] || {}, mw = (g.mw ?? 100) / 100;
    const base = k.useGrp ? g.bid : k.bid, eff = Math.round(base * mw);
    if (target && eff < target) {
      let nb = Math.ceil(target / mw / 10) * 10;
      const capped = nb > CAP; if (capped) nb = CAP;
      if (nb > base) need.push({ id: k.id, gid: k.gid, g: g.name, from: base, to: nb, useGrp: k.useGrp, mw: g.mw ?? 100, capped });
    }
  }
  if (need.length) {
    const dCost = Math.max(0, ((perf['MOBILE|' + (o.target.pos === 3 ? 'p3' : 'p5') + '|' + o.k] || {}).cost || 0) + ((perf['PC|' + (o.target.pos === 3 ? 'p3' : 'p5') + '|' + o.k] || {}).cost || 0) - o.costCur);
    plan.raise.push({ k: o.k, vol: o.vol, tier: o.tier, target: o.target, dCost, need });
    continue;
  }
  if (o.vol >= 10) plan.copy.push({ k: o.k, vol: o.vol, tier: o.tier, target: o.target, copies: live.map(k => ({ id: k.id, gid: k.gid, g: (grp[k.gid] || {}).name, mob: Math.round((k.useGrp ? (grp[k.gid] || {}).bid : k.bid) * ((grp[k.gid] || {}).mw ?? 100) / 100) })) });
  else plan.none.push({ k: o.k, vol: o.vol });
}
fs.writeFileSync(OUT + 'plan.json', JSON.stringify(plan, null, 1));
const S = (a, f) => a.reduce((x, o) => x + (o[f] || 0), 0);
console.log('노출 0 핵심 키워드', zero.length);
console.log(' B1 노출불가', plan.blocked.length, JSON.stringify(plan.blocked.reduce((m, b) => (m[b.why] = (m[b.why] || 0) + 1, m), {})), plan.blocked.map(b => b.k + '[' + b.why + ']').join(' '));
console.log(' B2 입찰 인상', plan.raise.length, '| 등록본', plan.raise.reduce((a, r) => a + r.need.length, 0), '| 월 검색', S(plan.raise, 'vol'), '| 월 예상 추가비용', S(plan.raise, 'dCost'), '| 1만원 상한 걸림', plan.raise.filter(r => r.need.some(n => n.capped)).map(r => r.k).join(','));
console.log('   상위:', plan.raise.sort((a, b) => b.vol - a.vol).slice(0, 25).map(r => r.k + '(월' + r.vol + ',' + r.need.map(n => n.from + '→' + n.to).join('/') + ')').join(' '));
console.log(' B3 입찰 충분·검색 있음인데 노출 0', plan.copy.length, '| 월 검색', S(plan.copy, 'vol'));
console.log('   ', plan.copy.sort((a, b) => b.vol - a.vol).slice(0, 30).map(c => c.k + '(월' + c.vol + ',' + c.copies.map(x => x.g).join('|') + ')').join(' '));
const cg = {}; for (const c of plan.copy) for (const x of c.copies) cg[x.gid] = (cg[x.gid] || { g: x.g, n: 0 }), cg[x.gid].n++;
console.log('   B3 등록본이 있는 그룹', Object.keys(cg).length, JSON.stringify(Object.values(cg).sort((a, b) => b.n - a.n).slice(0, 15)));
console.log(' B4 검색 없음(월 10 미만)·입찰 충분 — 손대지 않음', plan.none.length);
console.log(' 제외(문신·기기·잡음)', plan.skip.length, plan.skip.map(s => s.k).join(' '));
fs.writeFileSync(OUT + 'b3_groups.json', JSON.stringify(Object.keys(cg)));
