// 8/27 클릭 발생 키워드 전수 — 캠페인→그룹→키워드 단계 축소 후 키워드 stats
const fs=require('fs'),BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const DAY=process.argv[2]||'2026-08-27';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(800*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','cpc','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:DAY,until:DAY}));
const statsOf=async ids=>{
  const res=await pool(chunk(ids,40),5,g=>raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`));
  const m={}; for(const r of res) for(const d of ((r&&r.data)||[])) m[d.id]=d; return m;};

(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 const cs=await statsOf(camps.map(c=>c.nccCampaignId));
 const hot=camps.filter(c=>(cs[c.nccCampaignId]||{}).clkCnt>0);
 console.error(`캠페인 ${camps.length} → 클릭 발생 ${hot.length}개`);

 const gLists=await pool(hot,4,c=>raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`));
 const gAll=[],gCamp={};
 hot.forEach((c,i)=>{for(const g of (gLists[i]||[])){if(g.delFlag)continue;gAll.push(g);gCamp[g.nccAdgroupId]=c.name;}});
 const gs=await statsOf(gAll.map(g=>g.nccAdgroupId));
 const gHot=gAll.filter(g=>(gs[g.nccAdgroupId]||{}).clkCnt>0);
 console.error(`그룹 ${gAll.length} → 클릭 발생 ${gHot.length}개`);

 const kLists=await pool(gHot,4,g=>raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`));
 const kAll=[],kMeta={};
 gHot.forEach((g,i)=>{for(const k of (kLists[i]||[])){if(k.delFlag)continue;kAll.push(k.nccKeywordId);
   kMeta[k.nccKeywordId]={kw:k.keyword,camp:gCamp[g.nccAdgroupId],grp:g.name||'',
     bid:k.useGroupBidAmt?(g.bidAmt||0):(k.bidAmt||0),ugb:!!k.useGroupBidAmt,
     lock:!!k.userLock,st:k.status};}});
 console.error(`키워드 후보 ${kAll.length}개 조회중…`);
 const ks=await statsOf(kAll);
 const rows=Object.entries(ks).filter(([,d])=>d.clkCnt>0).map(([id,d])=>({...kMeta[id],...d}))
   .sort((a,b)=>b.salesAmt-a.salesAmt);

 const S=rows.reduce((s,r)=>({c:s.c+r.salesAmt,k:s.k+r.clkCnt,i:s.i+r.impCnt}),{c:0,k:0,i:0});
 console.log(`=== ${DAY} 클릭 발생 키워드 ${rows.length}개 ===`);
 console.log('  키워드                   클릭   비용      CPC     노출    순위  입찰가   캠페인');
 for(const r of rows)
  console.log(`  ${(r.kw||'').slice(0,20).padEnd(22)}${String(r.clkCnt).padStart(4)}${String(won(r.salesAmt)).padStart(9)}원${String(won(r.cpc)).padStart(8)}원${String(won(r.impCnt)).padStart(8)}${(r.avgRnk||0).toFixed(1).padStart(6)}${String(won(r.bid)).padStart(8)}원  ${(r.camp||'').slice(0,18)}`);
 console.log(`\n합계 — 클릭 ${S.k} · 비용 ${won(S.c)}원 · 노출 ${won(S.i)}`);
 fs.writeFileSync(__dirname+`/_sojam_d0828_kwclk_${DAY.replace(/-/g,'')}.json`,JSON.stringify(rows,null,1));
})();
