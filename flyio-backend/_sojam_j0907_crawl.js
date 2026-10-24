// 계정 전체 라이브 키워드 크롤 (재개 가능, 8.5분 데드라인) → _sojam_j0907_live.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(500*(t+1));}return null;}
const PARTS=P('_sojam_j0907_parts.jsonl');
const DEADLINE=Date.now()+28*60*1000;
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.error('캠페인 조회 실패 — 중단');process.exit(1);}
 const gl=[];{let i=0;await Promise.all(Array.from({length:12},async()=>{while(i<camps.length){const k=i++;
   gl[k]=await raw(`/ncc/adgroups?nccCampaignId=${camps[k].nccCampaignId}`);}}));}
 const groups=[],gInfo={};
 camps.forEach((c,i)=>{for(const g of (gl[i]||[])){if(g.delFlag)continue;groups.push(g);
  gInfo[g.nccAdgroupId]={camp:c.name,campTp:c.campaignTp,campLock:!!c.userLock,
   campBudget:c.useDailyBudget?(c.dailyBudget||0):null,grp:g.name||'',gbid:g.bidAmt||0,gLock:!!g.userLock};}});
 console.error(`캠페인 ${camps.length} · 그룹 ${groups.length}`);
 const cache=new Set();
 if(fs.existsSync(PARTS))for(const ln of fs.readFileSync(PARTS,'utf8').split('\n'))
  if(ln.trim())try{cache.add(JSON.parse(ln).gid)}catch(e){}
 const todo=groups.filter(g=>!cache.has(g.nccAdgroupId));
 console.error(`캐시 ${cache.size} · 남은 ${todo.length}`);
 const fd=fs.openSync(PARTS,'a');let n=0,to=0;
 {let i=0;await Promise.all(Array.from({length:32},async()=>{while(i<todo.length){
   if(Date.now()>DEADLINE){to=todo.length-i;i=todo.length;break;}
   const g=todo[i++];const gi=gInfo[g.nccAdgroupId];
   const arr=await raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`);
   if(!Array.isArray(arr))continue;
   const kws=arr.filter(k=>!k.delFlag).map(k=>({id:k.nccKeywordId,gid:g.nccAdgroupId,kw:k.keyword,
    bid:k.useGroupBidAmt?gi.gbid:(k.bidAmt||0),ugb:!!k.useGroupBidAmt,lock:!!k.userLock,st:k.status,...gi}));
   fs.writeSync(fd,JSON.stringify({gid:g.nccAdgroupId,kws})+'\n');
   if(++n%300===0)console.error(`  ${n}/${todo.length}`);}}));}
 fs.closeSync(fd);
 const inv=[],seen=new Set();
 for(const ln of fs.readFileSync(PARTS,'utf8').split('\n')){if(!ln.trim())continue;
  try{const o=JSON.parse(ln);if(seen.has(o.gid))continue;seen.add(o.gid);inv.push(...o.kws);}catch(e){}}
 fs.writeFileSync(P('_sojam_j0907_live.json'),JSON.stringify(inv));
 console.error(`키워드 ${inv.length}개 · 그룹 ${seen.size}/${groups.length} 저장 (시간초과 남음 ${to})`);
})();
