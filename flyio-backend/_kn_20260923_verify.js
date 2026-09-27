const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260923');const CID=441986;
(async()=>{
 const ids=[];for(const l of fs.readFileSync(path.join(D,'registered.jsonl'),'utf8').split('\n')) if(l.trim()) ids.push(JSON.parse(l).kid);
 const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
 const out=[];
 await pool(chunks,5,async c=>{
  const r=await req('GET','/ncc/keywords?ids='+encodeURIComponent(c.join(',')),null,CID,4);
  for(const k of (r||[])) out.push({kw:k.keyword,bid:k.bidAmt,ug:k.useGroupBidAmt?1:0,off:k.userLock?1:0,st:k.status,rs:k.statusReason,ins:k.inspectStatus,q:k.qualityIndex});
 });
 fs.writeFileSync(path.join(D,'verify_new.json'),JSON.stringify(out));
 const c=(f)=>{const m={};for(const o of out)m[o[f]]=(m[o[f]]||0)+1;return m;};
 console.log('확인',out.length,'/',ids.length);
 console.log('status',JSON.stringify(c('st')));
 console.log('reason',JSON.stringify(c('rs')));
 console.log('inspect',JSON.stringify(c('ins')));
 console.log('bid',JSON.stringify(c('bid')));
 console.log('userLock(OFF)',out.filter(o=>o.off).length,'그룹입찰사용',out.filter(o=>o.ug).length);
})().catch(e=>{console.error(e);process.exitCode=1});
