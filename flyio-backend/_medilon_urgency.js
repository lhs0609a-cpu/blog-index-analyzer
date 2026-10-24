// 대출 긴급도 = 대출 직접성 × 자금수요 임박성. 검색량이 아니라 검색자의 상태를 본다.
const fs=require('fs');const D='reports/medilon_20260921/';
const kw=JSON.parse(fs.readFileSync(D+'kwclass.json','utf8'));

function directness(k){
  if(/급전|당일대출|즉시대출|바로대출|일수|사금융|대부업/.test(k))return 3.5;
  if(/대출|마이너스통장|마통|대환|담보|신용대출|캐피탈|저축은행|론(비교|금리|한도|후기|추천|신청|조건|상담|자격|심사|순위|지원|절차|서류|승인|저금리)?$|닥터론|메디컬론|메디칼론/.test(k))return 3;
  if(/개원자금|개국자금|인수자금|권리금|도입자금|운영자금|시설자금|창업자금|운전자금|긴급자금|사업자금|자금조달|융자/.test(k))return 2;
  if(/정책자금|신용보증|기술보증|보증재단|보증기금|진흥공단|경영안정|버팀목|재도전|희망리턴/.test(k))return 1;
  if(/지원금|보조금|손실보전|재난지원|바우처|출연금/.test(k))return 0.3;
  return 0.5;
}
function imminence(k){
  let s=0;
  if(/급전|당일|즉시|바로|오늘|긴급|빨리|소액급전|비상금/.test(k))s=Math.max(s,3);
  if(/거절|한도초과|부결|막힌|안되는|어려운|연체|채무|회생|파산|신불자|저신용|무직자|한도없|추가대출/.test(k))s=Math.max(s,3);
  if(/개원|개국|인수|양수|양도|승계|권리금|매매|개설|분원|증축|신축|이전|확장|폐업/.test(k))s=Math.max(s,2.7);
  if(/한도조회|신청방법|신청서|신청|서류|승인|심사|상담|자격|접수|문의/.test(k))s=Math.max(s,2);
  if(/금리비교|저금리|금리|한도|조건|비용|계산|얼마|산정/.test(k))s=Math.max(s,1.2);
  if(/후기|추천|순위|비교|뜻|종류|방법|절차|지원$|정보/.test(k))s=Math.max(s,0.6);
  return s||0.6;
}
const MEDCAT=/^A_|^B_/;
const out=kw.map(r=>{
  if(r.cat==='T0_제휴PG'||r.cat==='D_무관')return {...r,u:null,tier:null};
  const d=directness(r.kw),i=imminence(r.kw);
  const med=MEDCAT.test(r.cat);
  const score=(d*i)*(med?1.0:0.55);          // 메디론 본업은 의료축
  let tier;
  if(score>=8)tier='U5';else if(score>=6)tier='U4';else if(score>=4)tier='U3';
  else if(score>=2.2)tier='U2';else if(score>=1)tier='U1';else tier='U0';
  return {...r,u:+score.toFixed(2),tier};
});
fs.writeFileSync(D+'kwurg.json',JSON.stringify(out));
const agg={};for(const r of out){if(!r.tier)continue;const k=r.tier+' '+(MEDCAT.test(r.cat)?'의료':'비의료');agg[k]=(agg[k]||0)+1;}
console.log(Object.entries(agg).sort().map(([k,v])=>k.padEnd(12)+String(v).padStart(7)).join('\n'));
console.log('\n각 tier 표본(의료축)');
for(const t of ['U5','U4','U3','U2','U1','U0']){
  const v=out.filter(r=>r.tier===t&&MEDCAT.test(r.cat));
  const s=[];const step=Math.max(1,Math.floor(v.length/8));
  for(let i=0;i<v.length&&s.length<8;i+=step)s.push(v[i].kw);
  console.log('  '+t,String(v.length).padStart(6),' '+s.join(' | '));
}
