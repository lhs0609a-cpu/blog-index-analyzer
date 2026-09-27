// 기간 내 클릭 발생 키워드 전수 — 캠페인→그룹→키워드로 단계 축소
//   node _sojam_e0831_week.js [since] [until]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const SINCE=process.argv[2]||'2026-08-25', UNTIL=process.argv[3]||'2026-08-31';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},
 async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k]);}}));return out;}
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','cpc','avgRnk']));
const T=encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL}));
const statsOf=async ids=>{const res=await pool(chunk(ids,40),8,
 g=>raw(`/stats?ids=${encodeURIComponent(g.join(','))}&fields=${F}&timeRange=${T}&timeIncrement=allDays`));
 const m={};for(const r of res)for(const d of ((r&&r.data)||[]))m[d.id]=d;return m;};
(async()=>{
 const camps=((await raw('/ncc/campaigns'))||[]).filter(c=>!c.delFlag);
 if(!camps.length){console.error('캠페인 조회 실패');process.exit(1);}
 const cs=await statsOf(camps.map(c=>c.nccCampaignId));
 const hot=camps.filter(c=>(cs[c.nccCampaignId]||{}).clkCnt>0);
 console.error(`캠페인 ${camps.length} → 클릭 발생 ${hot.length}개`);
 const gLists=await pool(hot,8,c=>raw(`/ncc/adgroups?nccCampaignId=${c.nccCampaignId}`));
 const gAll=[],gCamp={};
 hot.forEach((c,i)=>{for(const g of (gLists[i]||[])){if(g.delFlag)continue;gAll.push(g);
   gCamp[g.nccAdgroupId]={camp:c.name,grp:g.name||'',gbid:g.bidAmt||0};}});
 const gs=await statsOf(gAll.map(g=>g.nccAdgroupId));
 const gHot=gAll.filter(g=>(gs[g.nccAdgroupId]||{}).clkCnt>0);
 console.error(`그룹 ${gAll.length} → 클릭 발생 ${gHot.length}개`);
 const kLists=await pool(gHot,8,g=>raw(`/ncc/keywords?nccAdgroupId=${g.nccAdgroupId}`));
 const kAll=[],kMeta={};
 gHot.forEach((g,i)=>{const gi=gCamp[g.nccAdgroupId];
  for(const k of (kLists[i]||[])){if(k.delFlag)continue;kAll.push(k.nccKeywordId);
   kMeta[k.nccKeywordId]={kw:k.keyword,camp:gi.camp,grp:gi.grp,
    bid:k.useGroupBidAmt?gi.gbid:(k.bidAmt||0),st:k.status,lock:!!k.userLock};}});
 console.error(`키워드 후보 ${kAll.length}개 조회중…`);
 const ks=await statsOf(kAll);
 const rows=Object.entries(ks).filter(([,d])=>d.clkCnt>0).map(([id,d])=>({id,...kMeta[id],...d}))
  .sort((a,b)=>b.salesAmt-a.salesAmt);
 fs.writeFileSync(P(`_sojam_e0831_week_${SINCE.replace(/-/g,'')}_${UNTIL.replace(/-/g,'')}.json`),JSON.stringify(rows,null,1));
 // 그룹 실적 합과 대조 (키워드 단위로 안 잡히는 소진 = 확장검색/플레이스 등)
 const gSum=gHot.reduce((s,g)=>({c:s.c+(gs[g.nccAdgroupId].salesAmt||0),k:s.k+(gs[g.nccAdgroupId].clkCnt||0)}),{c:0,k:0});
 const cSum=hot.reduce((s,c)=>({c:s.c+(cs[c.nccCampaignId].salesAmt||0),k:s.k+(cs[c.nccCampaignId].clkCnt||0)}),{c:0,k:0});
 const kSum=rows.reduce((s,r)=>({c:s.c+r.salesAmt,k:s.k+r.clkCnt}),{c:0,k:0});
 console.error(`\n대조 — 캠페인합 ${won(cSum.c)}원/${cSum.k}클릭 · 그룹합 ${won(gSum.c)}원/${gSum.k} · 키워드합 ${won(kSum.c)}원/${kSum.k}`);
 console.log(JSON.stringify({SINCE,UNTIL,cSum,gSum,kSum,n:rows.length}));
})();
