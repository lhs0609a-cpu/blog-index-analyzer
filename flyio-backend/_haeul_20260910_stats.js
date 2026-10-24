const fs=require('fs'),path=require('path'),assert=require('assert');
const D=path.join(__dirname,'reports','haeul_20260910'),CID=3442423,SINCE='2026-09-09',UNTIL='2026-09-09';
fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json')));
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function call(method,p,body=null){for(let t=0;t<4;t++){try{const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,path:p,body,customer_id:String(CID)}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('API '+r.status+' '+p.split('?')[0]+' '+JSON.stringify(d.error||d.detail||d).slice(0,300));return d.response;}catch(e){if(t===3)throw e;await sleep(2500);}}}
async function pool(items,n,fn){const out=new Array(items.length);let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const j=i++;out[j]=await fn(items[j],j);}}));return out;}
const statsFor=async ids=>{const rr=await pool(chunks(ids,40),3,c=>call('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk','ccnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL}))));
  assert(rr.every(x=>Array.isArray(x.data)),'stats shape');return rr.flatMap(x=>x.data);};
(async()=>{
 const campaigns=read('campaigns'),cm=new Map(campaigns.map(c=>[c.nccCampaignId,c]));
 // 1) all adgroups
 let groups=[];
 for(const c of campaigns){const g=await call('GET','/ncc/adgroups?nccCampaignId='+c.nccCampaignId);assert(Array.isArray(g));groups.push(...g.map(x=>({...x,campaignName:c.name})));}
 save('adgroups_slim',groups.map(g=>({id:g.nccAdgroupId,cid:g.nccCampaignId,name:g.name,bidAmt:g.bidAmt,dailyBudget:g.dailyBudget,useDailyBudget:g.useDailyBudget,userLock:g.userLock,status:g.status,campaignName:g.campaignName})));
 console.log('ADGROUPS',groups.length);
 // 2) yesterday stats per adgroup
 const gs=await statsFor(groups.map(g=>g.nccAdgroupId));save('group_stats',gs);
 const gsm=new Map(gs.map(x=>[x.id,x]));
 const hot=groups.filter(g=>(gsm.get(g.nccAdgroupId)?.clkCnt||0)>0);
 console.log('GROUPS WITH CLICKS',hot.length,'of',groups.length);
 for(const g of hot){const s=gsm.get(g.nccAdgroupId);console.log(' ',g.campaignName,'|',g.name,'clk='+s.clkCnt,'cost='+s.salesAmt,'imp='+s.impCnt);}
 // 3) keywords in those groups
 const inv=await pool(hot,3,async g=>({gid:g.nccAdgroupId,keywords:await call('GET','/ncc/keywords?nccAdgroupId='+g.nccAdgroupId)}));
 assert(inv.every(x=>Array.isArray(x.keywords)));
 const keys=inv.flatMap(x=>x.keywords);console.log('KEYWORDS IN HOT GROUPS',keys.length);
 const ks=await statsFor(keys.map(k=>k.nccKeywordId));save('keyword_stats',ks);
 const ksm=new Map(ks.map(x=>[x.id,x]));const gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
 const rows=keys.filter(k=>(ksm.get(k.nccKeywordId)?.clkCnt||0)>0).map(k=>{const s=ksm.get(k.nccKeywordId),g=gm.get(k.nccAdgroupId);return{
   키워드:k.keyword,캠페인:cm.get(g.nccCampaignId)?.name||g.nccCampaignId,그룹:g.name,
   노출:s.impCnt,클릭:s.clkCnt,비용:s.salesAmt,CPC:Math.round(s.salesAmt/s.clkCnt),
   CTR:+(s.clkCnt/s.impCnt*100).toFixed(2),평균순위:s.avgRnk,
   입찰가:k.useGroupBidAmt?g.bidAmt:k.bidAmt,그룹입찰사용:!!k.useGroupBidAmt,
   상태:k.userLock?'OFF':'ON',keywordId:k.nccKeywordId,gid:k.nccAdgroupId};})
  .sort((a,b)=>b.비용-a.비용||b.클릭-a.클릭);
 save('clicked_keywords',rows);
 const cs=await statsFor(campaigns.map(c=>c.nccCampaignId));save('campaign_stats',cs);
 const campTot=cs.reduce((s,x)=>({clk:s.clk+x.clkCnt,cost:s.cost+x.salesAmt,imp:s.imp+x.impCnt}),{clk:0,cost:0,imp:0});
 const kwTot=rows.reduce((s,x)=>({clk:s.clk+x.클릭,cost:s.cost+x.비용,imp:s.imp+x.노출}),{clk:0,cost:0,imp:0});
 const summary={date:SINCE,campaignTotal:campTot,clickedKeywordTotal:kwTot,
   unattributed:{clk:campTot.clk-kwTot.clk,cost:campTot.cost-kwTot.cost},
   clickedKeywords:rows.length,groupsWithClicks:hot.length,adgroups:groups.length};
 save('summary',summary);
 const cscsv=cs.map(x=>({캠페인:cm.get(x.id)?.name||x.id,유형:cm.get(x.id)?.campaignTp,일예산:cm.get(x.id)?.dailyBudget,노출:x.impCnt,클릭:x.clkCnt,비용:x.salesAmt,CPC:x.clkCnt?Math.round(x.salesAmt/x.clkCnt):0})).sort((a,b)=>b.비용-a.비용);
 const csv=(n,a)=>{const cs2=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'﻿'+[cs2,...a.map(r=>cs2.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));};
 csv('어제_캠페인별_소진_20260909',cscsv);csv('어제_클릭발생_키워드_20260909',rows);
 console.log('\nCAMPAIGN');console.table(cscsv);
 console.log('\nSUMMARY',JSON.stringify(summary));
 console.log('\nCLICKED KEYWORDS');console.table(rows.map(({키워드,캠페인,그룹,노출,클릭,비용,CPC,CTR,평균순위,입찰가,상태})=>({키워드,캠페인,그룹,노출,클릭,비용,CPC,CTR,평균순위,입찰가,상태})));
})().catch(e=>{console.error('ERR',String(e),e.stack);process.exitCode=1;});
