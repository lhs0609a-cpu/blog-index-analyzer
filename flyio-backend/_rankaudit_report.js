// 소잠 — 내원 핵심 키워드 실순위·입찰 검토 보고 (2026-09-11). 입력: rankaudit/ 의 candidates·kw·grp·stats·est·vol·perf.
// 실순위 = 9/10~9/11 네이버 avgRnk(노출 가중, 텍스트의 모든 등록본 합산). 입찰 기대순위 = 유효입찰(그룹입찰·기기 가중치 반영)이 넘는 가장 높은 순위의 추정가.
// 예산 = performance-bulk 월 예상비용(대표 등록본 1개 기준, 텍스트 중복 없음) ↔ 일 15만원 × 30.
const fs = require('fs'), path = require('path');
const { effective } = require('./_rankaudit_measure');
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const L = n => JSON.parse(fs.readFileSync(D + n, 'utf8'));
const est = L('est.json'), vol = L('vol.json'), stats = L('stats.json'), perf = L('perf.json'), kw = L('kw.json'), grp = L('grp.json');
const rows = effective();
const DAILY = 150000, MONTH = DAILY * 30;

const posFor = (dev, k, bid) => { for (let p = 1; p <= 5; p++) { const e = est[dev + '|' + p + '|' + k]; if (e && bid >= e) return p; } return null; };
function whyOff(opts) {
  if (!opts.length) return '등록본 없음(삭제)';
  const r = [];
  for (const o of opts) {
    const k = kw[o.id] || {}, g = grp[k.gid] || {};
    r.push(k.lock ? '키워드 꺼짐' : g.lock ? '그룹 꺼짐' : g.campLock ? '캠페인 꺼짐' : g.adOk === false ? '소재 노출불가' : k.st !== 'ELIGIBLE' ? (k.sr || k.st) : '기타');
  }
  const c = {}; for (const x of r) c[x] = (c[x] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([x]) => x)[0];
}

const out = [];
for (const r of rows) {
  const v = vol[r.k]; const vm = v ? v.mo : 0, vp = v ? v.pc : 0;
  // 실측: 모든 등록본 합산
  let imp = 0, clk = 0, cost = 0, rs = 0;
  for (const o of r.opts) { const s = stats[o.id]; if (s) { imp += s.imp; clk += s.clk; cost += s.cost; if (s.rank != null) rs += s.rank * s.imp; } }
  const rank = imp ? +(rs / imp).toFixed(1) : null;
  const on = r.nOn > 0, b = r.best;
  const mob = b ? b.mob : 0, pcb = b ? b.pcb : 0;
  const mPos = on ? posFor('MOBILE', r.k, mob) : null, pPos = on ? posFor('PC', r.k, pcb) : null;
  const e = (d, p) => est[d + '|' + p + '|' + r.k] || null;
  const pf = (d, t) => (perf[d + '|' + t + '|' + r.k] || {}).cost || 0;
  const pc = (d, t) => (perf[d + '|' + t + '|' + r.k] || {}).clk || 0;
  let cls;
  if (!on) cls = '노출불가';
  else if (mPos === null) cls = '입찰 5위 밖';
  else if (mPos <= 3) cls = '1~3위 입찰';
  else cls = '4~5위 입찰';
  const over = on && e('MOBILE', 1) && mob > e('MOBILE', 1) * 2;
  out.push({ k: r.k, axis: r.axis, tiers: r.tiers.join('+'), vol: vm + vp, volMo: vm, cls, off: on ? null : whyOff(r.opts), over,
    mob, pcb, mPos, pPos, e1: e('MOBILE', 1), e3: e('MOBILE', 3), e5: e('MOBILE', 5), pe3: e('PC', 3), pe5: e('PC', 5),
    rank, imp, clk, cost, grp: b && b.gname, nOn: r.nOn,
    costCur: pf('MOBILE', 'cur') + pf('PC', 'cur'), cost5: pf('MOBILE', 'p5') + pf('PC', 'p5'), cost3: pf('MOBILE', 'p3') + pf('PC', 'p3'),
    clkCur: pc('MOBILE', 'cur') + pc('PC', 'cur'), clk5: pc('MOBILE', 'p5') + pc('PC', 'p5'), clk3: pc('MOBILE', 'p3') + pc('PC', 'p3') });
}
out.sort((a, b) => b.vol - a.vol);
fs.writeFileSync(D + 'report.json', JSON.stringify(out));
const csv = ['키워드,축,기준,월검색량,분류,노출불가사유,모바일유효입찰,모바일기대순위,PC유효입찰,PC기대순위,모바일1위가,모바일3위가,모바일5위가,실순위(9/10~11),노출,클릭,지출,그룹,월예상비용_현재,월예상비용_5위,월예상비용_3위']
  .concat(out.map(o => [o.k, o.axis, o.tiers, o.vol, o.cls, o.off || '', o.mob, o.mPos || '', o.pcb, o.pPos || '', o.e1 || '', o.e3 || '', o.e5 || '', o.rank ?? '', o.imp, o.clk, o.cost, (o.grp || '').replace(/,/g, ' '), o.costCur, o.cost5, o.cost3].join(',')));
fs.writeFileSync(D + '실순위_입찰검토.csv', '﻿' + csv.join('\n'));

const S = (a, f) => a.reduce((x, o) => x + (o[f] || 0), 0);
const grpBy = (a, f) => { const m = {}; for (const o of a) { const k = o[f]; m[k] = m[k] || { n: 0, vol: 0 }; m[k].n++; m[k].vol += o.vol; } return m; };
console.log('핵심 키워드', out.length, '| 월검색량 합', S(out, 'vol'));
console.log('분류', JSON.stringify(grpBy(out, 'cls')));
console.log('노출불가 사유', JSON.stringify(grpBy(out.filter(o => o.off), 'off')));
const measured = out.filter(o => o.rank != null);
const rb = {}; for (const o of measured) { const g = o.rank <= 1.5 ? '1위권' : o.rank <= 3.5 ? '2~3위' : o.rank <= 5.5 ? '4~5위' : '6위 밖'; rb[g] = rb[g] || { n: 0, vol: 0 }; rb[g].n++; rb[g].vol += o.vol; }
console.log('실순위(노출 있던', measured.length, '개)', JSON.stringify(rb), '| 노출 0', out.length - measured.length);
// 입찰은 5위 안인데 실순위가 5위 밖 / 노출 0 → 지역·품질·시간 등 입찰 외 원인
const mism = out.filter(o => o.cls !== '노출불가' && o.mPos && o.mPos <= 5 && o.rank != null && o.rank > 5.5);
console.log('입찰상 5위 안인데 실순위 6위 밖', mism.length, mism.slice(0, 15).map(o => o.k + '(입찰' + o.mPos + '위/실' + o.rank + ')').join(' '));
const out5 = out.filter(o => o.cls === '입찰 5위 밖').sort((a, b) => b.vol - a.vol);
console.log('\n입찰 5위 밖', out5.length, '| 월검색량', S(out5, 'vol'));
for (const o of out5.slice(0, 40)) console.log('  ', o.k, o.axis, '월' + o.vol, '| 모바일', o.mob + '원 → 5위', o.e5, '/ 3위', o.e3, '| 실순위', o.rank ?? '-', '| 그룹', o.grp);
const offs = out.filter(o => o.cls === '노출불가').sort((a, b) => b.vol - a.vol);
console.log('\n노출불가 상위', offs.slice(0, 25).map(o => o.k + ':' + o.vol + '[' + o.off + ']').join(' '));
const over = out.filter(o => o.over).sort((a, b) => b.vol - a.vol);
console.log('\n과입찰(모바일 유효입찰 > 1위 추정가×2)', over.length, over.slice(0, 20).map(o => o.k + '(' + o.mob + '/1위' + o.e1 + ')').join(' '));
const top = out.filter(o => o.cls !== '노출불가');
console.log('\n예산(월, performance 추정, 노출가능 키워드', top.length, '개)');
console.log('  현재 입찰 유지', S(top, 'costCur'), '원 / 클릭', S(top, 'clkCur'));
console.log('  전부 5위가', S(top, 'cost5'), '원 / 클릭', S(top, 'clk5'));
console.log('  전부 3위가', S(top, 'cost3'), '원 / 클릭', S(top, 'clk3'));
console.log('  목표 월', MONTH, '(일 15만)');
// 5위 밖만 5위로 올리면 추가 비용
const add5 = out5.reduce((x, o) => x + Math.max(0, o.cost5 - o.costCur), 0);
const add3 = out.filter(o => o.cls !== '노출불가' && (!o.mPos || o.mPos > 3)).reduce((x, o) => x + Math.max(0, o.cost3 - o.costCur), 0);
console.log('  5위 밖만 5위가로 올릴 때 추가 월', add5, '| 4위 이하 전부 3위가로 올릴 때 추가 월', add3);
const ax = {}; for (const o of out) { ax[o.axis] = ax[o.axis] || { n: 0, top3: 0, p45: 0, out5: 0, off: 0 }; const a = ax[o.axis]; a.n++; if (o.cls === '1~3위 입찰') a.top3++; else if (o.cls === '4~5위 입찰') a.p45++; else if (o.cls === '입찰 5위 밖') a.out5++; else a.off++; }
console.log('\n축별', JSON.stringify(ax));
