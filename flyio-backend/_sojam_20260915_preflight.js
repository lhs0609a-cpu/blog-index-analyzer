// 적용 전 점검: 대상 그룹의 소재 유무·캠페인 상태. 소재 0 인 그룹에 입찰을 올리면 돈만 나간다([[sojam-creative-audit]]).
const fs=require('fs'),path=require('path');
const CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260915/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,tries=4){for(let t=0;t<tries;t++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(60000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
(async()=>{
 const {acts}=JSON.parse(fs.readFileSync(D+'actions.json','utf8'));
 const gids=[...new Set(acts.map(a=>a.gid))];
 console.error('점검 그룹',gids.length);
 const out={};
 for(const g of gids){
  const ads=await api('/ncc/ads?nccAdgroupId='+g);
  const ok=(Array.isArray(ads)?ads:[]).filter(a=>!a.delFlag&&!a.userLock&&a.inspectStatus==='APPROVED'&&a.status==='ELIGIBLE');
  const grp=await api('/ncc/adgroups/'+g);
  const camp=grp?await api('/ncc/campaigns/'+grp.nccCampaignId):null;
  out[g]={name:grp&&grp.name,ads:(Array.isArray(ads)?ads:[]).length,adsOk:ok.length,
    grpSt:grp&&grp.status,grpLock:grp&&!!grp.userLock,campName:camp&&camp.name,campSt:camp&&camp.status,campLock:camp&&!!camp.userLock};
  await sleep(200);
 }
 fs.writeFileSync(D+'preflight.json',JSON.stringify(out,null,1));
 const bad=Object.entries(out).filter(([,v])=>!v.adsOk||v.grpLock||v.campLock);
 console.log('소재 없음/잠김 그룹',bad.length,'/',gids.length);
 for(const [g,v] of bad) console.log('  ',v.name,'| 소재',v.ads,'승인',v.adsOk,'| 그룹',v.grpSt,v.grpLock?'잠김':'','| 캠페인',v.campName,v.campSt,v.campLock?'잠김':'');
 const affected=acts.filter(a=>bad.some(([g])=>g===a.gid));
 console.log('영향 키워드',affected.length,':',affected.map(a=>a.k).join(' '));
})();
