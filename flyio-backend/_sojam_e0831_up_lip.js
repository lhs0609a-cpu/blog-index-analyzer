// 입술·구강 계열 입찰가 대폭 상향 — 네이버 1위 추정가 기준 (어제 up2.js 와 동일 정책, 범위만 계정 전체)
//   node _sojam_e0831_up_lip.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const {why,REGION}=require('./_sojam_d0828_rule.js');
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

const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const FAM=/구순|구각|입술|구내염|설염|혀갈라짐|혓바닥|입안|구강/;
// 비의료·상품/시술 키워드, 정규식 오탐, 타지역(접두 규칙에서 새는 것 포함) 제외
const JUNK=/넥니트|립밤|제거제|레이저|흉터수술|모공|롬앤|무좀|수족구각질|딸기코/;
const REGION2=[...REGION,'구미','서면','순천','양산','진주','동래','수성구','칠곡','해운대','김천','안동','경주','상주','밀양','사천','통영','거제','나주','순창','정읍','남원'];
const isRegion=k=>REGION2.some(t=>k.includes(t));
const sel=inv.filter(r=>FAM.test(r.kw)&&!why(r.kw)&&!JUNK.test(r.kw)&&!isRegion(r.kw));
const kws=[...new Set(sel.map(r=>r.kw))];

(async()=>{
 let lad={};
 if(fs.existsSync(P('_sojam_e0831_lip_ladder.json')))lad=JSON.parse(fs.readFileSync(P('_sojam_e0831_lip_ladder.json'),'utf8'));
 const need=kws.filter(k=>!(k in lad));
 if(need.length){
  console.error(`1·2위 추정가 조회 ${need.length}개…`);
  for(const pos of [1,2]){
   for(let i=0;i<need.length;i+=100){
    const b=need.slice(i,i+100);
    try{const r=await req('POST','/estimate/average-position-bid/keyword',
      {device:'PC',items:b.map(k=>({key:k,position:pos}))},EST_CID);
     for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;}
    }catch(e){console.error(`  pos${pos} 배치 실패 ${String(e).slice(0,80)}`);}
    await sleep(300);}
   console.error(`  pos${pos} 완료`);}
  for(const k of need)lad[k]||={};
  fs.writeFileSync(P('_sojam_e0831_lip_ladder.json'),JSON.stringify(lad));
 }

 const items=[],unlock=[],plan=[];
 for(const r of sel){
  const l=lad[r.kw]||{};const est=l[1]??l[2];
  if(est==null)continue;
  const nb=r10(Math.min(CAP,Math.max(FLOOR,est)));
  if(nb<=r.eff)continue;                        // 이미 그 이상이면 건드리지 않음
  items.push({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:nb,useGroupBidAmt:false});
  if(r.lock)unlock.push({nccKeywordId:r.id,nccAdgroupId:r.gid,userLock:false});
  plan.push({kw:r.kw,cur:r.eff,est,nb,camp:r.camp,st:r.st,lock:r.lock});
 }
 const byKw={};for(const p of plan){const u=(byKw[p.kw]||={cur:0,est:p.est,nb:p.nb,n:0});u.n++;u.cur=Math.max(u.cur,p.cur);}
 const list=Object.entries(byKw).sort((a,b)=>b[1].nb-a[1].nb);
 console.log(`입술·구강 후보 키워드 ${won(kws.length)}개 · 추정가 확보 ${won(Object.values(lad).filter(v=>v[1]!=null||v[2]!=null).length)}개`);
 console.log(`올라가는 인스턴스 ${won(items.length)}개 / 고유 키워드 ${won(list.length)}개 · 잠금해제 ${won(unlock.length)}개`);
 const before=plan.reduce((s,p)=>s+p.cur,0), after=plan.reduce((s,p)=>s+p.nb,0);
 console.log(`입찰가 합 ${won(before)}원 → ${won(after)}원 · 평균 ${won(before/plan.length)}원 → ${won(after/plan.length)}원 (${(after/before).toFixed(1)}배)\n`);
 console.log('=== 적용가 상위 40 ===');
 console.log('  키워드                   현재     1위추정   적용가   인스턴스');
 for(const [k,u] of list.slice(0,40))
  console.log(`  ${k.slice(0,22).padEnd(24)}${won(u.cur).padStart(7)}원${won(u.est).padStart(9)}원${won(u.nb).padStart(8)}원${String(u.n).padStart(6)}`);
 const c={};for(const p of plan)(c[p.camp]||=[]).push(p);
 console.log('\n=== 캠페인별 ===');
 Object.entries(c).sort((a,b)=>b[1].length-a[1].length).slice(0,12).forEach(([k,a])=>
  console.log(`  ${k.slice(0,40).padEnd(42)}${String(a.length).padStart(5)}개 · 평균 ${won(a.reduce((s,p)=>s+p.nb,0)/a.length)}원`));
 fs.writeFileSync(P('_sojam_e0831_up_lip_plan.json'),JSON.stringify(plan,null,1));
 fs.writeFileSync(P('_sojam_e0831_up_lip_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(sel.map(r=>[r.id,{gid:r.gid,kw:r.kw,bid:r.bid,ugb:r.ugb,eff:r.eff,lock:r.lock}]))));
 console.log(`\n롤백 스냅샷 ${won(sel.length)}개 저장`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 for(const [label,arr,f] of [['잠금 해제',unlock,'userLock'],['입찰가',items,'bidAmt']]){
  if(!arr.length)continue;let ok=0,bad=0;
  for(let i=0;i<arr.length;i+=100){const b=arr.slice(i,i+100);
   const [o,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',b);
   if(o)ok+=b.length;else{bad+=b.length;console.log(`  ${label} 실패`,String(e).slice(0,90));}
   await sleep(150);}
  console.log(`${label} 완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);}
})();
