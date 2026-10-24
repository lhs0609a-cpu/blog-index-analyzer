// 발굴 키워드 등록 — 탈스/난치·자가면역/아토피는 PC 1위 추정가, 나머지는 최저가 70원
//   node _sojam_f0901_register.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907',EST_CID='3808925';
const APPLY=process.argv.includes('--apply');
const FLOOR=500,CAP=20000;
const G_SCALP='grp-a001-01-000000071999012';   // 소잠_지루성_전용   (승인 소재)
const G_MAIN ='grp-a001-01-000000072328280';   // 소잠_절실축_난치구순가려움_a31 (승인 소재)
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,250)];}
 }catch(e){}await sleep(1200*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const HIGH=['탈스테로이드','난치·자가면역','아토피'];
const JUNK=/수술|시술|레이저|보톡스|기기|기계|샵|보호제|트리트먼트|팩|쿨링|스케일러|가글|베개|배게|리아|윤곽주사|알레르기기침/;
const rows=JSON.parse(fs.readFileSync(P('_sojam_f0901_new_kw2.json'),'utf8')).filter(r=>!JUNK.test(r.kw));
const hi=rows.filter(r=>HIGH.includes(r.axis));
const lo=rows.filter(r=>!HIGH.includes(r.axis));
(async()=>{
 // PC 1·2위 추정가
 const lad={};
 for(const pos of [1,2]){
  for(let i=0;i<hi.length;i+=100){
   try{const r=await req('POST','/estimate/average-position-bid/keyword',
     {device:'PC',items:hi.slice(i,i+100).map(x=>({key:x.kw,position:pos}))},EST_CID);
    for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;}
   }catch(e){console.error(`pos${pos} 실패 ${String(e).slice(0,80)}`);}
   await sleep(300);}
 }
 const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,e)));};
 const route=r=>r.axis==='지루성·두피'?G_SCALP:G_MAIN;
 const plan=[...hi.map(r=>({...r,bid:bidOf(r.kw),g:route(r),tier:'상향'})),
             ...lo.map(r=>({...r,bid:70,g:route(r),tier:'최저'}))];
 // 기존 보유 제외
 const gset={};
 for(const g of [G_SCALP,G_MAIN]){
  const [o,ks]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  gset[g]=new Set((ks||[]).filter(k=>!k.delFlag).map(k=>k.keyword));
  console.log(`그룹 ${g===G_SCALP?'소잠_지루성_전용':'소잠_절실축_난치구순가려움_a31'} 기존 ${gset[g].size}개`);
 }
 const todo=plan.filter(p=>!gset[p.g].has(p.kw));
 console.log(`\n등록 대상 ${won(plan.length)}종 중 신규 ${won(todo.length)}종 (중복 ${plan.length-todo.length})`);
 console.log(`  ★ PC 1위 추정가 적용 ${todo.filter(p=>p.tier==='상향').length}종`);
 console.log(`  · 최저가 70원 ${todo.filter(p=>p.tier==='최저').length}종`);
 console.log(`  소잠_지루성_전용 ${todo.filter(p=>p.g===G_SCALP).length}종 · 절실축 ${todo.filter(p=>p.g===G_MAIN).length}종\n`);
 console.log('=== 상향 대상 (PC 1위 추정가) ===');
 console.log('  키워드                  월검색량   PC1위추정   적용가');
 for(const p of todo.filter(x=>x.tier==='상향').sort((a,b)=>b.tot-a.tot)){
  const l=lad[p.kw]||{};
  console.log(`  ${p.kw.padEnd(20)}${won(p.tot).padStart(9)}${(l[1]==null?'없음':won(l[1])+'원').padStart(11)}${won(p.bid).padStart(9)}원`);}
 console.log(`\n최저가 등록 상위 12: ${todo.filter(x=>x.tier==='최저').sort((a,b)=>b.tot-a.tot).slice(0,12).map(p=>p.kw+'('+won(p.tot)+')').join(', ')}`);
 fs.writeFileSync(P('_sojam_f0901_register_plan.json'),JSON.stringify(todo,null,1));
 if(!APPLY){console.log('\ndry-run — 등록하려면 --apply');return;}
 for(const g of [G_MAIN,G_SCALP]){
  const arr=todo.filter(p=>p.g===g);
  if(!arr.length)continue;
  let ok=0,bad=0;
  for(let i=0;i<arr.length;i+=100){
   const b=arr.slice(i,i+100).map(p=>({keyword:p.kw,bidAmt:p.bid,useGroupBidAmt:false}));
   const [o,e]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'POST',b);
   if(o)ok+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,200));}
   await sleep(400);}
  console.log(`${g===G_SCALP?'소잠_지루성_전용':'절실축'} — 등록 ${ok} / 실패 ${bad}`);
 }
})();
