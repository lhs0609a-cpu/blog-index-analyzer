const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260917');
const arr=JSON.parse(fs.readFileSync(path.join(D,'by_keyword.json')));
const live=arr.filter(x=>x.on>0);
// 내원 의도 신호 (구조 판정)
const INST=/(병원|한의원|의원|클리닉|크리닉|센터|전문의|진료|닥터)/;
const PICK=/(추천|유명한곳|잘하는곳|잘하는|어디가좋|어디로|후기|비교|순위|best|베스트|1위)/i;
const COST=/(비용|가격|얼마|금액|실비|보험|환급|급여|비급여|할인|이벤트)/;
const ACT=/(예약|상담|문의|검사|진단|치료|처방|주사|시술)/;
const INFO=/(방법|이유|원인|증상|나이|평균|시기|계산|계산기|표|운동|스트레칭|음식|식단|영양제|영양|추천음식|효과|좋은|뜻|의미|자세|자는법|몇살|언제|얼마나|차이|종류|후유증|부작용|디시|나무위키|무료|앱|사이트)/;
function tier(kw){
  const inst=INST.test(kw),pick=PICK.test(kw),cost=COST.test(kw),act=ACT.test(kw);
  if(cost&&(inst||act)) return 'A1_비용실비';
  if(pick&&(inst||act)) return 'A2_병원선택';
  if(inst) return 'A3_기관어';
  if(cost) return 'B1_비용단독';
  if(pick) return 'B2_선택단독';
  if(act) return 'B3_행위어';
  if(INFO.test(kw)) return 'D_정보성';
  return 'C_일반';
}
const out=live.map(x=>({...x,t:tier(x.kw)}));
const h={};for(const x of out)h[x.t]=(h[x.t]||0)+1;
console.log('live',live.length);console.log(JSON.stringify(h,null,1));
const A=out.filter(x=>x.t[0]==='A');
console.log('A total',A.length,'A imp=0',A.filter(x=>x.imp===0).length,'A imp>0',A.filter(x=>x.imp>0).length);
fs.writeFileSync(path.join(D,'live_tiered.json'),JSON.stringify(out));
