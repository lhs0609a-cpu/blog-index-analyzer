const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>c.name==='파워링크');
 const c=camps[0];
 console.log('캠페인:',JSON.stringify({id:c.nccCampaignId,tp:c.campaignTp,budget:c.dailyBudget,use:c.useDailyBudget,lock:c.userLock},null,0));
 const gs=(await raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`))||[];
 console.log(`\n그룹 ${gs.length}개`);
 for(const g of gs.filter(x=>!x.delFlag))
  console.log(`  ${(g.name||'').slice(0,34).padEnd(36)} 입찰 ${String(g.bidAmt).padStart(6)}원 · ${g.status} · type=${g.adgroupType||''} · lock=${!!g.userLock}`);
 const ref=gs.find(g=>g.name==='0. 대표키워드');
 console.log('\n샘플 그룹 원본:');
 console.log(JSON.stringify(ref,null,1).slice(0,1400));
 const ads=(await raw(`/ncc/ads?nccAdgroupId=${ref.nccAdgroupId}`))||[];
 console.log(`\n그 그룹의 소재 ${ads.length}개`);
 for(const a of ads.filter(x=>!x.delFlag).slice(0,3)) console.log(JSON.stringify(a,null,1).slice(0,1200));
})();
