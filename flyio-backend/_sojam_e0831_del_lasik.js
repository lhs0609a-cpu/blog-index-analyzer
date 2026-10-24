// 강남라식잘하는곳 / 강남스마일라식잘하는곳 삭제 (원장 지시)
//   node _sojam_e0831_del_lasik.js [--apply]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];
  return[false,d.error||JSON.stringify(d).slice(0,200)];}}catch(e){}
 await sleep(1200*(t+1));}return[false,'retry exhausted'];}
const TARGET=['강남라식잘하는곳','강남스마일라식잘하는곳'];
const inv=JSON.parse(fs.readFileSync(P('_sojam_e0831_live.json'),'utf8'));
const sel=inv.filter(r=>TARGET.includes(r.kw));
(async()=>{
 // 삭제 전 원본 객체 전체를 스냅샷 (재등록용)
 const gids=[...new Set(sel.map(r=>r.gid))];
 const full=[];
 for(const g of gids){const [o,a]=await raw(`/ncc/keywords?nccAdgroupId=${g}`,'GET',null);
  if(o&&Array.isArray(a))for(const k of a)if(sel.some(s=>s.id===k.nccKeywordId))full.push(k);}
 console.log(`삭제 대상 ${sel.length}건 · 원본 확보 ${full.length}건`);
 for(const k of full)console.log(`  ${k.keyword}  입찰 ${(k.bidAmt||0).toLocaleString()}원 · ${k.status} · grp=${k.nccAdgroupId}`);
 fs.writeFileSync(P('_sojam_e0831_del_lasik_SNAPSHOT.json'),JSON.stringify({deletedAt:new Date().toISOString(),
   note:'재등록 시 nccAdgroupId 그룹에 keyword/bidAmt/links 로 POST /ncc/keywords',items:full},null,1));
 console.log('\n스냅샷 저장 — _sojam_e0831_del_lasik_SNAPSHOT.json');
 if(!APPLY){console.log('\ndry-run — 삭제하려면 --apply');return;}
 const ids=full.map(k=>k.nccKeywordId);
 const [o,e]=await raw(`/ncc/keywords?ids=${encodeURIComponent(ids.join(','))}`,'DELETE',null);
 console.log(o?`삭제 완료 — ${ids.length}건`:`삭제 실패 — ${String(e).slice(0,200)}`);
})();
