// 계정 전체 키워드 인벤토리 크롤 (재개 가능) → _sojam_d0828_inventory.json
// 그룹 단위로 _sojam_d0828_crawl_parts.jsonl 에 append. 중단되면 그대로 다시 실행하면 이어감.
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
async function pool(items,n,fn){let i=0,done=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{
 while(i<items.length){const k=i++;await fn(items[k]);if(++done%200===0)console.error(`  ${done}/${items.length}`);}}));}

const PARTS=P('_sojam_d0828_crawl_parts.jsonl');
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 console.error(`캠페인 ${camps.length}개 · 그룹 조회…`);
 const groups=[],gInfo={};
 const gl=[];{let i=0;await Promise.all(Array.from({length:10},async()=>{while(i<camps.length){const k=i++;
  gl[k]=await raw(`/ncc/adgroups?nccCampaignId=${camps[k].nccCampaignId}`);}}));}
 camps.forEach((c,i)=>{for(const g of (gl[i]||[])){if(g.delFlag)continue;groups.push(g);
  gInfo[g.nccAdgroupId]={camp:c.name,campId:c.nccCampaignId,campLock:!!c.userLock,
   campBudget:c.useDailyBudget?(c.dailyBudget||0):0,grp:g.name||'',gbid:g.bidAmt||0,gLock:!!g.userLock};}});
 console.error(`그룹 ${groups.length}개`);

 const seen=new Set();
 if(fs.existsSync(PARTS))for(const ln of fs.readFileSync(PARTS,'utf8').split('\n'))
  if(ln.trim())try{seen.add(JSON.parse(ln).gid)}catch(e){}
 const todo=groups.filter(g=>!seen.has(g.nccAdgroupId));
 console.error(`이미 받은 그룹 ${seen.size}개 · 남은 ${todo.length}개`);

 const fd=fs.openSync(PARTS,'a');
 await pool(todo,32,async g=>{
  const arr=await raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`);
  if(!Array.isArray(arr))return;
  const gi=gInfo[g.nccAdgroupId];
  const kws=arr.filter(k=>!k.delFlag).map(k=>({id:k.nccKeywordId,gid:g.nccAdgroupId,kw:k.keyword,
   bid:k.bidAmt||0,ugb:!!k.useGroupBidAmt,eff:k.useGroupBidAmt?gi.gbid:(k.bidAmt||0),
   lock:!!k.userLock,st:k.status,...gi}));
  fs.writeSync(fd,JSON.stringify({gid:g.nccAdgroupId,kws})+'\n');});
 fs.closeSync(fd);

 const inv=[];const dedup=new Set();
 for(const ln of fs.readFileSync(PARTS,'utf8').split('\n')){if(!ln.trim())continue;
  try{const o=JSON.parse(ln);if(dedup.has(o.gid))continue;dedup.add(o.gid);inv.push(...o.kws);}catch(e){}}
 fs.writeFileSync(P('_sojam_d0828_inventory.json'),JSON.stringify(inv));
 console.error(`키워드 인스턴스 ${inv.length}개 · 그룹 ${dedup.size}/${groups.length} 저장 완료`);
})();
