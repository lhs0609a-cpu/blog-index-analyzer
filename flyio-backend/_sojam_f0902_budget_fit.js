// 과예산 캠페인 OFF + 계정 일예산 합계를 150,000원에 맞춤
//   node _sojam_f0902_budget_fit.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const TARGET=150000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,200)];}
 }catch(e){}await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r100=v=>Math.max(70,Math.round(v/100)*100);
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt']));
(async()=>{
 const live=((await raw('/ncc/campaigns','GET',null))[1]||[]).filter(c=>!c.delFlag);
 const ids=[...new Set(live.map(c=>c.nccCampaignId))];
 // 오늘 + 어제 소진
 const st={};
 for(const d of ['2026-09-01','2026-09-02']){
  const T=encodeURIComponent(JSON.stringify({since:d,until:d}));
  for(const g of chunk(ids,40)){
   const [o,r]=await raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`,'GET',null);
   for(const x of ((r&&r.data)||[]))(st[x.id]||={})[d]=x;}
 }
 const rows=live.map(c=>{const s=st[c.nccCampaignId]||{};
  const t=(s['2026-09-02']||{}).salesAmt||0, y=(s['2026-09-01']||{}).salesAmt||0;
  const b=c.useDailyBudget?(c.dailyBudget||0):null;
  return {id:c.nccCampaignId,name:c.name,tp:c.campaignTp,lock:!!c.userLock,b,t,y,
   pct:b?Math.round(t*100/b):null};});
 const active=rows.filter(r=>!r.lock);
 // ① 오늘 예산 초과(>=100%) 캠페인
 const over=active.filter(r=>r.b&&r.t>r.b);
 console.log(`운영중 캠페인 ${active.length}개 · 일예산 합 ${won(active.reduce((s,r)=>s+(r.b||0),0))}원`);
 console.log(`오늘 소진 ${won(rows.reduce((s,r)=>s+r.t,0))}원 · 어제 ${won(rows.reduce((s,r)=>s+r.y,0))}원\n`);
 console.log(`=== ① 오늘 예산 초과 → OFF 대상 ${over.length}개 ===`);
 over.sort((a,b)=>b.pct-a.pct).forEach(r=>
  console.log(`  ${r.name.slice(0,38).padEnd(40)}예산 ${won(r.b).padStart(8)}원 · 소진 ${won(r.t).padStart(8)}원 (${r.pct}%)`));
 const offIds=new Set(over.map(r=>r.id));
 // ② 150,000원을 '실제 소진' 비중으로 배분한다.
 //    현재 예산 비율로 나누면 한 푼도 안 쓰는 캠페인 120여 개가 절반을 물고 있어
 //    주력(파워링크)이 반토막 난다. 최근 이틀 소진을 가중치로 쓴다.
 const keep=active.filter(r=>!offIds.has(r.id)&&r.b!==null);
 const FLOOR=70;
 const spend=r=>(r.t+r.y)/2;
 const spenders=keep.filter(r=>spend(r)>0), idle=keep.filter(r=>spend(r)<=0);
 const pool=TARGET-idle.length*FLOOR;          // 잠자는 캠페인은 바닥값만
 const tw=spenders.reduce((s,r)=>s+spend(r),0);
 const plan=[
  ...spenders.map(r=>({...r,nb:Math.max(FLOOR,r100(pool*spend(r)/tw))})),
  ...idle.map(r=>({...r,nb:FLOOR})),
 ].sort((a,b)=>b.nb-a.nb);
 const cur=keep.reduce((s,r)=>s+r.b,0);
 console.log(`
=== ② 일예산 재배분 — 현재 합 ${won(cur)}원 → 목표 ${won(TARGET)}원 ===`);
 console.log(`  소진 있는 캠페인 ${spenders.length}개에 ${won(pool)}원 배분 · 잠자는 ${idle.length}개는 ${FLOOR}원`);
 console.log('  캠페인                                   현재예산    최근평균소진   새 예산');
 plan.filter(r=>spend(r)>0).forEach(r=>
  console.log(`  ${r.name.slice(0,36).padEnd(38)}${won(r.b).padStart(9)}원${won(spend(r)).padStart(11)}원${won(r.nb).padStart(9)}원`));
 const after=plan.reduce((s,r)=>s+r.nb,0);
 console.log(`  변경 ${plan.filter(r=>r.nb!==r.b).length}개 · 새 예산 합 ${won(after)}원`);
 fs.writeFileSync(P('_sojam_f0902_budgetfit_ROLLBACK.json'),
  JSON.stringify({off:over.map(r=>({id:r.id,name:r.name})),
   budgets:plan.map(r=>({id:r.id,name:r.name,budget:r.b}))},null,1));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(const r of over){
  const [o,e]=await raw(`/ncc/campaigns/${r.id}?fields=userLock`,'PUT',{nccCampaignId:r.id,userLock:true});
  if(o)ok++;else{bad++;console.log('  OFF 실패',r.name,String(e).slice(0,100));}
  await sleep(300);}
 console.log(`캠페인 OFF — 성공 ${ok} / 실패 ${bad}`);
 let ok2=0,bad2=0;
 for(const r of plan.filter(x=>x.nb!==x.b)){
  const [o,e]=await raw(`/ncc/campaigns/${r.id}?fields=budget`,'PUT',
   {nccCampaignId:r.id,dailyBudget:r.nb,useDailyBudget:true});
  if(o)ok2++;else{bad2++;console.log('  예산 실패',r.name,String(e).slice(0,100));}
  await sleep(250);}
 console.log(`예산 조정 — 성공 ${ok2} / 실패 ${bad2}`);
})();
