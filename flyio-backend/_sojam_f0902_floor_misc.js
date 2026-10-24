// 통증·홍조·검사 계열 최저가 70원
//   통증: 가려움 동반 키워드는 제외 (피부 증상)
//   홍조: 탈스테로이드·아토피 계열은 제외 (진료 축)
//   검사: 체질 계열은 제외 (원장 지시로 유지)
//   node _sojam_f0902_floor_misc.js [--apply]
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
const PAIN=/통증|아픔|아파|쑤심|쑤셔|결림|저림|저릿/;
const ITCH=/가려움|간지러움|가렵|소양/;          // 피부 증상 — 통증에서 제외
const FLUSH=/홍조/;
const TSWATO=/스테로이드|탈스|아토피/;           // 홍조에서 제외
const TEST=/검사|진단/;
const CHEJIL=/체질|공진단|경옥고/;    // 검사에서 제외 (체질 + 한약명 오탐)                          // 검사에서 제외
const cls=k=>{
 if(PAIN.test(k)&&!ITCH.test(k))return '통증';
 if(FLUSH.test(k)&&!TSWATO.test(k))return '홍조';
 if(TEST.test(k)&&!CHEJIL.test(k))return '검사';
 return null;};
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
 console.log(`\n대상 인스턴스 ${won(cur.length)}개 (고유 ${won(new Set(cur.map(r=>r.kw)).size)}종)`);
 console.log(`70원 초과 = 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)}종)`);
 console.log(`입찰가 합 ${won(hi.reduce((s,r)=>s+r.eff,0))}원 → ${won(hi.length*70)}원\n`);
 for(const t of ['통증','홍조','검사']){
  const s=hi.filter(r=>r.t===t);
  const b={};for(const r of s){const u=(b[r.kw]||={eff:0});u.eff=Math.max(u.eff,r.eff);}
  const L=Object.entries(b).sort((x,y)=>y[1].eff-x[1].eff);
  console.log(`=== ${t} ${L.length}종 (인스턴스 ${s.length}) ===`);
  L.slice(0,18).forEach(([k,u])=>console.log(`  ${k.slice(0,26).padEnd(28)}${won(u.eff).padStart(8)}원 → 70원`));
  if(L.length>18)console.log(`   … 외 ${L.length-18}종`);
 }
 const keep=inv.filter(r=>((PAIN.test(r.kw)&&ITCH.test(r.kw))||(FLUSH.test(r.kw)&&TSWATO.test(r.kw))||(TEST.test(r.kw)&&CHEJIL.test(r.kw)))&&r.bid>70);
 const kb={};for(const r of keep)kb[r.kw]=Math.max(kb[r.kw]||0,r.bid);
 console.log(`\n=== 보호(내리지 않음) ${Object.keys(kb).length}종 ===`);
 Object.entries(kb).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log(`  ${k.slice(0,26).padEnd(28)}${won(v).padStart(8)}원 유지`));
 fs.writeFileSync(P('_sojam_f0902_misc_ROLLBACK.json'),
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
