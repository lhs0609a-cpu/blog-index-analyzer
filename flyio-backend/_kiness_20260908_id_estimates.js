const fs=require('fs');const {req,pool}=require('./_sojam_naver');const {classify}=require('./_kiness_20260908_discover');const P=n=>'_kiness_20260908_'+n+'.json';
(async()=>{
 const p=JSON.parse(fs.readFileSync(P('plan'))),e=JSON.parse(fs.readFileSync(P('estimates'))),tasks=[],results={};
 for(const pos of [5,3]){const arr=Object.entries(p.owners).filter(([kw])=>classify(kw).score>=(pos===5?55:75));for(let i=0;i<arr.length;i+=100)tasks.push({pos,arr:arr.slice(i,i+100)});}
 let done=0;const errors=[];await pool(tasks,3,async t=>{try{
  const r=await req('POST','/estimate/average-position-bid/id',{device:'PC',items:t.arr.map(([kw,x])=>({key:x.id,position:t.pos}))},441986);
  if(!Array.isArray(r?.estimate))throw Error('No estimate');
  for(const x of r.estimate){(results[x.nccKeywordId]||={kw:x.keyword})['PC'+t.pos]=x.bid;(e.data[x.keyword]||={})['PC'+t.pos]=x.bid;}
 }catch(err){errors.push({task:t,error:String(err)});}if(++done%100===0)console.log(done,'/',tasks.length);});
 fs.writeFileSync(P('id_estimates'),JSON.stringify({data:results,errors}));if(errors.length)throw Error('ID estimates incomplete');
 fs.writeFileSync(P('estimates'),JSON.stringify(e));console.log('id estimates',Object.keys(results).length);
})().catch(e=>{console.error(e);process.exitCode=1});
