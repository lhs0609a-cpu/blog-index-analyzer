const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
const OUT=path.join(D,'ext_kwstats30.jsonl');
(async()=>{
 const inv=JSON.parse(fs.readFileSync(path.join(D,'inventory.json')));
 const live=JSON.parse(fs.readFileSync(path.join(D,'live.json')));
 const ext=new Set(live.groups.filter(g=>g.name.startsWith('[타겟_10대]확장')).map(g=>g.id));
 const ids=inv.kw.filter(r=>ext.has(r[0])).map(r=>r[1]);
 console.log('대상 키워드',ids.length);
 const have=new Set();
 if(fs.existsSync(OUT)) for(const l of fs.readFileSync(OUT,'utf8').split('\n')) if(l.trim()){try{have.add(JSON.parse(l).id)}catch(e){}}
 const todo=ids.filter(i=>!have.has(i));
 const chunks=[];for(let i=0;i<todo.length;i+=50)chunks.push(todo.slice(i,i+50));
 const fd=fs.openSync(OUT,'a');let n=0,err=0;
 await pool(chunks,6,async c=>{
  try{
   const r=await req('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-08-23',until:'2026-09-21'})),null,CID,4);
   const got=new Set((r.data||[]).map(d=>d.id));
   const lines=(r.data||[]).map(d=>JSON.stringify({id:d.id,i:d.impCnt||0,c:d.clkCnt||0,s:d.salesAmt||0}));
   for(const id of c) if(!got.has(id)) lines.push(JSON.stringify({id,i:0,c:0,s:0}));
   fs.writeSync(fd,lines.join('\n')+'\n');
  }catch(e){err++;}
  if(++n%100===0)console.log(n,'/',chunks.length,'err',err);
 });
 fs.closeSync(fd);console.log('done',n,'err',err);
})().catch(e=>{console.error(e);process.exitCode=1});
