const fs=require('fs'),path=require('path');const {req}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
const APPLY=process.argv.includes('--apply');
(async()=>{
 const sb=await req('GET','/ncc/shared-budgets',null,CID,4);
 const todo=sb.filter(b=>b.deliveryMethod!=='STANDARD').map(b=>({...b,deliveryMethod:'STANDARD'}));
 console.log('대상',todo.map(b=>b.name).join(', '));
 if(!APPLY){console.log('DRY');return;}
 const r=await req('PUT','/ncc/shared-budgets',todo,CID,3);
 console.log('응답:',JSON.stringify(r).slice(0,800));
 const after=await req('GET','/ncc/shared-budgets',null,CID,4);
 for(const b of after)console.log(' ',b.name,b.dailyBudget,b.deliveryMethod,'inUse'+b.numberInUse);
 fs.writeFileSync(path.join(D,'delivery_after.json'),JSON.stringify(after));
})().catch(e=>{console.error(e);process.exitCode=1});
