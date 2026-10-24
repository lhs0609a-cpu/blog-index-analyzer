const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260923');const CID=441986;
const OUT=path.join(D,'minbid_axes3.jsonl');
(async()=>{
 const kws=JSON.parse(fs.readFileSync(path.join(D,'register_plan7.json'))).map(p=>p.kw);
 const done=new Set();
 if(fs.existsSync(OUT))for(const l of fs.readFileSync(OUT,'utf8').split('\n'))if(l.trim()){try{const o=JSON.parse(l);done.add(o.dev+'|'+o.kw)}catch(e){}}
 const jobs=[];
 for(const dev of ['PC','MOBILE']){const todo=kws.filter(k=>!done.has(dev+'|'+k));
  for(let i=0;i<todo.length;i+=200)jobs.push({dev,c:todo.slice(i,i+200)});}
 console.log('키워드',kws.length,'남은 배치',jobs.length);
 const fd=fs.openSync(OUT,'a');let n=0,err=0;
 await pool(jobs,5,async j=>{
  try{const r=await req('POST','/estimate/exposure-minimum-bid/keyword',{device:j.dev,period:'MONTH',items:j.c},CID,4);
   const g=new Map(((r&&r.estimate)||[]).map(x=>[x.keyword,x.bid]));
   fs.writeSync(fd,j.c.map(k=>JSON.stringify({kw:k,dev:j.dev,bid:g.has(k)?g.get(k):null})).join('\n')+'\n');
  }catch(e){err++;}
  if(++n%50===0)console.log(n,'/',jobs.length,'err',err);
 });
 fs.closeSync(fd);console.log('완료',n,'실패',err);
})().catch(e=>{console.error(e);process.exitCode=1});
