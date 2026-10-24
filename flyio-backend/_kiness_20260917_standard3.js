const fs=require('fs'),path=require('path');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
(async()=>{
 const before=await req('GET','/ncc/shared-budgets',null,CID,4);
 fs.writeFileSync(path.join(D,'sharedbudget_before.json'),JSON.stringify(before));
 const todo=before.filter(b=>b.deliveryMethod!=='STANDARD');
 if(todo.length){
  const body=todo.map(b=>({sharedBudgetId:b.sharedBudgetId,dailyBudget:b.dailyBudget,deliveryMethod:'STANDARD'}));
  const r=await req('PUT','/ncc/shared-budgets?fields=dailyBudget',body,CID,3);
  if(!Array.isArray(r))throw Error('unexpected '+JSON.stringify(r).slice(0,200));
 }
 const after=await req('GET','/ncc/shared-budgets',null,CID,4);
 fs.writeFileSync(path.join(D,'sharedbudget_after.json'),JSON.stringify(after));
 console.log('공유예산 최종 상태:');
 for(const b of after)console.log(' ',b.deliveryMethod==='STANDARD'?'✔':'✘',b.name,b.dailyBudget+'원',b.deliveryMethod,'inUse'+b.numberInUse);
 const bad=after.filter(b=>b.deliveryMethod!=='STANDARD');
 console.log(bad.length?('미적용 '+bad.length+'건'):'전부 균등배분 적용됨');
})().catch(e=>{console.error(e);process.exitCode=1});
