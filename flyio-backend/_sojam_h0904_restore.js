// ③ 두드러기·건선·여드름 복원 — 상담일지 실적(월 신환 9.4명) 근거. 시험 예산 안에서.
//   dry-run 기본, 적용 --apply, 롤백 _sojam_h0904_restore_ROLLBACK.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {REGION:R1}=require('./_sojam_d0828_rule.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const ENVELOPE=Number(process.env.ENV_WON||300000); // 월 시험 예산
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8')).kw;
const vol=k=>{const v=R2[k];return v?(v.pc||0)+(v.mo||0):0;};

const AX=[['두드러기',/두드러기|담마진|두드레기/],['건선',/건선/],['여드름',/여드름|뾰루지|화농|면포/]];
// 오탐 방지: 손수건선물 류, 타지역 접두, 지역+업종만, 제품 구매
const FP=/수건선|물건선|건선반|건선물/;
const GOODS=/로션|크림|보습제|비누|세정제|워시|샴푸|화장품|패치|기기|파운데이션|쿠션|팩$|추천템|선물|가격비교|영양제|비타민|보조제|앰플|토너|에센스|세럼/;
const OTHER=[...new Set(R1)].filter(r=>!/^(강남|서초|역삼|선릉|논현|신사|압구정|청담|삼성|교대|방배|양재|매봉|도곡|대치|한티|서울|수도권|전국)$/.test(r));
const ok=k=>{ if(FP.test(k))return false; if(GOODS.test(k))return false;
 if(OTHER.some(r=>k.startsWith(r)))return false; if(bare(k))return false;
 if(/사마귀|대상포진|홍조|검사|진단|레이저|수술|시술|필러|보톡스|압출|스케일링|피부과|성형외과|치과|의원(?!.*한)|병원(?!.*한)/.test(k))return false;
 return true; };
const CTR3=0.0042, SHARE=0.55;

(async()=>{
 const seen=new Set(); const cand=[];
 S.keywords.forEach(k=>{
  const ax=AX.find(([n,re])=>re.test(k.kw)); if(!ax)return;
  if(seen.has(k.kw))return; if(!ok(k.kw))return;
  const v=vol(k.kw); if(v<500)return;
  if(!k.lock && k.bid>70) return;              // 이미 살아있으면 제외
  if(k.glock||k.clock) return;                 // 그룹·캠페인 잠금은 제외
  seen.add(k.kw); cand.push({...k,ax:ax[0],vol:v});
 });
 console.log(`후보 ${cand.length}개 (두드러기 ${cand.filter(c=>c.ax==='두드러기').length} · 건선 ${cand.filter(c=>c.ax==='건선').length} · 여드름 ${cand.filter(c=>c.ax==='여드름').length})`);
 cand.sort((a,b)=>b.vol-a.vol);
 const top=cand.slice(0,600);
 const lad={};
 for(let i=0;i<top.length;i+=100){
  const [o,r]=await raw('/estimate/average-position-bid/keyword','POST',
   {device:'MOBILE',items:top.slice(i,i+100).map(k=>({key:k.kw,position:3}))});
  ((r&&r.estimate)||[]).forEach(e=>{const q=(e.keyword||'').trim();if(q)lad[q]=e.bid;});
  await sleep(350);}
 const priced=top.filter(k=>lad[k.kw]).map(k=>{
  const imp=k.vol*SHARE, c=imp*CTR3;
  return {...k,b3:lad[k.kw],c3:c,cost3:c*lad[k.kw],cpc:lad[k.kw]};})
  .filter(k=>k.b3<3000).sort((a,b)=>a.cpc-b.cpc);
 // 축별 예산은 상담일지 실적 비례 — 두드러기 5.8 : 건선 2.1 : 여드름 1.5 (월 신환)
 const SHARE_AX={'두드러기':5.8,'건선':2.1,'여드름':1.5};
 const sum=Object.values(SHARE_AX).reduce((a,b)=>a+b,0);
 const cap={}; for(const a in SHARE_AX) cap[a]=ENVELOPE*SHARE_AX[a]/sum;
 const used={'두드러기':0,'건선':0,'여드름':0}; const pick=[];
 for(const k of priced){ if(used[k.ax]+k.cost3>cap[k.ax]) continue; used[k.ax]+=k.cost3; pick.push(k); }
 const acc=Object.values(used).reduce((a,b)=>a+b,0);
 console.log(`축별 예산 배분: ${Object.entries(cap).map(([a,v])=>a+' '+won(v)+'원').join(' · ')}`);
 const byAx={}; pick.forEach(k=>{(byAx[k.ax]||={n:0,c:0,m:0,v:0});const b=byAx[k.ax];b.n++;b.c+=k.c3;b.m+=k.cost3;b.v+=k.vol;});
 console.log(`\n══ 복원 대상 ${pick.length}개 · 월 ${won(acc)}원 (시험예산 ${won(ENVELOPE)}원) · 월클릭 +${Math.round(pick.reduce((s,k)=>s+k.c3,0))} · 평균 CPC ${won(acc/pick.reduce((s,k)=>s+k.c3,0))}원 ══`);
 Object.entries(byAx).forEach(([a,b])=>console.log(`  ${a.padEnd(6)} ${String(b.n).padStart(3)}개 · 검색량 ${won(b.v).padStart(8)} · 월클릭 ${b.c.toFixed(0).padStart(4)} · ${won(b.m).padStart(8)}원`));
 console.log('\n검색량 상위 20:');
 pick.slice().sort((a,b)=>b.vol-a.vol).slice(0,20).forEach(k=>
  console.log(`  [${k.ax}] 검색량 ${won(k.vol).padStart(7)} · ${won(k.bid).padStart(5)}→${won(r10(k.b3)).padStart(6)}원 · 월클릭 ${k.c3.toFixed(1).padStart(5)} · ${k.lock?'잠금해제':'입찰상향'}  ${k.kw}`));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 const RB={at:new Date().toISOString(),note:'두드러기·건선·여드름 복원 직전',items:[]};
 const bid=[],unl=[];
 pick.forEach(k=>{RB.items.push({id:k.id,gid:k.gid,kw:k.kw,ax:k.ax,bid:k.bid,lock:!!k.lock,to:r10(k.b3)});
  bid.push({nccKeywordId:k.id,nccAdgroupId:k.gid,bidAmt:r10(k.b3),useGroupBidAmt:false});
  if(k.lock)unl.push({nccKeywordId:k.id,nccAdgroupId:k.gid,userLock:false});});
 fs.writeFileSync(P('_sojam_h0904_restore_ROLLBACK.json'),JSON.stringify(RB,null,0));
 console.log(`\n롤백 ${RB.items.length}건 저장`);
 for(const [label,arr,f] of [['잠금 해제',unl,'userLock'],['입찰가',bid,'bidAmt']]){
  if(!arr.length)continue;let o=0,b=0;
  for(let j=0;j<arr.length;j+=100){const bb=arr.slice(j,j+100);
   const [x,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(x)o+=bb.length;else{b+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,110));}
   await sleep(200);}
  console.log(`${label} — 성공 ${o} / 실패 ${b}`);}
 console.log('\n복원 완료');
})();
