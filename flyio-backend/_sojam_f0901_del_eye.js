// 라식·라섹·렌즈삽입·안과 계열 삭제 (원장 지시)
//   node _sojam_f0901_del_eye.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  return[false,d.error||JSON.stringify(d).slice(0,200)];}}catch(e){}
 await sleep(1200*(t+1));}return[false,'retry exhausted'];}
const won=n=>(n||0).toLocaleString('ko-KR');
const RE=/라식|라섹|렌즈삽입|시력교정|안구건조|안과/;
const FP=/안과민성|안과다|안과로|안과잉/;   // '천안'+'과민성' 등 어절 넘는 충돌 제외
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const sel=inv.filter(r=>RE.test(r.kw)&&!FP.test(r.kw));
(async()=>{
 const kws=[...new Set(sel.map(r=>r.kw))].sort();
 console.log(`삭제 대상 고유 ${kws.length}종 / 인스턴스 ${sel.length}개`);
 const skip=inv.filter(r=>RE.test(r.kw)&&FP.test(r.kw)).map(r=>r.kw);
 console.log(`오탐 제외: ${[...new Set(skip)].join(', ')||'없음'}`);
 const gids=[...new Set(sel.map(r=>r.gid))];
 const full=[];let i=0;
 await Promise.all(Array.from({length:12},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)
   if(!k.delFlag&&sel.some(s=>s.id===k.nccKeywordId))full.push(k);}}));
 console.log(`라이브 확인 ${full.length}건 (이미 없는 것 ${sel.length-full.length})`);
 const b={};for(const r of sel){const u=(b[r.kw]||={bid:0,el:false});u.bid=Math.max(u.bid,r.bid);if(r.st==='ELIGIBLE')u.el=true;}
 Object.entries(b).sort((x,y)=>y[1].bid-x[1].bid).forEach(([k,u])=>
  console.log(`  ${k.slice(0,26).padEnd(28)}${won(u.bid).padStart(7)}원 · ${u.el?'노출가능':'중지'}`));
 fs.writeFileSync(P('_sojam_f0901_del_eye_SNAPSHOT.json'),
  JSON.stringify({deletedAt:new Date().toISOString(),
   note:'재등록 시 nccAdgroupId 그룹에 keyword/bidAmt 로 POST /ncc/keywords',items:full},null,1));
 console.log(`\n스냅샷 저장 — _sojam_f0901_del_eye_SNAPSHOT.json (${full.length}건)`);
 if(!APPLY){console.log('\ndry-run — 삭제하려면 --apply');return;}
 const ids=full.map(k=>k.nccKeywordId);
 let ok=0,bad=0;
 for(let j=0;j<ids.length;j+=30){const b2=ids.slice(j,j+30);
  const [o,e]=await raw(`/ncc/keywords?ids=${encodeURIComponent(b2.join(','))}`,'DELETE',null);
  if(o)ok+=b2.length;else{bad+=b2.length;console.log('  실패',String(e).slice(0,140));}
  await sleep(400);}
 console.log(`\n삭제 완료 — 성공 ${ok} / 실패 ${bad}`);
})();
