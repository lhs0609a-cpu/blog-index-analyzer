const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(method,p,body){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method,path:p,body:body||null}),signal:AbortSignal.timeout(50000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+r.status+' '+String(d.error||'').slice(0,100));return d.response;}catch(e){if(a===3)throw e;await new Promise(s=>setTimeout(s,2000));}}}
const enc=x=>encodeURIComponent(JSON.stringify(x));
(async()=>{
const D=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date());
console.error('date',D,'now',now);
const camps=await api('GET','/ncc/campaigns?recordSize=1000');
const rows=[];
for(let i=0;i<camps.length;i+=50){
  const r=await api('GET','/stats?ids='+encodeURIComponent(camps.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt'])+'&timeRange='+enc({since:D,until:D}));
  rows.push(...(r.data||[]));
  await new Promise(s=>setTimeout(s,300));
}
const t=rows.reduce((a,r)=>({imp:a.imp+ +(r.impCnt||0),clk:a.clk+ +(r.clkCnt||0),cost:a.cost+ +(r.salesAmt||0)}),{imp:0,clk:0,cost:0});
console.log('TODAY',D,now,JSON.stringify(t));
fs.writeFileSync('../../reports/sojam-20260909/_today_campaigns.json',JSON.stringify({date:D,at:now,total:t,rows,camps:camps.map(c=>({id:c.nccCampaignId,name:c.name}))}));
// 후보 키워드 오늘 실적
const IDS=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_bytext_ids.json','utf8'));
const rowsF=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_final_rows.json','utf8'));
const texts=[...new Set(rowsF.map(r=>r.kw))];
let ids=[],owner={};
for(const t2 of texts)for(const id of ((IDS[t2]||{}).on||[])){ids.push(id);owner[id]=t2;}
console.error('candidate keyword ids',ids.length);
const ks=[];
for(let i=0;i<ids.length;i+=40){
  const r=await api('GET','/stats?ids='+encodeURIComponent(ids.slice(i,i+40).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:D,until:D}));
  ks.push(...(r.data||[]));
  await new Promise(s=>setTimeout(s,300));
}
fs.writeFileSync('../../reports/sojam-20260909/_today_keywords.json',JSON.stringify({date:D,at:now,owner,stats:ks}));
console.log('kw rows',ks.length,'with imp',ks.filter(r=>+r.impCnt>0).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
