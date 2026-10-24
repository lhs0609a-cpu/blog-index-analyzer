// 기간 소진의 키워드 단위 지도 — 소진은 클릭에서만 나오므로 '클릭 발생 캠페인 → 그룹 → 키워드' 로 좁혀도 전액이 잡힌다.
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const SINCE=process.argv[2],UNTIL=process.argv[3];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function raw(p,t=4){for(let i=0;i<t;i++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),signal:AbortSignal.timeout(120000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(800*(i+1));}return null;}
async function pool(items,n,fn){const o=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;o[k]=await fn(items[k]);}}));return o;}
const F=enc(['impCnt','clkCnt','salesAmt','avgRnk']),T=enc({since:SINCE,until:UNTIL});
const statsOf=async ids=>{const res=await pool(chunk(ids,40),6,g=>raw('/stats?ids='+encodeURIComponent(g.join(','))+'&fields='+F+'&timeRange='+T));const m={};for(const r of res)for(const d of ((r&&r.data)||[]))m[d.id]=d;return m;};
(async()=>{
 const camps=((await raw('/ncc/campaigns?recordSize=1000'))||[]).filter(c=>!c.delFlag);
 const cs=await statsOf(camps.map(c=>c.nccCampaignId));
 const hot=camps.filter(c=>(cs[c.nccCampaignId]||{}).salesAmt>0);
 console.error('캠페인',camps.length,'→ 소진 발생',hot.length);
 const gl=await pool(hot,5,c=>raw('/ncc/adgroups?nccCampaignId='+c.nccCampaignId));
 const gAll=[],gCamp={};
 hot.forEach((c,i)=>{for(const g of (gl[i]||[])){if(g.delFlag)continue;gAll.push(g);gCamp[g.nccAdgroupId]={camp:c.name,cid:c.nccCampaignId,sb:!!c.sharedBudgetId};}});
 const gs=await statsOf(gAll.map(g=>g.nccAdgroupId));
 const gHot=gAll.filter(g=>(gs[g.nccAdgroupId]||{}).salesAmt>0);
 console.error('그룹',gAll.length,'→ 소진 발생',gHot.length);
 const kl=await pool(gHot,5,g=>raw('/ncc/keywords?nccAdgroupId='+g.nccAdgroupId));
 const kAll=[],kMeta={};
 gHot.forEach((g,i)=>{for(const k of (kl[i]||[])){if(k.delFlag)continue;kAll.push(k.nccKeywordId);
  kMeta[k.nccKeywordId]={kw:k.keyword,grp:g.name||'',...gCamp[g.nccAdgroupId],
   bid:k.useGroupBidAmt?(g.bidAmt||0):(k.bidAmt||0),ugb:!!k.useGroupBidAmt,gbid:g.bidAmt||0,
   gid:g.nccAdgroupId,lock:!!k.userLock,st:k.status};}});
 console.error('키워드 후보',kAll.length);
 const ks=await statsOf(kAll);
 const rows=Object.entries(ks).filter(([,d])=>d.salesAmt>0).map(([id,d])=>({id,...kMeta[id],imp:+d.impCnt||0,clk:+d.clkCnt||0,cost:+d.salesAmt||0,rank:d.avgRnk??null})).sort((a,b)=>b.cost-a.cost);
 const D=path.join(__dirname,'../reports/sojam-20260915/');
 fs.writeFileSync(D+'spendmap_'+SINCE.replace(/-/g,'')+'_'+UNTIL.replace(/-/g,'')+'.json',JSON.stringify(rows));
 const tot=rows.reduce((a,r)=>a+r.cost,0);
 console.log('기간',SINCE,'~',UNTIL,'| 소진 키워드',rows.length,'| 합계',tot.toLocaleString('ko-KR'),'원');
})();
