const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(p){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:'GET',path:p,body:null}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||'').slice(0,100));return d.response;}catch(e){if(a===3)throw e;await new Promise(s=>setTimeout(s,2500));}}}
const enc=x=>encodeURIComponent(JSON.stringify(x));const D='2026-09-10';const OUT='../reports/sojam-20260911/';fs.mkdirSync(OUT,{recursive:true});
async function stats(ids,f){const out=[];for(let i=0;i<ids.length;i+=40){const r=await api('/stats?ids='+encodeURIComponent(ids.slice(i,i+40).join(','))+'&fields='+enc(f)+'&timeRange='+enc({since:D,until:D}));out.push(...(r.data||[]));await new Promise(s=>setTimeout(s,150));}return out;}
(async()=>{
const camps=await api('/ncc/campaigns?recordSize=1000');const cn=Object.fromEntries(camps.map(c=>[c.nccCampaignId,c.name]));
const cs=await stats(camps.map(c=>c.nccCampaignId),['impCnt','clkCnt','salesAmt']);
const T=cs.reduce((a,r)=>({imp:a.imp+ +r.impCnt,clk:a.clk+ +r.clkCnt,cost:a.cost+ +r.salesAmt}),{imp:0,clk:0,cost:0});
console.log('■ 2026-09-10 총계',JSON.stringify(T),'| 캠페인',camps.length);
const cc=cs.filter(r=>+r.clkCnt>0||+r.salesAmt>0).sort((a,b)=>b.salesAmt-a.salesAmt);
console.log('■ 캠페인별');for(const r of cc)console.log('  ',(cn[r.id]||r.id).slice(0,40).padEnd(42),String(r.impCnt).padStart(6),String(r.clkCnt).padStart(4),String(r.salesAmt).padStart(8));
const groups=[];for(const c of cc){let b='';for(let i=0;i<30;i++){const pg=await api('/ncc/adgroups?nccCampaignId='+c.id+'&recordSize=1000'+(b?'&baseSearchId='+b:''));if(!Array.isArray(pg)||!pg.length)break;groups.push(...pg.map(g=>({id:g.nccAdgroupId,name:g.name,cid:c.id})));if(pg.length<1000)break;b=pg[pg.length-1].nccAdgroupId;}}
const gm=Object.fromEntries(groups.map(g=>[g.id,g]));
const gs=(await stats(groups.map(g=>g.id),['impCnt','clkCnt','salesAmt'])).filter(r=>+r.clkCnt>0);
const kws=[];for(const g of gs){const ks=await api('/ncc/keywords?nccAdgroupId='+g.id+'&recordSize=1000');if(Array.isArray(ks))kws.push(...ks.map(k=>({id:k.nccKeywordId,kw:k.keyword,gid:g.id,bid:k.useGroupBidAmt?null:k.bidAmt,lock:k.userLock})));await new Promise(s=>setTimeout(s,150));}
const km=Object.fromEntries(kws.map(k=>[k.id,k]));
const ks=(await stats(kws.map(k=>k.id),['impCnt','clkCnt','salesAmt','avgRnk'])).filter(r=>+r.clkCnt>0).map(r=>({...km[r.id],imp:+r.impCnt,clk:+r.clkCnt,cost:+r.salesAmt,rank:+r.avgRnk})).sort((a,b)=>b.cost-a.cost);
const kc=ks.reduce((a,r)=>({clk:a.clk+r.clk,cost:a.cost+r.cost}),{clk:0,cost:0});const gc=gs.reduce((a,r)=>({clk:a.clk+ +r.clkCnt,cost:a.cost+ +r.salesAmt}),{clk:0,cost:0});
fs.writeFileSync(OUT+'yesterday.json',JSON.stringify({D,T,byCampaign:cc.map(r=>({name:cn[r.id],...r})),clicked:ks,groupClicks:gs.map(r=>({...gm[r.id],clk:+r.clkCnt,cost:+r.salesAmt}))},null,1));
console.log('■ 클릭 난 그룹',gs.length,'(클릭',gc.clk,'/',gc.cost,'원) | 키워드 귀속',ks.length,'개 (클릭',kc.clk,'/',kc.cost,'원)');
for(const r of gs.filter(g=>!ks.some(k=>k.gid===g.id)))console.log('   키워드 귀속 안 된 그룹:',gm[r.id].name,'|',cn[gm[r.id].cid],r.clkCnt,'클릭',r.salesAmt,'원');
console.log('■ 클릭 키워드 전부 (비용순)');let i=0;for(const k of ks)console.log(String(++i).padStart(3),k.kw.padEnd(18),String(k.clk).padStart(3),String(k.cost).padStart(7),String(Math.round(k.cost/k.clk)).padStart(7),String(k.imp).padStart(6),k.rank.toFixed(1).padStart(5),String(k.bid??'그룹').padStart(6),(k.lock?'[지금중지]':''),(cn[gm[k.gid].cid]||'').slice(0,24),'/',(gm[k.gid].name||'').slice(0,22));
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
