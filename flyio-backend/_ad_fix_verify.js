const fs=require('fs');
const base='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(p){for(let a=0;a<3;a++){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:'1858907',method:'GET',path:p,body:null}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok||!d.success)return null;return d.response;}catch(e){if(a===2)return null;await new Promise(s=>setTimeout(s,3000));}}}
(async()=>{
const rec={};
for(const l of fs.readFileSync('../reports/sojam-20260910/_ad_fix.jsonl','utf8').split('\n')){if(!l.trim())continue;try{const d=JSON.parse(l);const p=rec[d.gid];if(!p||d.act==='added'||(p.act==='would_add'&&d.act!=='would_add'))rec[d.gid]=d;}catch(e){}}
const noad=JSON.parse(fs.readFileSync('../reports/sojam-20260910/_noad_final.json','utf8'));
const added=Object.values(rec).filter(r=>r.act==='added');
const failed=Object.values(rec).filter(r=>r.act==='add_failed');
const remaining=noad.filter(g=>!rec[g.gid]||rec[g.gid].act!=='added');
console.log('붙임',added.length,'| 실패',failed.length,'| 411 중 아직 소재 안 붙은 그룹',remaining.length);
for(const f of failed)console.log('  실패',f.gid,'→',String(f.err).slice(0,200));
// 검증: 붙인 그룹 전부 재조회
const st={};let i=0,cursor=0;const out=[];
await Promise.all(Array.from({length:3},async()=>{while(cursor<added.length){const r=added[cursor++];const ads=await api('/ncc/ads?nccAdgroupId='+r.gid);const arr=Array.isArray(ads)?ads:[];
  const mine=arr.find(a=>a.nccAdId===r.adId);const k=mine?(mine.inspectStatus+'/'+mine.status):(ads===null?'조회실패':'소재없음');st[k]=(st[k]||0)+1;out.push({gid:r.gid,adId:r.adId,state:k,n:arr.length});
  await new Promise(s=>setTimeout(s,80));}}));
console.log('재조회 검수/상태 분포',JSON.stringify(st));
fs.writeFileSync('../reports/sojam-20260910/_ad_fix_verify.json',JSON.stringify({added:added.length,failed,remaining,verify:out},null,1));
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
