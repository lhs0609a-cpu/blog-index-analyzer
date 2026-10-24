// 체질 계열 — PC 5위 추정가로 (무리하지 않는 선)
//   node _sojam_f0902_chejil5.js [--apply]
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
const r10=v=>Math.max(70,Math.round(v/10)*10);
const lad=JSON.parse(fs.readFileSync(P('_sojam_f0902_chejil_ladder.json'),'utf8'));
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const sel=inv.filter(r=>/체질/.test(r.kw)&&/검사|진단/.test(r.kw));
// 5위 추정가 (없으면 3위 → 70)
const bidOf=k=>{const l=lad[k]||{};return r10(l[5]??l[3]??70);};
(async()=>{
 const gids=[...new Set(sel.map(r=>r.gid))];
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:20},async()=>{while(i<gids.length){const g=gids[i++];
  const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)if(!k.delFlag)live[k.nccKeywordId]=k;}}));
 const cur=sel.filter(r=>live[r.id]).map(r=>({...r,eff:live[r.id].useGroupBidAmt?(gb[r.gid]||0):(live[r.id].bidAmt||0)}));
 const chg=cur.filter(r=>bidOf(r.kw)!==r.eff);
 console.log(`체질 검사·진단 인스턴스 ${won(cur.length)}개 (고유 ${won(new Set(cur.map(r=>r.kw)).size)}종) · 변경 ${won(chg.length)}개`);
 const b={};for(const r of chg){const u=(b[r.kw]||={cur:0,nb:bidOf(r.kw)});u.cur=Math.max(u.cur,r.eff);}
 console.log('\n  키워드                      현재    5위추정  적용가');
 Object.entries(b).sort((x,y)=>y[1].nb-x[1].nb).forEach(([k,u])=>{const l=lad[k]||{};
  console.log(`  ${k.slice(0,24).padEnd(26)}${won(u.cur).padStart(7)}원${won(l[5]??'-').padStart(8)}원${won(u.nb).padStart(8)}원`);});
 const aft=Object.values(b).reduce((s,u)=>s+u.nb,0);
 console.log(`\n적용가 합(고유 기준) ${won(aft)}원 · 최고 ${won(Math.max(...Object.values(b).map(u=>u.nb)))}원`);
 fs.writeFileSync(P('_sojam_f0902_chejil5_ROLLBACK.json'),
  JSON.stringify(Object.fromEntries(cur.map(r=>[r.id,{gid:r.gid,kw:r.kw,eff:r.eff}]))));
 const items=chg.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:bidOf(r.kw),useGroupBidAmt:false}));
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(let j=0;j<items.length;j+=100){const b2=items.slice(j,j+100);
  const [o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b2);
  if(o)ok+=b2.length;else{bad+=b2.length;console.log('  실패',String(e).slice(0,90));}await sleep(150);}
 console.log(`완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);
})();
