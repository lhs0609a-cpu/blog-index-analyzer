// Account-scoped PC fifth-position and mobile third-position estimate refresh. Default is read-only.
const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');const {classify}=require('./_kiness_20260908_discover');
const {calculate}=require('./_kiness_mobile_bid_policy');
const P=n=>path.join(__dirname,'_kiness_20260908_'+n+'.json'),APPLY=process.argv.includes('--apply');
const logDir=path.join(__dirname,'kiness_monitor_logs');fs.mkdirSync(logDir,{recursive:true});
const call=(m,p,b)=>req(m,p,b,441986,m==='PUT'?1:4);
(async()=>{
 const verified=JSON.parse(fs.readFileSync(P('verified')));if(verified.errors.length)throw Error('Baseline verification failed');
 const plan=JSON.parse(fs.readFileSync(P('plan'))),override=path.join(__dirname,'_kiness_pc5_targets.json');
 const targets=fs.existsSync(override)?JSON.parse(fs.readFileSync(override)):Object.entries(plan.owners).filter(([kw])=>classify(kw).tier==='region_clinic').map(([kw,x])=>({kw,...x}));
 if(!fs.existsSync(override))targets.push(...verified.created.filter(x=>x.tier==='region_clinic').map(x=>({kw:x.kw,id:x.id,gid:x.gid})));
 const budgets=await call('GET','/ncc/shared-budgets');const accountBudget=budgets.find(x=>x.name==='키네스_문의확대_총검색예산_0908');if(!accountBudget||accountBudget.dailyBudget>450000)throw Error('Account budget guard differs; no changes made');
 const groups=await pool([...new Set(targets.map(x=>x.gid))],3,gid=>call('GET','/ncc/adgroups/'+gid));if(groups.some(x=>!x?.nccAdgroupId))throw Error('Incomplete groups: '+JSON.stringify(groups.filter(x=>!x?.nccAdgroupId).slice(0,3)));const gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
 const chunks=[];for(let i=0;i<targets.length;i+=100)chunks.push(targets.slice(i,i+100));
 const estimates=await pool(chunks,3,x=>call('POST','/estimate/average-position-bid/id',{device:'PC',items:x.map(k=>({key:k.id,position:5}))}));
 if(estimates.some(x=>!Array.isArray(x?.estimate)))throw Error('Incomplete PC estimates');const em=new Map(estimates.flatMap(x=>x.estimate).map(e=>[e.nccKeywordId,e.bid]));
 const mobileEstimates=await pool(chunks,3,x=>call('POST','/estimate/average-position-bid/id',{device:'MOBILE',items:x.map(k=>({key:k.id,position:3}))}));
 if(mobileEstimates.some(x=>!Array.isArray(x?.estimate)))throw Error('Incomplete mobile estimates');const mm=new Map(mobileEstimates.flatMap(x=>x.estimate).map(e=>[e.nccKeywordId,e.bid]));
 const byGroup=await pool([...gm.keys()],3,gid=>call('GET','/ncc/keywords?nccAdgroupId='+gid));if(byGroup.some(x=>!Array.isArray(x)))throw Error('Incomplete keywords');const km=new Map(byGroup.flat().map(k=>[k.nccKeywordId,k]));
 const changes=[],issues=[];for(const x of targets){const g=gm.get(x.gid),k=km.get(x.id),e=em.get(x.id),m=mm.get(x.id);if(!k||g.userLock||k.userLock||!e||!m){issues.push({...x,reason:'inactive_or_missing_estimate'});continue;}
  const calculated=calculate(e,m,g.pcNetworkBidWeight??100,g.mobileNetworkBidWeight??100);if(calculated.capped){issues.push({...x,reason:'bid_ceiling'});continue;}const to=calculated.bid;
  if((k.useGroupBidAmt?g.bidAmt:k.bidAmt)!==to)changes.push({...x,oldBid:k.bidAmt,oldGroupBid:k.useGroupBidAmt,bid:to,pc5:e,mobile3:m});
 }
 const campaigns=await call('GET','/ncc/campaigns'),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let daily={cost:0,clicks:0,trackedConversions:0};for(let i=0;i<campaigns.length;i+=50){const r=await call('GET','/stats?ids='+encodeURIComponent(campaigns.slice(i,i+50).map(c=>c.nccCampaignId).join(','))+'&fields='+encodeURIComponent(JSON.stringify(['salesAmt','clkCnt','ccnt']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:date,until:date})));if(!Array.isArray(r?.data))throw Error('Daily stats unavailable');for(const s of r.data){daily.cost+=s.salesAmt||0;daily.clicks+=s.clkCnt||0;daily.trackedConversions+=s.ccnt||0;}}
 const log={time:new Date().toISOString(),dateKST:date,daily,apply:APPLY,targets:targets.length,changes,issues,applied:0};const file=path.join(logDir,new Date().toISOString().replace(/[:.]/g,'-')+'.json');fs.writeFileSync(file,JSON.stringify(log));
 if(APPLY)for(let i=0;i<changes.length;i+=100){const c=changes.slice(i,i+100),r=await call('PUT','/ncc/keywords?fields=bidAmt',c.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:x.bid,useGroupBidAmt:false})));if(!Array.isArray(r)||r.length!==c.length||r.some(k=>!k.nccKeywordId||k.useGroupBidAmt!==false||c.find(x=>x.id===k.nccKeywordId)?.bid!==k.bidAmt))throw Error('Bid update incomplete; see log '+file);log.applied+=c.length;fs.writeFileSync(file,JSON.stringify(log));}
 console.log(JSON.stringify({targets:targets.length,changes:changes.length,issues:issues.length,applied:log.applied,file}));
})().catch(e=>{const file=path.join(logDir,'latest_error.json');fs.writeFileSync(file,JSON.stringify({time:new Date().toISOString(),error:String(e)}));console.error(e);process.exitCode=1});
