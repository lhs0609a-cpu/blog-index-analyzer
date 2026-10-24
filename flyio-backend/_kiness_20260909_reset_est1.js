const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const ids=plan.filter(p=>p.targetRank).map(p=>p.id);
const jobs=[];for(const device of ['PC','MOBILE'])for(let i=0;i<ids.length;i+=100)jobs.push({device,ids:ids.slice(i,i+100)});
let done=0;
(async()=>{
 const out=await pool(jobs,5,async j=>{
  const r=await req('POST','/estimate/average-position-bid/id',{device:j.device,items:j.ids.map(id=>({key:id,position:1}))},441986,4);
  if(!Array.isArray(r?.estimate)||r.estimate.length!==j.ids.length)throw Error('mismatch');
  if(++done%50===0)console.log(done,'/',jobs.length);
  return {device:j.device,data:r.estimate};});
 if(out.some(x=>x.__err))throw Error('failed batches');
 const m={};for(const b of out)for(const e of b.data)(m[e.nccKeywordId]=m[e.nccKeywordId]||{})[b.device]=e.bid;
 fs.writeFileSync(path.join(D,'estimates_rank1.json'),JSON.stringify(m));
 console.log('rank1 estimates',Object.keys(m).length);
})().catch(e=>{console.error(e);process.exitCode=1;});
