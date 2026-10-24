// 강화 후보 추정입찰가(1·2·3위, MOBILE/PC) — 로컬 키 직접 호출.
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const F=D+'est.json';
const est=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const texts=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
(async()=>{
 for(const dev of ['MOBILE','PC']) for(const pos of [1,2,3,5]){
  const todo=texts.filter(t=>est[dev+'|'+pos+'|'+t]===undefined);
  if(!todo.length){console.error(dev,pos,'캐시');continue;}
  for(let i=0;i<todo.length;i+=100){
   try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:dev,items:todo.slice(i,i+100).map(k=>({key:k,position:pos}))},3808925,3);
    for(const e of (r&&r.estimate)||[]) est[dev+'|'+pos+'|'+e.keyword]=e.bid;}catch(e){console.error(' fail',dev,pos,i,String(e).slice(0,60));}
   await sleep(250);
  }
  for(const t of todo) if(est[dev+'|'+pos+'|'+t]===undefined) est[dev+'|'+pos+'|'+t]=null;
  fs.writeFileSync(F,JSON.stringify(est));console.error(dev,pos,'완료');
 }
})();
