const fs=require('fs');const {req,pool}=require('./_sojam_naver');const {classify}=require('./_kiness_20260908_discover');const P=n=>'_kiness_20260908_'+n+'.json';
(async()=>{
 const inv=JSON.parse(fs.readFileSync(P('inventory'))),dis=JSON.parse(fs.readFileSync(P('discovery')));
 const kws=[...new Set([...inv.flatMap(x=>x.keywords.map(k=>k.keyword)),...dis.generated.map(x=>x.kw),...dis.related.map(x=>x.kw)])].filter(k=>classify(k).score>=55);
 const out={};const tasks=[];
 for(const [device,pos] of [['PC',5],['PC',3],['MOBILE',5]]){
  const arr=kws.filter(k=>pos===5&&device==='PC'||classify(k).score>=75);
  for(let i=0;i<arr.length;i+=100)tasks.push({device,pos,keys:arr.slice(i,i+100)});
 }
 let done=0;const errors=[];await pool(tasks,3,async t=>{
  try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:t.device,items:t.keys.map(key=>({key,position:t.pos}))},441986);
   if(!Array.isArray(r?.estimate))throw Error('Missing estimate');
   for(const x of r.estimate){const kw=(x.keyword||x.key||'').trim();if(kw)(out[kw]||={})[t.device+t.pos]=x.bid;}
  }catch(e){errors.push({...t,error:String(e)});}
  if(++done%50===0){fs.writeFileSync(P('estimates'),JSON.stringify({data:out,errors}));console.log(done,'/',tasks.length,'keywords',Object.keys(out).length);}
 });fs.writeFileSync(P('estimates'),JSON.stringify({data:out,errors}));console.log('complete',Object.keys(out).length,'errors',errors.length);
})().catch(e=>{console.error(e);process.exitCode=1});
