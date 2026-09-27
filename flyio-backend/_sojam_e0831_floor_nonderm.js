// 업종어(한의원/병원…)가 붙었는데 잔여어가 피부 진료가 아닌 키워드 → 최저가 70원
// (지역+업종뿐인 것도 잔여어가 빈 문자열이라 여기에 포함된다)
//   node _sojam_e0831_floor_nonderm.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {strip}=require('./_sojam_e0831_bare.js');
const {isDerm}=require('./_sojam_e0831_derm.js');
const {why}=require('./_sojam_d0828_rule.js');
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(1500*(t+1),10000));}return[false,'retry exhausted'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const BIZRE=/한의원|한방|병원|의원|클리닉|한약국/;
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const sel=inv.filter(r=>BIZRE.test(r.kw)&&!why(r.kw)&&!isDerm(strip(r.kw)));
(async()=>{
 const gids=[...new Set(sel.map(r=>r.gid))];
 console.error(`대상 인스턴스 ${won(sel.length)}개 · 그룹 ${gids.length}개 라이브 재조회…`);
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:24},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 const cur=sel.map(r=>{const k=live[r.id];
  return {...r,eff:k?(k.useGroupBidAmt?(gb[r.gid]||0):(k.bidAmt||0)):r.eff,found:!!k};});
 const hi=cur.filter(r=>r.eff>70);
 console.log(`\n업종어 포함·피부 아님 인스턴스 ${won(cur.length)}개 (고유 ${won(new Set(cur.map(r=>r.kw)).size)}) · 조회실패 ${cur.filter(r=>!r.found).length}`);
 console.log(`70원 초과 = 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)})`);
 console.log(`입찰가 합 ${won(hi.reduce((s,r)=>s+r.eff,0))}원 → ${won(hi.length*70)}원\n`);
 const b={};for(const r of hi){const u=(b[r.kw]||={eff:0,res:strip(r.kw)});u.eff=Math.max(u.eff,r.eff);}
 console.log('=== 입찰가 상위 40 ===');
 Object.entries(b).sort((x,y)=>y[1].eff-x[1].eff).slice(0,40)
  .forEach(([k,u])=>console.log(`  ${k.slice(0,24).padEnd(26)}${won(u.eff).padStart(8)}원  잔여="${u.res}"`));
 fs.writeFileSync(P('_sojam_e0831_floor_nonderm_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(cur.map(r=>[r.id,{gid:r.gid,kw:r.kw,bid:r.bid,ugb:r.ugb,eff:r.eff}]))));
 const items=hi.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
 console.log(`\n롤백 스냅샷 ${won(cur.length)}개 저장 · PUT ${won(items.length)}개`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(let j=0;j<items.length;j+=100){const b2=items.slice(j,j+100);
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b2);
  if(o)ok+=b2.length;else{bad+=b2.length;console.log('  실패',String(e).slice(0,90));}await sleep(150);}
 console.log(`완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);
})();
