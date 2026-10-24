const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(800*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','cpc','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-28',until:'2026-08-28'}));
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>/핵심/.test(c.name||''));
 console.log('핵심 캠페인', camps.length,'개');
 for(const c of camps){
  const gs=(await raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`))||[];
  console.log(`\n== ${c.name} · 캠예산 ${won(c.useDailyBudget?c.dailyBudget:0)}원 · ${c.status}${c.userLock?' OFF':''}`);
  for(const g of gs.filter(g=>!g.delFlag)){
   const kws=(await raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`))||[];
   const live=kws.filter(k=>!k.userLock&&k.status==='ELIGIBLE');
   const bids=live.map(k=>k.useGroupBidAmt?(g.bidAmt||0):(k.bidAmt||0)).sort((a,b)=>b-a);
   console.log(`  그룹 ${(g.name||'').slice(0,24).padEnd(26)} 예산 ${won(g.useDailyBudget?g.dailyBudget:'무제한')} · 그룹입찰 ${won(g.bidAmt)}원 · KW ${kws.length}(활성 ${live.length}) · 최고입찰 ${won(bids[0])}원${g.userLock?' OFF':''}`);
   const top=live.map(k=>({t:k.keyword,b:k.useGroupBidAmt?(g.bidAmt||0):(k.bidAmt||0)})).sort((a,b)=>b.b-a.b).slice(0,8);
   for(const t of top) console.log(`      ${t.t.padEnd(22)} ${won(t.b)}원`);
   // 오늘 그룹 성과
   const s=await raw(`/stats?ids=${encodeURIComponent(g.nccAdgroupId)}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
   const d=(s&&s.data&&s.data[0])||{};
   console.log(`      → 오늘 노출 ${won(d.impCnt)} 클릭 ${won(d.clkCnt)} 소진 ${won(d.salesAmt)}원 CPC ${won(d.cpc)}원`);
  }
 }
})();
