// Operational priority; never a diagnosis, actual suffering measurement, or visit probability.
function policy(keyword,e,legacy=false){
 const k=keyword.replace(/\s/g,'');const protected5=e.pc5_protected||legacy;
 const direct=/예약|문의|상담|방문|검사비용|검사가격|클리닉비용|클리닉가격/.test(k);
 const strongConcern=/안커|안크|안자라|성장멈|멈춘키|또래보다|너무작|키가작|저신장|성장부진|성장지연|왜소증|초경후|생리후|성장판닫/.test(k)&&!/평균|계산|표준|방법|운동|음식|시기|몇살/.test(k);
 if(protected5)return {tier:'P_지역PC5보호',urgency:'지역 기관 탐색',floor:300,cap:100000,estimate:true,reason:'기존 지역 PC5 관리 또는 지역+성장클리닉; 최신 PC5 추정가에 5% 여유, 플랫폼 기본입찰 상한 내 적용',protected5:true};
 if(e.category==='A')return {tier:'A_브랜드',urgency:direct?'직접 상담·예약':'브랜드 지정·비교',floor:300,cap:3000,estimate:true,reason:'브랜드 지정 검색 우선; 필요한 노출가격으로 입찰하고 PC 기준 3천원 상한',protected5:false};
 if(e.category==='B')return {tier:'B_생활권상담',urgency:direct?'직접 상담·예약':'생활권 기관 탐색',floor:500,cap:direct?9000:7000,estimate:true,reason:'생활권 상담·검사 수요 우선; 명시적 행동 의도에 더 높은 허용 입찰',protected5:false};
 if(e.category==='C')return {tier:'C_일반상담',urgency:direct?'직접 상담·예약':'기관·검사 탐색',floor:300,cap:direct?6000:4000,estimate:true,reason:'서비스 탐색 의도는 있으나 내원 생활권 미확정; 생활권 핵심보다 제한',protected5:false};
 if(e.category==='D')return {tier:strongConcern?'D1_구체적성장고민':'D2_일반성장고민',urgency:strongConcern?'구체적 성장 고민':'일반 성장 고민',floor:strongConcern?300:150,cap:strongConcern?1500:500,estimate:true,reason:'성장 정체·작은 키 등 구체적 고민은 일반 정보보다 높게; 예약과 동일한 의도로 간주하지 않음',protected5:false};
 const category=e.category;
 const cap=category==='E'?(e.confidence==='낮음'?70:150):category==='F'?150:category==='H'?100:70;
 return {tier:{E:'E_정보성',F:'F_원거리',G:'G_제품',H:'H_서비스확인',I:'I_목적불일치',J:'J_의미확인'}[category]||'J_의미확인',urgency:'내원 행동 약함 또는 서비스 미확인',floor:70,cap,estimate:false,reason:'정보·제품·원거리·서비스 불일치 또는 불명확 검색은 낮은 입찰로 제한',protected5:false};
}
function calculate(p,estimate,weight){
 if(!Number.isFinite(weight)||weight<=0)throw Error('Invalid PC weight');
 if(p.estimate&&(!Number.isFinite(estimate)||estimate<=0))throw Error('Missing positive estimate');
 const requested=p.estimate?Math.max(p.floor,estimate*1.05):p.cap;
 const pcTarget=Math.min(p.cap,requested);
 const bid=Math.max(70,Math.min(100000,Math.ceil(pcTarget*100/weight/10)*10));
 const effective=Math.round(bid*weight/100);
 return {bid,effective,pcTarget:Math.round(pcTarget),estimateCapped:p.estimate&&effective+1<estimate*1.05,platformCapped:bid===100000&&effective+1<pcTarget};
}
module.exports={policy,calculate};
