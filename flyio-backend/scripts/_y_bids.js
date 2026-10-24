const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(method,p,body){for(let a=0;a<4;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method,path:p,body:body||null}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+r.status+' '+(d.error||''));return d.response;}catch(e){if(a===3)throw e;await new Promise(s=>setTimeout(s,1500));}}}
(async()=>{
const A=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_bucketA.json','utf8'));
const IDS=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_bytext_ids.json','utf8'));
const CORE0=['아토피진료','가려움증치료','온몸가려움증','밤에가려움증','전신가려움증','습진병원','피부염치료','지루성피부염병원','한포진병원','피부묘기증병원','아토피병원','습진한의원','한포진한의원','아토피치료한의원','지루성피부염한의원','아토피증상','한포진치료','한포진원인','접촉성피부염치료','피부묘기증치료','화폐상습진','손습진','발습진','습진원인','피부소양증','소양증','가려움증','몸가려움증'];
const texts=[...new Set([...A.map(r=>r.kw),...CORE0])];
let ids=[];const owner={};
for(const t of texts){for(const id of (IDS[t]||{}).on||[]){ids.push(id);owner[id]=t;}}
console.error('texts',texts.length,'ids',ids.length);
const kws=[];
for(let i=0;i<ids.length;i+=100){
  const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(ids.slice(i,i+100).join(',')));
  if(Array.isArray(r))kws.push(...r);
}
console.error('fetched keywords',kws.length);
const gids=[...new Set(kws.map(k=>k.nccAdgroupId))];
const groups={};
for(let i=0;i<gids.length;i+=100){
  const r=await api('GET','/ncc/adgroups?ids='+encodeURIComponent(gids.slice(i,i+100).join(',')));
  if(Array.isArray(r))for(const g of r)groups[g.nccAdgroupId]=g;
}
console.error('groups',Object.keys(groups).length);
fs.writeFileSync('../../reports/sojam-20260909/_fresh_keywords.json',JSON.stringify({kws,groups,owner}));
// estimates
const est={};
for(const device of ['MOBILE','PC']){
 for(const pos of [1,2,3]){
  for(let i=0;i<texts.length;i+=100){
    const items=texts.slice(i,i+100).map(k=>({key:k,position:pos}));
    const r=await api('POST','/estimate/average-position-bid/keyword',{device,items});
    for(const e of (r&&r.estimate)||[])est[device+'|'+pos+'|'+e.keyword]=e.bid;
  }
 }
 for(let i=0;i<texts.length;i+=100){
   const r=await api('POST','/estimate/exposure-minimum-bid/keyword',{device,period:'MONTH',items:texts.slice(i,i+100).map(k=>({key:k}))});
   for(const e of (r&&r.estimate)||[])est[device+'|min|'+e.keyword]=e.bid;
 }
 console.error('estimates done',device);
}
fs.writeFileSync('../../reports/sojam-20260909/_estimates_pos.json',JSON.stringify(est));
console.log('OK texts',texts.length,'est',Object.keys(est).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
