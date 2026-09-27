// 동의 축 강화 적용 — 인상만, 20개씩, 적용 직전 재조회로 계획 이후 변동분은 건너뛴다. 롤백 before.json.
// 사용: node _sojam_20260915_apply.js apply | verify | rollback
const fs=require('fs'),path=require('path');
const CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260915/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(m,p,b){
 for(let a=0;a<3;a++){
  try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(60000)});
   const d=await r.json(); if(!r.ok||!d.success) throw Error('rej '+String(d.error||'').slice(0,200)); return d.response;}
  catch(e){ if(a===2||m!=='GET') throw e; await sleep(2500);} }
}
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const save=(n,o)=>fs.writeFileSync(D+n,JSON.stringify(o,null,1));

async function apply(){
 const {acts}=J('actions.json');
 const st=fs.existsSync(D+'apply_result.json')?J('apply_result.json'):{ok:[],skip:[],fail:[]};
 const done=new Set([...st.ok,...st.skip].map(x=>x.id));
 const before=fs.existsSync(D+'before.json')?J('before.json'):{};
 const todo=acts.filter(a=>!done.has(a.id));
 console.error('적용 대상',todo.length);
 for(let i=0;i<todo.length;i+=20){
  const part=todo.slice(i,i+20);
  const fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.map(a=>a.id).join(',')));
  const body=[];
  for(const a of part){
   const k=(fresh||[]).find(x=>x.nccKeywordId===a.id);
   if(!k){st.skip.push({id:a.id,k:a.k,why:'조회 안 됨'});continue;}
   if(k.userLock){st.skip.push({id:a.id,k:a.k,why:'꺼진 키워드'});continue;}
   const curOwn=k.useGroupBidAmt?null:k.bidAmt;
   if(curOwn!==null&&curOwn!==a.fromBid){st.skip.push({id:a.id,k:a.k,why:'계획 이후 입찰 변동 '+curOwn+'≠'+a.fromBid});continue;}
   if(a.bidAmt<=(k.useGroupBidAmt?0:k.bidAmt)){st.skip.push({id:a.id,k:a.k,why:'이미 목표 이상'});continue;}
   if(!before[a.id]) before[a.id]={bidAmt:k.bidAmt,useGroupBidAmt:k.useGroupBidAmt,keyword:k.keyword};
   body.push({...k,bidAmt:a.bidAmt,useGroupBidAmt:false});
  }
  save('before.json',before);
  if(body.length){
   try{
    await api('PUT','/ncc/keywords?fields=bidAmt',body);
    const after=await api('GET','/ncc/keywords?ids='+encodeURIComponent(body.map(b=>b.nccKeywordId).join(',')));
    for(const b of body){const k=(after||[]).find(x=>x.nccKeywordId===b.nccKeywordId);const a=part.find(p=>p.id===b.nccKeywordId);
     (k&&k.bidAmt===a.bidAmt&&!k.useGroupBidAmt?st.ok:st.fail).push({id:a.id,k:a.k,axis:a.axis,to:a.bidAmt,got:k&&k.bidAmt});}
   }catch(e){for(const b of body) st.fail.push({id:b.nccKeywordId,k:b.keyword,err:String(e).slice(0,200)});}
  }
  save('apply_result.json',st);
  console.error('  적용',st.ok.length,'실패',st.fail.length,'건너뜀',st.skip.length);
  await sleep(900);
 }
 console.log(JSON.stringify({적용:st.ok.length,실패:st.fail.length,건너뜀:st.skip.length}));
}
async function verify(){
 const {acts}=J('actions.json');
 const ids=acts.map(a=>a.id);
 let mismatch=0;
 for(let i=0;i<ids.length;i+=20){
  const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(ids.slice(i,i+20).join(',')));
  for(const k of (Array.isArray(r)?r:[])){const a=acts.find(x=>x.id===k.nccKeywordId);
   if(!a)continue;
   if(k.bidAmt!==a.bidAmt||k.useGroupBidAmt){mismatch++;console.log(' 불일치',a.k,k.bidAmt,'≠',a.bidAmt,k.useGroupBidAmt?'(그룹입찰)':'');}}
  await sleep(250);
 }
 console.log('검증 완료 — 불일치',mismatch,'/',acts.length);
}
async function rollback(){
 const before=J('before.json');
 const ids=Object.keys(before);
 for(let i=0;i<ids.length;i+=20){
  const part=ids.slice(i,i+20);
  const fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.join(',')));
  const body=(fresh||[]).map(k=>({...k,bidAmt:before[k.nccKeywordId].bidAmt,useGroupBidAmt:before[k.nccKeywordId].useGroupBidAmt}));
  if(body.length) await api('PUT','/ncc/keywords?fields=bidAmt',body);
  console.error('  롤백',i+body.length,'/',ids.length);
  await sleep(900);
 }
 console.log('롤백 완료',ids.length);
}
const m=process.argv[2];
(m==='apply'?apply():m==='verify'?verify():m==='rollback'?rollback():Promise.resolve(console.log('apply|verify|rollback'))).catch(e=>{console.error(e.stack);process.exitCode=1;});
