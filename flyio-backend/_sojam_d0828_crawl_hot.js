// 소진 있는 54개 캠페인만 키워드 크롤 (재개 가능) → _sojam_d0828_inv_hot.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
const PARTS=P('_sojam_d0828_crawl_parts.jsonl');   // 전체 크롤과 캐시 공유
const DEADLINE=Date.now()+8.5*60*1000;
(async()=>{
 const hot=JSON.parse(fs.readFileSync(P('_sojam_d0828_hotcamps.json'),'utf8'));
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.error('캠페인 조회 실패 — 중단 (기존 산출물 보존)');process.exit(1);}
 const want=new Map(hot.map(h=>[h.id,h]));
 const gl=[];const cs=camps.filter(c=>want.has(c.nccCampaignId));
 {let i=0;await Promise.all(Array.from({length:10},async()=>{while(i<cs.length){const k=i++;
   gl[k]=await raw(`/ncc/adgroups?nccCampaignId=${cs[k].nccCampaignId}`);}}));}
 const groups=[],gInfo={};
 cs.forEach((c,i)=>{for(const g of (gl[i]||[])){if(g.delFlag)continue;groups.push(g);
  gInfo[g.nccAdgroupId]={camp:c.name,campId:c.nccCampaignId,campLock:!!c.userLock,
   campSpend:want.get(c.nccCampaignId).salesAmt||0,
   campBudget:c.useDailyBudget?(c.dailyBudget||0):0,grp:g.name||'',gbid:g.bidAmt||0,gLock:!!g.userLock};}});
 console.error(`소진 캠페인 ${cs.length}개 · 그룹 ${groups.length}개`);

 const cache=new Map();
 if(fs.existsSync(PARTS))for(const ln of fs.readFileSync(PARTS,'utf8').split('\n'))
  if(ln.trim())try{const o=JSON.parse(ln);cache.set(o.gid,o.kws);}catch(e){}
 const todo=groups.filter(g=>!cache.has(g.nccAdgroupId));
 console.error(`캐시 적중 ${groups.length-todo.length}개 · 남은 ${todo.length}개`);

 const fd=fs.openSync(PARTS,'a');let n=0,skipped=0;
 {let i=0;await Promise.all(Array.from({length:32},async()=>{while(i<todo.length){
   if(Date.now()>DEADLINE){skipped=todo.length-i;i=todo.length;break;}
   const g=todo[i++];
   const arr=await raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`);
   if(!Array.isArray(arr))continue;
   const gi=gInfo[g.nccAdgroupId];
   const kws=arr.filter(k=>!k.delFlag).map(k=>({id:k.nccKeywordId,gid:g.nccAdgroupId,kw:k.keyword,
    bid:k.bidAmt||0,ugb:!!k.useGroupBidAmt,eff:k.useGroupBidAmt?gi.gbid:(k.bidAmt||0),
    lock:!!k.userLock,st:k.status,...gi}));
   cache.set(g.nccAdgroupId,kws);
   fs.writeSync(fd,JSON.stringify({gid:g.nccAdgroupId,kws})+'\n');
   if(++n%200===0)console.error(`  ${n}/${todo.length}`);}}));}
 fs.closeSync(fd);

 const inv=[];let miss=0;
 for(const g of groups){const k=cache.get(g.nccAdgroupId);if(k)inv.push(...k);else miss++;}
 fs.writeFileSync(P('_sojam_d0828_inv_hot.json'),JSON.stringify(inv));
 console.error(`키워드 인스턴스 ${inv.length}개 · 미수집 그룹 ${miss}개 (시간초과 ${skipped})`);
})();
