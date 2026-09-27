const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');const CID=441986;
const SINCE='2026-09-14',UNTIL='2026-09-20';
const OUT=path.join(D,'kwstats7.jsonl');
(async()=>{
 const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
 const have=new Set();
 if(fs.existsSync(OUT)) for(const l of fs.readFileSync(OUT,'utf8').split('\n')) if(l.trim()){try{have.add(JSON.parse(l).id)}catch(e){}}
 const todo=flat.map(x=>x.id).filter(id=>!have.has(id));
 console.log('todo',todo.length,'of',flat.length);
 const chunks=[];for(let i=0;i<todo.length;i+=50)chunks.push(todo.slice(i,i+50));
 const fd=fs.openSync(OUT,'a');let n=0,err=0;
 await pool(chunks,6,async ids=>{
  try{
   const r=await req('GET','/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL})),null,CID,5);
   if(!Array.isArray(r?.data))throw Error('bad');
   const got=new Set(r.data.map(d=>d.id));
   const lines=r.data.map(d=>JSON.stringify({id:d.id,i:d.impCnt||0,c:d.clkCnt||0,s:d.salesAmt||0,r:d.avgRnk||0}));
   for(const id of ids) if(!got.has(id)) lines.push(JSON.stringify({id,i:0,c:0,s:0,r:0}));
   fs.writeSync(fd,lines.join('\n')+'\n');
  }catch(e){err++;}
  if(++n%200===0)console.log(n,'/',chunks.length,'err',err);
 });
 fs.closeSync(fd);console.log('done chunks',n,'err',err);
})().catch(e=>{console.error(e);process.exitCode=1});
