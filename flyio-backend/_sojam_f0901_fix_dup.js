const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const APPLY=process.argv.includes('--apply');
const DST='grp-a001-01-000000072328280';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,method,body,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),
  signal:AbortSignal.timeout(150000)});
 if(r.ok){const d=await r.json();if(d.success)return[true,d.response];return[false,d.error||'']}
 }catch(e){}await sleep(1200*(t+1));}return[false,'retry'];}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const r10=v=>Math.max(70,Math.round(v/10)*10);
const lad=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid_ladder.json'),'utf8'));
const kws=new Set(JSON.parse(fs.readFileSync(P('_sojam_e0831_tsw_group.json'),'utf8')).kws);
const bidOf=k=>{const l=lad[k]||{};const e=l[1]??l[2];return e==null?500:r10(Math.min(20000,Math.max(500,e)));};
(async()=>{
 const [o,ks]=await raw(`/ncc/keywords?nccAdgroupId=${DST}`,'GET',null);
 const live=(ks||[]).filter(k=>!k.delFlag);
 const tsw=live.filter(k=>kws.has(k.keyword));
 console.log(`그룹 전체 키워드 ${live.length}개 · 그중 탈스 ${tsw.length}종`);
 console.log(`노출가능 ${live.filter(k=>k.status==='ELIGIBLE').length} · 잠김 ${live.filter(k=>k.userLock).length}`);
 const low=tsw.filter(k=>(k.bidAmt||0)<bidOf(k.keyword)||k.useGroupBidAmt);
 console.log(`\n목표가 미달 ${low.length}개`);
 low.forEach(k=>console.log(`  ${k.keyword.padEnd(24)}${won(k.bidAmt).padStart(7)}원 → ${won(bidOf(k.keyword)).padStart(7)}원`));
 const lk=tsw.filter(k=>k.userLock);
 if(lk.length)console.log(`잠긴 탈스 키워드 ${lk.length}개: ${lk.map(k=>k.keyword).join(', ')}`);
 if(!APPLY){console.log('\ndry-run — 적용하려면 --apply');return;}
 if(low.length){
  const items=low.map(k=>({nccKeywordId:k.nccKeywordId,nccAdgroupId:DST,bidAmt:bidOf(k.keyword),useGroupBidAmt:false}));
  const [o2,e]=await raw('/ncc/keywords?fields=bidAmt','PUT',items);
  console.log(o2?`입찰가 보정 ${items.length}개 완료`:`실패 ${String(e).slice(0,150)}`);
 }
 if(lk.length){
  const [o3,e3]=await raw('/ncc/keywords?fields=userLock','PUT',lk.map(k=>({nccKeywordId:k.nccKeywordId,nccAdgroupId:DST,userLock:false})));
  console.log(o3?`잠금해제 ${lk.length}개 완료`:`잠금해제 실패 ${String(e3).slice(0,150)}`);
 }
})();
