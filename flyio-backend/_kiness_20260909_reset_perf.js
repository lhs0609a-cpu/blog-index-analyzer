const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const intent=plan.filter(p=>p.targetRank);
// 지역 키워드는 해당 지점 캠페인, 그 외에는 실적/전국 대표 그룹을 대표 위치로 둔다.
const score=p=>(p.imp7*1000)+(p.branch&&p.campaign.includes(p.branch)?500:0)+(/대표/.test(p.group)?200:0)+(/확장그룹|국내전국/.test(p.group)?-100:0);
const byKw=new Map();
for(const p of intent){const a=byKw.get(p.keyword)||byKw.set(p.keyword,[]).get(p.keyword);a.push(p);}
const primary=new Set();
for(const [kw,arr] of byKw){arr.sort((a,b)=>score(b)-score(a));primary.add(arr[0].id);}
const head=[...byKw.values()].map(a=>a[0]).filter(p=>p.vol>0||p.imp7>0);
fs.writeFileSync(path.join(D,'primary_ids.json'),JSON.stringify([...primary]));
console.log('대표 위치',primary.size,'헤드 키워드',head.length);
const BIDS=[300,700,1500,3000,5000,8000,12000,18000,25000,35000,50000];
const jobs=[];for(const p of head)for(const device of ['PC','MOBILE'])jobs.push({p,device});
let done=0;
(async()=>{
 const out=await pool(jobs,6,async j=>{
  const r=await req('POST','/estimate/performance/id',{device:j.device,keywordplus:false,key:j.p.id,bids:BIDS},441986,4);
  if(!Array.isArray(r?.estimate))throw Error('bad perf '+j.p.id);
  if(++done%200===0)console.log('perf',done,'/',jobs.length);
  return {id:j.p.id,keyword:j.p.keyword,device:j.device,estimate:r.estimate};
 });
 const bad=out.filter(x=>x.__err);
 fs.writeFileSync(path.join(D,'perf_errors.json'),JSON.stringify(bad.slice(0,20)));
 if(bad.length>jobs.length*0.02)throw Error('too many perf failures '+bad.length);
 const curve={};
 for(const o of out){if(o.__err)continue;(curve[o.id]=curve[o.id]||{keyword:o.keyword})[o.device]=Object.fromEntries(o.estimate.map(e=>[e.bid,{c:e.clicks,i:e.impressions,cost:e.cost}]));}
 fs.writeFileSync(path.join(D,'perf_curve.json'),JSON.stringify(curve));
 console.log('curves',Object.keys(curve).length,'failed',bad.length);
})().catch(e=>{fs.writeFileSync(path.join(D,'perf_error.json'),JSON.stringify({error:String(e)}));console.error(e);process.exitCode=1;});
