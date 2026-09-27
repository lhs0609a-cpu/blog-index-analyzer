// 적용 후 — 실제로 노출가능 상태가 됐는지, 아니면 어디서 막혔는지
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
(async()=>{
 const gids=[...new Set(rows.map(r=>r.gid))];
 const live={};let i=0;
 await Promise.all(Array.from({length:20},async()=>{while(i<gids.length){const g=gids[i++];
  const a=await raw(`/ncc/keywords?nccAdgroupId=${g}`);if(Array.isArray(a))for(const k of a)live[k.nccKeywordId]=k;}}));
 // 그룹/캠페인 상태
 const gInfo={};
 let j=0;const gl=[...gids];
 await Promise.all(Array.from({length:12},async()=>{while(j<gl.length){const g=gl[j++];
  const a=await raw(`/ncc/adgroups?ids=${g}`); const x=Array.isArray(a)?a[0]:null;
  if(x)gInfo[g]={name:x.name,lock:!!x.userLock,st:x.status,camp:x.nccCampaignId,bid:x.bidAmt};}}));
 const cids=[...new Set(Object.values(gInfo).map(g=>g.camp))];
 const cInfo={};
 const camps=(await raw('/ncc/campaigns'))||[];
 for(const c of camps)cInfo[c.nccCampaignId]={name:c.name,lock:!!c.userLock,st:c.status};

 let ok=0;const blocked={};
 for(const r of rows){const k=live[r.id];if(!k)continue;
  if(k.status==='ELIGIBLE'){ok++;continue;}
  const g=gInfo[r.gid]||{},c=cInfo[g.camp]||{};
  const why=k.userLock?'키워드 잠김':g.lock?`그룹 OFF (${g.name||''})`:c.lock?`캠페인 OFF (${c.name||''})`:`기타 (${k.status})`;
  (blocked[why]||=[]).push(r.kw);}
 console.log(`\n스테로이드 인스턴스 ${rows.length}개 — 노출가능 ${won(ok)} / 아직 아님 ${won(rows.length-ok)}`);
 const bids=rows.map(r=>live[r.id]).filter(Boolean).map(k=>k.bidAmt||0).sort((a,b)=>a-b);
 console.log(`입찰가 중앙 ${won(bids[Math.floor(bids.length/2)])}원 · 최고 ${won(bids[bids.length-1])}원 · 70원 남은 것 ${bids.filter(v=>v<=70).length}개`);
 for(const [w,a] of Object.entries(blocked).sort((x,y)=>y[1].length-x[1].length))
  console.log(`\n  ▸ ${w} — ${a.length}개\n     ${[...new Set(a)].slice(0,12).join(', ')}`);
})();
