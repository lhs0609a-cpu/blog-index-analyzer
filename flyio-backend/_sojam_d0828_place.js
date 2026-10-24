const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(800*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','cpc','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:'2026-08-27',until:'2026-08-27'}));
(async()=>{
 const c=((await raw('/ncc/campaigns'))||[]).find(c=>c.name==='플레이스');
 console.log('캠페인 타입', c.campaignTp, c.nccCampaignId);
 const gs=(await raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`))||[];
 for(const g of gs){
  console.log('그룹',g.name,g.adgroupType||'',g.nccAdgroupId);
  const kws=(await raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`))||[];
  console.log('  키워드수',Array.isArray(kws)?kws.length:JSON.stringify(kws).slice(0,200));
  if(Array.isArray(kws)&&kws.length){
   const ids=kws.map(k=>k.nccKeywordId);
   const s=await raw(`/stats?ids=${encodeURIComponent(ids.slice(0,40).join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
   const hit=((s&&s.data)||[]).filter(d=>d.clkCnt>0);
   const m={};kws.forEach(k=>m[k.nccKeywordId]=k.keyword);
   for(const d of hit)console.log(`   ▸ ${m[d.id]} 클릭 ${d.clkCnt} 비용 ${won(d.salesAmt)}원 노출 ${won(d.impCnt)} 순위 ${(d.avgRnk||0).toFixed(1)}`);
   if(!hit.length)console.log('   (키워드 단위 클릭 없음)');
  }
  const gsx=await raw(`/stats?ids=${encodeURIComponent(g.nccAdgroupId)}&fields=${F}&timeRange=${T}&timeIncrement=allDays`);
  const d=((gsx&&gsx.data)||[])[0]||{};
  console.log(`  그룹 실적: 노출 ${won(d.impCnt)} 클릭 ${won(d.clkCnt)} 비용 ${won(d.salesAmt)}원`);
 }
})();
