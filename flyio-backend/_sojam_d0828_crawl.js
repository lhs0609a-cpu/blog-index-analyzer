// 계정 전체 키워드 인벤토리 크롤 → _sojam_d0828_inventory.json
const fs=require('fs'),BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0,done=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);if(++done%100===0)console.error(`  ${done}/${items.length}`);}}));return out;}
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 console.error(`캠페인 ${camps.length}개 · 그룹 조회…`);
 const gl=await pool(camps,6,c=>raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`));
 const groups=[],gInfo={};
 camps.forEach((c,i)=>{for(const g of (gl[i]||[])){if(g.delFlag)continue;groups.push(g);
   gInfo[g.nccAdgroupId]={camp:c.name,campId:c.nccCampaignId,campLock:!!c.userLock,campBudget:c.useDailyBudget?(c.dailyBudget||0):0,
     grp:g.name||'',gbid:g.bidAmt||0,gLock:!!g.userLock};}});
 console.error(`그룹 ${groups.length}개 · 키워드 조회…`);
 const kl=await pool(groups,6,g=>raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`));
 const inv=[];let nullg=0;
 groups.forEach((g,i)=>{const arr=kl[i];if(!Array.isArray(arr)){nullg++;return;}
  const gi=gInfo[g.nccAdgroupId];
  for(const k of arr){if(k.delFlag)continue;
   inv.push({id:k.nccKeywordId,gid:g.nccAdgroupId,kw:k.keyword,bid:k.bidAmt||0,ugb:!!k.useGroupBidAmt,
     eff:k.useGroupBidAmt?gi.gbid:(k.bidAmt||0),lock:!!k.userLock,st:k.status,...gi});}});
 console.error(`키워드 인스턴스 ${inv.length}개 (그룹 조회실패 ${nullg}개)`);
 fs.writeFileSync(__dirname+'/_sojam_d0828_inventory.json',JSON.stringify(inv));
 console.error('저장 완료');
})();
