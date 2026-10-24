// 홍조 전부 + 검사·진단 전부 최저가 70원 (예외 없음)
//   유일 예외: '공진단'(한약명) — '진단' 부분문자열 오탐
//   node _sojam_f0902_floor_all2.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(1500*(t+1));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const FLUSH=/홍조/;
const TEST=/검사|진단/;
const FP=/공진단/;                    // 한약명 — 진단 오탐
const cls=k=>FP.test(k)?null:FLUSH.test(k)?'홍조':TEST.test(k)?'검사':null;
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const sel=inv.filter(r=>cls(r.kw));
(async()=>{
 const gids=[...new Set(sel.map(r=>r.gid))];
 console.error(`인스턴스 ${sel.length}개 · 그룹 ${gids.length}개 라이브 재조회…`);
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:24},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)if(!k.delFlag)live[k.nccKeywordId]=k;}}));
 const cur=sel.filter(r=>live[r.id]).map(r=>({...r,eff:live[r.id].useGroupBidAmt?(gb[r.gid]||0):(live[r.id].bidAmt||0),t:cls(r.kw)}));
 const hi=cur.filter(r=>r.eff>70);
 console.log(`\n홍조·검사 인스턴스 ${won(cur.length)}개 (고유 ${won(new Set(cur.map(r=>r.kw)).size)}종)`);
 console.log(`70원 초과 = 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)}종)`);
 console.log(`입찰가 합 ${won(hi.reduce((s,r)=>s+r.eff,0))}원 → ${won(hi.length*70)}원\n`);
 for(const t of ['홍조','검사']){
  const b={};for(const r of hi.filter(x=>x.t===t)){const u=(b[r.kw]||={eff:0});u.eff=Math.max(u.eff,r.eff);}
  const L=Object.entries(b).sort((x,y)=>y[1].eff-x[1].eff);
  console.log(`=== ${t} ${L.length}종 ===`);
  L.forEach(([k,u])=>console.log(`  ${k.slice(0,26).padEnd(28)}${won(u.eff).padStart(8)}원 → 70원`));
 }
 fs.writeFileSync(P('_sojam_f0902_all2_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(cur.map(r=>[r.id,{gid:r.gid,kw:r.kw,eff:r.eff,t:r.t}]))));
 const items=hi.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
 console.log(`\n롤백 스냅샷 ${won(cur.length)}개 저장 · PUT ${won(items.length)}개`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(let j=0;j<items.length;j+=100){const b2=items.slice(j,j+100);
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b2);
  if(o)ok+=b2.length;else{bad+=b2.length;console.log('  실패',String(e).slice(0,90));}await sleep(150);}
 console.log(`완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);
})();
