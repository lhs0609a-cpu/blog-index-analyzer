const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function get(p){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:'GET',path:p,body:null}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+r.status+' '+(d.error||''));return d.response;}catch(e){if(a===3)throw e;await new Promise(s=>setTimeout(s,2000));}}}
(async()=>{
const D='2026-09-09';
const camps=await get('/ncc/campaigns?recordSize=1000');
const enc=x=>encodeURIComponent(JSON.stringify(x));
const rows=[];
for(let i=0;i<camps.length;i+=50){
  const ids=camps.slice(i,i+50).map(c=>c.nccCampaignId).join(',');
  const r=await get('/stats?ids='+encodeURIComponent(ids)+'&fields='+enc(['impCnt','clkCnt','salesAmt','ccnt'])+'&timeRange='+enc({since:D,until:D}));
  rows.push(...(r.data||[]));
}
const t=rows.reduce((a,r)=>({imp:a.imp+ +(r.impCnt||0),clk:a.clk+ +(r.clkCnt||0),cost:a.cost+ +(r.salesAmt||0)}),{imp:0,clk:0,cost:0});
const byName=rows.filter(r=>+r.salesAmt>0||+r.clkCnt>0).map(r=>({name:(camps.find(c=>c.nccCampaignId===r.id)||{}).name,id:r.id,imp:+r.impCnt,clk:+r.clkCnt,cost:+r.salesAmt})).sort((a,b)=>b.cost-a.cost);
console.log(JSON.stringify({date:D,campaigns:camps.length,total:t,byCampaign:byName},null,1));
require('fs').writeFileSync(__dirname+'/../../reports/sojam-20260909/yesterday_campaign_stats.json',JSON.stringify({date:D,total:t,byCampaign:byName,raw:rows}));
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
