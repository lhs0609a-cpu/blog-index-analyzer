const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>(n||0).toLocaleString('ko-KR');
const inv=require('./_sojam_d0828_inv_hot.json');
const tgt=inv.filter(r=>/체질/.test(r.kw)&&r.eff>70);
(async()=>{
 const gids=[...new Set(tgt.map(r=>r.gid))];
 const live={},gb={};for(const r of inv)gb[r.gid]=r.gbid;
 let i=0;await Promise.all(Array.from({length:16},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/keywords?nccAdgroupId=${g}`);if(Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 const b={};for(const r of tgt){const k=live[r.id];if(!k)continue;
  const eff=k.useGroupBidAmt?(gb[r.gid]||0):(k.bidAmt||0);
  const u=(b[r.kw]||={was:0,now:0});u.was=Math.max(u.was,r.eff);u.now=Math.max(u.now,eff);}
 const L=Object.entries(b).sort((x,y)=>y[1].now-x[1].now);
 console.log('체질 관련 키워드 '+L.length+'종 현재 상태');
 L.forEach(([k,u])=>console.log('  '+k.slice(0,24).padEnd(26)+'8/28 '+won(u.was).padStart(7)+'원 → 현재 '+won(u.now).padStart(7)+'원'+(u.now<=70?'  ▼최저가':'')));
})();
