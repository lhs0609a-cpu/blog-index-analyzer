const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const BASE='https://blog-index-analyzer.fly.dev',CID='1858907';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function raw(p,tries=4){for(let t=0;t<tries;t++){try{
 const r=await fetch(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=${CID}`,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({path:p,method:'GET',body:null,customer_id:CID}),
  signal:AbortSignal.timeout(120000)});
 if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(t+1));}return null;}
const won=n=>(n||0).toLocaleString('ko-KR');
const body=a=>{const d=a.ad||{};const b=d.basic||d;
 return {h:b.headline||'',desc:b.description||'',med:b.medicalNo||'',url:(b.pc&&b.pc.final)||'',tags:(b.tags||[]).join('/')};};
const rows=JSON.parse(fs.readFileSync(P('_sojam_e0831_steroid.json'),'utf8'));
const byG={};for(const r of rows)(byG[r.gid]||=[]).push(r);
const top=Object.entries(byG).sort((a,b)=>b[1].length-a[1].length).slice(0,8);
(async()=>{
 const camps=(await raw('/ncc/campaigns'))||[];
 const cb={};for(const c of camps)cb[c.name]={b:c.useDailyBudget?c.dailyBudget:null,lock:!!c.userLock};
 for(const [g,ks] of top){
  const a=(await raw(`/ncc/ads?nccAdgroupId=${g}`))||[];
  const c=cb[ks[0].camp]||{};
  console.log(`\n■ ${ks[0].camp} (일예산 ${c.b===null?'무제한':won(c.b)+'원'}) · 스테로이드 키워드 ${ks.length}개`);
  for(const ad of a.filter(x=>!x.delFlag)){
   const v=body(ad);
   console.log(`   [${ad.status}/${ad.inspectStatus}] ${ad.type}  심의 ${v.med||'없음'}`);
   console.log(`      ${v.h}`);
   console.log(`      ${v.desc}`);
   if(v.tags)console.log(`      태그: ${v.tags}`);
  }
 }
})();
