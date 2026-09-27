const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m,p,b){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:m,path:p,body:b||null}),signal:AbortSignal.timeout(50000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+String(d.error||'').slice(0,120));return d.response;}catch(e){if(a===3){console.error('skip',p.slice(0,60));return null;}await new Promise(s=>setTimeout(s,2000));}}}
const F='../reports/sojam-20260910/_group_inventory.json';
(async()=>{
const st=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{groups:{},doneCamps:[]};
const doneC=new Set(st.doneCamps);
const camps=await api('GET','/ncc/campaigns?recordSize=1000');
const prev=JSON.parse(fs.readFileSync('../reports/sojam-20260909/yesterday_campaign_stats.json','utf8'));
const active=new Set(prev.byCampaign.map(c=>c.id));
const targets=camps.filter(c=>c.campaignTp==='WEB_SITE'&&c.status==='ELIGIBLE'&&(active.has(c.nccCampaignId)||/핵심_강남피부|^파워링크/.test(c.name)));
console.error('대상 캠페인',targets.length);
for(const c of targets){
  if(doneC.has(c.nccCampaignId))continue;
  const gs=await api('GET','/ncc/adgroups?nccCampaignId='+c.nccCampaignId+'&recordSize=1000');
  if(Array.isArray(gs)){
    for(const g of gs){
      if(st.groups[g.nccAdgroupId])continue;
      if(g.status!=='ELIGIBLE')continue;
      const ads=await api('GET','/ncc/ads?nccAdgroupId='+g.nccAdgroupId);
      const arr=Array.isArray(ads)?ads:[];
      st.groups[g.nccAdgroupId]={gid:g.nccAdgroupId,name:g.name,camp:c.name,cid:c.nccCampaignId,
        bid:g.bidAmt,mw:g.mobileNetworkBidWeight,pw:g.pcNetworkBidWeight,
        ads:arr.length,adsOk:arr.filter(a=>!a.userLock&&a.inspectStatus==='APPROVED').length,
        kwPlus:g.useKeywordPlus,target:(g.targetSummary||{}).pcMobile};
      await new Promise(s=>setTimeout(s,120));
    }
  }
  st.doneCamps.push(c.nccCampaignId);
  fs.writeFileSync(F,JSON.stringify(st));
  console.error(' done',c.name,'총그룹',Object.keys(st.groups).length);
}
const good=Object.values(st.groups).filter(g=>g.adsOk>0);
console.log('DONE 소재승인 ELIGIBLE 그룹',good.length,'/ 조회',Object.keys(st.groups).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
