const fs=require('fs'),crypto=require('crypto');
const C=JSON.parse(fs.readFileSync('_medilon_creds.json','utf8'));
const BASE='https://api.searchad.naver.com',CID=String(C.customer_id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function hdr(m,uri){const ts=String(Date.now());return {'Content-Type':'application/json; charset=UTF-8','X-Timestamp':ts,'X-API-KEY':C.api_key,'X-Customer':CID,'X-Signature':crypto.createHmac('sha256',C.secret_key).update(ts+'.'+m+'.'+uri).digest('base64')};}
async function req(m,ep,b){const r=await fetch(BASE+ep,{method:m,headers:hdr(m,ep.split('?')[0]),body:b?JSON.stringify(b):undefined,signal:AbortSignal.timeout(40000)});
 const t=await r.text();if(!r.ok)throw new Error(r.status+' '+t.slice(0,180));return JSON.parse(t);}
(async()=>{
 const cs=await req('GET','/ncc/campaigns');
 const plan=JSON.parse(fs.readFileSync('reports/medilon_20260921/plan_budget.json','utf8'));
 const live={};for(const c of cs)live[c.nccCampaignId]=c.dailyBudget;
 const bad=plan.filter(p=>live[p.id]!==p.neu);
 console.log('불일치',bad.length);
 for(const p of bad){
   console.log('  ',p.name,live[p.id],'→',p.neu);
   try{await req('PUT','/ncc/campaigns/'+p.id+'?fields=budget',{nccCampaignId:p.id,dailyBudget:p.neu,useDailyBudget:true});}
   catch(e){console.error('   실패',e.message.slice(0,120));}
   await sleep(200);
 }
 const cs2=await req('GET','/ncc/campaigns');
 const live2={};for(const c of cs2)live2[c.nccCampaignId]=c.dailyBudget;
 const ok=plan.filter(p=>live2[p.id]===p.neu).length;
 console.log('\n재확인',ok+'/'+plan.length,ok===plan.length?'✓':'← 여전히 불일치');
 console.log('일예산 합계',cs2.reduce((a,c)=>a+c.dailyBudget,0),'원');
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
