const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const {LADDER}=require('./_kiness_20260909_reset_ladder');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'ladder_rows.json'),'utf8'));
const targets=rows.filter(r=>LADDER[r.tier].rank);
const jobs=[];
for(const device of ['PC','MOBILE']){
 const byRank={};for(const r of targets)(byRank[LADDER[r.tier].rank]=byRank[LADDER[r.tier].rank]||[]).push(r.id);
 for(const [rank,ids] of Object.entries(byRank))for(let i=0;i<ids.length;i+=100)jobs.push({device,rank:+rank,ids:ids.slice(i,i+100)});
 // 실적 있는 키워드는 순위별 곡선을 따로 확보한다.
 const live=targets.filter(r=>r.imp7>0).map(r=>r.id);
 for(const rank of [1,2,3,5])for(let i=0;i<live.length;i+=100)jobs.push({device,rank,ids:live.slice(i,i+100),curve:true});
}
let done=0;
(async()=>{
 const out=await pool(jobs,5,async j=>{
  const r=await req('POST','/estimate/average-position-bid/id',{device:j.device,items:j.ids.map(id=>({key:id,position:j.rank}))},441986,4);
  if(!Array.isArray(r?.estimate)||r.estimate.length!==j.ids.length)throw Error('estimate mismatch');
  if(++done%50===0)console.log('batches',done,'/',jobs.length);
  return {device:j.device,rank:j.rank,curve:!!j.curve,data:r.estimate};
 });
 const bad=out.filter(x=>x.__err);if(bad.length)throw Error('failed batches '+bad.length+' '+bad[0].__err);
 const target={},curve={};
 for(const b of out)for(const e of b.data){
  if(b.curve){((curve[e.nccKeywordId]=curve[e.nccKeywordId]||{})[b.device]=curve[e.nccKeywordId][b.device]||{})[b.rank]=e.bid;}
  else (target[e.nccKeywordId]=target[e.nccKeywordId]||{})[b.device]=e.bid;
 }
 fs.writeFileSync(path.join(D,'estimates_target.json'),JSON.stringify(target));
 fs.writeFileSync(path.join(D,'estimates_curve.json'),JSON.stringify(curve));
 console.log('target estimates',Object.keys(target).length,'curve',Object.keys(curve).length);
})().catch(e=>{fs.writeFileSync(path.join(D,'estimate_error.json'),JSON.stringify({error:String(e)}));console.error(e);process.exitCode=1;});
