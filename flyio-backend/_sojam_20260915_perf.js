// 강화안의 월 예상 클릭·비용 (performance-bulk). 현재 유효입찰 vs 3위가.
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const plan=JSON.parse(fs.readFileSync(D+'plan_agree_axes.json','utf8'));
const F=D+'perf.json';
const pf=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const est=JSON.parse(fs.readFileSync(D+'est.json','utf8'));
const items=[];
for(const r of plan) for(const dev of ['MOBILE','PC']){
 const cur=dev==='MOBILE'?r.bid:r.bid;  // PC 가중치는 그룹별이라 근사
 const p3=est[dev+'|3|'+r.k];
 for(const [tag,bid] of [['cur',cur],['p3',p3]]){
  if(!bid||bid<70)continue;
  const key=dev+'|'+tag+'|'+r.k;
  if(pf[key]===undefined) items.push({key,device:dev,keyword:r.k,bid:Math.min(100000,Math.max(70,Math.round(bid/10)*10))});
 }
}
(async()=>{
 console.error('perf 남은',items.length);
 for(let i=0;i<items.length;i+=100){
  const b=items.slice(i,i+100);
  try{const r=await req('POST','/estimate/performance-bulk',{items:b.map(x=>({device:x.device,keywordplus:false,keyword:x.keyword,bid:x.bid}))},3808925,3);
   const out=(r&&r.items)||[];
   for(let j=0;j<b.length;j++){const o=out[j]||{};pf[b[j].key]={bid:b[j].bid,clk:o.clicks??null,imp:o.impressions??null,cost:o.cost??null};}
  }catch(e){console.error(' fail',i,String(e).slice(0,80));}
  await sleep(300);
 }
 fs.writeFileSync(F,JSON.stringify(pf));
 console.error('완료');
})();
