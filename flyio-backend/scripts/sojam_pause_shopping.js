// Bounded user-authorized pause only. No bid/budget changes or reactivation.
const fs=require('fs'),path=require('path');
const OUT=path.resolve(__dirname,'../../reports/sojam-20260908/execution');
const CID='1858907',BASE='https://blog-index-analyzer.fly.dev';
const save=(n,d)=>fs.writeFileSync(path.join(OUT,n+'.json'),JSON.stringify(d,null,2));
async function raw(p,method='GET',body=null){
 await new Promise(r=>setTimeout(r,350));
 const r=await fetch(BASE+'/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method,body,customer_id:CID}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error('API '+r.status);return d.response;
}
(async()=>{
 if(!process.argv.includes('--apply'))throw Error('--apply required');
 if(fs.existsSync(path.join(OUT,'shopping_pause_result.json')))throw Error('Result exists; inspect before rerun');
 const rows=JSON.parse(fs.readFileSync(path.join(OUT,'shopping_pause_candidates.json')));
 if(rows.length!==72||new Set(rows.map(r=>r.keyword_id)).size!==72)throw Error('Scope mismatch');
 const gs=[...new Set(rows.map(r=>r.group_id))],snapshot=[];
 for(const gid of gs){
   const g=await raw('/ncc/adgroups/'+gid);
   if(g.customerId!=CID||g.userLock||g.status!=='ELIGIBLE')throw Error('Group changed');
   const ks=await raw('/ncc/keywords?nccAdgroupId='+gid);
   for(const r of rows.filter(r=>r.group_id===gid)){
     const k=ks.find(k=>k.nccKeywordId===r.keyword_id);
     if(!k||k.customerId!=CID||k.keyword!==r.keyword||k.nccAdgroupId!==gid||k.userLock||k.editTm!==r.editTm)throw Error('Preflight mismatch '+r.keyword_id);
     snapshot.push(k);
   }
 }
 save('shopping_pause_before',{at:new Date().toISOString(),customerId:CID,keywords:snapshot});
 let writeError=null;
 try{for(let i=0;i<snapshot.length;i+=50){
   await raw('/ncc/keywords?fields=userLock','PUT',snapshot.slice(i,i+50).map(k=>({...k,userLock:true})));
 }}catch(e){writeError=e.message;}
 const verified=[];
 for(const gid of gs){
   const ks=await raw('/ncc/keywords?nccAdgroupId='+gid);
   for(const b of snapshot.filter(k=>k.nccAdgroupId===gid)){
     const a=ks.find(k=>k.nccKeywordId===b.nccKeywordId);
     verified.push({id:b.nccKeywordId,keyword:b.keyword,before:b.userLock,after:a?.userLock,status:a?.status,bidUnchanged:a?.bidAmt===b.bidAmt&&a?.useGroupBidAmt===b.useGroupBidAmt,editTm:a?.editTm});
   }
 }
 const result={at:new Date().toISOString(),customerId:CID,requested:72,paused:verified.filter(r=>r.after===true).length,writeError,verified};
 save('shopping_pause_result',result);console.log(JSON.stringify({requested:72,paused:result.paused,writeError,bidsUnchanged:verified.every(r=>r.bidUnchanged)}));
 if(result.paused!==72||!verified.every(r=>r.bidUnchanged))process.exitCode=2;
})().catch(e=>{console.error(e.message);process.exitCode=1});
