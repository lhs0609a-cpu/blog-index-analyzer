// 제외축 후보의 현재/3위가 월 예상치.
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const rows=JSON.parse(fs.readFileSync(D+'exax_rows.json','utf8'));
const est=JSON.parse(fs.readFileSync(D+'est.json','utf8'));
const cand=new Set(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
const F=D+'perf.json';
const pf=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const items=[];
for(const r of rows){ if(!cand.has(r.k))continue;
 for(const dev of ['MOBILE','PC']){
  const p3=est[dev+'|3|'+r.k];
  for(const [tag,bid] of [['cur',r.bid],['p3',p3]]){
   if(!bid||bid<70)continue;
   const key=dev+'|'+tag+'|'+r.k;
   if(pf[key]===undefined) items.push({key,device:dev,keyword:r.k,bid:Math.min(100000,Math.max(70,Math.round(bid/10)*10))});
  }
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
 fs.writeFileSync(F,JSON.stringify(pf));console.error('완료');
})();
