const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const P=n=>path.join(__dirname,'_kiness_20260908_'+n+'.json');
(async()=>{
 const d=JSON.parse(fs.readFileSync(P('discovery'))),map=new Map(d.related.map(x=>[x.kw,x.data]));
 const arr=d.generated.map(x=>x.kw).filter(k=>!map.has(k)),chunks=[];
 for(let i=0;i<arr.length;i+=5)chunks.push(arr.slice(i,i+5));
 let done=0;const errors=[];
 await pool(chunks,3,async c=>{
  try{const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(c.join(','))+'&showDetail=1',null,441986);
   if(!Array.isArray(r?.keywordList))throw Error('Missing keywordList');
   for(const x of r.keywordList)map.set(x.relKeyword.replace(/\s/g,''),x);
  }catch(e){errors.push({c,error:String(e)});}
  if(++done%100===0){console.log(done,'/',chunks.length,'volumes',map.size);fs.writeFileSync(P('volumes'),JSON.stringify({data:Object.fromEntries(map),errors}));}
 });
 fs.writeFileSync(P('volumes'),JSON.stringify({data:Object.fromEntries(map),errors}));console.log('complete',map.size,'errors',errors.length);
})().catch(e=>{console.error(e);process.exitCode=1});
