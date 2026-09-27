// 죽어있던 핵심 키워드 일괄 기동 — 잠금해제 + PC 1위 추정가
//   node _sojam_f0901_revive.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const {why}=require('./_sojam_d0828_rule.js');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907',EST_CID='3808925';
const APPLY=process.argv.includes('--apply');
const FLOOR=500, CAP=10000, FUNGAL_FLOOR=1000, FOLLIC_FLOOR=3000;
// 한의원 진료가 아닌 시술·미용·상품 제외
const SKIP=/레이저|수술|시술|보톡스|필러|주사맞|제거기|제거술|각질제거|스케일링|왁싱|제모|샴푸|크림|연고추천|바디워시|영양제|보험/;
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const audit=JSON.parse(fs.readFileSync(P('_sojam_f0901_audit.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const FUNGAL=/무좀|백선|어루러기|조갑진균|손발톱진균|칸디다/;
const FOLLIC=/모낭염/;
const deadSet=new Set(audit.dead.map(r=>r.kw));
// 대상: 감사에서 죽어있던 것 + 무좀·진균 전체 + 칸디다 + 모낭염 전체
const sel=inv.filter(r=>!why(r.kw)&&!SKIP.test(r.kw)&&(deadSet.has(r.kw)||FUNGAL.test(r.kw)||FOLLIC.test(r.kw)));
const kws=[...new Set(sel.map(r=>r.kw))];
(async()=>{
 const LF=P('_sojam_f0901_revive_ladder.json');
 let lad=fs.existsSync(LF)?JSON.parse(fs.readFileSync(LF,'utf8')):{};
 const need=kws.filter(k=>!(k in lad));
 if(need.length){
  console.error(`PC 1위 추정가 조회 ${need.length}개…`);
  for(let i=0;i<need.length;i+=100){
   try{const r=await req('POST','/estimate/average-position-bid/keyword',
     {device:'PC',items:need.slice(i,i+100).map(k=>({key:k,position:1}))},EST_CID);
    for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)lad[k]=e.bid;}
   }catch(e){console.error('  실패',String(e).slice(0,70));}
   await sleep(280);}
  for(const k of need)if(!(k in lad))lad[k]=null;
  fs.writeFileSync(LF,JSON.stringify(lad));
 }
 const floorOf=k=>FOLLIC.test(k)?FOLLIC_FLOOR:FUNGAL.test(k)?FUNGAL_FLOOR:FLOOR;
 const bidOf=k=>r10(Math.min(CAP,Math.max(floorOf(k),lad[k]??0)));
 // 라이브 재조회
 const gids=[...new Set(sel.map(r=>r.gid))];
 console.error(`그룹 ${gids.length}개 라이브 재조회…`);
 const live={};let i=0;
 await Promise.all(Array.from({length:24},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)if(!k.delFlag)live[k.nccKeywordId]=k;}}));
 const cur=sel.filter(r=>live[r.id]).map(r=>({...r,k:live[r.id]}));
 const unlock=cur.filter(r=>r.k.userLock).map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,userLock:false}));
 const up=cur.filter(r=>bidOf(r.kw)>(r.k.bidAmt||0));
 const items=up.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:bidOf(r.kw),useGroupBidAmt:false}));
 console.log(`\n대상 고유 ${won(kws.length)}종 / 인스턴스 ${won(cur.length)}개`);
 console.log(`잠금해제 ${won(unlock.length)}개 · 입찰가 상향 ${won(items.length)}개`);
 const bef=up.reduce((s,r)=>s+(r.k.bidAmt||0),0), aft=up.reduce((s,r)=>s+bidOf(r.kw),0);
 console.log(`입찰가 합 ${won(bef)}원 → ${won(aft)}원 · 평균 ${won(bef/(up.length||1))}원 → ${won(aft/(up.length||1))}원`);
 console.log(`바닥값 — 모낭염 계열 ${won(FOLLIC_FLOOR)}원 · 진균(무좀·칸디다) ${won(FUNGAL_FLOOR)}원 · 기타 ${won(FLOOR)}원\n`);
 const b={};for(const r of up){const u=(b[r.kw]||={cur:0,nb:bidOf(r.kw)});u.cur=Math.max(u.cur,r.k.bidAmt||0);}
 console.log('=== 적용가 상위 35 ===');
 Object.entries(b).sort((x,y)=>y[1].nb-x[1].nb).slice(0,35)
  .forEach(([k,u])=>console.log(`  ${k.slice(0,24).padEnd(26)}${won(u.cur).padStart(7)}원 → ${won(u.nb).padStart(7)}원  (1위추정 ${lad[k]==null?'없음':won(lad[k])+'원'})`));
 fs.writeFileSync(P('_sojam_f0901_revive_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(cur.map(r=>[r.id,{gid:r.gid,kw:r.kw,bid:r.k.bidAmt,lock:!!r.k.userLock,st:r.k.status}]))));
 console.log(`\n롤백 스냅샷 ${won(cur.length)}개 저장`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 for(const [label,arr,f] of [['잠금 해제',unlock,'userLock'],['입찰가',items,'bidAmt']]){
  if(!arr.length)continue;let ok=0,bad=0;
  for(let j=0;j<arr.length;j+=100){const bb=arr.slice(j,j+100);
   const [o,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(o)ok+=bb.length;else{bad+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,90));}
   await sleep(150);}
  console.log(`${label} — 성공 ${won(ok)} / 실패 ${won(bad)}`);}
})();
