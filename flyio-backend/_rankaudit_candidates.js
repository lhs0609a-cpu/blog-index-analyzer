// 소잠 — 내원 핵심 키워드 선정 (2026-09-11 사용자 지시 "내원할 중요한 키워드 전부 파악해서 실순위 측정하고 5위안에 예산 맞게 입찰가 설정되어있는지 전부 검토").
// 기준: (내원 핵심 질환 축) AND (치료처 의도 | 헤드어 월 1,000+ | 9일 클릭 1+). 진료범위 제외·제품어·반려동물은 뺀다.
// 입력: 9/10 텍스트→ID(_bytext_ids), 9/10·9/11 등록분, _vol_exact(검색량), _perf_join(9/1~9/9 성과).
const fs = require('fs'), path = require('path');
const { why } = require('./_sojam_d0828_rule');
const R = path.join(__dirname, '../reports/');
const OUT = R + 'sojam-20260911/rankaudit/';
fs.mkdirSync(OUT, { recursive: true });
const J = f => JSON.parse(fs.readFileSync(R + f, 'utf8'));
const norm = s => String(s).replace(/\s+/g, '');

const ids = {}; // text → on ids
for (const [k, v] of Object.entries(J('sojam-20260909/_bytext_ids.json'))) if ((v.on || []).length) ids[norm(k)] = [...v.on];
const addId = (k, id) => { k = norm(k); (ids[k] = ids[k] || []).includes(id) || ids[k].push(id); };
for (const c of J('sojam-20260910/register/result.json').created) addId(c.keyword, c.id);
for (const c of J('sojam-20260910/private/apply/result.json').registered) addId(c.kw, c.id);
for (const c of J('sojam-20260911/pain/apply/result.json').created) addId(c.kw, c.id);
for (const c of J('sojam-20260911/painx/apply/result.json').created) addId(c.kw, c.id);
for (const c of J('sojam-20260911/creative/orphan_apply/result.json').created) addId(c.kw, c.id);
const boilPaused = new Set(J('sojam-20260910/boil/result.json').paused);
for (const k of Object.keys(ids)) { ids[k] = ids[k].filter(i => !boilPaused.has(i)); if (!ids[k].length) delete ids[k]; }

const vol = {}; for (const [k, v] of Object.entries(J('sojam-20260910/_vol_exact.json'))) vol[norm(k)] = (v.pcLt ? 0 : v.pc) + (v.moLt ? 0 : v.mo);
const perf = J('sojam-20260910/_perf_join.json').perf;

// 내원 핵심 축 (상담일지 질환 라벨 + 원장 유지 축). 순서 = 판정 우선순위.
const AXES = [
  ['아토피', /아토피|태열/], ['한포진', /한포진/], ['지루성·두피', /지루|두피염|두피가려|두피각질|비듬/], ['접촉성피부염', /접촉성/],
  ['묘기증', /묘기/], ['은밀부위', /항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|질입구|소음순|유두|엉덩이(가려|습진|간지)|겨드랑이(가려|습진|간지)|완선|칸디다/],
  ['습진', /습진|피부염|화폐상/], ['가려움·소양', /가려|간지|소양/], ['백반증', /백반/], ['무좀·백선', /무좀|백선|어루러기/],
  ['다한증·땀띠', /다한|땀띠/], ['구내염·구순염', /구내염|구순염|입술염|구각/], ['모낭염·한선염', /모낭염|한선염/],
  ['탈스테로이드', /탈스|스테로이드/], ['난치·자가면역', /난치성피부|자가면역|천포창|양진|태선|어린선/], ['피부질환 일반', /피부질환|피부병|피부한의원|피부질환한의원/],
];
const INTENT = /한의원|병원|치료|클리닉|잘하는|전문|명의|완치|낫는법|강남|역삼|신논현|서초|교대|양재|선릉|도곡|한티|매봉|논현|삼성동/;
const EXCL = /종기|절종|낭종|농양|멍울|대상포진|사마귀|홍조|주사비|딸기코|검사|(?<!공)진단|여드름|두드러기|건선|탈모|크림|로션|샴푸|비누|바디워시|스프레이|패치|에센스|쿠팡|강아지|고양이|반려|피부과|성형|레이저|제모/;

const out = [];
for (const [k, list] of Object.entries(ids)) {
  if (why(k) || EXCL.test(k)) continue;
  const ax = AXES.find(([, r]) => r.test(k)); if (!ax) continue;
  const p = perf[k] || {}, v = vol[k];
  const t = [];
  if (INTENT.test(k)) t.push('치료처의도');
  if ((v || 0) >= 1000) t.push('헤드어1000+');
  if ((p.clk9 || 0) >= 1) t.push('9일클릭');
  if (!t.length) continue;
  out.push({ k, axis: ax[0], tiers: t, vol: v ?? null, ids: list, imp9: p.imp9 || 0, clk9: p.clk9 || 0, cost9: p.cost9 || 0, rank9: p.rank9 ?? null });
}
out.sort((a, b) => (b.cost9 - a.cost9) || ((b.vol || 0) - (a.vol || 0)));
fs.writeFileSync(OUT + 'candidates.json', JSON.stringify(out));
const ax = {}; for (const r of out) { ax[r.axis] = ax[r.axis] || { n: 0, ids: 0, vol: 0, cost9: 0 }; ax[r.axis].n++; ax[r.axis].ids += r.ids.length; ax[r.axis].vol += r.vol || 0; ax[r.axis].cost9 += r.cost9; }
const tier = {}; for (const r of out) for (const t of r.tiers) tier[t] = (tier[t] || 0) + 1;
console.log('핵심 키워드', out.length, '| 등록 ID', out.reduce((a, r) => a + r.ids.length, 0), '| 볼륨 알려진 것', out.filter(r => r.vol !== null).length);
console.log('기준별', JSON.stringify(tier));
for (const [a, v] of Object.entries(ax).sort((x, y) => y[1].cost9 - x[1].cost9)) console.log(' ', a, JSON.stringify(v));
console.log('9일 지출 상위 25:', out.slice(0, 25).map(r => r.k + ':' + r.cost9).join(' '));

// 볼륨 1,000+ 인데 켜진 등록이 없는 핵심어 (측정 대상이 아니라 공백으로 보고)
const gap = Object.entries(vol).filter(([k, v]) => v >= 1000 && !ids[k] && !why(k) && !EXCL.test(k) && AXES.some(([, r]) => r.test(k))).sort((a, b) => b[1] - a[1]);
fs.writeFileSync(OUT + 'gap_unregistered.json', JSON.stringify(gap));
console.log('볼륨 1,000+ 핵심어 중 켜진 등록 없음', gap.length, gap.slice(0, 20).map(([k, v]) => k + ':' + v).join(' '));
