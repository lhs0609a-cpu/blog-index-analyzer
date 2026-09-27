// 특정 키워드 패턴 전부 최저가(70원)
//   node _sojam_e0831_floor_kw.js "대상포진" [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const PAT=process.argv[2],APPLY=process.argv.includes('--apply');
if(!PAT){console.error('패턴 필요');process.exit(1);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=5){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(180000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  if(/BAD_REQUEST|11001/.test(String(d.error)))return[false,d.error];}}catch(e){}
 await sleep(Math.min(1500*(t+1),10000));}return[false,'retry exhausted'];}
const won=n=>(n||0).toLocaleString('ko-KR');
const inv=JSON.parse(fs.readFileSync(P('_sojam_d0828_inv_hot.json'),'utf8'));
const re=new RegExp(PAT);
const sel=inv.filter(r=>re.test(r.kw));
(async()=>{
 // 인벤토리가 8/28 기준이므로 대상 그룹만 라이브 재조회
 const gids=[...new Set(sel.map(r=>r.gid))];
 console.error(`패턴 "${PAT}" 인스턴스 ${won(sel.length)}개 · 그룹 ${gids.length}개 라이브 재조회…`);
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0,done=0;
 await Promise.all(Array.from({length:24},async()=>{while(i<gids.length){const g=gids[i++];
  const[o,arr]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(arr))for(const k of arr)live[k.nccKeywordId]=k;
  if(++done%300===0)console.error(`  ${done}/${gids.length}`);}}));
 const cur=sel.map(r=>{const k=live[r.id];
  const eff=k?(k.useGroupBidAmt?(gb[r.gid]||0):(k.bidAmt||0)):r.eff;
  return {...r,eff,st:k?k.status:r.st,found:!!k};});
 const miss=cur.filter(r=>!r.found).length;
 const hi=cur.filter(r=>r.eff>70);
 console.log(`\n"${PAT}" 인스턴스 ${won(cur.length)}개 (고유 ${won(new Set(cur.map(r=>r.kw)).size)}개) · 조회실패 ${miss}`);
 console.log(`70원 초과 = 내려갈 것 ${won(hi.length)}개 (고유 ${won(new Set(hi.map(r=>r.kw)).size)}개)\n`);
 const seen=new Set();
 console.log('=== 입찰가 높은 순 (고유 키워드 상위 30) ===');
 for(const r of [...hi].sort((a,b)=>b.eff-a.eff)){if(seen.has(r.kw))continue;seen.add(r.kw);if(seen.size>30)break;
  console.log(`  ${r.kw.slice(0,22).padEnd(24)}${won(r.eff).padStart(8)}원 → 70원   ${r.camp.slice(0,30)}`);}
 fs.writeFileSync(P(`_sojam_e0831_floor_${PAT}_ROLLBACK.json`),
  JSON.stringify(Object.fromEntries(cur.map(r=>[r.id,{gid:r.gid,kw:r.kw,eff:r.eff}]))));
 const items=hi.map(r=>({nccKeywordId:r.id,nccAdgroupId:r.gid,bidAmt:70,useGroupBidAmt:false}));
 console.log(`\n롤백 스냅샷 ${won(cur.length)}개 저장 · PUT ${won(items.length)}개`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 let ok=0,bad=0;
 for(let j=0;j<items.length;j+=100){const b=items.slice(j,j+100);
  const[o,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',b);
  if(o)ok+=b.length;else{bad+=b.length;console.log('  실패',String(e).slice(0,90));}
  await sleep(150);}
 console.log(`완료 — 성공 ${won(ok)} / 실패 ${won(bad)}`);
})();
