// 은밀부위(생식기·항문·사타구니·유두 등) 피부질환 키워드 상향 — 1위 추정가 / 바닥 500 / 상한 20000
//   node _sojam_f0901_up_intimate.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const {why}=require('./_sojam_d0828_rule.js');
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
// '성기'는 만성기침·여성기 등 어절을 넘는 충돌이 있어 부정 선행 제한
const AREA=/고환|음낭|음경|귀두|(?<![만여남악양급독다])성기|사타구니|서혜|회음|항문|똥꼬|외음|질가려움|질염|음부|엉덩이|둔부|치골|겨드랑이|유두|유륜/;
// 비의료 상품·용품 제외
const JUNK=/바람막이|마사지기|팬티|티셔츠|안장|자전거|뽕|레깅스|속옷|의자|쿠션|방석|패드|운동|스쿼트|힙업|확대|왁싱|제모기|보정|커버|가방|인형|스티커|테이프|의료기|기구|매트|밴드|수영복|담요|가터|브라|니플|보호대|수술|시술|레이저|보톡스|필러|절제|제거술|주사기|주사맞|땀주사|엉덩이주사|리프팅|성형/;
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const sel=inv.filter(r=>AREA.test(r.kw)&&!JUNK.test(r.kw)&&!why(r.kw));
const kws=[...new Set(sel.map(r=>r.kw))];
(async()=>{
 const LF=P('_sojam_f0901_intimate_ladder.json');
 let lad=fs.existsSync(LF)?JSON.parse(fs.readFileSync(LF,'utf8')):{};
 const need=kws.filter(k=>!(k in lad));
 if(need.length){
  console.error(`1·2위 추정가 조회 ${need.length}개…`);
  for(const pos of [1,2]){
   for(let i=0;i<need.length;i+=100){const b=need.slice(i,i+100);
    try{const r=await req('POST','/estimate/average-position-bid/keyword',
      {device:'PC',items:b.map(k=>({key:k,position:pos}))},EST_CID);
     for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;}
    }catch(e){console.error(`  pos${pos} 실패 ${String(e).slice(0,70)}`);}
    await sleep(250);}
   console.error(`  pos${pos} 완료`);}
  for(const k of need)lad[k]||={};
  fs.writeFileSync(LF,JSON.stringify(lad));
 }
 const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,e)));};
 const items=[],unlock=[],plan=[];
 for(const r of sel){
  const nb=bidOf(r.kw);
  if(r.lock)unlock.push({nccKeywordId:r.id,nccAdgroupId:r.gid,userLock:false});
  if(nb>r.bid){items.push({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:nb,useGroupBidAmt:false});
   plan.push({kw:r.kw,cur:r.bid,nb,camp:r.camp});}
 }
 const b={};for(const p of plan){const u=(b[p.kw]||={cur:0,nb:p.nb});u.cur=Math.max(u.cur,p.cur);}
 const L=Object.entries(b).sort((x,y)=>y[1].nb-x[1].nb);
 console.log(`은밀부위 대상 고유 ${won(kws.length)}종 / 인스턴스 ${won(sel.length)}개 (상품·용품 제외)`);
 console.log(`올라가는 인스턴스 ${won(items.length)}개 · 고유 ${won(L.length)}종 · 잠금해제 ${won(unlock.length)}개`);
 const bef=plan.reduce((s,p)=>s+p.cur,0),aft=plan.reduce((s,p)=>s+p.nb,0);
 console.log(`입찰가 합 ${won(bef)}원 → ${won(aft)}원 · 평균 ${won(bef/(plan.length||1))}원 → ${won(aft/(plan.length||1))}원\n`);
 console.log('=== 적용가 상위 30 ===');
 L.slice(0,30).forEach(([k,u])=>console.log(`  ${k.slice(0,24).padEnd(26)}${won(u.cur).padStart(7)}원 → ${won(u.nb).padStart(7)}원`));
 fs.writeFileSync(P('_sojam_f0901_intimate_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(sel.map(r=>[r.id,{gid:r.gid,kw:r.kw,bid:r.bid,ugb:r.ugb,lock:r.lock}]))));
 console.log(`\n롤백 스냅샷 ${won(sel.length)}개 저장`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 for(const [label,arr,f] of [['잠금 해제',unlock,'userLock'],['입찰가',items,'bidAmt']]){
  if(!arr.length)continue;let ok=0,bad=0;
  for(let i=0;i<arr.length;i+=100){const bb=arr.slice(i,i+100);
   const [o,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(o)ok+=bb.length;else{bad+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,90));}
   await sleep(150);}
  console.log(`${label} 완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);}
})();
