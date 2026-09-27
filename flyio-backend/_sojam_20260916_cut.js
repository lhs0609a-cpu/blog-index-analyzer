// 무좀·백선 / 콜린성두드러기 / 검사·진단 축을 70원으로 내린다 (사용자 지시 2026-09-16).
// 중간 입찰은 의미가 없다 — 계정 실측 CTR 이 4위 0.06% / 5위 0.02% 라 '3위 아니면 70원' 이다([[sojam-ad-budget]]).
// 사용: node _sojam_20260916_cut.js plan | apply | verify | rollback
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260916/');
fs.mkdirSync(D,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(m,p,b){for(let t=0;t<3;t++){try{
 const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(60000)});
 const d=await r.json(); if(!r.ok||!d.success) throw Error('rej '+String(d.error||'').slice(0,200)); return d.response;}
 catch(e){if(t===2||m!=='GET')throw e;await sleep(2000);}}}
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260916_cut_targets.json'),'utf8'));
const allIds=[...new Set(Object.values(T).flatMap(t=>t.ids))];
const J=n=>JSON.parse(fs.readFileSync(D+n,'utf8'));
const save=(n,o)=>fs.writeFileSync(D+n,JSON.stringify(o,null,1));

async function plan(){
 const kw={},grp={};
 for(const b of chunk(allIds,20)){
  const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(b.join(',')));
  for(const k of (Array.isArray(r)?r:[])) kw[k.nccKeywordId]={k:k.keyword,gid:k.nccAdgroupId,bid:k.bidAmt,useGrp:!!k.useGroupBidAmt,lock:!!k.userLock,st:k.status};
  await sleep(200);
 }
 for(const g of [...new Set(Object.values(kw).map(x=>x.gid).filter(Boolean))]){
  const r=await api('GET','/ncc/adgroups/'+g);
  if(r) grp[g]={name:r.name,bid:r.bidAmt,mw:r.mobileChannelWeight??r.mobileNetworkBidWeight??100,lock:!!r.userLock,st:r.status};
  await sleep(150);
 }
 // 최근 7일 소진
 const st={};
 for(const b of chunk(allIds,40)){
  const r=await api('GET','/stats?ids='+encodeURIComponent(b.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt'])+'&timeRange='+enc({since:'2026-09-09',until:'2026-09-15'}));
  for(const x of ((r&&r.data)||[])) st[x.id]={imp:+x.impCnt||0,clk:+x.clkCnt||0,cost:+x.salesAmt||0};
  await sleep(200);
 }
 const acts=[],skip=[];
 for(const [text,t] of Object.entries(T)) for(const id of t.ids){
  const m=kw[id]; if(!m){skip.push({id,k:text,why:'조회 안 됨'});continue;}
  const g=grp[m.gid]||{};
  const eff=Math.round((m.useGrp?(g.bid||0):(m.bid||0))*(g.mw??100)/100);
  const own=m.useGrp?null:m.bid;
  const s=st[id]||{imp:0,clk:0,cost:0};
  if(!m.useGrp && m.bid<=70){skip.push({id,k:text,why:'이미 70원'});continue;}
  acts.push({id,k:text,cls:t.cls,gid:m.gid,grp:g.name,curOwn:own,useGrp:m.useGrp,eff,to:70,lock:m.lock,st:m.st,...s});
 }
 save('cut_plan.json',{acts,skip});
 const won=n=>Math.round(n||0).toLocaleString('ko-KR');
 const by={};for(const a of acts){const x=by[a.cls]=by[a.cls]||{n:0,cost:0,clk:0,imp:0};x.n++;x.cost+=a.cost;x.clk+=a.clk;x.imp+=a.imp;}
 console.log('인하 대상',acts.length,'| 이미 70원 등 제외',skip.length);
 for(const [k,v] of Object.entries(by)) console.log('  '+k+': '+v.n+'개 · 7일 소진 '+won(v.cost)+'원 · 클릭 '+v.clk+' · 노출 '+won(v.imp));
 console.log('7일 소진 합계',won(acts.reduce((a,x)=>a+x.cost,0)),'원 (일평균',won(acts.reduce((a,x)=>a+x.cost,0)/7)+'원)');
}
async function apply(){
 const {acts}=J('cut_plan.json');
 const st=fs.existsSync(D+'cut_result.json')?J('cut_result.json'):{ok:[],skip:[],fail:[]};
 const done=new Set([...st.ok,...st.skip].map(x=>x.id));
 const before=fs.existsSync(D+'cut_before.json')?J('cut_before.json'):{};
 const todo=acts.filter(a=>!done.has(a.id));
 console.error('적용 대상',todo.length);
 for(const part of chunk(todo,20)){
  const fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.map(a=>a.id).join(',')));
  const body=[];
  for(const a of part){
   const k=(fresh||[]).find(x=>x.nccKeywordId===a.id);
   if(!k){st.skip.push({id:a.id,k:a.k,why:'조회 안 됨'});continue;}
   if(!k.useGroupBidAmt&&k.bidAmt<=70){st.skip.push({id:a.id,k:a.k,why:'이미 70원'});continue;}
   if(!before[a.id]) before[a.id]={bidAmt:k.bidAmt,useGroupBidAmt:k.useGroupBidAmt,keyword:k.keyword};
   body.push({...k,bidAmt:70,useGroupBidAmt:false});
  }
  save('cut_before.json',before);
  if(body.length){
   try{
    await api('PUT','/ncc/keywords?fields=bidAmt',body);
    const after=await api('GET','/ncc/keywords?ids='+encodeURIComponent(body.map(b=>b.nccKeywordId).join(',')));
    for(const b of body){const k=(after||[]).find(x=>x.nccKeywordId===b.nccKeywordId);const a=part.find(p=>p.id===b.nccKeywordId);
     (k&&k.bidAmt===70&&!k.useGroupBidAmt?st.ok:st.fail).push({id:a.id,k:a.k,cls:a.cls,got:k&&k.bidAmt});}
   }catch(e){for(const b of body) st.fail.push({id:b.nccKeywordId,k:b.keyword,err:String(e).slice(0,200)});}
  }
  save('cut_result.json',st);
  console.error('  인하',st.ok.length,'실패',st.fail.length,'건너뜀',st.skip.length);
  await sleep(900);
 }
 console.log(JSON.stringify({인하:st.ok.length,실패:st.fail.length,건너뜀:st.skip.length}));
}
async function verify(){
 const {acts}=J('cut_plan.json');
 let bad=0;
 for(const b of chunk(acts.map(a=>a.id),20)){
  const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(b.join(',')));
  for(const k of (Array.isArray(r)?r:[])) if(k.bidAmt!==70||k.useGroupBidAmt){bad++;console.log(' 불일치',k.keyword,k.bidAmt,k.useGroupBidAmt?'(그룹입찰)':'');}
  await sleep(200);
 }
 console.log('검증 — 불일치',bad,'/',acts.length);
}
async function rollback(){
 const before=J('cut_before.json');
 const ids=Object.keys(before);
 for(const part of chunk(ids,20)){
  const fresh=await api('GET','/ncc/keywords?ids='+encodeURIComponent(part.join(',')));
  const body=(fresh||[]).map(k=>({...k,bidAmt:before[k.nccKeywordId].bidAmt,useGroupBidAmt:before[k.nccKeywordId].useGroupBidAmt}));
  if(body.length) await api('PUT','/ncc/keywords?fields=bidAmt',body);
  await sleep(900);
 }
 console.log('롤백 완료',ids.length);
}
const m=process.argv[2];
({plan,apply,verify,rollback}[m]||(()=>Promise.resolve(console.log('plan|apply|verify|rollback'))))().catch(e=>{console.error(e.stack);process.exitCode=1;});
