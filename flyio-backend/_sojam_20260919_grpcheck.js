// 등록 대상 그룹 검증. GN(남/여/알수없음 전부 enable·negative:false)은 제한이 아니다 — 처음에 이걸 제한으로 읽고 후보 0개로 잘못 판정했다.
// 실제 제한은 RL(지역목록)·RP(반경)·SD(요일·시간)·AG(연령에서 '알 수 없음' 빠진 경우).
const fs=require('fs'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p){for(let t=0;t<3;t++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(60000)});const d=await r.json();if(r.ok&&d.success)return d.response;}catch(e){}await sleep(1200);}return null;}
function restricted(cr){
  const list=Array.isArray(cr)?cr.filter(x=>!x.delFlag&&x.enable!==false):[];
  const by={};for(const x of list)(by[x.type]=by[x.type]||[]).push(x);
  const out=[];
  for(const [t,xs] of Object.entries(by)){
    if(t==='GN'){ if(!xs.some(x=>x.dictionaryCode==='GNU'&&!x.negative))out.push('GN(알수없음 제외)'); continue; }
    if(t==='AG'){ if(!xs.some(x=>/U$/.test(x.dictionaryCode)&&!x.negative))out.push('AG(알수없음 제외)'); continue; }
    if(['RL','RP','SD'].includes(t))out.push(t);
  }
  return out;
}
(async()=>{
  const proven=['grp-a001-01-000000067496653','grp-a001-01-000000068278707','grp-a001-01-000000067451515'];
  const cand=JSON.parse(fs.readFileSync('../reports/sojam-20260919_grpcand.json','utf8'));
  const seen=new Set(), list=[];
  for(const gid of proven)list.push({gid,name:'(9/16 검증 그룹)'});
  for(const g of cand.slice(0,16))if(!proven.includes(g.gid))list.push(g);
  const ok=[];
  for(const g of list){
    if(seen.has(g.gid))continue; seen.add(g.gid);
    const grp=await api('/ncc/adgroups/'+g.gid); if(!grp){console.log(g.gid,'그룹 조회 실패');continue;}
    const cr=await api('/ncc/criterion/'+g.gid);
    const res=restricted(cr);
    const ads=(await api('/ncc/ads?nccAdgroupId='+g.gid))||[];
    const live=ads.filter(a=>!a.delFlag&&a.inspectStatus==='APPROVED'&&a.status==='ELIGIBLE');
    const kws=(await api('/ncc/keywords?nccAdgroupId='+g.gid))||[];
    const camp=await api('/ncc/campaigns/'+g.cid||grp.nccCampaignId);
    const head=live.map(a=>(a.ad&&(a.ad.headline||(a.ad.basic&&a.ad.basic.headline)))||'?')[0]||'';
    const good=grp.status==='ELIGIBLE'&&!res.length&&live.length>0&&kws.length<950;
    console.log((good?'OK  ':'skip')+' '+grp.name.padEnd(24)+' 키워드'+String(kws.length).padStart(5)+' 여유'+String(1000-kws.length).padStart(5)+' 제한:'+(res.join(',')||'없음')+' 소재'+live.length+' | '+head.slice(0,30));
    if(good)ok.push({gid:g.gid,name:grp.name,cid:grp.nccCampaignId,room:1000-kws.length,head});
    await sleep(250);
  }
  fs.writeFileSync('../reports/sojam-20260919_grpok.json',JSON.stringify(ok));
  console.log('\n사용 가능',ok.length,'그룹 · 여유 합계',ok.reduce((a,g)=>a+g.room,0));
})();
