const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');const OUT=path.join(D,'vols.jsonl');
const num=v=>{if(v==null)return 0;const s=String(v).replace(/[^0-9]/g,'');return s?parseInt(s,10):0;};
(async()=>{
 const need=JSON.parse(fs.readFileSync(path.join(D,'need_vol.json')));
 const have=new Set();
 if(fs.existsSync(OUT))for(const l of fs.readFileSync(OUT,'utf8').split('\n'))if(l.trim()){try{have.add(JSON.parse(l).k)}catch(e){}}
 const todo=need.filter(k=>!have.has(k));
 console.log('todo',todo.length);
 const chunks=[];for(let i=0;i<todo.length;i+=5)chunks.push(todo.slice(i,i+5));
 const fd=fs.openSync(OUT,'a');let n=0,err=0;
 await pool(chunks,3,async c=>{
  try{const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(c.join(','))+'&showDetail=1',null,441986,4);
   if(!Array.isArray(r?.keywordList))throw Error('miss');
   const m=new Map(r.keywordList.map(x=>[x.relKeyword.replace(/\s/g,''),x]));
   const lines=c.map(k=>{const x=m.get(k.replace(/\s/g,''));
     return JSON.stringify({k,pc:x?num(x.monthlyPcQcCnt):-1,mo:x?num(x.monthlyMobileQcCnt):-1,comp:x?x.compIdx:null,depth:x?x.plAvgDepth:null,
       pcRaw:x?String(x.monthlyPcQcCnt):null,moRaw:x?String(x.monthlyMobileQcCnt):null});});
   fs.writeSync(fd,lines.join('\n')+'\n');
  }catch(e){err++;}
  if(++n%200===0)console.log(n,'/',chunks.length,'err',err);
 });
 fs.closeSync(fd);console.log('done',n,'err',err);
})().catch(e=>{console.error(e);process.exitCode=1});
