const fs=require('fs'),path=require('path'),assert=require('assert');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const NEW=250000;
const IDS=['nsb-a001-01-000000000073065','nsb-a001-02-000000000073066','nsb-a001-02-000000000073067'];
const call=(m,p,b)=>req(m,p,b,441986,m==='GET'?4:1);
(async()=>{
 const before=await call('GET','/ncc/shared-budgets');
 fs.writeFileSync(path.join(D,'budget250_before.json'),JSON.stringify(before));
 const events=[];
 for(const id of IDS){
  const b=before.find(x=>x.sharedBudgetId===id);assert(b,'공유예산 없음 '+id);
  const r=await call('PUT','/ncc/shared-budgets/'+id,
   {sharedBudgetId:id,customerId:441986,name:b.name,ownerType:b.ownerType,dailyBudget:NEW,deliveryMethod:'ACCELERATED'});
  events.push({id,name:b.name,before:b.dailyBudget,after:r.dailyBudget});
 }
 const after=await call('GET','/ncc/shared-budgets');
 fs.writeFileSync(path.join(D,'budget250_after.json'),JSON.stringify(after));
 for(const e of events)assert.equal(after.find(x=>x.sharedBudgetId===e.id)?.dailyBudget,NEW,'반영 실패 '+e.id);
 const camps=await call('GET','/ncc/campaigns');
 const place=camps.find(c=>c.campaignTp==='PLACE'&&!c.userLock);
 const contents=camps.filter(c=>c.campaignTp==='POWER_CONTENTS'&&!c.userLock);
 const info=after.find(x=>x.sharedBudgetId==='nsb-a001-02-000000000073235');
 const out={at:new Date().toISOString(),events,
  검색광고_공유예산:NEW,정보탐색_공유예산:info?.dailyBudget,
  플레이스:place.dailyBudget,파워컨텐츠:contents.map(c=>c.dailyBudget),
  설정_합계:NEW+place.dailyBudget+contents.reduce((a,c)=>a+c.dailyBudget,0)};
 fs.writeFileSync(path.join(D,'budget250_result.json'),JSON.stringify(out,null,1));
 console.log(JSON.stringify(out,null,1));
})().catch(e=>{fs.writeFileSync(path.join(D,'budget250_error.json'),JSON.stringify({at:new Date().toISOString(),error:String(e)}));console.error(e);process.exitCode=1;});
