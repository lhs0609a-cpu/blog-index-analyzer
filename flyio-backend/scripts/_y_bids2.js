const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(method,p,body){for(let a=0;a<5;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method,path:p,body:body||null}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+r.status+' '+String(d.error||'').slice(0,120));return d.response;}catch(e){if(a===4){console.error('  skip',p.slice(0,60),e.message);return null;}await new Promise(s=>setTimeout(s,1500));}}}
const F='../../reports/sojam-20260909/_fresh_state.json';
(async()=>{
const A=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_bucketA.json','utf8'));
const IDS=JSON.parse(fs.readFileSync('../../reports/sojam-20260909/_bytext_ids.json','utf8'));
const CORE0=['아토피진료','가려움증치료','온몸가려움증','전신가려움증','습진병원','피부염치료','지루성피부염병원','한포진병원','피부묘기증병원','아토피병원','습진한의원','한포진한의원','아토피치료한의원','지루성피부염한의원','아토피증상','한포진치료','한포진원인','접촉성피부염치료','피부묘기증치료','화폐상습진','손습진','발습진','습진원인','피부소양증','소양증','가려움증','몸가려움증','피부가려움증','피부가려움증원인','지루성피부염','지루성피부염치료','지루성두피염','피부묘기증','모낭염','두피모낭염','습진치료','주부습진','피부발진','피부염'];
const texts=[...new Set([...A.map(r=>r.kw),...CORE0])];
const st=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{kws:{},groups:{},est:{}};
let ids=[];const owner={};
for(const t of texts){for(const id of (IDS[t]||{}).on||[]){ids.push(id);owner[id]=t;}}
ids=ids.filter(i=>!st.kws[i]);
console.error('texts',texts.length,'ids to fetch',ids.length);
for(let i=0;i<ids.length;i+=20){
  const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(ids.slice(i,i+20).join(',')));
  if(Array.isArray(r))for(const k of r)st.kws[k.nccKeywordId]=k;
  fs.writeFileSync(F,JSON.stringify(st));
  if(i%100===0)console.error(' kw',i+20,'/',ids.length);
}
const gids=[...new Set(Object.values(st.kws).map(k=>k.nccAdgroupId))].filter(g=>!st.groups[g]);
console.error('groups to fetch',gids.length);
for(let i=0;i<gids.length;i+=20){
  const r=await api('GET','/ncc/adgroups?ids='+encodeURIComponent(gids.slice(i,i+20).join(',')));
  if(Array.isArray(r))for(const g of r)st.groups[g.nccAdgroupId]=g;
  fs.writeFileSync(F,JSON.stringify(st));
}
for(const device of ['MOBILE','PC']){
 for(const pos of [1,2,3]){
  for(let i=0;i<texts.length;i+=50){
    const chunk=texts.slice(i,i+50);
    if(chunk.every(k=>st.est[device+'|'+pos+'|'+k]!==undefined))continue;
    const r=await api('POST','/estimate/average-position-bid/keyword',{device,items:chunk.map(k=>({key:k,position:pos}))});
    for(const e of (r&&r.estimate)||[])st.est[device+'|'+pos+'|'+e.keyword]=e.bid;
    fs.writeFileSync(F,JSON.stringify(st));
  }
  console.error('est',device,pos);
 }
}
st.owner=owner;fs.writeFileSync(F,JSON.stringify(st));
console.log('OK kws',Object.keys(st.kws).length,'groups',Object.keys(st.groups).length,'est',Object.keys(st.est).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
