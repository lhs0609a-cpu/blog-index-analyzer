// 스테로이드 계열 전부 노출 — 잠금해제 + 1위 추정가 (바닥 500 / 상한 20000)
//   node _sojam_e0831_up_steroid.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907',EST_CID='3808925';
const APPLY=process.argv.includes('--apply');
const FLOOR=500,CAP=20000;
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(1500*(t+1),10000));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
const kws=[...new Set(rows.map(r=>r.kw))];
(async()=>{
 let lad={};
 const LF=P('_sojam_e0831_steroid_ladder.json');
 if(fs.existsSync(LF))lad=JSON.parse(fs.readFileSync(LF,'utf8'));
 const need=kws.filter(k=>!(k in lad));
 if(need.length){
  console.error(`1·2위 추정가 조회 ${need.length}개…`);
  for(const pos of [1,2]){
   for(let i=0;i<need.length;i+=100){const b=need.slice(i,i+100);
    try{const r=await req('POST','/estimate/average-position-bid/keyword',
      {device:'PC',items:b.map(k=>({key:k,position:pos}))},EST_CID);
     for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;}
    }catch(e){console.error(`  pos${pos} 실패 ${String(e).slice(0,70)}`);}
    await sleep(300);}}
  for(const k of need)lad[k]||={};
  fs.writeFileSync(LF,JSON.stringify(lad));
 }
 const bids=[],unlock=[],plan=[];
 for(const r of rows){
  if(r.lock)unlock.push({nccKeywordId:r.id,nccAdgroupId:r.gid,userLock:false});
  const l=lad[r.kw]||{};const est=l[1]??l[2];
  const nb=est==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,est)));
  if(nb>r.eff){bids.push({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:nb,useGroupBidAmt:false});
   plan.push({kw:r.kw,cur:r.eff,est:est??null,nb,camp:r.camp,st:r.status});}
 }
 const b={};for(const p of plan){const u=(b[p.kw]||={cur:0,est:p.est,nb:p.nb});u.cur=Math.max(u.cur,p.cur);}
 const L=Object.entries(b).sort((x,y)=>y[1].nb-x[1].nb);
 console.log(`스테로이드 계열 인스턴스 ${rows.length}개 · 고유 ${kws.length}종`);
 console.log(`잠금해제 ${won(unlock.length)}개 · 입찰가 상향 ${won(bids.length)}개 (고유 ${L.length}종)`);
 const bef=plan.reduce((s,p)=>s+p.cur,0),aft=plan.reduce((s,p)=>s+p.nb,0);
 console.log(`입찰가 합 ${won(bef)}원 → ${won(aft)}원 · 평균 ${won(bef/plan.length)}원 → ${won(aft/plan.length)}원\n`);
 console.log('=== 적용가 상위 35 ===');
 L.slice(0,35).forEach(([k,u])=>console.log(`  ${k.slice(0,26).padEnd(28)}${won(u.cur).padStart(7)}원 → ${won(u.nb).padStart(7)}원  (1위추정 ${u.est==null?'없음':won(u.est)+'원'})`));
 fs.writeFileSync(P('_sojam_e0831_up_steroid_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(rows.map(r=>[r.id,{gid:r.gid,kw:r.kw,eff:r.eff,lock:r.lock,st:r.status}]))));
 console.log(`\n롤백 스냅샷 ${rows.length}개 저장`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 for(const [label,arr,f] of [['잠금 해제',unlock,'userLock'],['입찰가',bids,'bidAmt']]){
  if(!arr.length)continue;let ok=0,bad=0;
  for(let i=0;i<arr.length;i+=100){const bb=arr.slice(i,i+100);
   const [o,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(o)ok+=bb.length;else{bad+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,90));}
   await sleep(150);}
  console.log(`${label} 완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);}
})();
