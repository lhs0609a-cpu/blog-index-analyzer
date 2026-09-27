const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
const APPLY=process.argv.includes('--apply');
(async()=>{
 const sb=await req('GET','/ncc/shared-budgets',null,CID,4);
 const camps=await req('GET','/ncc/campaigns',null,CID,4);
 fs.writeFileSync(path.join(D,'delivery_backup.json'),JSON.stringify({at:new Date().toISOString(),sharedBudgets:sb,campaigns:camps.map(c=>({id:c.nccCampaignId,name:c.name,deliveryMethod:c.deliveryMethod,dailyBudget:c.dailyBudget,useDailyBudget:c.useDailyBudget,sharedBudgetId:c.sharedBudgetId}))}));
 const sbTodo=sb.filter(b=>b.deliveryMethod!=='STANDARD');
 const cTodo=camps.filter(c=>c.deliveryMethod!=='STANDARD');
 console.log('공유예산 변경대상',sbTodo.length,'/',sb.length);
 console.log('캠페인 변경대상',cTodo.length,'/',camps.length);
 if(!APPLY){console.log('DRY RUN. --apply 로 실행');return;}
 const sbRes=[];
 for(const b of sbTodo){
  try{const r=await req('PUT','/ncc/shared-budgets',{...b,deliveryMethod:'STANDARD'},CID,3);
   sbRes.push({id:b.sharedBudgetId,name:b.name,ok:r?.deliveryMethod==='STANDARD',got:r?.deliveryMethod||JSON.stringify(r).slice(0,150)});
  }catch(e){sbRes.push({id:b.sharedBudgetId,name:b.name,ok:false,err:String(e).slice(0,200)});}
 }
 console.log('공유예산 결과:');for(const r of sbRes)console.log(' ',r.ok?'OK':'FAIL',r.name,r.got||r.err||'');
 let ok=0,fail=[];
 await pool(cTodo,4,async c=>{
  try{const r=await req('PUT','/ncc/campaigns/'+c.nccCampaignId+'?fields='+encodeURIComponent(JSON.stringify(['budget'])),{...c,deliveryMethod:'STANDARD'},CID,3);
   if(r?.deliveryMethod==='STANDARD')ok++;else fail.push({n:c.name,got:JSON.stringify(r).slice(0,150)});
  }catch(e){fail.push({n:c.name,err:String(e).slice(0,200)});}
 });
 console.log('캠페인 STANDARD 적용',ok,'실패',fail.length);
 for(const f of fail.slice(0,10))console.log('  FAIL',f.n,f.err||f.got);
 fs.writeFileSync(path.join(D,'delivery_result.json'),JSON.stringify({sbRes,ok,fail}));
})().catch(e=>{console.error(e);process.exitCode=1});
