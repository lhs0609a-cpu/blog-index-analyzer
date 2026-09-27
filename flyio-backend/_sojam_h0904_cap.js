// 축별 CPC 상한 설계 — 실제 내원 실적이 좋은 축은 비싸도 사고, 나쁜 축은 싸게만 산다
//  (a) 상한 초과 키워드는 상한으로 내림 → 재원 확보
//  (b) 막힌 키워드 중 상한 이하로 3위 진입 가능한 것 해제 → 재원 사용
// dry-run 기본 / --apply / 롤백 _sojam_h0904_cap_ROLLBACK.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(1500*(t+1));}return[false,'exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const M=30/33;

// 축 · 8개월 실제 내원 · CPC 상한(원)
//  상한 근거: 내원율이 높을수록 비싼 클릭을 감당할 수 있다
const AXDEF=[
 ['묘기증',/묘기증|피부묘기/,          8, 6000],
 ['지루성',/지루성|두피염|비듬|두피/,   14, 5000],
 ['아토피',/아토피|태열/,              58, 6000],
 ['두드러기',/두드러기|담마진|두드레기/,  46, 4500],
 ['건선',/건선/,                      17, 4000],
 ['여드름',/여드름|뾰루지|화농|면포/,    12, 2500],
 ['습진',/습진|한포진/,                35, 3500],
 ['피부염',/피부염|접촉성|화폐상/,       41, 4000],
 ['백반증',/백반증/,                    0,   70],
 ['다한증',/다한증|땀띠|땀많|한증/,      0,   70],
 ['모낭염',/모낭염|종기|봉와직염|절종|옹종/, 3,1500],
 ['무좀',/무좀|백선|칸디다|완선/,        2, 1500],
 ['구순염',/구순|구내염|입술|입안|혀|설염/, 2,1500],
 ['탈스',/탈스|스테로이드|리바운드/,      0, 1500],
 ['가려움',/가려|간지|소양|양진/,        55, 1800],
];
const AXC={}; AXDEF.forEach(([n,re,v,c])=>AXC[n]={re,v,cap:c});
const ax=k=>{for(const [n,re] of AXDEF) if(re.test(k)) return n; return '기타'};
const CAP_ETC=3000;   // 기타(천포창·자가면역·자반증 등 정당한 축) — 중간 상한
const cap=a=>a==='기타'?CAP_ETC:AXC[a].cap;

const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const U=JSON.parse(fs.readFileSync(P('_sojam_g0903_unlock.json'),'utf8')).blocked;
const kmap={};S.keywords.forEach(k=>kmap[k.id]=k);
// 이미 오늘 손댄 것은 건드리지 않는다
const done=new Set();
for(const f of ['_sojam_h0903_ROLLBACK.json','_sojam_h0904_restore_ROLLBACK.json']){
 try{JSON.parse(fs.readFileSync(P(f),'utf8')).items.forEach(i=>done.add(i.id));}catch(e){}}

(async()=>{
 // (a) 상한 초과 → 내림
 const over=A.hit33.filter(k=>!k.v&&k.clk>0).map(k=>({...k,a:ax(k.kw),x:kmap[k.id]}))
  .filter(k=>k.x&&!done.has(k.id)&&k.x.bid>cap(k.a))
  .map(k=>({...k,to:cap(k.a),save:(k.cost*M)*Math.max(0,1-cap(k.a)/k.x.bid)}))
  .sort((a,b)=>b.save-a.save);
 const saved=over.reduce((s,k)=>s+k.save,0);
 // (b) 막힌 것 중 상한 이하 3위 진입 가능
 // 제품 구매 의도는 내원으로 이어지지 않는다 — 연고·약은 치료 의도가 있어 유지
 const GOODS=/로션|크림|보습제|비누|세정제|워시|샴푸|린스|화장품|바디|추천템|선물|앰플|토너|에센스|세럼|영양제|비타민/;
 const openable=U.filter(k=>{const x=kmap[k.id]; if(GOODS.test(k.kw))return false;
  return x&&!done.has(k.id)&&!x.glock&&!x.clock&&k.b3&&k.b3<=cap(ax(k.kw))&&AXC[ax(k.kw)]?.v!==0;})
  .map(k=>({...k,a:ax(k.kw)})).sort((a,b)=>(a.cost3/a.c3)-(b.cost3/b.c3));
 // 축별 목표예산 = 총예산 × 내원비중. 축이 목표를 넘으면 더 안 켠다. 총 지출은 회수액 이내(순증 0).
 const BUDGET=4200000;
 const totV=AXDEF.reduce((s,d)=>s+d[2],0);
 const curByAx={};
 A.hit33.filter(k=>!k.v&&k.clk>0).forEach(k=>{const a=ax(k.kw);curByAx[a]=(curByAx[a]||0)+k.cost*M;});
 const savedByAx={}; over.forEach(k=>{savedByAx[k.a]=(savedByAx[k.a]||0)+k.save;});
 const tgtByAx={}; AXDEF.forEach(([n,re,v])=>tgtByAx[n]=BUDGET*v/totV); tgtByAx['기타']=0;
 const spentByAx={};
 let acc=0; const open=[];
 for(const k of openable){
  if(acc+k.cost3>saved) continue;                                   // 총 순증 0
  const after=(curByAx[k.a]||0)-(savedByAx[k.a]||0)+(spentByAx[k.a]||0)+k.cost3;
  if(after>(tgtByAx[k.a]||0)) continue;                             // 축 목표예산 초과 금지
  acc+=k.cost3; spentByAx[k.a]=(spentByAx[k.a]||0)+k.cost3; open.push(k);
 }

 console.log('══ 축별 CPC 상한 설계 (근거: 8개월 실제 내원 수) ══');
 console.log('축        내원  CPC상한    상한초과 키워드   회수          해제 가능   지출');
 const g1={},g2={};
 over.forEach(k=>{(g1[k.a]||={n:0,s:0});g1[k.a].n++;g1[k.a].s+=k.save;});
 open.forEach(k=>{(g2[k.a]||={n:0,c:0});g2[k.a].n++;g2[k.a].c+=k.cost3;});
 [...AXDEF.map(d=>d[0]),'기타'].forEach(a=>{
  const v=a==='기타'?{v:'-',cap:CAP_ETC}:AXC[a];
  const o=g1[a]||{n:0,s:0}, p=g2[a]||{n:0,c:0};
  console.log(`${a.padEnd(8)} ${String(v.v).padStart(4)} ${won(v.cap).padStart(7)}원 ${String(o.n).padStart(9)}개 ${won(o.s).padStart(10)}원 ${String(p.n).padStart(9)}개 ${won(p.c).padStart(9)}원`);});
 console.log(`\n회수 ${won(saved)}원 · 지출 ${won(acc)}원 · 순증 ${(acc-saved>=0?'+':'')+won(acc-saved)}원/월`);
 console.log(`대상: 상한 하향 ${over.length}개 · 신규 해제 ${open.length}개`);
 console.log('\n── 상한 초과로 내리는 것 상위 15 ──');
 over.slice(0,15).forEach(k=>console.log(`  [${k.a.padEnd(4)}] ${won(k.x.bid).padStart(6)}→${won(k.to).padStart(6)}원 · 33일클릭 ${String(k.clk).padStart(2)} · 월 ${won(k.save).padStart(7)}원 회수  ${k.kw}`));
 console.log('\n── 새로 켜는 것 상위 15 (내원 실적 좋은 축 우선) ──');
 open.slice().sort((a,b)=>b.c3-a.c3).slice(0,15).forEach(k=>console.log(`  [${k.a.padEnd(4)}] ${won(kmap[k.id].bid).padStart(5)}→${won(r10(k.b3)).padStart(6)}원 · 검색량 ${won(k.vol).padStart(7)} · 월클릭 ${k.c3.toFixed(1).padStart(5)}  ${k.kw}`));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 const RB={at:new Date().toISOString(),note:'축별 CPC 상한 설계 직전',items:[]};
 const bid=[],unl=[];
 over.forEach(k=>{RB.items.push({id:k.id,gid:k.x.gid,kw:k.kw,a:k.a,bid:k.x.bid,lock:!!k.x.lock,to:k.to,op:'cap'});
  bid.push({nccKeywordId:k.id,nccAdgroupId:k.x.gid,bidAmt:k.to,useGroupBidAmt:false});});
 open.forEach(k=>{const x=kmap[k.id];RB.items.push({id:x.id,gid:x.gid,kw:k.kw,a:k.a,bid:x.bid,lock:!!x.lock,to:r10(k.b3),op:'open'});
  bid.push({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:r10(k.b3),useGroupBidAmt:false});
  if(x.lock)unl.push({nccKeywordId:x.id,nccAdgroupId:x.gid,userLock:false});});
 fs.writeFileSync(P('_sojam_h0904_cap_ROLLBACK.json'),JSON.stringify(RB,null,0));
 console.log(`\n롤백 ${RB.items.length}건 저장`);
 for(const [label,arr,f] of [['잠금 해제',unl,'userLock'],['입찰가',bid,'bidAmt']]){
  if(!arr.length)continue;let o=0,b=0;
  for(let j=0;j<arr.length;j+=100){const bb=arr.slice(j,j+100);
   const [x,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(x)o+=bb.length;else{b+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,110));}
   await sleep(200);}
  console.log(`${label} — 성공 ${o} / 실패 ${b}`);}
 console.log('\n적용 완료');
})();
