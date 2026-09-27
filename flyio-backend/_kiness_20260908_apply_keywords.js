const fs=require('fs');const {req}=require('./_sojam_naver');const P=n=>'_kiness_20260908_'+n+'.json';
const plan=JSON.parse(fs.readFileSync(P('plan'))),st=fs.existsSync(P('keywords_applied'))?JSON.parse(fs.readFileSync(P('keywords_applied'))):{bids:[],locks:[],created:[],errors:[]};
const save=()=>fs.writeFileSync(P('keywords_applied'),JSON.stringify(st));
const call=(m,p,b)=>req(m,p,b,441986,1);
function check(r,n){if(!Array.isArray(r)||r.length!==n||r.some(x=>!x.nccKeywordId||x.code||x.error))throw Error('Unexpected keyword response '+JSON.stringify(r).slice(0,600));}
(async()=>{
 const budget=JSON.parse(fs.readFileSync(P('budget_applied')));if(!budget.otherShared||budget.error)throw Error('Budget setup must complete first');
 const changes=[...plan.changes].sort((a,b)=>(a.newBid-a.oldBid)-(b.newBid-b.oldBid));
 for(let i=0;i<changes.length;i+=100){if(st.bids.includes(i))continue;const chunk=changes.slice(i,i+100);
  const r=await call('PUT','/ncc/keywords?fields=bidAmt',chunk.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,bidAmt:x.newBid,useGroupBidAmt:false})));check(r,chunk.length);st.bids.push(i);save();if(i%5000===0)console.log('bids',i,'/',changes.length);
 }
 const locks=changes.filter(x=>x.newLock!==x.oldLock);
 for(let i=0;i<locks.length;i+=100){if(st.locks.includes(i))continue;const chunk=locks.slice(i,i+100);
  const r=await call('PUT','/ncc/keywords?fields=userLock',chunk.map(x=>({nccKeywordId:x.id,nccAdgroupId:x.gid,userLock:x.newLock})));check(r,chunk.length);st.locks.push(i);save();if(i%3000===0)console.log('locks',i,'/',locks.length);
 }
 const byGroup={};plan.creates.forEach(x=>(byGroup[x.gid]||=[]).push(x));
 for(const [gid,items] of Object.entries(byGroup)){
  const existing=await call('GET','/ncc/keywords?nccAdgroupId='+gid);const map=new Map(existing.map(k=>[k.keyword,k]));
  const todo=items.filter(x=>!map.has(x.kw));
  for(let i=0;i<todo.length;i+=100){const chunk=todo.slice(i,i+100);
   const r=await call('POST','/ncc/keywords?nccAdgroupId='+gid,chunk.map(x=>({keyword:x.kw,bidAmt:x.bid,useGroupBidAmt:false,userLock:false})));check(r,chunk.length);
   st.created.push(...r.map(x=>({id:x.nccKeywordId,gid,kw:x.keyword,status:x.status,inspect:x.inspectStatus,bid:x.bidAmt})));save();
  }console.log('created group',gid,todo.length,'total',st.created.length);
 }
 st.complete=true;save();console.log('COMPLETE',changes.length,'bids',locks.length,'locks',st.created.length,'created');
})().catch(e=>{st.errors.push({time:new Date().toISOString(),error:String(e)});save();console.error(e);process.exitCode=1});
