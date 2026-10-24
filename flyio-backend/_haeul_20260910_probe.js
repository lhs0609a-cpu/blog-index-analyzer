const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_20260910'),CID=3442423;
fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
async function call(method,p,body=null){for(let t=0;t<3;t++){try{const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,path:p,body,customer_id:String(CID)}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('API '+r.status+' '+p.split('?')[0]+' '+JSON.stringify(d.error||d.detail||d).slice(0,300));return d.response;}catch(e){if(t===2)throw e;await sleep(2000);}}}
(async()=>{
 const campaigns=await call('GET','/ncc/campaigns');save('campaigns',campaigns);
 console.log('CAMPAIGNS');
 for(const c of campaigns)console.log([c.nccCampaignId,c.campaignTp,c.name,'budget='+c.dailyBudget,'useDaily='+c.useDailyBudget,'shared='+(c.sharedBudgetId||'-'),'lock='+c.sharedBudgetLock,'userLock='+c.userLock,c.status].join(' | '));
 console.log('TOTAL DAILY BUDGET',campaigns.reduce((s,c)=>s+(c.useDailyBudget?c.dailyBudget:0),0));
 for(const p of ['/ncc/shared-budgets','/ncc/shared-budget','/ncc/budgets','/ncc/sharedBudgets']){
  try{const r=await call('GET',p);console.log('PROBE OK',p,JSON.stringify(r).slice(0,600));}
  catch(e){console.log('PROBE FAIL',p,String(e).slice(0,220));}
 }
 // yesterday spend at campaign level
 const ids=campaigns.map(c=>c.nccCampaignId);
 const stats=await call('GET','/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','ccnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-09-09',until:'2026-09-09'})));
 save('campaign_yesterday',stats);
 console.log('YESTERDAY', JSON.stringify(stats));
})().catch(e=>{console.error('ERR',String(e));process.exitCode=1;});
