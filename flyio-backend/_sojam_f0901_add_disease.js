// 발굴한 은밀부위 '질환명' 키워드를 승인 소재 그룹에 등록
//   node _sojam_f0901_add_disease.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907',EST_CID='3808925';
const DST='grp-a001-01-000000072328280';   // 소잠_절실축_난치구순가려움_a31 (승인 소재 보유)
const APPLY=process.argv.includes('--apply');
const FLOOR=500,CAP=20000;
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||JSON.stringify(d).slice(0,250)];}
 }catch(e){}await sleep(1200*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
// 착색·멍울 제외, 질환명만
const TARGET=['옴진드기','모소낭','모소동','간찰진','진주양음경구진','낭습증','낭습','경화성태선'];
const vol={};for(const r of JSON.parse(fs.readFileSync(P('_sojam_f0901_new_kw.json'),'utf8')))vol[r.kw]=r;
(async()=>{
 const lad={};
 for(const pos of [1,2]){
  try{const r=await req('POST','/estimate/average-position-bid/keyword',
    {device:'PC',items:TARGET.map(k=>({key:k,position:pos}))},EST_CID);
   for(const e of (r.estimate||[])){const k=(e.keyword||'').trim();if(k)(lad[k]||={})[pos]=e.bid;}
  }catch(e){console.error(`pos${pos} 실패 ${String(e).slice(0,80)}`);}
  await sleep(300);
 }
 const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?FLOOR:r10(Math.min(CAP,Math.max(FLOOR,e)));};
 const [ok,have]=await raw(`/ncc/keywords?nccAdgroupId=${DST}`,'GET',null);
 const exist=new Set((have||[]).filter(k=>!k.delFlag).map(k=>k.keyword));
 const todo=TARGET.filter(k=>!exist.has(k));
 console.log(`대상 그룹 소잠_절실축_난치구순가려움_a31 · 기존 키워드 ${(have||[]).filter(k=>!k.delFlag).length}개`);
 console.log(`등록 대상 ${TARGET.length}종 중 신규 ${todo.length}종 (이미 있음 ${TARGET.length-todo.length})\n`);
 console.log('  키워드                    월검색량   1위추정   적용가');
 for(const k of TARGET){const v=vol[k]||{};const l=lad[k]||{};
  console.log(`  ${k.padEnd(22)}${won(v.tot).padStart(8)}${(l[1]==null?'없음':won(l[1])+'원').padStart(10)}${won(bidOf(k)).padStart(9)}원${exist.has(k)?'  (이미 있음)':''}`);}
 console.log(`\n입찰가 합 ${won(todo.reduce((s,k)=>s+bidOf(k),0))}원 · 검색량 합 ${won(TARGET.reduce((s,k)=>s+((vol[k]||{}).tot||0),0))}회/월`);
 if(!APPLY){console.log('\ndry-run — 등록하려면 --apply');return;}
 if(!todo.length){console.log('등록할 것 없음');return;}
 const items=todo.map(k=>({keyword:k,bidAmt:bidOf(k),useGroupBidAmt:false}));
 const [o,e]=await raw(`/ncc/keywords?nccAdgroupId=${DST}`,'POST',items);
 console.log(o?`등록 완료 — ${items.length}종`:`등록 실패 — ${String(e).slice(0,250)}`);
})();
