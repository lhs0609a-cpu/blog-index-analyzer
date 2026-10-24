const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260923');const CID=441986;
const APPLY=process.argv.includes('--apply');
const LOG=path.join(D,'bid_applied5.jsonl');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(D,'bid_apply5.json')));
 const done=new Set();
 if(fs.existsSync(LOG))for(const l of fs.readFileSync(LOG,'utf8').split('\n'))if(l.trim())done.add(JSON.parse(l).kid);
 const todo=plan.filter(p=>!done.has(p.kid));
 console.log('입찰 변경 대상',todo.length,'(이미',done.size,') APPLY=',APPLY);
 if(!APPLY){console.log('DRY RUN 샘플:',todo.slice(0,5).map(p=>p.kw+' '+p.from+'→'+p.to));return;}
 const chunks=[];for(let i=0;i<todo.length;i+=100)chunks.push(todo.slice(i,i+100));
 const fd=fs.openSync(LOG,'a');let ok=0,err=0;const msgs=new Map();
 for(const c of chunks){
  try{
   const r=await req('PUT','/ncc/keywords?fields=bidAmt',
     c.map(p=>({nccKeywordId:p.kid,nccAdgroupId:p.gid,bidAmt:p.to,useGroupBidAmt:false})),CID,4);
   const arr=Array.isArray(r)?r:[];
   fs.writeSync(fd,arr.map(k=>JSON.stringify({kid:k.nccKeywordId,kw:k.keyword,bid:k.bidAmt})).join('\n')+'\n');
   ok+=arr.length;
   if(arr.length!==c.length)console.log('부분성공',arr.length,'/',c.length);
  }catch(e){err+=c.length;const m=String(e).slice(0,200);msgs.set(m,(msgs.get(m)||0)+c.length);}
  console.log('진행',ok+err,'/',todo.length);
 }
 fs.closeSync(fd);
 console.log('적용',ok,'실패',err);
 for(const [m,n] of msgs)console.log(n,m);
})().catch(e=>{console.error(e);process.exitCode=1});
