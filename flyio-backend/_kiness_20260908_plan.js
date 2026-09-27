const fs=require('fs');const {classify,branches}=require('./_kiness_20260908_discover');const P=n=>'_kiness_20260908_'+n+'.json';
const read=n=>JSON.parse(fs.readFileSync(P(n)));const I=read('inventory'),G=read('groups'),C=read('campaigns'),V=read('volumes').data,E=read('estimates').data,S=read('kwstats').data;
const gm=new Map(G.map(g=>[g.nccAdgroupId,g])),cm=new Map(C.map(c=>[c.nccCampaignId,c])),im=new Map(I.map(x=>[x.gid,x]));
const sm=new Map(S.map(s=>[s.id,s])),bykw=new Map();
const round=v=>Math.max(70,Math.min(100000,Math.ceil(v/10)*10));
const goodAd=a=>!a.userLock&&a.inspectStatus==='APPROVED'&&a.enable!==false&&a.ad?.pc?.final&&!a.ad.pc.final.includes('/renew/')&&/kiness.co.kr/.test(a.ad.pc.final);
const valid=g=>g.adgroupType==='WEB_SITE'&&!g.userLock&&!cm.get(g.nccCampaignId).userLock&&(im.get(g.nccAdgroupId)?.ads.some(goodAd));
for(const x of I)for(const k of x.keywords){if(!bykw.has(k.keyword))bykw.set(k.keyword,[]);bykw.get(k.keyword).push(k);}
function bid(kw,g){const a=classify(kw),e=E[kw]||{};let value;
 if(a.tier==='region_clinic')value=Math.max(300,(e.PC5||0)*1.05);
 else if(a.tier==='brand')value=Math.max(300,Math.min(1500,(e.PC3||e.PC5||300)*1.1));
 else if(a.tier==='clinic'||a.tier==='consult')value=Math.max(300,Math.min(5000,(e.PC3&&e.PC3<=3500?e.PC3:e.PC5||300)*1.05));
 else if(a.tier==='growth')value=Math.max(200,Math.min(2000,(e.PC5||200)*1.05));
 else if(a.tier==='adjacent')value=700;
 else value=70;
 return round(value*100/(g.pcNetworkBidWeight||100));
}
const owners=new Map(),changes=[],audit=[];
for(const [kw,ks] of bykw){
 const a=classify(kw);let choices=ks.filter(k=>valid(gm.get(k.nccAdgroupId))&&k.inspectStatus==='APPROVED'&&(!k.userLock||a.score>=75));
 choices.sort((ka,kb)=>{
  function score(k){const g=gm.get(k.nccAdgroupId),c=cm.get(g.nccCampaignId);return (a.branch&&c.name.includes(a.branch)?1000:0)+(g.name.includes('지역KW')&&a.tier==='region_clinic'?500:0)+(a.tier==='brand'&&c.name==='전국_브랜드KW'?1000:0)+(k.userLock?-100:0)+(sm.get(k.nccKeywordId)?.clkCnt||0)+(im.get(g.nccAdgroupId).ads.some(ad=>goodAd(ad)&&ad.ad.pc.final.includes('/html/online01'))?20:0);}
  return score(kb)-score(ka);
 });
 const owner=a.score>=40?choices[0]:null;if(owner)owners.set(kw,owner);
 for(const k of ks){const g=gm.get(k.nccAdgroupId),c=cm.get(g.nccCampaignId),eff=k.useGroupBidAmt?g.bidAmt:k.bidAmt;
  let to=eff,lock=k.userLock,reason='unchanged_inactive';
  if(owner===k){to=bid(kw,g);lock=false;reason=a.tier;}
  else if(g.adgroupType==='WEB_SITE'&&!g.userLock&&!c.userLock&&!k.userLock){to=70;reason=owner?'duplicate':'low_intent';if(owner||a.score===0)lock=true;}
  if(to!==eff||lock!==k.userLock||(owner===k&&k.useGroupBidAmt))changes.push({id:k.nccKeywordId,gid:g.nccAdgroupId,kw,oldBid:k.bidAmt,oldGroupBid:k.useGroupBidAmt,oldLock:k.userLock,newBid:to,newLock:lock,reason});
  audit.push({keyword:kw,id:k.nccKeywordId,campaign:c.name,group:g.name,tier:a.tier,intent_score:a.score,branch:a.branch||'',owner:owner===k,old_bid:eff,new_bid:to,new_lock:lock,pc5:E[kw]?.PC5??'',pc3:E[kw]?.PC3??'',pc_volume:V[kw]?.monthlyPcQcCnt??'',mobile_volume:V[kw]?.monthlyMobileQcCnt??'',clicks30:sm.get(k.nccKeywordId)?.clkCnt||0,cost30:sm.get(k.nccKeywordId)?.salesAmt||0,reason});
 }
}
const branchGroups={};for(const b of Object.keys(branches)){const g=G.find(g=>valid(g)&&g.name.includes('지역KW')&&cm.get(g.nccCampaignId).name.includes(b));if(g)branchGroups[b]=g.nccAdgroupId;}
const generic=G.filter(valid).find(g=>g.name==='[대표]전환K');if(!generic)throw Error('Missing generic group');
const discovery=read('discovery'),candidateSet=new Set([...discovery.generated.map(x=>x.kw),...Object.keys(V)]);
const counts=new Map(I.map(x=>[x.gid,x.keywords.length])),creates=[],blocked=[];
for(const kw of candidateSet){const a=classify(kw);if(bykw.has(kw)||a.score<75||!V[kw]||/상담상담|비용비용|추천추천/.test(kw))continue;
 let gid=a.branch?branchGroups[a.branch]:generic.nccAdgroupId;
 if(!gid){blocked.push({kw,reason:'no_approved_branch_group'});continue;}
 if((counts.get(gid)||0)>=990){blocked.push({kw,reason:'group_capacity'});continue;}
 const g=gm.get(gid);creates.push({kw,gid,bid:bid(kw,g),tier:a.tier,pc5:E[kw]?.PC5??null,pc_volume:V[kw].monthlyPcQcCnt,mobile_volume:V[kw].monthlyMobileQcCnt});counts.set(gid,(counts.get(gid)||0)+1);
}
for(const [kw,ks] of bykw){const a=classify(kw);if(a.tier!=='region_clinic'||owners.has(kw))continue;
 const gid=a.branch?branchGroups[a.branch]:generic.nccAdgroupId;
 if(!gid||(counts.get(gid)||0)>=990){blocked.push({kw,reason:'rehome_capacity'});continue;}
 creates.push({kw,gid,bid:bid(kw,gm.get(gid)),tier:a.tier,pc5:E[kw]?.PC5??null,pc_volume:V[kw]?.monthlyPcQcCnt??'unknown',mobile_volume:V[kw]?.monthlyMobileQcCnt??'unknown',rehome:true});counts.set(gid,(counts.get(gid)||0)+1);
}
const regionGroups=new Set([...owners].filter(([kw])=>classify(kw).tier==='region_clinic').map(([,k])=>k.nccAdgroupId));
creates.filter(x=>x.tier==='region_clinic').forEach(x=>regionGroups.add(x.gid));
const groupFix=G.filter(g=>valid(g)&&([...owners.values()].some(k=>k.nccAdgroupId===g.nccAdgroupId)||creates.some(x=>x.gid===g.nccAdgroupId))).map(g=>({gid:g.nccAdgroupId,disableDailyBudget:g.useDailyBudget,region:regionGroups.has(g.nccAdgroupId)}));
const plan={customerId:441986,createdAt:new Date().toISOString(),budget:{total:200000,searchShared:198000,contentEach:500,place:1000,deliveryMethod:'STANDARD',regionGroupShared:140000,otherGroupShared:58000},changes,creates,blocked,groups:groupFix,owners:Object.fromEntries([...owners].map(([kw,k])=>[kw,{id:k.nccKeywordId,gid:k.nccAdgroupId}])),counts:{campaigns:C.length,groups:G.length,instances:audit.length,unique:bykw.size,owners:owners.size,changes:changes.length,creates:creates.length,regionGroups:regionGroups.size,regionKeywords:[...bykw.keys()].filter(k=>classify(k).tier==='region_clinic').length}};
fs.writeFileSync(P('plan'),JSON.stringify(plan));
const csv=(rows)=>{const fields=Object.keys(rows[0]);return '\ufeff'+fields.join(',')+'\n'+rows.map(r=>fields.map(f=>'"'+String(r[f]??'').replace(/"/g,'""')+'"').join(',')).join('\n');};
fs.writeFileSync('_kiness_20260908_full_analysis.csv',csv(audit));fs.writeFileSync('_kiness_20260908_new_keywords.csv',csv(creates));
console.log(JSON.stringify({counts:plan.counts,blocked:blocked.length,groups:groupFix.length,maxBid:Math.max(...changes.map(x=>x.newBid)),byReason:changes.reduce((a,x)=>(a[x.reason]=(a[x.reason]||0)+1,a),{})}));
