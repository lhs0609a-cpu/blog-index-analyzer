// _pain_harvest.js 결과 판정: 진료범위(원장 지시 + 9/10 종기 제외) → 등록 여부 → 고통 축 분류.
// 산출물 reports/sojam-20260911/pain/_final.json, 미등록_후보.csv
const fs = require('fs'), path = require('path');
const { why } = require('./_sojam_d0828_rule');
const { SKIN, PART, SUFFER, norm } = require('./_pain_harvest');
const DIR = path.join(__dirname, '../reports/sojam-20260911/pain');

const rows = new Map();
for (const l of fs.readFileSync(path.join(DIR, 'vol.jsonl'), 'utf8').split('\n')) if (l.trim()) { const d = JSON.parse(l); rows.set(d.k, d); }
const acSurf = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, 'ac_found.json'), 'utf8'))).map(norm));
const reg = JSON.parse(fs.readFileSync(path.join(DIR, '_reg_set.json'), 'utf8'));

// 제외(원장 지시·9/10 결정). 부분문자열 경계 주의: 옴은 옴진드기/옴벌레만, 진단은 공진단 제외.
const EXCL = [
  ['종기·낭종(9/10 제외)', /종기|절종|옹종|낭종|지방종|농양|멍울|피지낭/],
  ['대상포진', /대상포진/], ['사마귀', /사마귀/], ['홍조', /홍조|안면홍조|주사비|딸기코/],
  ['검사·진단', /검사|(?<!공)진단/], ['여드름', /여드름|드름/],
  // 회귀 점검(등록·켜짐 어 재적용)으로 좁혔다: 질염은 칸디다질염(주력) 제외, 허리·관절·결막은 허리습진·아토피결막염을,
  // 치아는 팔꿈'치아'토피·대'치아'토피를 잘라서 뺐다.
  ['타과', /치질|치핵|치루|치열|탈항|항문외과|항문출혈|혈변|변비|(?<!칸디다)질염|질분비물|분비물|냉이|방광염|요도|전립선|포경|음경확대|소음순수술|질성형|성형|탈장|음낭수종|정계정맥|유방(?!습진|가려)|유선염|젖몸살|모유수유|임질|매독|클라미디아|요로|자궁|난소|생리통|두통|잇몸|안과/],
  ['미용·제모', /제모|미백|화이트닝|왁싱|레이저|brazil|브라질리언/],
  ['반려동물', /강아지|고양이|반려|애견|댕댕|강쥐|햄스터/],
  ['비피부(벗겨짐 오탐)', /구두굽|구두가죽|가죽|신발|페인트|소파|매니큐어|도금|코팅/],
];
// 제품어는 계정에 이미 다수 켜져 있다(아토피크림 등) — 제외가 아니라 낮은 우선 보류로 둔다. '가격'은 치료처 의도라 넣지 않는다.
const PRODUCT = /크림|로션|바디워시|샴푸|비누|세정제|청결제|파우더|패치|스프레이|밴드|에센스|오일|미스트|팩$|쿠팡|올리브영|다이소|추천템|퇴치|소독|제거제|탈취|살충|벽지|네일/;
// 은밀부위 + 찢어짐/열상은 항문열상·치열(항문외과), 상처는 산후·성교 외상(산부인과)
const PART_OTHER = [['타과:열상·치열', /찢어|열상|파열/], ['경계:외상·산후상처', /상처|봉합|출산후|회음절개/]];
// 원장 결정 대기(9/10 보류 묶음과 동일 기준) — 목록엔 남기되 즉시 등록 대상에서 뺀다.
const HOLD = [
  ['보류:색소침착', /색소침착|착색|거뭇|검게|까매|까맣|멜라닌/],
  ['보류:성매개', /헤르페스|곤지름|성병|성매개|사면발|음부포진|성기포진|생식기포진/],
  ['경계:유두피지', /유두피지|유두피$|젖꼭지피지/],
  ['보류:뾰루지·냄새', /뾰루지|냄새|액취|암내/],
  ['보류:봉와직염·비립종', /봉와직염|비립종|쥐젖/],
  ['경계:피부통증', /통증|아파|아프/],
];
const FAM = [
  ['은밀부위', PART],
  ['한포진·물집·갈라짐', /한포진|물집|수포|갈라|트임|트고|주부습진|손습진|손끝|손가락끝|발뒤꿈치|벗겨/],
  ['진물·짓무름', /진물|짓무|고름/],
  ['따가움·쓰라림·작열', /따가|따끔|쓰라|쓰려|화끈|작열|찌릿|통증|아파|아프/],
  ['밤·수면 가려움', /잠|밤|새벽|못자|누우면|잘때/],
  ['긁음·상처·피', /긁|딱지|상처|피나|피가|피날/],
  ['스테로이드·약 안 듣는', /스테로이드|탈스|리바운드|연고|항히스타민|약먹어도|약을먹어도/],
  ['만성·재발·치료실패', /만성|재발|안낫|안나아|완치|평생|몇년|수년|오래|난치|계속|안멈|심해|심할|악화/],
  ['소아·아기', /아기|아이|신생아|유아|소아|초등|중학생|고등학생/],
  ['임신·갱년기·노인', /임신|임산부|출산|산후|갱년기|노인|어르신|할머니|할아버지/],
  ['입술·구순·구내', /입술|구순|구각|입꼬리|구내염|입안/],
  ['가려움 일반', /가려|가렵|간지|소양/],
  ['기타 피부', /./],
];
const tag = (list, k) => { for (const [n, r] of list) if (r.test(k)) return n; return null; };

const out = [];
for (const d of rows.values()) {
  const k = norm(d.k);
  if (!SKIN.test(k)) continue;
  // 고통·괴로움 축: 은밀부위, 가려움, 고통 표현 중 하나는 있어야 한다
  if (!(PART.test(k) || SUFFER.test(k) || /가려|가렵|간지|소양/.test(k))) continue;
  const ac = acSurf.has(k);
  const lt = d.pcLt && d.moLt;
  if (lt && !ac) continue; // 생성·연관 출신의 <10 은 실재 불명
  const vol = d.pc + d.mo;
  const po = PART.test(k) ? tag(PART_OTHER, k) : null;
  const ex = why(k) || tag(EXCL, k) || (po && po.startsWith('타과') ? po : null);
  const hold = ex ? null : (po || tag(HOLD, k) || (PART.test(k) && /포진/.test(k) ? '보류:성매개' : null) || (PRODUCT.test(k) ? '낮음:제품어' : null));
  const r = reg[k];
  out.push({ k, vol, lt, ac, comp: d.comp, fam: tag(FAM, k), ex, hold, reg: !!r, on: !!(r && r.on) });
}
out.sort((a, b) => b.vol - a.vol);
fs.writeFileSync(path.join(DIR, '_final.json'), JSON.stringify(out));

const ok = out.filter(r => !r.ex);
const unreg = ok.filter(r => !r.reg), regOff = ok.filter(r => r.reg && !r.on);
const s = a => a.reduce((x, r) => x + r.vol, 0);
console.log('판정 대상', out.length, '| 제외', out.length - ok.length, '| 진료범위', ok.length);
console.log('  등록·켜짐', ok.filter(r => r.on).length, '| 등록·꺼짐', regOff.length, '(월', s(regOff), ') | 미등록', unreg.length, '(월', s(unreg), ')');
console.log('  미등록 중 즉시가능', unreg.filter(r => !r.hold).length, '(월', s(unreg.filter(r => !r.hold)), ') | 보류', unreg.filter(r => r.hold).length, '(월', s(unreg.filter(r => r.hold)), ')');
const ex = {}; for (const r of out) if (r.ex) { ex[r.ex] = ex[r.ex] || [0, 0]; ex[r.ex][0]++; ex[r.ex][1] += r.vol; }
console.log('제외 사유', JSON.stringify(ex));
const fam = {}; for (const r of unreg.filter(r => !r.hold)) { fam[r.fam] = fam[r.fam] || { n: 0, v: 0, real: 0 }; fam[r.fam].n++; fam[r.fam].v += r.vol; if (!r.lt) fam[r.fam].real++; }
console.log('미등록·즉시가능 축별', JSON.stringify(fam));
const csv = ['키워드,월검색량,10미만,자동완성출신,경쟁,축,보류,등록,켜짐'].concat(
  ok.filter(r => !r.on).map(r => [r.k, r.vol, r.lt ? 'Y' : '', r.ac ? 'Y' : '', r.comp, r.fam, r.hold || '', r.reg ? 'Y' : '', r.on ? 'Y' : ''].join(',')));
fs.writeFileSync(path.join(DIR, '미등록_후보.csv'), '﻿' + csv.join('\n'));
