// 신환 50명 설계 — 지금 예산 안에서 재배분
//  ① 낭비 70원  ② 고CPC 키워드를 3위 진입가로 하향(죽이지 않음)  ③ 막힌 주력 해제
//  축은 상담일지 내원 실적으로 A(검증)/B(미검증)로 나눠 B는 저가만 시험
//  dry-run 기본. 적용 --apply. 롤백 _sojam_h0903_ROLLBACK.json
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const M=30/33;
const BUDGET_HEADROOM=581370;   // 일예산 156,750×30=4,702,500 - 실소진 4,121,130

const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const A=JSON.parse(fs.readFileSync(P('_sojam_g0903_audit.json'),'utf8'));
const U=JSON.parse(fs.readFileSync(P('_sojam_g0903_unlock.json'),'utf8')).blocked;
const kmap={};S.keywords.forEach(k=>kmap[k.id]=k);

// 상담일지에서 내원 실적이 확인된 축 = A / 흔적 없는 축 = B
const AXA=/아토피|태열|가려|간지|소양|양진|묘기증|습진|한포진|지루성|두피염|비듬|두피|피부염|접촉성|화폐상|여드름|뾰루지|화농|피부질환|피부병/;
const AXB=/구순|구내염|입술|입안|혀|설염|다한증|땀|모낭염|종기|봉와직염|무좀|백선|칸디다|완선|백반증|스테로이드|탈스/;
const tier=k=>AXA.test(k)?'A':AXB.test(k)?'B':'A';
// 내원 의도가 강해 CPC가 비싸도 지키는 어미
const INTENT=/한의원|병원|치료|치료법|치료방법|잘하는곳|추천|후기|한방/;

(async()=>{
 // ── ① 낭비 (7일 감사 비내원권)
 const waste=A.hit7.filter(k=>k.v).map(k=>kmap[k.id]).filter(k=>k&&k.bid>70);
 const saveWaste=A.hit7.filter(k=>k.v&&kmap[k.id]&&kmap[k.id].bid>70).reduce((s,k)=>s+k.cost*30/7,0);

 // ── ③ 해제: A축은 3,000원 미만, B축은 1,000원 미만(저가 시험)
 // 제품 구매 의도(로션·크림 등)는 내원으로 안 이어진다 — 제외. 연고·약은 치료 의도가 있어 유지.
 const GOODS=/로션|크림|보습제|비누|세정제|워시|샴푸|린스|화장품|추천템|선물/;
 const cands=U.filter(k=>{const x=kmap[k.id];if(!x||x.glock||x.clock||!k.b3)return false;
  if(GOODS.test(k.kw))return false;
  return tier(k.kw)==='A' ? k.b3<3000 : k.b3<1000;})
  .map(k=>({...k,cpc3:k.cost3/k.c3})).sort((a,b)=>a.cpc3-b.cpc3);


 // ── ② 고CPC 하향: 내원권·CPC 5,000원 초과·클릭 3 이하 → 3위 진입가로 (죽이지 않음)
 const hi=A.hit33.filter(k=>!k.v&&k.clk>0&&k.clk<=3&&(k.cost/k.clk)>5000)
  .map(k=>({...k,mcost:k.cost*M,cpc:k.cost/k.clk,x:kmap[k.id]})).filter(k=>k.x&&k.x.bid>1000);
 // 진입가 조회
 const lad={};
 for(let i=0;i<hi.length;i+=100){
  const r=await raw('/estimate/average-position-bid/keyword','POST',
   {device:'MOBILE',items:hi.slice(i,i+100).map(k=>({key:k.kw,position:3}))});
  ((r[1]&&r[1].estimate)||[]).forEach(e=>{const q=(e.keyword||'').trim();if(q)lad[q]=e.bid;});
  await sleep(350);}
 const down=hi.filter(k=>lad[k.kw]&&lad[k.kw]<k.x.bid*0.85)
  .map(k=>({...k,to:r10(lad[k.kw]),save:k.mcost*(1-lad[k.kw]/k.x.bid)}))
  .sort((a,b)=>b.save-a.save);
 const saveDown=down.reduce((s,k)=>s+k.save,0);

 // 예산 캡 — 회수액 + 여력까지만 싼 클릭부터 채운다
 const cap=saveWaste+saveDown+BUDGET_HEADROOM;
 const unlock=[];let acc=0;
 for(const k of cands){ if(acc+k.cost3>cap) continue; acc+=k.cost3; unlock.push(k); }
 const addCost=acc, addClk=unlock.reduce((s,k)=>s+k.c3,0);
 const skipped=cands.length-unlock.length;
 const net=addCost-saveWaste-saveDown;
 console.log('══ 신환 50명 세팅 (예산 재배분) ══\n');
 console.log(`① 낭비 차단        ${String(waste.length).padStart(4)}개 → 70원         월 ${won(saveWaste).padStart(9)}원 회수`);
 console.log(`② 고CPC 입찰 하향   ${String(down.length).padStart(4)}개 → 3위 진입가    월 ${won(saveDown).padStart(9)}원 회수  (죽이지 않고 순위만 조정)`);
 console.log(`③ 막힌 주력 해제    ${String(unlock.length).padStart(4)}개 해제+입찰     월 ${won(addCost).padStart(9)}원 지출`);
 console.log(`     └ A축(실적확인) ${String(unlock.filter(k=>tier(k.kw)==='A').length).padStart(3)}개 · ${won(unlock.filter(k=>tier(k.kw)==='A').reduce((s,k)=>s+k.cost3,0)).padStart(9)}원`);
 console.log(`     └ B축(시험)     ${String(unlock.filter(k=>tier(k.kw)==='B').length).padStart(3)}개 · ${won(unlock.filter(k=>tier(k.kw)==='B').reduce((s,k)=>s+k.cost3,0)).padStart(9)}원  진입가 1천원 미만만`);
 console.log(`\n순증 ${(net>=0?'+':'')+won(net)}원/월  (예산 여력 ${won(BUDGET_HEADROOM)}원) ${net<=BUDGET_HEADROOM?'✅ 예산 내':'❌ 초과'}`);
 console.log(`예상 월 클릭 +${Math.round(addClk)} · 신규분 평균 CPC ${won(addCost/addClk)}원 · 예산 캡으로 보류 ${skipped}개`);

 console.log('\n── ③ 해제 상위 18 ──');
 unlock.slice().sort((a,b)=>b.c3-a.c3).slice(0,18).forEach(k=>
  console.log(`  [${tier(k.kw)}] 검색량 ${won(k.vol).padStart(7)} · ${won(kmap[k.id].bid).padStart(6)}→${won(r10(k.b3)).padStart(6)}원 · 월클릭 ${k.c3.toFixed(1).padStart(5)} · ${k.cause.padEnd(13)} ${k.kw}`));
 console.log('\n── ② 입찰 하향 상위 12 (지키면서 비용만 절감) ──');
 down.slice(0,12).forEach(k=>console.log(
  `  CPC ${won(k.cpc).padStart(7)}원·클릭${k.clk} · ${won(k.x.bid).padStart(6)}→${won(k.to).padStart(6)}원 · 월 ${won(k.save).padStart(7)}원 절감 ${INTENT.test(k.kw)?'★의도강함':''}  ${k.kw}`));
 console.log('\n── ① 낭비 ──');
 A.hit7.filter(k=>k.v&&kmap[k.id]&&kmap[k.id].bid>70).sort((a,b)=>b.cost-a.cost).forEach(k=>
  console.log(`  ${won(k.cost).padStart(6)}원 ${k.clk}클릭 · ${won(kmap[k.id].bid).padStart(6)}→70원 · ${String(k.v).padEnd(10)} ${k.kw}`));

 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 const RB={at:new Date().toISOString(),note:'신환50 세팅 직전',items:[]};
 const bidItems=[],unlockItems=[];
 const put=(x,to,op)=>{RB.items.push({id:x.id,gid:x.gid,kw:x.kw,bid:x.bid,lock:!!x.lock,ugb:!!x.ugb,op,to});
  bidItems.push({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:to,useGroupBidAmt:false});};
 waste.forEach(x=>put(x,70,'waste'));
 down.forEach(k=>put(k.x,k.to,'down'));
 unlock.forEach(k=>{const x=kmap[k.id];put(x,r10(k.b3),'unlock');
  if(x.lock)unlockItems.push({nccKeywordId:x.id,nccAdgroupId:x.gid,userLock:false});});
 fs.writeFileSync(P('_sojam_h0903_ROLLBACK.json'),JSON.stringify(RB,null,0));
 console.log(`\n롤백 ${RB.items.length}건 저장 → _sojam_h0903_ROLLBACK.json`);
 for(const [label,arr,f] of [['잠금 해제',unlockItems,'userLock'],['입찰가',bidItems,'bidAmt']]){
  if(!arr.length)continue;let ok=0,bad=0;
  for(let j=0;j<arr.length;j+=100){const bb=arr.slice(j,j+100);
   const [o,e]=await raw(`/ncc/keywords?fields=${f}`,'PUT',bb);
   if(o)ok+=bb.length;else{bad+=bb.length;console.log(`  ${label} 실패`,String(e).slice(0,110));}
   await sleep(200);}
  console.log(`${label} — 성공 ${won(ok)} / 실패 ${won(bad)}`);}
 console.log('\n적용 완료');
})();
