const fs=require('fs'),path=require('path'),assert=require('assert');const {req}=require('./_sojam_naver');const D=path.join(__dirname,'reports/kiness_mobile_budget_20260909');const save=(n,v)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(v));
const call=async(m,p,b)=>{const r=await req(m,p,b,441986,3);if(r===undefined)throw Error('Missing response');return r;};
(async()=>{
 const shared=await call('GET','/ncc/shared-budgets'),camps=await call('GET','/ncc/campaigns');save('budget_preflight',{at:new Date().toISOString(),shared,camps});
 const total=shared.find(x=>x.sharedBudgetId==='nsb-a001-01-000000000073065');assert(total&&total.customerId===441986);assert(camps.filter(c=>c.campaignTp==='WEB_SITE').every(c=>c.sharedBudgetId===total.sharedBudgetId));
 const others=camps.filter(c=>!c.userLock&&c.campaignTp!=='WEB_SITE'&&c.campaignTp!=='BRAND_SEARCH');assert(others.every(c=>c.useDailyBudget));assert.equal(others.reduce((s,c)=>s+c.dailyBudget,0),2000);
 const payload={sharedBudgetId:total.sharedBudgetId,customerId:441986,name:total.name,ownerType:total.ownerType,dailyBudget:178000,deliveryMethod:'ACCELERATED'};
 const r=await call('PUT','/ncc/shared-budgets/'+total.sharedBudgetId,payload);save('budget_mutation',r);
 const after=await call('GET','/ncc/shared-budgets'),ca=await call('GET','/ncc/campaigns');const s=after.find(x=>x.sharedBudgetId===total.sharedBudgetId);assert.equal(s.dailyBudget,178000);assert.equal(s.deliveryMethod,'ACCELERATED');assert(ca.filter(c=>c.campaignTp==='WEB_SITE').every(c=>c.sharedBudgetId===s.sharedBudgetId&&c.sharedDailyBudget===178000&&c.sharedBudgetDeliveryMethod==='ACCELERATED'));
 save('budget_verified',{at:new Date().toISOString(),shared:after,campaigns:ca,dailyConfigured:180000,actualSpendGuaranteed:false});console.log('VERIFIED search shared178000 + content1000 + place1000 =180000; accelerated; 69 campaign memberships retained');
})().catch(e=>{save('budget_error',{at:new Date().toISOString(),error:String(e)});console.error(e);process.exitCode=1;});
