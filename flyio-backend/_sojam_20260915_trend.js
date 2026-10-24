const CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
async function api(p,tries=4){for(let t=0;t<tries;t++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(90000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
(async()=>{
 const camps=((await api('/ncc/campaigns?recordSize=1000'))||[]).filter(c=>!c.delFlag);
 const ids=camps.map(c=>c.nccCampaignId);
 const days=['2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14'];
 for(const d of days){
  let imp=0,clk=0,cost=0;
  for(let i=0;i<ids.length;i+=50){
   const r=await api('/stats?ids='+encodeURIComponent(ids.slice(i,i+50).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt'])+'&timeRange='+enc({since:d,until:d}));
   for(const x of ((r&&r.data)||[])){imp+=+x.impCnt||0;clk+=+x.clkCnt||0;cost+=+x.salesAmt||0;}
  }
  const dow=['일','월','화','수','목','금','토'][new Date(d+'T00:00:00Z').getUTCDay()];
  console.log(d,dow,'| 소진',cost.toLocaleString('ko-KR'),'| 클릭',clk,'| CPC',clk?Math.round(cost/clk).toLocaleString('ko-KR'):'-','| 노출',imp.toLocaleString('ko-KR'));
 }
})();
