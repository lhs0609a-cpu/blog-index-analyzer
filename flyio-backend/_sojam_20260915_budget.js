// 공유예산 dailyBudget 변경 — 캠페인 예산 합계는 상한이 아니다([[sojam-ad-budget]] 9/14 정정). 생성은 불가, 수정만 된다.
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const SBID='nsb-a001-01-000000000045855';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(m,p,b){for(let t=0;t<3;t++){try{
 const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success) throw Error('rej '+String(d.error||'').slice(0,200)); return d.response;}
 catch(e){if(t===2||m!=='GET')throw e;await sleep(1500);}}}
const AMOUNT=Number(process.argv[2]);
(async()=>{
 if(!AMOUNT||AMOUNT<1000) throw Error('금액 인자 필요');
 const list=await api('GET','/ncc/shared-budgets');
 const sb=list.find(x=>x.sharedBudgetId===SBID);
 if(!sb) throw Error('공유예산 없음');
 console.log('변경 전:', sb.name, sb.dailyBudget.toLocaleString('ko-KR')+'원', '| 연결', sb.numberInUse+'개', '| editTm', sb.editTm);
 const D=path.join(__dirname,'../reports/sojam-20260915/');
 fs.writeFileSync(D+'sharedbudget_before.json',JSON.stringify(sb,null,1));
 if(sb.dailyBudget===AMOUNT) return console.log('이미 같은 금액');
 await api('PUT','/ncc/shared-budgets/'+SBID,{...sb,dailyBudget:AMOUNT});
 await sleep(1200);
 const after=(await api('GET','/ncc/shared-budgets')).find(x=>x.sharedBudgetId===SBID);
 console.log('변경 후:', after.dailyBudget.toLocaleString('ko-KR')+'원', '| 배분', after.deliveryMethod, '| 상태', after.status, '| editTm', after.editTm);
 if(after.dailyBudget!==AMOUNT) throw Error('검증 실패: '+after.dailyBudget);
 // 공유예산 밖 캠페인
 const camps=((await api('GET','/ncc/campaigns?recordSize=1000'))||[]).filter(c=>!c.delFlag&&!c.sharedBudgetId);
 const own=camps.reduce((a,c)=>a+(c.dailyBudget||0),0);
 console.log('공유예산 밖 개별예산:', camps.map(c=>c.name+' '+(c.dailyBudget||0).toLocaleString('ko-KR')).join(' · '));
 console.log('계정 일 상한 합계:', (AMOUNT+own).toLocaleString('ko-KR')+'원');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
