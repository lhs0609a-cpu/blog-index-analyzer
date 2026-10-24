// _painx_harvest.js 결과 판정: 통증+피부 → 진료범위 → 실재 확인 → 등록 여부 → 통증 축.
// 사용자 지시(2026-09-11): 검색량 20 미만도 상관없다 → <10 도 넣되, 실재가 확인된 것만.
//   실재 = 실볼륨 10+ | 자동완성 표면 | keywordstool 이 '연관어'로 돌려준 것(내가 넣은 힌트 문자열의 되돌림이 아닌 것).
// 산출물 reports/sojam-20260911/painx/_final.json, 통증_후보.csv
const fs = require('fs'), path = require('path');
const { why } = require('./_sojam_d0828_rule');
const { PAIN, SKIN, norm } = require('./_painx_harvest');
const DIR = path.join(__dirname, '../reports/sojam-20260911/painx');
const rd = f => fs.existsSync(path.join(DIR, f)) ? fs.readFileSync(path.join(DIR, f), 'utf8') : '';

const rows = new Map();
for (const f of ['kt.jsonl', 'vol.jsonl']) for (const l of rd(f).split('\n')) if (l.trim()) { const d = JSON.parse(l); if (!rows.has(d.k)) rows.set(d.k, d); }
const ac = new Set(Object.keys(JSON.parse(rd('ac_found.json') || '{}')).map(norm));
const hints = new Set([...rd('kt_seeds.txt').split('\n'), ...rd('vol_hints.txt').split('\n')].filter(Boolean));
const reg = JSON.parse(rd('_reg_set.json'));

// 통증 판정(넓게): 엄격 PAIN + 갈라짐·찢어짐·까짐·벗겨짐 같은 '상처성 통증' 표현
const PAINX = new RegExp(PAIN.source + '|갈라|찢어|까짐|까졌|벗겨|터짐|터졌|짓무');

const EXCL = [
  ['대상포진', /대상포진|포진후신경통|포진후통증/],
  ['종기·낭종', /종기|절종|옹종|낭종|지방종|농양|멍울/],
  ['사마귀', /사마귀/], ['홍조', /홍조|주사비|딸기코/], ['검사·진단', /검사|(?<!공)진단/], ['여드름', /여드름|드름/],
  // 비피부 통증 — 부위는 피부 부위라도 원인이 근골격·신경·내장이면 뺀다
  ['비피부 통증', /^목헐|목이헐|근육|관절|인대|힘줄|건초염|골절|뼈|디스크|허리|어깨|무릎통증|손목|방아쇠|터널증후군|족저근막|통풍|류마티스|섬유근육통|복합부위|CRPS|두통|편두통|치통|치아|잇몸|사랑니|충치|생리통|복통|배아|위염|위궤양|십이지장|장염|궤양성대장염|대장|식도|편도|인후|목구멍|목감기|기침|요로|방광|전립선|부고환|고환염|음낭수종|정계정맥|혈전|하지정맥|협심|심장|폐|간암|암$|암통증|항암|골반|좌골|꼬리뼈통증|손저림|발저림|수근관|중이염|외이도염|눈통증|결막|안구|각막|다래끼/],
  ['타과(항문·산부인과 외과)', /치질|치핵|치열|치루|탈항|항문외과|항문출혈|혈변|변비|젖몸살|유선염|유방|모유수유|제왕절개|자궁|난소|(?<!칸디다)질염|내성발톱|발톱무좀수술|티눈제거/],
  ['미용·시술', /레이저|제모|왁싱|필러|보톡스|문신|타투|피어싱|성형|시술|박피|필링|MTS|리프팅/],
  ['반려동물', /강아지|고양이|반려|애견|댕댕|강쥐/],
  // '꿈' 은 발뒤'꿈'치를 먹는다(회귀 점검에서 발뒤꿈치갈라짐 등 켜진 어 7개가 잘렸다) — 뒤/뒷 앞은 제외
  ['잡음', /(?<![뒤뒷])꿈|뜻$|노래|가사|웹툰|드라마|영화|게임|간지럼|확인서|소견서/],
];
const PRODUCT = /크림|로션|바디워시|샴푸|비누|세정제|청결제|파우더|패치|패드|스프레이|밴드|에센스|오일|미스트|쿠팡|올리브영|다이소|추천템|립밤|영양제/;
const HOLD = [
  ['보류:성매개', /곤지름|성병|매독|임질|클라미디아|성기헤르페스|생식기헤르페스|생식기포진|음부포진|성기포진|인유두종|HPV/],
  ['보류:봉와직염', /봉와직염|단독|괴사성/],
  ['경계:화상·동상·욕창', /화상|동상|욕창|괴사|타서벗겨|타서껍질|햇볕에타/],
  ['경계:신발 마찰', /운동화|신발|구두|새신발|뒤꿈치까짐/],
  ['경계:약물부작용 통증', /마운자로|위고비|삭센다|젭바운드|항암/],
  ['경계:조갑주위염', /조갑주위염|손톱주위염|발톱주위염|생인손/],
  ['경계:일반 상처', /(?<!피부)상처(?!.*(진물|습진|아토피))|찰과상|베인|긁힌|넘어져/],
  ['경계:당뇨발·혈관', /당뇨발|당뇨병성|괴저/],
];
const FAM = [
  ['한포진·물집', /한포진|물집|수포|터짐|터졌|터져/],
  ['갈라짐·찢어짐', /갈라|찢어|트임|트고|까짐|까졌|벗겨|거스러미|뒤꿈치/],
  ['탈스·스테로이드', /탈스|스테로이드|리바운드/],
  ['진물·짓무름', /진물|짓무|간찰|기저귀/],
  ['구강·입술 통증', /입안|혀|혓바늘|설염|구내염|아프타|베체트|입술|입꼬리|구순|구각|편평태선|구강/],
  ['은밀부위 통증', /사타구니|음부|외음부|질입구|회음|항문|똥꼬|엉덩이|겨드랑|유두|가슴밑|고환|음낭|귀두|포피|음경|생식기|소변|배변|대변/],
  ['무좀·백선 통증', /무좀|백선|완선|칸디다|곰팡이|진균/],
  ['모낭염·한선염 통증', /모낭염|한선염|화농/],
  ['자가면역·수포성', /천포창|루푸스|혈관염|피부근염|쇼그렌|결절성홍반|경화태선|태선/],
  ['이질통·감각이상', /이질통|통각|감각이상|이상감각|저림|저려|찌릿|전기|스치|닿으면|닿기만|바람만|옷만|신경통/],
  ['작열·화끈·따가움', /작열|화끈|타는|불타|따가|따갑|따끔|쓰라|쓰림|쓰려|쓰리/],
  ['헐음·궤양', /헐|궤양/],
  ['기타 피부 통증', /./],
];
const tag = (list, k) => { for (const [n, r] of list) if (r.test(k)) return n; return null; };

// SKIN 은 부위명(고환·엉덩이·뒤꿈치·혀)도 맥락으로 받아서 '고환이아파요'·'발뒤꿈치가아파요'(족저근막)·'앉을때엉덩이통증' 이 통과한다.
// 피부 증상어가 없으면: 작열·따가움·헐음은 피부/점막 증상으로 보고 살리고, 그냥 아픔·찌릿·욱신은 타과 가능성이 커서 경계로 뺀다.
const SKINSYM = /피부|살갗|물집|수포|진물|짓무|갈라|트임|트고|각질|발진|습진|아토피|한포진|탈스|스테로이드|지루|모낭염|한선염|화농|구내염|구순염|구각|혓바늘|설염|아프타|베체트|태선|천포창|포진|헤르페스|칸디다|간찰|기저귀|땀띠|무좀|백선|완선|조갑|거스러미|농가진|옴|벌레물|물린|화상|햇빛|일광|동상|욕창|봉와직염|루푸스|혈관염|피부근염|쇼그렌|결절성|양진|헐|궤양|가려|가렵|간지|소양|상처|딱지|곰팡이|진균|찢어|까짐|까졌|벗겨|터짐|터졌/;
const SURFACE_PAIN = /따가|따갑|따끔|화끈|쓰라|쓰림|쓰려|쓰리|작열/;
const partOnly = k => SKINSYM.test(k) || SURFACE_PAIN.test(k) ? null : '경계:부위통증(타과 가능)';

const out = [];
for (const d of rows.values()) {
  const k = norm(d.k);
  if (!PAINX.test(k) || !SKIN.test(k)) continue;
  const lt = d.pcLt && d.moLt;
  const inAc = ac.has(k), echoed = hints.has(k);
  const real = !lt || inAc || !echoed;
  if (!real) continue; // 내가 만든 힌트가 <10 으로 되돌아온 것 = 실재 불명
  const ex = why(k) || tag(EXCL, k);
  const hold = ex ? null : (tag(HOLD, k) || partOnly(k) || (PRODUCT.test(k) ? '낮음:제품어' : null));
  const r = reg[k];
  out.push({ k, vol: d.pc + d.mo, lt, ac: inAc, comp: d.comp, fam: tag(FAM, k), ex, hold, reg: !!r, on: !!(r && r.on) });
}
out.sort((a, b) => b.vol - a.vol || a.k.localeCompare(b.k));
fs.writeFileSync(path.join(DIR, '_final.json'), JSON.stringify(out));

const ok = out.filter(r => !r.ex), un = ok.filter(r => !r.reg), now = un.filter(r => !r.hold), off = ok.filter(r => r.reg && !r.on);
const S = a => a.reduce((x, r) => x + r.vol, 0);
console.log('판정', out.length, '| 제외', out.length - ok.length, '| 진료범위', ok.length, '(등록·켜짐', ok.filter(r => r.on).length, '/ 등록·꺼짐', off.length, '월', S(off), ')');
console.log('미등록', un.length, '월', S(un), '| 즉시가능', now.length, '(10+', now.filter(r => !r.lt).length, '월', S(now), '/ <10', now.filter(r => r.lt).length, ') | 보류', un.length - now.length);
const ex = {}; for (const r of out) if (r.ex) { ex[r.ex] = ex[r.ex] || [0, 0]; ex[r.ex][0]++; ex[r.ex][1] += r.vol; }
console.log('제외', JSON.stringify(ex));
const hd = {}; for (const r of un) if (r.hold) { hd[r.hold] = hd[r.hold] || [0, 0]; hd[r.hold][0]++; hd[r.hold][1] += r.vol; }
console.log('보류', JSON.stringify(hd));
const fm = {}; for (const r of now) { fm[r.fam] = fm[r.fam] || { n: 0, lt: 0, v: 0 }; fm[r.fam].n++; if (r.lt) fm[r.fam].lt++; fm[r.fam].v += r.vol; }
console.log('즉시가능 축별', JSON.stringify(fm));
const csv = ['키워드,월검색량,10미만,자동완성,경쟁,축,제외,보류,등록,켜짐'].concat(out.filter(r => !r.on).map(r => [r.k, r.vol, r.lt ? 'Y' : '', r.ac ? 'Y' : '', r.comp, r.fam, r.ex || '', r.hold || '', r.reg ? 'Y' : '', ''].join(',')));
fs.writeFileSync(path.join(DIR, '통증_후보.csv'), '﻿' + csv.join('\n'));
