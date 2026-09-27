// 일 소진 목표 150,000원에 맞춰 예산소진(cap) 캠페인 일예산 상향
//   node _sojam_f0901_budget_up.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const TARGET=150000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,250)];}
 }catch(e){}await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const rows=JSON.parse(fs.readFileSync(P('_sojam_f0901_budget.json'),'utf8'));
// 8/31 소진율 90% 이상 = 예산에 막힌 캠페인
const cap=rows.filter(r=>r.b&&r.pct!==null&&r.pct>=90);
const capSpend=cap.reduce((s,r)=>s+r.s31,0);
const capBudget=cap.reduce((s,r)=>s+r.b,0);
const other=rows.reduce((s,r)=>s+r.s31,0)-capSpend;
const room=TARGET-other;
const k=room/capBudget;
const r100=v=>Math.round(v/100)*100;
console.log(`8/31 소진 ${won(rows.reduce((s,r)=>s+r.s31,0))}원 → 목표 ${won(TARGET)}원`);
console.log(`예산 막힌 캠페인 ${cap.length}개 (예산합 ${won(capBudget)}원 / 소진 ${won(capSpend)}원)`);
console.log(`막히지 않은 캠페인 소진 ${won(other)}원 → cap 캠페인에 배분할 여유 ${won(room)}원 (배율 ${k.toFixed(3)})\n`);
const plan=cap.map(r=>({...r,nb:r100(r.b*k)}));
console.log('  캠페인                                     현재예산   →   신규예산     8/31소진');
for(const p of plan) console.log('  '+p.name.slice(0,38).padEnd(40)+won(p.b).padStart(8)+'원 → '+won(p.nb).padStart(8)+'원'+won(p.s31).padStart(10)+'원');
console.log(`\n예산 합 ${won(capBudget)}원 → ${won(plan.reduce((s,p)=>s+p.nb,0))}원 (+${won(plan.reduce((s,p)=>s+p.nb,0)-capBudget)}원)`);
console.log(`전액 소진 시 예상 일소진 ${won(plan.reduce((s,p)=>s+p.nb,0)+other)}원`);
fs.writeFileSync(P('_sojam_f0901_budget_ROLLBACK.json'),JSON.stringify(cap.map(r=>({id:r.id,name:r.name,budget:r.b})),null,1));
if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');process.exit(0);}
(async()=>{
 for(const p of plan){
  const [o,e]=await raw(`/ncc/campaigns/${p.id}?fields=budget`,'PUT',
   {nccCampaignId:p.id,dailyBudget:p.nb,useDailyBudget:true});
  console.log(o?`  ✓ ${p.name.slice(0,32)} → ${won(p.nb)}원`:`  ✗ ${p.name.slice(0,32)} 실패 ${String(e).slice(0,140)}`);
  await sleep(400);
 }
})();
