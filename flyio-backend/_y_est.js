const fs=require('fs');const {req,sleep}=require('./_sojam_naver');
(async()=>{
const rows=JSON.parse(fs.readFileSync('../reports/sojam-20260909/_final_rows.json','utf8'));
const texts=[...new Set(rows.map(r=>r.kw))];
const out={};
for(const device of ['MOBILE','PC']){
 for(const pos of [1,2,3,5]){
  for(let i=0;i<texts.length;i+=100){
   const r=await req('POST','/estimate/average-position-bid/keyword',{device,items:texts.slice(i,i+100).map(k=>({key:k,position:pos}))},3808925,3);
   for(const e of (r&&r.estimate)||[])out[device+'|'+pos+'|'+e.keyword]=e.bid;
   await sleep(250);
  }
 }
}
fs.writeFileSync('../reports/sojam-20260909/_est_market.json',JSON.stringify(out));
console.log('OK',texts.length,'texts',Object.keys(out).length,'entries');
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
