const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(m,p,b){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:m,path:p,body:b||null}),signal:AbortSignal.timeout(50000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+String(d.error||'').slice(0,90));return d.response;}catch(e){if(a===3){console.error('skip',p.slice(0,50));return null;}await new Promise(s=>setTimeout(s,2000));}}}
const enc=x=>encodeURIComponent(JSON.stringify(x));
const F='../reports/sojam-20260909/_core_measured.json';
(async()=>{
const S=JSON.parse(fs.readFileSync('../reports/sojam-20260909/_core_set.json','utf8'));
const st=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{today:{},kw:{},grp:{}};
const D=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const at=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date());
let ids=[];const owner={};
for(const [t,d] of Object.entries(S))for(const id of d.on){ids.push(id);owner[id]=t;}
const todo=ids.filter(i=>!st.today[i]);
console.error('ids',ids.length,'todo',todo.length,D,at);
for(let i=0;i<todo.length;i+=40){
  const r=await api('GET','/stats?ids='+encodeURIComponent(todo.slice(i,i+40).join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:D,until:D}));
  if(r&&r.data)for(const x of r.data)st.today[x.id]=x;
  for(const id of todo.slice(i,i+40))if(!st.today[id])st.today[id]={id,impCnt:0,clkCnt:0,salesAmt:0,avgRnk:0};
  fs.writeFileSync(F,JSON.stringify(st));
  if(i%400===0)console.error(' stats',i+40,'/',todo.length);
  await new Promise(s=>setTimeout(s,250));
}
// 라이브 입찰: 그룹 단위
const B=JSON.parse(fs.readFileSync('../reports/sojam-20260909/reset-150k/before.json','utf8'));
const KM={};
for(const line of fs.readFileSync('../reports/sojam-20260909/full/keywords.tsv','utf8').split('\n')){
  const r=line.split('\t'); if(r.length<13)continue; KM[r[2]]=r[1];
}
const gids=[...new Set(ids.map(i=>(B.keywords[i]||{}).nccAdgroupId||KM[i]).filter(Boolean))].filter(g=>!st.grp[g]);
console.error('groups todo',gids.length);
let n=0;
for(const g of gids){
  const ks=await api('GET','/ncc/keywords?nccAdgroupId='+g);
  const gg=await api('GET','/ncc/adgroups/'+g);
  if(gg)st.grp[g]={name:gg.name,bid:gg.bidAmt,mw:gg.mobileNetworkBidWeight,pw:gg.pcNetworkBidWeight,status:gg.status,camp:gg.nccCampaignId};
  if(Array.isArray(ks))for(const k of ks)if(owner[k.nccKeywordId])st.kw[k.nccKeywordId]={bid:k.useGroupBidAmt?(gg&&gg.bidAmt):k.bidAmt,ugb:!!k.useGroupBidAmt,lock:k.userLock,status:k.status,gid:g};
  if(++n%25===0){fs.writeFileSync(F,JSON.stringify(st));console.error(' grp',n,'/',gids.length);}
  await new Promise(s=>setTimeout(s,200));
}
st.meta={date:D,at,ids:ids.length};st.owner=owner;
fs.writeFileSync(F,JSON.stringify(st));
console.log('OK today',Object.keys(st.today).length,'kwlive',Object.keys(st.kw).length,'grp',Object.keys(st.grp).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
