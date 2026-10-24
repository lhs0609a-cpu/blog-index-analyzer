// 해울 클릭 검색어 → 내원 가능성 버킷 (v2)
// 축 정의는 운영메모의 공식 진료범위 21개(홈페이지 전체 진료 메뉴)를 그대로 따른다:
//  두통 일반·긴장성·편두통·생리전·군발·삼차신경통·노인성·약물과용·소아두통 /
//  자율신경실조증·미주신경성실신·어지럼증·메니에르·전정신경염 / 불면증·공황장애 /
//  과민성대장증후군·생리통·집중력저하(브레인포그)·수험생우울증·수험생두통
// v1(축밖 562개)은 ① '머리가아파요' 같은 조사 삽입 ② '어지럽' 어간 ③ 브레인포그·과민성대장·생리통·
// 집중력 축 누락 때문에 오탐이 많았다. 여기서 셋을 고치고, 진료범위 밖은 '인접(원장 확인)'과 '무관'으로 가른다.
const G = require('./_haeul_20260917_gate.js');
const R = G.RE;

const norm = s => String(s).replace(/\s+/g, '').toLowerCase();
// 조사 흡수: '머리가아파요' → '머리아파요'
const departicle = s => s.replace(/(머리|뒷목|목뒤|정수리|관자놀이|뒤통수|두피|이마|속|가슴)(가|이|은|는|을|를)/g, '$1');

const BRAND = /(해울)/;
// 진료범위 안 — gate v2의 AXIS + 누락 축 보강
const AXIS2 = new RegExp(R.AXIS.source.slice(0, -1) +
  '|어지럽|어질어질|핑돌|핑그르|머리아파|머리아프|머리찌릿|머리띵|머리흔들|머리무거|머리조임|머리열' +
  '|브레인포그|집중력저하|집중이안|기억이안|머리안돌아|머릿속안개|멍한|멍해' +
  '|과민성대장|과민대장|장트러블|생리통|월경통|수험생)');
// 진료범위 밖이지만 인접 — 광고를 끌지 말지는 원장 판단(임의로 '낭비'라 부르지 않는다)
const ADJACENT = /(화병|울화|이명|귀울림|불안장애|불안증|신경쇠약|신체화|스트레스|우울증|번아웃|홧병|가슴답답|숨쉬기|두근|심계)/;
// 진료범위 밖 확정 — 신경외과·응급·내과·타질환·제품
const OUT = /(뇌출혈|뇌경색|뇌동맥류|뇌종양|뇌수막|뇌전증|간질|뇌수두증|뇌연화|뇌혈관|뇌졸중|중풍|치매|파킨슨|안면마비|구안와사|디스크|협착|갑상선|혈압|저혈당|당뇨|빈혈|코피|위염|역류|대장암|대상포진|감기|독감|코로나|냉방병|열사병|고산증|근감소|마그네슘|비타민|영양제|멀미약|고약|효능|나물)/;
// 타 병원·타 과 탐색 — 치료처를 찾지만 해울 축이 아니다
const CLINICWORD = /(한의원|한방병원|병원|의원(?!리|인)|클리닉|신경과|신경외과|정신과|이비인후과|내과|의원)/;

const AXIS_ONLY = /^(두통|편두통|긴장성두통|군발두통|만성두통|삼차신경통|후두신경통|어지럼증|어지러움|현훈|이석증|메니에르|메니에르병|전정신경염|자율신경실조증|자율신경실조|기립성저혈압|미주신경성실신|공황장애|불면증|수면장애|브레인포그|생리통|과민성대장증후군)$/;
const INFO = /(원인|증상|이유|무엇|뭐|뜻|종류|차이|구분|전조|초기|위험|합병|검사|자가진단|진단|테스트|체크|의미|왜|때문|관련|정보|이란|얼마나|기간|지속)/;

function bucket(raw) {
  const s0 = norm(raw);
  const s = departicle(s0).replace(/공항장애/g,"공황장애").replace(/대장증후군/g,"과민성대장증후군");
  if (BRAND.test(s)) return { b: '0_브랜드', sig: 'brand', visit: 1, scope: 'in' };
  const inAxis = AXIS2.test(s);
  if (inAxis) {
    const g = G.grade(s);            // 등급 판정은 기존 v2 판정기 그대로
    if (g) return { b: g.grade === 'S' ? '1_내원S' : g.grade === 'A' ? '2_내원A' : '3_내원B', sig: g.sig.join('/'), visit: 1, scope: 'in' };
    if (R.JUNK.test(s)) return { b: '8_진료범위밖_무관', sig: 'junk', visit: 0, scope: 'out' };
    if (R.OTHER.test(s)) return { b: '6_타지역', sig: 'other_region', visit: 0, scope: 'in' };
    const fail = R.FAIL.test(s);
    if (!fail && (R.SELF.test(s) || R.DRUG.test(s))) return { b: '5_자가치료·제품', sig: R.DRUG.test(s) ? 'drug' : 'self', visit: 0, scope: 'in' };
    // gate 가 null 인데 축 안 = 내원 신호 없는 정보성. 다만 보강축(브레인포그 등)은 gate AXIS 밖이라 여기로 온다.
    if (R.CLINIC.test(s) || R.TREAT.test(s) || R.DECIDE.test(s)) return { b: '2_내원A', sig: 'clinic/treat(보강축)', visit: 1, scope: 'in' };
    // 진료축 안에서 '검사'는 진단을 받으러 가는 의도, '한약·침·추나'는 해울이 파는 치료 자체다.
    // (자가진단·자가검사는 위 SELF 컷에서 이미 빠졌다)
    if (/(검사|진단)/.test(s)) return { b: '2_내원A', sig: 'diagnosis', visit: 1, scope: 'in' };
    if (/(한약|한방|침치료|약침|추나|뜸|부항)/.test(s)) return { b: '2_내원A', sig: 'kmedicine', visit: 1, scope: 'in' };
    if (AXIS_ONLY.test(s)) return { b: '4_질환명단독', sig: 'bare', visit: 0, scope: 'in' };
    return { b: '4_정보탐색', sig: INFO.test(s) ? 'info' : '', visit: 0, scope: 'in' };
  }
  if (OUT.test(s)) return { b: '8_진료범위밖_무관', sig: 'out_disease', visit: 0, scope: 'out' };
  if (ADJACENT.test(s)) return { b: '7_진료범위밖_인접(원장확인)', sig: 'adjacent', visit: 0, scope: 'adj' };
  if (CLINICWORD.test(s)) return { b: '6_타병원·타과탐색', sig: 'other_clinic', visit: 0, scope: 'out' };
  return { b: '8_진료범위밖_무관', sig: '', visit: 0, scope: 'out' };
}
module.exports = { bucket, norm };
