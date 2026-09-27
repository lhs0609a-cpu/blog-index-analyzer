const fs=require('fs'),path=require('path');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
const APPLY=process.argv.includes('--apply');
const LOG=path.join(D,'registered4.jsonl');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(D,'register_plan4.json')));
 const done=new Set();
 if(fs.existsSync(LOG)) for(const l of fs.readFileSync(LOG,'utf8').split('\n')) if(l.trim()) done.add(JSON.parse(l).kw);
 const todo=plan.filter(p=>!done.has(p.kw));
 const byg=new Map();
 for(const p of todo){ if(!byg.has(p.gid))byg.set(p.gid,[]); byg.get(p.gid).push(p); }
 console.log('등록 대상',todo.length,'그룹',byg.size,'(이미 등록',done.size,') APPLY=',APPLY);
 if(!APPLY){ console.log('DRY RUN 샘플:',todo.slice(0,5).map(p=>p.kw+'@'+p.gname)); return; }
 const fd=fs.openSync(LOG,'a');let ok=0,err=0;const msgs=new Map();
 for(const [gid,items] of byg){
  for(let i=0;i<items.length;i+=100){
   const c=items.slice(i,i+100);
   const body=c.map(p=>({keyword:p.kw,bidAmt:p.bid,useGroupBidAmt:false,userLock:false}));
   try{
    const r=await req('POST','/ncc/keywords?nccAdgroupId='+gid,body,CID,3);
    const arr=Array.isArray(r)?r:[];
    fs.writeSync(fd,arr.map(k=>JSON.stringify({kw:k.keyword,kid:k.nccKeywordId,gid})).join('\n')+'\n');
    ok+=arr.length;
    if(arr.length!==c.length) console.log('부분성공',c[0].gname,arr.length,'/',c.length);
   }catch(e){ err+=c.length; const m=String(e).slice(0,200); msgs.set(m,(msgs.get(m)||0)+c.length); }
  }
  console.log(items[0].gname,'완료 누적 ok',ok,'err',err);
 }
 fs.closeSync(fd);
 console.log('등록 완료',ok,'실패',err);
 for(const [m,n] of msgs) console.log(n,m);
})().catch(e=>{console.error(e);process.exitCode=1});
