// 어제(2026-09-20) 해울 소진 + 클릭 발생 키워드. 하루치만, 저부하로.
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,DATE=process.env.DATE||'2026-09-20';
const D=path.join(__dirname,'reports','haeul_20260921');fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=(n,x)=>fs.writeFileSync(path.join(D,n+'.json'),JSON.stringify(x));
const has=n=>fs.existsSync(path.join(D,n+'.json'));
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json'),'utf8'));
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function api(m,p,b=null){for(let t=0;t<4;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error('API '+r.status+' '+p.split('?')[0]+' '+String(d.error||d.detail||'').slice(0,300));
 return d.response;}catch(e){if(t===3)throw e;await sleep(3000);}}}
async function pool(items,n,fn){const out=new Array(items.length);let i=0;
 await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const j=i++;out[j]=await fn(items[j],j);await sleep(250);}}));return out;}
const FIELDS=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk','ccnt']));
const TR=encodeURIComponent(JSON.stringify({since:DATE,until:DATE}));
async function statsFor(ids){const rr=await pool(chunks(ids,40),2,c=>api('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+FIELDS+'&timeRange='+TR));
 assert(rr.every(x=>Array.isArray(x.data)),'stats shape');return rr.flatMap(x=>x.data);}
(async()=>{
 const campaigns=has('campaigns')?read('campaigns'):await api('GET','/ncc/campaigns');save('campaigns',campaigns);
 const cm=new Map(campaigns.map(c=>[c.nccCampaignId,c]));
 const cs=has('campaign_stats')?read('campaign_stats'):await statsFor(campaigns.map(c=>c.nccCampaignId));save('campaign_stats',cs);
 const csm=new Map(cs.map(x=>[x.id,x]));
 const camp=campaigns.map(c=>{const s=csm.get(c.nccCampaignId)||{};return{캠페인:c.name,유형:c.campaignTp,일예산:c.dailyBudget,게재:c.deliveryMethod,
  노출:s.impCnt||0,클릭:s.clkCnt||0,비용:s.salesAmt||0,CPC:s.clkCnt?Math.round(s.salesAmt/s.clkCnt):0,
  CTR:s.impCnt?+(s.clkCnt/s.impCnt*100).toFixed(2):0,소진율:c.dailyBudget?Math.round((s.salesAmt||0)/c.dailyBudget*100)+'%':''};}).sort((a,b)=>b.비용-a.비용);
 save('campaign_table',camp);
 console.log('\n=== 캠페인별 '+DATE+' ===');console.table(camp);
 const T=camp.reduce((s,x)=>({imp:s.imp+x.노출,clk:s.clk+x.클릭,cost:s.cost+x.비용}),{imp:0,clk:0,cost:0});
 console.log('합계 노출 '+T.imp+' 클릭 '+T.clk+' 소진 '+T.cost.toLocaleString()+'원(VAT별도) CPC '+(T.clk?Math.round(T.cost/T.clk):0));

 let groups;
 if(has('adgroups'))groups=read('adgroups');
 else{groups=[];for(const c of campaigns){const g=await api('GET','/ncc/adgroups?nccCampaignId='+c.nccCampaignId);assert(Array.isArray(g));
  groups.push(...g.map(x=>({id:x.nccAdgroupId,cid:x.nccCampaignId,name:x.name,bidAmt:x.bidAmt,dailyBudget:x.dailyBudget,useDailyBudget:x.useDailyBudget,userLock:x.userLock,status:x.status,statusReason:x.statusReason})));
  await sleep(400);} save('adgroups',groups);}
 console.log('ADGROUPS',groups.length);
 const gs=has('group_stats')?read('group_stats'):await statsFor(groups.map(g=>g.id));save('group_stats',gs);
 const gsm=new Map(gs.map(x=>[x.id,x]));
 const hot=groups.filter(g=>(gsm.get(g.id)?.clkCnt||0)>0);
 console.log('클릭 발생 그룹',hot.length,'/',groups.length);
 console.table(hot.map(g=>{const s=gsm.get(g.id);return{캠페인:cm.get(g.cid)?.name,그룹:g.name,노출:s.impCnt,클릭:s.clkCnt,비용:s.salesAmt,상태:g.status,그룹예산:g.useDailyBudget?g.dailyBudget:''};}).sort((a,b)=>b.비용-a.비용));

 let keys;
 if(has('hot_keywords'))keys=read('hot_keywords');
 else{const inv=await pool(hot,2,async g=>await api('GET','/ncc/keywords?nccAdgroupId='+g.id));
  keys=inv.flat().map(k=>({kid:k.nccKeywordId,gid:k.nccAdgroupId,kw:k.keyword,bid:k.bidAmt,useGroupBid:!!k.useGroupBidAmt,off:!!k.userLock,status:k.status}));save('hot_keywords',keys);}
 console.log('클릭 그룹 내 키워드',keys.length);
 const ks=has('keyword_stats')?read('keyword_stats'):await statsFor(keys.map(k=>k.kid));save('keyword_stats',ks);
 const ksm=new Map(ks.map(x=>[x.id,x]));const gm=new Map(groups.map(g=>[g.id,g]));
 const rows=keys.filter(k=>(ksm.get(k.kid)?.clkCnt||0)>0).map(k=>{const s=ksm.get(k.kid),g=gm.get(k.gid);return{
  키워드:k.kw,캠페인:cm.get(g.cid)?.name||'',그룹:g.name,노출:s.impCnt,클릭:s.clkCnt,비용:s.salesAmt,
  CPC:Math.round(s.salesAmt/s.clkCnt),CTR:+(s.clkCnt/s.impCnt*100).toFixed(2),평균순위:s.avgRnk,
  입찰가:k.useGroupBid?g.bidAmt:k.bid,그룹입찰:k.useGroupBid?'Y':'',상태:k.off?'OFF':'ON',kid:k.kid};})
  .sort((a,b)=>b.비용-a.비용||b.클릭-a.클릭);
 save('clicked_keywords',rows);
 const kt=rows.reduce((s,x)=>({imp:s.imp+x.노출,clk:s.clk+x.클릭,cost:s.cost+x.비용}),{imp:0,clk:0,cost:0});
 console.log('\n=== 클릭 발생 키워드 '+rows.length+'개 ===');
 console.table(rows.map(({kid,...r})=>r));
 console.log('키워드 귀속: 클릭 '+kt.clk+'/'+T.clk+' 비용 '+kt.cost.toLocaleString()+'/'+T.cost.toLocaleString());
 console.log('미귀속(확장검색+플레이스): 클릭 '+(T.clk-kt.clk)+' 비용 '+(T.cost-kt.cost).toLocaleString());
 const csv=(n,a)=>{if(!a.length)return;const c=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'﻿'+[c,...a.map(r=>c.map(x=>r[x]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));};
 csv('어제_캠페인별_'+DATE.replace(/-/g,''),camp);csv('어제_클릭키워드_'+DATE.replace(/-/g,''),rows);
 save('summary',{date:DATE,total:T,keywordAttributed:kt,clickedKeywords:rows.length,hotGroups:hot.length,adgroups:groups.length});
})().catch(e=>{console.error('ERR',String(e));process.exitCode=1;});
