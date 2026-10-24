// 소잠 — 사용자 지정 카테고리(간지럼·극심통증·아토피·습진·은밀부위·구순염·가려움증) 대상 선정
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));

const core = L('_sojam_b0827_corekws.json');       // gid -> {camp,gname,gbid,gbudget,kws[]}
const old = L('_sojam_b0827_raise_scope.json');     // 기존 4축 스코프
const vol = {};
for (const f of ['_sojam_b0827_vol_extra.json']) {
  try { Object.assign(vol, L(f)); } catch (e) {}
}
for (const [k, v] of Object.entries(old)) if (v.vol) vol[k] = Math.max(vol[k] || 0, v.vol);
// bidtable 에 담긴 검색량도 흡수
try {
  for (const r of L('_sojam_b0827_bidtable.json')) if (r.kw && r.vol) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol);
} catch (e) {}

// ── 카테고리 토큰 ────────────────────────────────────────────────
const CAT = {
  '가려움': ['가려움', '가려운', '가렵', '간지러', '간지럼', '간지럽', '소양증', '소양감', '근질'],
  '극심통증': ['통증', '아픔', '쓰라림', '따가움', '따끔', '화끈거림', '욱신', '종기', '봉와직염',
              '대상포진', '농가진', '단순포진', '구순포진', '화농', '고름', '물집', '수포',
              '고름집', '연조직염', '결절성양진', '농양', '피부염증', '두피염증'],
  '아토피': ['아토피'],
  '습진': ['습진', '한포진', '피부염', '건선', '태선', '두드러기'],
  '은밀부위': ['사타구니', '서혜부', '엉덩이', '둔부', '항문', '똥꼬', '똥구멍', '회음부', '생식기',
              '성기', '음부', '음순', '질염', '질입구', '질가려', '질건조', '고환', '음낭', '귀두',
              '포피', '포경', '유두', '젖꼭지', '유방', '겨드랑이', '액취', '음모', '치골', '자궁경부',
              '외음', '내음', '사타구', '허벅지안쪽', '엉덩', '항문가려'],
  '구순염': ['구순염', '구각염', '입술', '입꼬리', '구내염', '혓바닥', '혀갈라짐'],
};
// 제외 — 진료범위 밖 / 일반 피부과·병원 탐색어
const EXCLUDE = ['피부과', '성형외과', '내과의원', '치과', '한의원추천', '강남', '청담', '압구정',
                 '병원비', '가격', '비용', '보험', '실비', '연예인', '후기사진',
                 '관절염', '무좀', '갑상선', '류마티스', '켈로이드', '피어싱'];
// 여드름 계열은 은밀부위 키워드가 아닌 한 제외(진료범위 밖)
const isAcne = (kw, cats) => kw.includes('여드름') && !cats.has('은밀부위');

const uniq = new Map();  // kw -> {vol, cats:Set, inst:[]}
for (const [gid, g] of Object.entries(core)) {
  for (const k of g.kws) {
    const eff = k.ugb ? (g.gbid || 0) : (k.bid || 0);
    const state = (k.lock || k.st !== 'ELIGIBLE') ? '중지·잠금' : (eff <= 70 ? '70원 묶임' : '노출 가능');
    if (!uniq.has(k.kw)) uniq.set(k.kw, { vol: vol[k.kw] || 0, cats: new Set(), inst: [] });
    uniq.get(k.kw).inst.push({ id: k.id, gid, g: g.gname, camp: g.camp, eff, ugb: k.ugb, state, lock: k.lock, st: k.st });
  }
}
for (const [kw, v] of uniq) {
  for (const [cat, toks] of Object.entries(CAT)) if (toks.some(t => kw.includes(t))) v.cats.add(cat);
  if (old[kw]) v.cats.add('기존축:' + old[kw].axis);
}

const isExc = kw => EXCLUDE.some(t => kw.includes(t));
const hit = [...uniq.entries()]
  .filter(([kw, v]) => v.cats.size > 0 && !isExc(kw) && !isAcne(kw, v.cats))
  .map(([kw, v]) => ({ kw, vol: v.vol, cats: [...v.cats], inst: v.inst }));

hit.sort((a, b) => b.vol - a.vol);
fs.writeFileSync(P('_sojam_c0827_targets.json'), JSON.stringify(hit, null, 0), 'utf8');

// ── 리포트 ──────────────────────────────────────────────────────
const N = hit.length;
console.log(`전체 고유 키워드 ${uniq.size} → 대상 ${N}개 (인스턴스 ${hit.reduce((s, h) => s + h.inst.length, 0)})`);
const cnt = {};
for (const h of hit) for (const c of h.cats) if (!c.startsWith('기존축')) cnt[c] = (cnt[c] || 0) + 1;
console.log('카테고리별:', cnt);
const isNew = h => !old[h.kw];
const nw = hit.filter(isNew);
console.log(`기존 스코프 밖에서 새로 편입 ${nw.length}개`);
console.log('  신규 상위20:', nw.slice(0, 20).map(h => `${h.kw}(${h.vol})`).join(', '));
for (const t of [10000, 3000, 1000, 100, 0]) {
  const s = hit.filter(h => h.vol >= t);
  const live = s.filter(h => h.inst.some(i => i.state === '노출 가능')).length;
  console.log(`  검색량>=${String(t).padEnd(6)} ${String(s.length).padStart(5)}개 / 현재 노출 ${live}개`);
}
