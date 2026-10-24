const fs = require('fs');
const path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function get(p) {
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:'GET',path:p,body:null}),signal:AbortSignal.timeout(30000)});
      const d=await r.json(); if(!r.ok || !d.success) throw Error('API rejected '+r.status);
      return d.response;
    } catch(e) { if(attempt===2) throw e; }
  }
}
(async()=>{
  const started=new Date().toISOString();
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const campaigns=await get('/ncc/campaigns?recordSize=1000');
  if(!Array.isArray(campaigns) || campaigns.length>=1000) throw Error('Unexpected campaign pagination');
  const enc=x=>encodeURIComponent(JSON.stringify(x));
  const responses=[];
  for(let i=0;i<campaigns.length;i+=50) responses.push(await get('/stats?ids='+encodeURIComponent(campaigns.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt'])+'&timeRange='+enc({since:date,until:date})+'&breakdown=pcMblTp'));
  const total={impCnt:0,clkCnt:0,salesAmt:0};
  const rows=responses.flatMap(r=>r.data||[]);
  for(const r of rows) for(const k in total) total[k]+=Number(r[k]||0);
  const top=rows.filter(r=>r.salesAmt>0).sort((a,b)=>b.salesAmt-a.salesAmt).map(r=>({name:campaigns.find(c=>c.nccCampaignId===r.id)?.name,...r}));
  const output={started,finished:new Date().toISOString(),date,campaignCount:campaigns.length,total,dailyBudgetSum:campaigns.filter(c=>c.useDailyBudget).reduce((s,c)=>s+c.dailyBudget,0),meta:responses.map(({data,...rest})=>rest),top,campaigns,responses};
  const dir=path.resolve(__dirname,'../../reports/sojam-20260909');
  fs.writeFileSync(path.join(dir,'today-spend-'+Date.now()+'.json'),JSON.stringify(output));
  console.log(JSON.stringify({...output,campaigns:undefined,responses:undefined}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
