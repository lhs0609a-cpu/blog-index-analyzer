// Auditable qualitative rubric. Scores are NOT observed visit probabilities.
const fs=require('fs'),path=require('path');
const mappings={
 강남:{core:'강남 역삼 대치 도곡 선릉 한티 개포 압구정 청담 삼성동',adjacent:'수서 일원',broad:''},
 잠실:{core:'잠실 송파 삼전 석촌 방이 가락 문정',adjacent:'강동 천호 암사 둔촌 길동',broad:''},
 목동:{core:'목동 양천 신정 신월 오목교',adjacent:'강서 화곡 등촌 마곡 발산 방화 가양 염창',broad:''},
 반포:{core:'반포 서초 잠원 방배 교대 고속터미널',adjacent:'양재 사당 동작',broad:''},
 성북:{core:'성북 길음 돈암 정릉 종암 월곡 보문 성신여대',adjacent:'노원 도봉 강북 중계 공릉 하계 월계 미아 수유',broad:''},
 마포:{core:'마포 홍대 합정 상수 공덕 신촌 연남 망원 아현 대흥',adjacent:'서대문 은평 구파발 불광 응암 홍제',broad:''},
 분당:{core:'분당 수내 서현 판교 야탑 미금 이매 성남정자',adjacent:'수정구 중원구',broad:'성남'},
 일산:{core:'일산 주엽 정발산 대화 마두 백석',adjacent:'운정 파주 덕양 삼송 화정',broad:'고양'},
 부천:{core:'부천 신중동 춘의 원미 소사 송내',adjacent:'부평 부개 계양',broad:''},
 수원:{core:'수원 영통 매탄 인계 권선 장안 팔달 광교 호매실',adjacent:'동탄 병점',broad:'화성 오산'},
 평촌:{core:'평촌 안양 동안 범계 호계 비산 관양 인덕원',adjacent:'군포 산본 의왕 만안',broad:''},
 평택:{core:'평택 비전동 소사벌 송탄 지제 평택고덕',adjacent:'안성',broad:''},
 수지:{core:'용인수지 수지 풍덕천 죽전 성복 신봉 동천 상현',adjacent:'기흥 구성 보정 처인',broad:'용인'},
 송도:{core:'송도 연수구 인천연수',adjacent:'남동구 구월동 미추홀 주안 인천논현',broad:'인천 청라 검단'},
 대구:{core:'수성구 수성 범어 만촌 황금 대구',adjacent:'달서 달성 동성로 경산',broad:''},
 부산:{core:'부산 동래 수안 명륜 사직 안락 온천 미남',adjacent:'해운대 연산 연제 금정 서면 센텀 사상',broad:'양산'},
 창원:{core:'창원 성산 상남 의창',adjacent:'마산 진해 장유 김해 율하 진영',broad:''},
};
const AMBIG=new Set('중동 상동 정자 고덕 동백 논현 논현동 삼성 중구 서구 동구 남구 북구 금정 장안 구성 동천 비산 중앙동 연수'.split(' '));
const REMOTE='대전 광주 울산 세종 충북 충남 충청 전북 전남 전라 강원 제주 서귀포 청주 천안 아산 원주 춘천 강릉 속초 익산 군산 목포 여수 순천 전주 포항 경주 진주 거제 통영 김천 구미 안동 영주 영천 김제 논산 정읍 상주 삼척 이천 칠곡 밀양 함안 광양 상록 동해 문경 사하 사천 단원 홍천 담양 여주 가평 양평 의성 영덕 영동 보령 당진 태안 서천 홍성 예산 계룡 청양 정선 철원 인제 고성 양양 완주 나주 무안 해남 영암 장성 순창 남원 거창 합천 남해 하동 진천 증평 음성 옥천 창녕 공주 연천 고흥 강진 곡성 고창 구례 금산 단양 장흥 태백 화순 고령 동두천 포천 의정부 양주 옥정 안산 시흥 하남 남양주 김포 구리 다산 미사 별내 과천 광명 금천 구로 영등포 용산 성동 광진 중랑 종로 왕십리 이태원 건대 성수'.split(' ');
const tokens=[];for(const [branch,m] of Object.entries(mappings))for(const [zone,s] of Object.entries(m))for(const token of s.split(' ').filter(Boolean))tokens.push({token,branch,zone});
for(const token of REMOTE)if(!tokens.some(x=>x.token===token))tokens.push({token,branch:'',zone:/^(구로|금천|영등포|용산|성동|광진|중랑|종로|왕십리|이태원|건대|성수|과천|광명|김포|구리|다산|미사|별내|하남|남양주|시흥|안산|의정부|양주|옥정)$/.test(token)?'unmapped_near':'remote'});
for(const token of AMBIG)if(!tokens.some(x=>x.token===token))tokens.push({token,branch:'',zone:'ambiguous'});
tokens.push({token:'서울',branch:'',zone:'broad_multi'},{token:'경기',branch:'',zone:'broad_multi'},{token:'수도권',branch:'',zone:'broad_multi'},{token:'하노이',branch:'하노이',zone:'overseas'},{token:'베트남',branch:'하노이',zone:'overseas'});
tokens.sort((a,b)=>b.token.length-a.token.length);
function geo(k){
 if(/^(?:키네스)?광주/.test(k)&&!/^광주광역시/.test(k))return {zone:'ambiguous',branch:'',token:'광주',confidence:'경기 광주/광주광역시 동명이 확인 필요'};
 const variants=[k,k.replace(/^키네스(?:가격|비용|후기|상담|예약)?/,''),k.replace(/^(서울특별시|서울시|서울|경기도|경기|부산광역시|부산|대구광역시|대구|인천광역시|인천|경상남도|경남)/,'')];
 let hits=tokens.filter(x=>variants.some(v=>v.startsWith(x.token))||k.endsWith(x.token)||k.includes('키네스'+x.token)||k.includes('키네스비용'+x.token)||k.includes('키네스가격'+x.token));
 if(!hits.length)return {zone:'none',branch:'',token:'',confidence:'지역정보 없음'};
 const chosen=hits[0];
 // Repeated place names are not assigned to a branch without a disambiguating prefix.
 if(AMBIG.has(chosen.token)&&!new RegExp('^(서울|경기|부산|대구|인천|성남|분당|수원|평택|강동|용인|부천)').test(k))return {zone:'ambiguous',branch:'',token:chosen.token,confidence:'동명이 지역 확인 필요'};
 if(chosen.token==='고덕'&&/^강동|서울강동/.test(k))return {zone:'adjacent',branch:'잠실',token:'강동고덕',confidence:'생활권 가설'};
 if(chosen.token==='논현동'&&/^인천/.test(k))return {zone:'adjacent',branch:'송도',token:'인천논현동',confidence:'생활권 가설'};
 if(chosen.token==='논현'&&/^서울|강남/.test(k))return {zone:'adjacent',branch:'강남',token:'강남논현',confidence:'생활권 가설'};
 return {...chosen,confidence:chosen.zone==='core'?'지점 소재지·생활권 가설':chosen.zone==='remote'?'공식 지점 없는 지역':chosen.zone==='adjacent'?'인접 생활권 가설':'세부 생활권 확인 필요'};
}
const RX={
 child:/어린이|청소년|초등|중학생|고등학생|남아|여아|아동|소아|우리(?:아이|아들|딸)|자녀|아이키|성장기|사춘기|초경|생리후|중[123]|고[123]|초[1-6]|(?:[6-9]|1[0-8])(?:세|살)/,
 adult:/성인|어른|군대|군인|전역|20대|30대|40대|50대|(?:2[0-9]|[3-9][0-9])(?:세|살)|직장인|대학생|남편|아내/,
 core:/키성장|키크(?:는|기|고|려|게)|키가(?:안|작|크)|작은키|키작은|성장클리닉|성장센터|성장센타|성장정밀|성장검사|성장판|키성장센터|성장상담|성장부진|성장지연|저신장|왜소증|성장장애|예측키|예상키|골연령|뼈나이|최종키|키유전|아이키|초등학생키|중학생키|고등학생키|남아키|여아키|사춘기키|성장도|신장검사|키검사|키상담|성장예측/,
 adjunct:/성조숙|성숙지연|초경|소아비만|어린이비만|청소년비만|아동비만|(?:어린이|청소년|아동|초등학생)(?:자세|체형|척추)|성장기비만/,
 posture:/자세교정|체형교정|척추측만|거북목|일자목|굽은등|휜다리/,
 medical:/주사|호르몬|한의원|한방|한약|보약|녹용|대학병원|정형외과|내분비|성조숙증치료|엑스레이|xray|x레이|골연령|뼈나이|실비|보험|급여|도수치료|수술|치료제/,
 competitors:/함소아|톨앤핏|키넥스|서정한의|고시환|아주대|고려대|연세대|세브란스|서울아산|아산병원|서울대병원|삼성서울|차병원|아이누리|하이키|아이조아|아이엔여기|키움한의/,
 goods:/영양제|유산균|비타민|칼슘|홍삼|초유|아연|오메가|마그네슘|철분제|건기식|건강기능|단백질보충|프로틴|우유|두유|분유|젤리|구미젤리|한우|고기|요거트|요구르트|치즈|분말|알약|캡슐|쑥쑥드림|아이커|아이클타임|아이키커|키즈텐|키움정|종근당|닥터키즈|뉴트리|텐텐|하이업|키올리|아이클|키움플러스|키움성장|키성장기계|성장판자극기|성장판마사지|키크는기구|키성장기구|키크는운동기구/,
 junk:/금시세|폐초경|텅스텐|구리시세|주식|주가|채용|구인|구직|알바|취업|연봉|창업|가맹|프랜차이즈|사업계획|의료대출|강아지|고양이|반려|동물|식물|화분|캐릭터|게임|웹툰|일러스트|영어로|뜻$|번역|키네스타시스|키네스테틱|키높이|깔창|키수술|사지연장|교복|필통|가방|장난감|학용품|문제집|학습지|전집|카시트|유모차|어린이집|유치원|태권도|수영장|스키|놀이방|놀이터|공예|주일|사진|촬영|도서|독서|옷|셔츠|바지|원피스|패션|신발|운동화|코디|선물|생일|리조트|호텔|펜션|숙소|여행|캠핑|브라|속옷|브래지어/,
 otherHealth:/암클리닉|당뇨|고혈압|치매|폐렴|백일해|중이염|축농증|알레르기|아토피|비염|틱장애|adhd|언어치료|언어발달|발달검사|발달평가|발달지연|놀이치료|심리상담|우울|불안|공황|디스크|관절염|통풍|족저근막|도수|피부과|여드름|사마귀|탈모|피부염|아토피|모낭|홍조|다한증|건선|면역력|총명|집중력|학습능력|편식|식욕부진|밥안먹|저체중아|저체중|성장통|평발|무지외반|구루병|골다공/,
 service:/클리닉|센터|센타|상담|예약|체험|검사|검진|프로그램|관리센터|관리실|성장관리|키관리|병원|의원|전문점/,
 transaction:/상담|예약|문의|전화|연락처|체험|신청|방문|접수|진료시간|영업시간|운영시간|위치|찾아가는|가는길|주차/,
 compare:/비용|가격|후기|추천|비교|잘하는|전문|유명|명의|잘보는|어디|좋은곳|가격표|얼마|리뷰/,
 info:/평균키|평균|표준|성장표|백분위|계산|키재는|키재기|측정기|그래프|통계|논문|자료|원리|뜻|방법|하는법|크는법|키크기운동|운동법|스트레칭|줄넘기|식단|음식|수면|잠자|몇시|자가|집에서|마사지|증상|원인|시기|나이|몇살|몇세|몇학년|효과|기간|언제|얼마나|차이|정상|유전|예상키|예측키|유튜브|방송|살림남|살림하는|맘카페/,
 concern:/안크|안커|안자라|성장멈|멈춘키|또래보다|너무작|작은아이|키작은아이|키가작|저신장|성장부진|성장지연|왜소증|생리후|초경후|초경이른|성조숙|사춘기키|성장판닫|급성장|성장속도/,
};
const CATEGORIES={A:'브랜드 문의·비교',B:'생활권 내원 핵심',C:'일반 상담·검사 탐색',D:'성장 고민·증상 탐색',E:'정보성 탐색',F:'원거리 상담 탐색',G:'제품·구매 목적',H:'의료방식·경쟁기관 확인',I:'무관·대상 불일치',J:'의미·서비스 확인 필요'};
function evaluate(raw){
 const k=raw.replace(/\s/g,'').toLowerCase().replace(/^(?:kiness|zlsptm)$/,'키네스'),g=geo(k),reasons=[],flags=[];
 const child=RX.child.test(k)||/초딩|중딩|고딩|중등|고등생|초등생|중학교|고등학교|남자아이|여자아이|작은아이/.test(k);
 const growthContext=/평균키|표준키|키계산|키예측|미래키|유전키|엄빠키|실키|기직키|현재키|목표키|키클리닉|키센터|키큰|키고민|키작남|키안크|키늘리|키커지|숨은키|성장키|키급성장|키아는법|키180|키170|키160|올바른자세|롱맨|성장호르몬|성장치료|성장관리|성장곡선|성장촉진|성장정체|성장속도|성장발육|성장체조|성장음식|성장법|최종신장|예측신장|키관리/.test(k)||(child&&/키|성장|사춘기|변성기|성징|초경|겨털|겨드랑이털|몽우리|조숙|가슴멍울|평균신장|신장표|표준발육/.test(k))||/(?:아동|어린이|청소년|아이)성장/.test(k);
 const brand=/키네스/.test(k)&&!/키네스타시스|키네스테틱/.test(k),core=RX.core.test(k)||growthContext,adjunct=RX.adjunct.test(k),posture=RX.posture.test(k),adult=RX.adult.test(k),service=RX.service.test(k)||/성장치료/.test(k),transaction=RX.transaction.test(k),compare=RX.compare.test(k),info=RX.info.test(k)||/체조|키계산|미래키|실키|기직키|현재키|엄빠키|성장곡선|성장범위|성장표준|기상직후키/.test(k),concern=RX.concern.test(k)||/키고민|조숙증의심/.test(k),medical=RX.medical.test(k),competitor=RX.competitors.test(k),goods=RX.goods.test(k)||/성장제|성장촉진제|이유식/.test(k),junk=RX.junk.test(k),other=RX.otherHealth.test(k);
 const geographic=g.token!=='';const pc5Protected=geographic&&/(?:키성장|성장)클리닉/.test(k)&&!competitor&&!junk&&!adult;
 let category='J',fit=0,intent=0,geoscore={core:20,adjacent:13,broad:9,broad_multi:7,none:5,remote:0,unmapped_near:4,ambiguous:2,overseas:0}[g.zone]??0,audience=child?10:5,brandScore=brand?5:0,confidence='중간',action='의미 확인 후 제한 테스트';
 if(junk||adult||/축구|인라인|발레|체육교실|유아체육|배드민턴|중국어|육아수업|풀배터리|사회성향상|성장환경진술서|성장발달상황/.test(k)){category='I';reasons.push(adult?'성인 키성장 등 주 대상과 불일치':'물품·취업·수업·일상 등 방문 서비스와 다른 목적');action='내원 캠페인 제외 후보';confidence='높음';}
 else if(goods){category='G';reasons.push('제품·영양제·기구 구매 또는 제품정보 의도');action='내원 예산에서 분리';confidence='높음';}
 else if(competitor||medical||/치료|터너증후군|성장침/.test(k)){category='H';fit=core||adjunct?12:0;intent=transaction?35:compare?30:service?27:info?10:18;reasons.push(competitor?'다른 기관을 지정한 검색':'주사·한방·치료·보험·검사방식 등 제공 서비스 확인 필요');action='서비스·상담기록 확인 전 핵심예산 배정 보류';flags.push('의료서비스 동일성 미확인');}
 else if(brand){const brandCompare=compare||/효과|기간|성공|부작용|안전|실패/.test(k),brandInfo=/평균|표준|계산|원인|운동법|스트레칭|줄넘기|키재기|키재는|백분위|성장표/.test(k);category=brandInfo&&!transaction&&!brandCompare?'E':'A';fit=30;intent=transaction?35:brandCompare?31:category==='E'?8:28;reasons.push(transaction?'키네스 직접 상담·방문 행동':brandCompare?'키네스 이용 여부 비교·검토':category==='E'?'브랜드 포함 정보 검색; 상담과 분리':'키네스 지정 검색');action=category==='A'?'브랜드 예산 우선':'브랜드 정보성 별도 소액 예산';confidence='높음';}
 else if(core||adjunct||(posture&&child)||/작은아이/.test(k)){
  fit=core?30:22;intent=transaction?35:compare&&service?31:service?28:concern?22:compare?20:info?8:16;
  if(service&&(transaction||compare||!info)){
   if(g.zone==='core'||g.zone==='adjacent'){category='B';action='생활권 내원 예산 우선';reasons.push('방문형 서비스 검색과 지점 생활권의 결합');}
   else if(g.zone==='remote'||g.zone==='overseas'){category='F';action='원거리 예산 분리·내원 가능성 확인';reasons.push('상담 의도는 있지만 공식 지점 소재권과 떨어진 지역');}
   else {category='C';action='일반 상담 예산에서 검증';reasons.push('상담·검사 수요, 구체적 내원 생활권은 미확정');}
  }else if(concern&&!/평균|계산|표준|뜻|운동|체조|음식|식단|방법|하는법|원인|통계|유전|시기|몇살|몇세/.test(k)){category='D';action='성장 고민 예산으로 제한 테스트';reasons.push('성장 걱정은 있으나 업체 선택·예약 의도는 약함');}
  else {category='E';intent=info?8:14;action='정보성 별도 소액 예산';reasons.push(info?'정보·방법·원인 탐색 위주':'성장 관련 일반 검색으로 내원 행동은 불명확');}
  if(adjunct&&!core){flags.push('성숙·비만·자세 등 보조 프로그램 적합성 확인');if(category==='B')intent=Math.min(intent,26);}
 }else if(other){category='I';confidence='높음';action='내원 핵심예산 제외 후보';reasons.push('키성장 프로그램과 직접 연결되지 않는 건강·발달 검색');}
 else if(posture){category='J';fit=12;intent=service?20:8;reasons.push('자세 관련이지만 아동 대상·프로그램 적합성이 불명확');flags.push('대상 연령 확인');}
 else {reasons.push('확인된 성장 프로그램·브랜드·방문 의도를 식별하지 못함');confidence='낮음';}
 if(g.zone==='ambiguous'){flags.push('동명이 지역');if(category==='B')category='C';}
 if(g.zone==='unmapped_near'){flags.push('근교 지점 배정 미확정');}
 if(g.zone==='broad_multi'||g.zone==='broad')flags.push('시·광역권만 확인, 실제 이동거리 미측정');
 if(/상담상담|비용비용|추천추천|유명한한|검사검사/.test(k)){flags.push('부자연스러운 반복 조합');confidence='낮음';}
 if(/맘카페|명의|몇살부터|후기좋은|가격저렴/.test(k))flags.push('자동 조합·검색 수요 확인');
 if(/성장판검사/.test(k))flags.push('성장정밀검사와 기대 검사방식 일치 확인');
 if(/성조숙.*검사/.test(k))flags.push('내분비 진단검사와 관리 프로그램의 차이 확인');
 if(/병원|의원/.test(k)&&!medical)flags.push('의료기관 기대와 프로그램 제공 방식 일치 확인');
 if(/성선수지|주숙증|성주숙|읍식|예샹|기직키/.test(k)){flags.push('오타·비표준 표현 및 수요 확인');confidence='낮음';}
 if(/(?:예비)?(?:중[1-3]|고[1-3]|중학생|고등학생|중딩|고딩|중등|고등|1[3-8](?:세|살)).*유아신장/.test(k))flags.push('연령과 유아 표현 상충');
 let score=Math.min(100,fit+intent+geoscore+audience+brandScore);
 if(['G','I'].includes(category))score=0;
 if(category==='J')score=Math.min(score,39);
 if(category==='H')score=Math.min(score,49);
 if(category==='E')score=Math.min(score,45);
 if(category==='D')score=Math.min(score,69);
 if(category==='F')score=Math.min(score,59);
 if(category==='A'&&g.zone==='none')score=Math.max(score,brand&&transaction?90:brand&&compare?86:brand&&info?70:80);
 if(flags.includes('부자연스러운 반복 조합'))score=Math.min(score,35);
 return {keyword:raw,category,category_label:CATEGORIES[category],priority_score:score,score_is_probability:false,service_fit:fit,action_intent:intent,geo_score:geoscore,audience_score:audience,brand_score:brandScore,score_adjustment:score-fit-intent-geoscore-audience-brandScore,geo_zone:g.zone,region:g.token,branch:g.branch,geo_basis:g.confidence,audience:adult?'성인 명시':child?'아동·청소년 명시':'연령 미명시',confidence,reason:reasons.join(' / '),review_flags:flags.join(' / '),recommended_action:action,pc5_protected:pc5Protected};
}
module.exports={evaluate,geo,CATEGORIES,mappings};
