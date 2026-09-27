// 주력 축에서 막혀 있는 키워드 전수 + 3위 진입가 → 파워링크 천장 계산
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');const {isDerm}=require('./_sojam_e0831_derm.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8')).kw;
const vol=k=>{const v=R2[k];return v?(v.pc||0)+(v.mo||0):0;};
const inScope=k=>!why(k)&&!bare(k)&&isDerm(k)&&!/대상포진|사마귀|홍조|검사|진단|예방접종|주사/.test(k);
const PRODUCT=/스케일링|마사지|앰플|괄사|브러쉬|토닉|영양제|스파|에센스|팩$|타투|반영구|점빼기|세럼|트리트먼트|스프레이|샴푸|패치|기기|쿨링|관리샵|구개열|구순열|가글|커버제|레이저|수술/;
// 상담일지 내원율
const AX={'아토피':[/아토피|태열/,70.9],'가려움':[/가려|간지|소양|양진|묘기증/,64.6],
 '지루성':[/지루성|두피염|비듬|두피/,76.5],'습진':[/습진|한포진/,61.4],
 '피부염':[/피부염(?!.*지루)|접촉성|화폐상/,60.9],'모낭염':[/모낭염|종기|봉와직염|절종|옹종/,60],
 '무좀':[/무좀|백선|칸디다|완선/,60],'구순염':[/구순|구내염|입술|입안|혀|설염/,60],
 '다한증':[/다한증|땀띠|땀많|한증/,60],'백반증':[/백반증/,60],'탈스':[/탈스|스테로이드|리바운드/,60]};
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method='GET',body=null,tries=3){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(900*(t+1));}return null;}
(async()=>{
 // 축별 막힌 키워드 (중복 제거, 검색량 300+)
 const seen=new Set(); const blocked=[];
 for(const [name,[re]] of Object.entries(AX)){
  S.keywords.forEach(k=>{
   if(seen.has(k.kw))return;
   if(!re.test(k.kw)||!inScope(k.kw)||PRODUCT.test(k.kw))return;
   const v=vol(k.kw); if(v<300)return;
   const isBlocked = k.lock||k.glock||k.clock||k.bid<=70||(k.rnk33>=4);
   if(!isBlocked)return;
   seen.add(k.kw);
   blocked.push({kw:k.kw,ax:name,vol:v,imp:k.imp33,clk:k.clk33,bid:k.bid,rnk:k.rnk33,
    cause:[k.lock&&'키워드잠금',k.glock&&'그룹잠금',k.clock&&'캠페인잠금',
           (!k.lock&&k.bid<=70)&&'70원',(k.rnk33>=4)&&('순위'+Math.round(k.rnk33))].filter(Boolean).join('·'),
    id:k.id,gid:k.gid,camp:k.camp});
  });
 }
 blocked.sort((a,b)=>b.vol-a.vol);
 console.log(`막힌 주력 키워드 ${blocked.length}개 · 월 검색량 합 ${won(blocked.reduce((s,k)=>s+k.vol,0))}`);
 // 3위·2위 진입가
 const lad={};
 for(const pos of [2,3]){
  for(let i=0;i<blocked.length;i+=100){
   const items=blocked.slice(i,i+100).map(k=>({key:k.kw,position:pos}));
   const r=await raw('/estimate/average-position-bid/keyword','POST',{device:'MOBILE',items});
   ((r&&r.estimate)||[]).forEach(e=>{const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;});
   await sleep(350);}
  console.log(`  ${pos}위 진입가 조회 완료`);
 }
 // 예상: 노출점유 0.55, CTR 3위 0.42%(계정 실측 노출가중 평균), 2위 0.45%
 const SHARE=0.55, CTR3=0.0042, CTR2=0.0045;
 blocked.forEach(k=>{k.b2=lad[k.kw]?.[2];k.b3=lad[k.kw]?.[3];
  k.exImp=k.vol*SHARE; k.c3=k.exImp*CTR3; k.c2=k.exImp*CTR2;
  k.cost3=k.c3*(k.b3||0); k.cost2=k.c2*(k.b2||0);
  k.eff=k.b3?k.b3:1e9;});
 const ok=blocked.filter(k=>k.b3);
 // 효율 구간별
 console.log('\n══ 3위 진입가 구간별 (월 예상) ══');
 console.log('진입가대       키워드  월검색량      월클릭   월비용       CPC');
 const bands=[[0,1000],[1000,2000],[2000,3000],[3000,5000],[5000,1e9]];
 bands.forEach(([lo,hi])=>{
  const g=ok.filter(k=>k.b3>=lo&&k.b3<hi);
  if(!g.length)return;
  const V=g.reduce((s,k)=>s+k.vol,0),C=g.reduce((s,k)=>s+k.c3,0),M=g.reduce((s,k)=>s+k.cost3,0);
  console.log(`${(won(lo)+'~'+(hi>1e8?'':won(hi))).padEnd(14)} ${String(g.length).padStart(5)} ${won(V).padStart(10)} ${C.toFixed(0).padStart(8)} ${won(M).padStart(11)}원 ${won(C?M/C:0).padStart(7)}원`);});
 const T=ok.reduce((s,k)=>({c:s.c+k.c3,m:s.m+k.cost3,v:s.v+k.vol}),{c:0,m:0,v:0});
 console.log(`전체           ${String(ok.length).padStart(5)} ${won(T.v).padStart(10)} ${T.c.toFixed(0).padStart(8)} ${won(T.m).padStart(11)}원 ${won(T.m/T.c).padStart(7)}원`);
 console.log('\n══ 검색량 상위 30 (막힌 것) ══');
 console.log('월검색량  현노출  현입찰   3위가   2위가   월클릭  월비용     축      원인');
 ok.slice(0,30).forEach(k=>console.log(
  `${won(k.vol).padStart(8)} ${String(k.imp).padStart(6)} ${won(k.bid).padStart(7)}원 ${won(k.b3).padStart(6)}원 ${won(k.b2).padStart(6)}원 ${k.c3.toFixed(1).padStart(6)} ${won(k.cost3).padStart(9)}원 ${k.ax.padEnd(6)} ${k.cause}`));
 fs.writeFileSync(P('_sojam_g0903_unlock.json'),JSON.stringify({at:new Date().toISOString(),blocked:ok},null,0));
 console.log('\n저장 → _sojam_g0903_unlock.json');
})();
