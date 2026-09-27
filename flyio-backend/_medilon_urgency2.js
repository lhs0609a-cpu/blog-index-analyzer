// 긴급도 v2 — 시장이 반증했다. '개원자금대출신청' 류 격자 조합은 추정가 90%가 70원(경쟁 0, 수요 0)이고,
// 실제로 돈이 걸린 건 '요양원매매 26,070원' 같은 개원·인수 축이다. 자금수요 확정 상태를 직접성으로 인정한다.
const fs=require('fs');const D='reports/medilon_20260921/';
const kw=JSON.parse(fs.readFileSync(D+'kwclass.json','utf8'));
const est=JSON.parse(fs.readFileSync(D+'estimates.json','utf8'));
const vol=JSON.parse(fs.readFileSync(D+'volumes.json','utf8'));
const n=v=>v==='< 10'?5:(+v||0);
const MED=/^A_|^B_/;

function directness(k,med){
  if(/급전|당일대출|즉시대출|바로대출|일수|사금융|대부업/.test(k))return 3.5;
  if(/대출|마이너스통장|마통|대환|담보|신용대출|캐피탈|저축은행|닥터론|메디컬론|메디칼론|론(비교|금리|한도|후기|추천|신청|조건|상담|자격|심사|순위|지원|절차|서류|승인|저금리)?$/.test(k))return 3;
  // 개원·인수·매매·권리금은 자금수요가 이미 확정된 상태다 (금융어가 없어도)
  if(med&&/개원|개국|인수|양수|양도|승계|권리금|매매|분원|증축|신축|개설|창업|폐업/.test(k))return 2.6;
  if(/개원자금|인수자금|권리금|도입자금|운영자금|시설자금|창업자금|운전자금|긴급자금|사업자금|자금조달|융자/.test(k))return 2.2;
  if(/정책자금|신용보증|기술보증|보증재단|보증기금|진흥공단|경영안정|버팀목|재도전|희망리턴/.test(k))return 1;
  if(/지원금|보조금|손실보전|재난지원|바우처|출연금/.test(k))return 0.3;
  return 0.5;
}
function imminence(k){
  let s=0.6;
  if(/후기|추천|순위|비교|뜻|종류|정보/.test(k))s=Math.max(s,0.8);
  if(/금리비교|저금리|금리|한도$|한도[^조]|조건|비용|계산|얼마|산정|가격/.test(k))s=Math.max(s,1.4);
  if(/한도조회|신청방법|신청서|신청|서류|승인|심사|상담|자격|접수|문의|방법|절차/.test(k))s=Math.max(s,2.2);
  if(/개원|개국|인수|양수|양도|승계|권리금|매매|개설|분원|증축|신축|폐업/.test(k))s=Math.max(s,2.8);
  if(/거절|한도초과|부결|연체|채무|회생|파산|신불자|저신용|무직자|추가대출/.test(k))s=Math.max(s,3.2);
  if(/급전|당일|즉시|바로|오늘|긴급|빨리|비상금/.test(k))s=Math.max(s,3.5);
  return s;
}
const out=kw.map(r=>{
  if(r.cat==='T0_제휴PG'||r.cat==='D_무관')return {...r,u:null,tier:null,demand:0,est1:0,v:0};
  const med=MED.test(r.cat);
  const score=directness(r.kw,med)*imminence(r.kw)*(med?1:0.55);
  const e1=Math.max(est['PC|1|'+r.kw]||0,est['MOBILE|1|'+r.kw]||0);
  const e3=Math.max(est['PC|3|'+r.kw]||0,est['MOBILE|3|'+r.kw]||0);
  const vv=vol[r.kw.toUpperCase()]||vol[r.kw]||{};
  const v=n(vv.pc)+n(vv.mo);
  // 실수요: 경쟁 입찰가가 바닥(70원)을 넘거나, 월 검색량이 잡히는 것
  const demand=(e1>70?1:0)+(v>=10?1:0);
  let tier;
  if(score>=8)tier='U5';else if(score>=6)tier='U4';else if(score>=4)tier='U3';
  else if(score>=2.2)tier='U2';else if(score>=1)tier='U1';else tier='U0';
  return {...r,u:+score.toFixed(2),tier,demand,est1:e1,est3:e3,v};
});
fs.writeFileSync(D+'kwurg.json',JSON.stringify(out));
const a={};for(const r of out){if(!r.tier)continue;const k=r.tier+' '+(MED.test(r.cat)?'의료':'비의료')+' '+(r.demand?'실수요':'무수요');a[k]=(a[k]||0)+1;}
console.log('긴급도 × 축 × 실수요');
for(const [k,v] of Object.entries(a).sort())console.log('  '+k.padEnd(22)+String(v).padStart(7));
const real=out.filter(r=>r.tier&&r.demand>0&&MED.test(r.cat)).sort((x,y)=>y.u-x.u||y.v-x.v);
console.log('\n의료축 실수요 키워드',real.length,'개 — 긴급도 상위 45');
for(const r of real.slice(0,45))
  console.log('  '+r.tier,String(r.u).padStart(5),'월'+String(r.v).padStart(5),'1위'+String(r.est1).padStart(6),'3위'+String(r.est3).padStart(6),(r.lock?'OFF':'ON ')," ",r.kw);
