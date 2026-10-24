// 실제 내원 실적 비례로 축별 예산 재배분 — 입찰 순위로 조절
// dry-run 기본 / --apply / 롤백 _sojam_h0904_rebal_ROLLBACK.json
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
const M=30/33, BUDGET=4200000;

// ── 실제 내원 실적 (상담일지 8개월, '기타피부' 분해 반영) → 목표 비중
const VISITS={아토피:58,가려움:55,두드러기:46,피부염:41,습진:35,건선:17,지루성:14,여드름:12,묘기증:8,모낭염:3,구순염:2,무좀:2,백반증:0,다한증:0,탈스:0};
const AX=[['묘기증',/묘기증|피부묘기/],['지루성',/지루성|두피염|비듬|두피/],['아토피',/아토피|태열/],
 ['두드러기',/두드러기|담마진|두드레기/],['건선',/건선/],['여드름',/여드름|뾰루지|화농|면포/],
 ['습진',/습진|한포진/],['피부염',/피부염|접촉성|화폐상/],['백반증',/백반증/],
 ['다한증',/다한증|땀띠|땀많|한증/],['모낭염',/모낭염|종기|봉와직염|절종|옹종/],
 ['무좀',/무좀|백선|칸디다|완선/],['구순염',/구순|구내염|입술|입안|혀|설염/],
 ['탈스',/탈스|스테로이드|리바운드/],['가려움',/가려|간지|소양|양진/]];
const ax=k=>{for(const [n,re] of AX) if(re.test(k)) return n; return '기타';};

const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const kmap={};S.keywords.forEach(k=>kmap[k.id]=k);

(async()=>{
 // 현재 축별 지출 (33일 실측 → 월)
 const cur={};
 A.hit33.filter(k=>!k.v&&k.clk>0).forEach(k=>{const a=ax(k.kw);
  (cur[a]||={cost:0,clk:0,n:0});cur[a].cost+=k.cost*M;cur[a].clk+=k.clk*M;cur[a].n++;});
 // 오늘 복원분 반영
 try{const RS=JSON.parse(fs.readFileSync(P('_sojam_h0904_restore_ROLLBACK.json'),'utf8'));
  RS.items.forEach(i=>{const a=ax(i.kw);(cur[a]||={cost:0,clk:0,n:0});});}catch(e){}
 const totV=Object.values(VISITS).reduce((a,b)=>a+b,0);
 console.log('══ 축별 — 실제 내원 실적 vs 현재 광고비 ══');
 console.log('축        내원  목표비중  목표예산     현재예산     차이         조치');
 const plan={};
 for(const a of Object.keys(VISITS)){
  const tgt=BUDGET*VISITS[a]/totV, now=(cur[a]||{}).cost||0, diff=tgt-now;
  plan[a]={tgt,now,diff};
  const act=VISITS[a]===0?'전면 축소':diff>150000?'증액':diff<-150000?'감액':'유지';
  console.log(`${a.padEnd(8)} ${String(VISITS[a]).padStart(4)} ${(VISITS[a]/totV*100).toFixed(1).padStart(7)}% ${won(tgt).padStart(9)}원 ${won(now).padStart(10)}원 ${(diff>=0?'+':'')+won(diff).padStart(9)}원  ${act}`);
 }
 const etc=(cur['기타']||{}).cost||0;
 console.log(`기타     (내원 실적 매칭 안 됨)                  ${won(etc).padStart(10)}원              전면 축소`);

 // ── 실행: 축별로 목표 순위를 정하고 진입가로 설정
 //   증액 축 → 2위, 유지 → 3위, 감액 → 5위, 내원0/기타 → 70원
 const POS={};
 for(const a of Object.keys(VISITS)){
  POS[a]= VISITS[a]===0 ? 0 : plan[a].diff>150000 ? 2 : plan[a].diff<-150000 ? 5 : 3;
 }
 POS['기타']=0;
 console.log('\n축별 목표 순위:',Object.entries(POS).map(([a,p])=>`${a} ${p?p+'위':'70원'}`).join(' · '));

 // 대상 키워드: 현재 돈이 나가는 내원권 키워드 전부
 const targets=A.hit33.filter(k=>!k.v&&k.clk>0).map(k=>({...k,a:ax(k.kw),x:kmap[k.id]})).filter(k=>k.x);
 const byA={};targets.forEach(k=>{(byA[k.a]||=[]).push(k);});
 console.log('\n조정 대상 키워드:',Object.entries(byA).map(([a,v])=>`${a} ${v.length}`).join(' · '));
 // 진입가 조회 (순위별)
 const need={};targets.forEach(k=>{const p=POS[k.a];if(p){(need[p]||=new Set()).add(k.kw);}});
 const lad={};
 for(const p of Object.keys(need)){
  const arr=[...need[p]];
  for(let i=0;i<arr.length;i+=100){
   const [o,r]=await raw('/estimate/average-position-bid/keyword','POST',
    {device:'MOBILE',items:arr.slice(i,i+100).map(k=>({key:k,position:Number(p)}))});
   ((r&&r.estimate)||[]).forEach(e=>{const q=(e.keyword||'').trim();if(q)(lad[q]||={})[p]=e.bid;});
   await sleep(320);}
  console.log(`  ${p}위 진입가 조회 완료 (${arr.length}개)`);
 }
 const ch=[];
 targets.forEach(k=>{
  const p=POS[k.a];
  let to = p===0 ? 70 : (lad[k.kw]&&lad[k.kw][p] ? r10(lad[k.kw][p]) : null);
  if(to===null) return;
  if(to===k.x.bid) return;
  ch.push({...k,to,from:k.x.bid,pos:p});
 });
 const est={};ch.forEach(k=>{(est[k.a]||={d:0,n:0});est[k.a].d+=(k.cost*M)*(k.to/k.from-1);est[k.a].n++;});
 console.log('\n══ 조정 결과 (월 비용 변화 추정) ══');
 let tot=0;
 Object.entries(est).sort((a,b)=>b[1].d-a[1].d).forEach(([a,v])=>{tot+=v.d;
  console.log(`  ${a.padEnd(8)} ${String(v.n).padStart(4)}개 · ${(v.d>=0?'+':'')+won(v.d).padStart(9)}원`);});
 console.log(`  순증 ${(tot>=0?'+':'')+won(tot)}원/월`);
 console.log('\n변화 큰 키워드 상위 18:');
 ch.map(k=>({...k,d:(k.cost*M)*(k.to/k.from-1)})).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,18)
  .forEach(k=>console.log(`  [${k.a.padEnd(4)}] ${won(k.from).padStart(6)}→${won(k.to).padStart(6)}원 (${k.pos?k.pos+'위':'70원'}) · 월 ${(k.d>=0?'+':'')+won(k.d).padStart(8)}원 · 33일클릭 ${k.clk}  ${k.kw}`));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 const RB={at:new Date().toISOString(),note:'내원실적 비례 재배분 직전',items:ch.map(k=>({id:k.id,gid:k.x.gid,kw:k.kw,a:k.a,bid:k.from,to:k.to}))};
 fs.writeFileSync(P('_sojam_h0904_rebal_ROLLBACK.json'),JSON.stringify(RB,null,0));
 console.log(`\n롤백 ${RB.items.length}건 저장`);
 const items=ch.map(k=>({nccKeywordId:k.id,nccAdgroupId:k.x.gid,bidAmt:k.to,useGroupBidAmt:false}));
 let ok=0,bad=0;
 for(let j=0;j<items.length;j+=100){const bb=items.slice(j,j+100);
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',bb);
  if(o)ok+=bb.length;else{bad+=bb.length;console.log('  실패',String(e).slice(0,110));}
  await sleep(200);}
 console.log(`입찰가 — 성공 ${ok} / 실패 ${bad}\n재배분 완료`);
})();
