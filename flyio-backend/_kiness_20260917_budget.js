const {req}=require('./_sojam_naver');const CID=441986;
(async()=>{
 const sb=await req('GET','/ncc/shared-budgets',null,CID,4);
 console.log('=== 공유예산 ===');
 for(const b of sb) console.log([b.nccSharedBudgetId,b.name,b.dailyBudget,'lock:'+b.budgetLock,'expect:'+(b.expectCost??'-')].join('\t'));
 const now=new Date();
 const stats=await req('GET','/stats?ids='+encodeURIComponent((await req('GET','/ncc/campaigns',null,CID,4)).map(c=>c.nccCampaignId).slice(0,50).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','impCnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-09-17',until:'2026-09-17'})),null,CID,4);
 const t=stats.data.reduce((a,x)=>({c:a.c+(x.salesAmt||0),k:a.k+(x.clkCnt||0),i:a.i+(x.impCnt||0)}),{c:0,k:0,i:0});
 console.log('오늘(09-17) 첫50캠페인 누적', JSON.stringify(t), 'now', now.toISOString());
})().catch(e=>{console.error(e);process.exitCode=1});
