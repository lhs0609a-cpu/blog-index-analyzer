// Extend the geographical audit without changing the already-reviewed keyword owners.
const fs=require('fs');const {req}=require('./_sojam_naver');const {classify}=require('./_kiness_20260908_discover');const P=n=>'_kiness_20260908_'+n+'.json';
const call=(m,p,b)=>req(m,p,b,441986,m==='POST'?1:3);
(async()=>{
 const applied=JSON.parse(fs.readFileSync(P('keywords_applied')));if(!applied.complete)throw Error('Initial keyword application incomplete');
 const p=JSON.parse(fs.readFileSync(P('plan'))),inv=JSON.parse(fs.readFileSync(P('inventory'))),gs=JSON.parse(fs.readFileSync(P('groups'))),gm=new Map(gs.map(g=>[g.nccAdgroupId,g]));
 const e=JSON.parse(fs.readFileSync(P('estimates'))).data,km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k])),changes=new Map(p.changes.map(x=>[x.id,x]));
 const out={changes:[],created:[],errors:[]};
 const regional=Object.entries(p.owners).filter(([kw])=>classify(kw).tier==='region_clinic');
 for(const [kw,x] of regional){const g=gm.get(x.gid),to=Math.max(70,Math.min(100000,Math.ceil(Math.max(300,(e[kw]?.PC5||70)*1.05)*100/(g.pcNetworkBidWeight||100)/10)*10)),c=changes.get(x.id),old=km.get(x.id);
  if(!c||c.reason!=='region_clinic'||c.newBid!==to){const change=c||{id:x.id,gid:x.gid,kw,oldBid:old.bidAmt,oldGroupBid:old.useGroupBidAmt,oldLock:old.userLock,newLock:false};change.newBid=to;change.reason='region_clinic';changes.set(x.id,change);out.changes.push(change);}
  const group=p.groups.find(g=>g.gid===x.gid);if(group)group.region=true;
 }
 const generic=p.creates.find(x=>!classify(x.kw).branch)?.gid;if(!generic)throw Error('Missing generic destination');
 const current=await call('GET','/ncc/keywords?nccAdgroupId='+generic),seen=new Set(current.map(k=>k.keyword));
 for(const kw of new Set(inv.flatMap(x=>x.keywords.map(k=>k.keyword)))){if(classify(kw).tier!=='region_clinic'||p.owners[kw]||p.creates.some(x=>x.kw===kw))continue;
  if(current.length+out.created.length>=990)throw Error('Recovery group capacity');
  const g=gm.get(generic),bid=Math.max(70,Math.min(100000,Math.ceil(Math.max(300,(e[kw]?.PC5||70)*1.05)*100/(g.pcNetworkBidWeight||100)/10)*10));
  const item={kw,gid:generic,bid,tier:'region_clinic',pc5:e[kw]?.PC5||70,pc_volume:'unknown',mobile_volume:'unknown',rehome:true};p.creates.push(item);if(!seen.has(kw))out.created.push(item);
 }
 p.changes=[...changes.values()];p.counts.changes=p.changes.length;p.counts.creates=p.creates.length;p.counts.regionKeywords=new Set(inv.flatMap(x=>x.keywords.map(k=>k.keyword)).filter(k=>classify(k).tier==='region_clinic')).size;p.counts.regionGroups=p.groups.filter(g=>g.region).length;
 fs.writeFileSync(P('plan'),JSON.stringify(p));fs.writeFileSync(P('region_finish'),JSON.stringify(out));
 for(let i=0;i<out.changes.length;i+=100){const c=out.changes.slice(i,i+100),r=await call('PUT','/ncc/keywords?fields=bidAmt',c.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:x.newBid,useGroupBidAmt:false})));if(!Array.isArray(r)||r.length!==c.length)throw Error('Region bid correction incomplete');}
 for(let i=0;i<out.created.length;i+=100){const c=out.created.slice(i,i+100),r=await call('POST','/ncc/keywords?nccAdgroupId='+generic,c.map(x=>({keyword:x.kw,bidAmt:x.bid,useGroupBidAmt:false,userLock:false})));if(!Array.isArray(r)||r.length!==c.length)throw Error('Region recovery incomplete');}
 console.log('region corrections',out.changes.length,'extra recovery',out.created.length,'total regional',p.counts.regionKeywords);
})().catch(e=>{console.error(e);process.exitCode=1});
