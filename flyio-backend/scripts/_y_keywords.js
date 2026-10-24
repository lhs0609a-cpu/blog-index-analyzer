const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(method,p,body){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method,path:p,body:body||null}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+r.status+' '+(d.error||''));return d.response;}catch(e){if(a===3)throw e;await new Promise(s=>setTimeout(s,1500));}}}
const enc=x=>encodeURIComponent(JSON.stringify(x));
const D='2026-09-09';
async function stats(ids){const out=[];for(let i=0;i<ids.length;i+=40){const r=await api('GET','/stats?ids='+encodeURIComponent(ids.slice(i,i+40).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:D,until:D}));out.push(...(r.data||[]));}return out;}
(async()=>{
const prev=JSON.parse(fs.readFileSync(__dirname+'/../../reports/sojam-20260909/yesterday_campaign_stats.json'));
const camps=prev.byCampaign.filter(c=>c.clk>0);
console.error('campaigns with clicks',camps.length);
let groups=[];
for(const c of camps){
  let base_='',page;
  for(let i=0;i<60;i++){
    page=await api('GET','/ncc/adgroups?nccCampaignId='+c.id+'&recordSize=1000'+(base_?'&baseSearchId='+base_:''));
    if(!Array.isArray(page)||!page.length)break;
    groups.push(...page.map(g=>({id:g.nccAdgroupId,name:g.name,cid:c.id,cname:c.name})));
    if(page.length<1000)break;
    base_=page[page.length-1].nccAdgroupId;
  }
  console.error(c.name,'groups so far',groups.length);
}
fs.writeFileSync('_y_groups.json',JSON.stringify(groups));
const gs=await stats(groups.map(g=>g.id));
const gclk=gs.filter(r=>+r.clkCnt>0);
console.error('groups',groups.length,'with clicks',gclk.length,'clicks',gclk.reduce((a,r)=>a+ +r.clkCnt,0));
fs.writeFileSync('_y_group_stats.json',JSON.stringify({groups,gs}));
// keywords in clicked groups
const gmap=Object.fromEntries(groups.map(g=>[g.id,g]));
let kws=[];
for(const r of gclk){
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+r.id+'&recordSize=1000');
  if(Array.isArray(ks))kws.push(...ks.map(k=>({id:k.nccKeywordId,kw:k.keyword,gid:r.id,gname:gmap[r.id].name,cname:gmap[r.id].cname,bid:k.bidAmt,useGroupBid:k.useGroupBidAmt,userLock:k.userLock,status:k.status})));
}
console.error('keywords in clicked groups',kws.length);
const ks=await stats(kws.map(k=>k.id));
const kmap=Object.fromEntries(kws.map(k=>[k.id,k]));
const clicked=ks.filter(r=>+r.clkCnt>0).map(r=>({...kmap[r.id],imp:+r.impCnt,clk:+r.clkCnt,cost:+r.salesAmt,rank:+r.avgRnk})).sort((a,b)=>b.cost-a.cost);
const sum=clicked.reduce((a,r)=>({clk:a.clk+r.clk,cost:a.cost+r.cost}),{clk:0,cost:0});
fs.writeFileSync(__dirname+'/../../reports/sojam-20260909/yesterday_keyword_clicks.json',JSON.stringify({date:D,clicked,sum,groupStats:gclk.map(r=>({...gmap[r.id],imp:+r.impCnt,clk:+r.clkCnt,cost:+r.salesAmt}))},null,1));
console.log(JSON.stringify({attributed:sum,rows:clicked.length},null,1));
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
