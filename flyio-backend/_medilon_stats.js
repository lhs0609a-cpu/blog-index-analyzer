const fs=require('fs'),crypto=require('crypto');const D='reports/medilon_20260921/';
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep){for(let t=0;t<4;t++){try{const r=await fetch(BASE+ep,{headers:hdr(m,ep.split('?')[0]),signal:AbortSignal.timeout(60000)});
  const x=await r.text();if(r.status===429||r.status>=500){await sleep(1500*(t+1));continue;}
  if(!r.ok)throw new Error(r.status+' '+x.slice(0,200));return JSON.parse(x);}catch(e){if(t===3)throw e;await sleep(1200*(t+1));}}}
const FIELDS='["impCnt","clkCnt","salesAmt","ctr","cpc","avgRnk"]';
(async()=>{
  const cps=JSON.parse(fs.readFileSync(D+'campaigns.json','utf8'));
  const ids=cps.map(c=>c.nccCampaignId);
  const tr=encodeURIComponent(JSON.stringify({since:'2026-06-23',until:'2026-09-20'}));
  const acc={};
  for(let i=0;i<ids.length;i+=20){
    const q='/stats?ids='+ids.slice(i,i+20).join('&ids=')+'&fields='+encodeURIComponent(FIELDS)+'&timeRange='+tr;
    const r=await req('GET',q);
    for(const d of (r.data||[]))acc[d.id]=d;
    await sleep(200);
  }
  const rowsOut=cps.map(c=>({id:c.nccCampaignId,name:c.name,budget:c.dailyBudget,...(acc[c.nccCampaignId]||{})}));
  fs.writeFileSync(D+'campaign_stats.json',JSON.stringify(rowsOut,null,1));
  const sum=k=>rowsOut.reduce((a,b)=>a+(+b[k]||0),0);
  console.log('90일 합계  노출',sum('impCnt'),'클릭',sum('clkCnt'),'비용',Math.round(sum('salesAmt')),'원');
  console.log('일예산 합계',rowsOut.reduce((a,b)=>a+b.budget,0),'원/일');
  console.log('\n지출 상위 15');
  for(const r of rowsOut.slice().sort((a,b)=>(+b.salesAmt||0)-(+a.salesAmt||0)).slice(0,15))
    console.log(('' +r.name).padEnd(28), '예산',String(r.budget).padStart(6), '노출',String(r.impCnt||0).padStart(7),'클릭',String(r.clkCnt||0).padStart(5),'비용',String(Math.round(r.salesAmt||0)).padStart(7));
  const zero=rowsOut.filter(r=>!(+r.salesAmt));
  console.log('\n90일 지출 0원 캠페인',zero.length,'/',rowsOut.length,'· 이들의 예산 합계',zero.reduce((a,b)=>a+b.budget,0),'원/일');
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
