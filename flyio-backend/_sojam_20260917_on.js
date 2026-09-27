// 소잠 2026-09-17 — "간절도 최상위(≥60) 전부 켜고 노출되게" 사용자 지시 실행.
// 단계: read(현재상태 전수 재조회) → class(원인 분류) → apply-on(꺼진 것 ON) → apply-bid(5위가)
// 가드: 백반증 제외(9/14 최우선 지시 '전부 최소입찰'), 인상만, 10원 단위, 상한, 전건 GET 재검증.
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260917/'); fs.mkdirSync(D,{recursive:true});
const D16=path.join(__dirname,'../reports/sojam-20260916/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const F=n=>D+n, has=n=>fs.existsSync(F(n));
const save=(n,o)=>fs.writeFileSync(F(n),JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(m,p,b,tries){tries=tries||(m==='GET'?4:1);
  for(let i=0;i<tries;i++){try{
    const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(90000)});
    const d=await r.json(); if(r.ok&&d.success)return d.response;
    if(m!=='GET')throw Error('rej '+String(d.error||'').slice(0,200));
  }catch(e){if(m!=='GET')throw e;}await sleep(700*(i+1));}
  return null;}
async function pool(items,n,fn){const o=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;o[k]=await fn(items[k]);}}));return o;}

const VITILIGO=/백반/;                      // 9/14 최우선 지시: 백반증은 전부 최소입찰 70원 — 절대 건드리지 않는다
const PROCTO=/항문튀어나옴|항문종기|항문피$|항문출혈|항문농양|항문열상|치질|치핵|치루|탈항|항문외과|대장/;  // 진료범위 아님
const urg=J(D+'urg_rows.json');
const TOP=urg.filter(r=>r.score>=60&&!VITILIGO.test(r.k)&&!PROCTO.test(r.k));
const bytext=J(D16+'inv/bytext.json');
const ids=[...new Set(TOP.flatMap(r=>(bytext[r.k]||[]).map(x=>x.id)))];

async function read(){
  const kw=has('on_kw.json')?J(F('on_kw.json')):{};
  const todo=ids.filter(i=>!kw[i]);
  console.error('간절도 60+ 대상',TOP.length,'어 · 등록',ids.length,'· 조회 남은',todo.length);
  if(todo.length){
    const gs=chunk(todo,20);let d=0;
    const res=await pool(gs,6,async b=>{const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(b.join(',')));if(++d%50===0)console.error('   kw',d,'/',gs.length);return r;});
    for(const r of res)for(const k of (Array.isArray(r)?r:[]))kw[k.nccKeywordId]={k:k.keyword,gid:k.nccAdgroupId,cid:k.nccCampaignId,bid:k.bidAmt,ugb:!!k.useGroupBidAmt,lock:!!k.userLock,st:k.status,sr:k.statusReason,ins:k.inspectStatus,del:!!k.delFlag};
    save('on_kw.json',kw);
  }
  console.error('키워드 조회 완료',ids.filter(i=>kw[i]).length,'/',ids.length);
  // 그룹 상태 재조회
  const grp=has('on_grp.json')?J(F('on_grp.json')):{};
  const gids=[...new Set(Object.values(kw).map(k=>k.gid).filter(Boolean))].filter(g=>!grp[g]);
  console.error('그룹 조회',gids.length);
  if(gids.length){let d=0;
    const gr=await pool(gids,8,async g=>{const r=await api('GET','/ncc/adgroups/'+g);if(++d%100===0)console.error('   grp',d,'/',gids.length);return r;});
    gids.forEach((g,i)=>{const r=gr[i];if(r)grp[g]={name:r.name,cid:r.nccCampaignId,bid:r.bidAmt,mw:r.mobileChannelWeight??100,pw:r.pcChannelWeight??100,lock:!!r.userLock,st:r.status,sr:r.statusReason,del:!!r.delFlag};});
    save('on_grp.json',grp);}
  // 캠페인
  const camps=await api('GET','/ncc/campaigns?recordSize=1000');
  save('on_camp.json',Object.fromEntries((camps||[]).map(c=>[c.nccCampaignId,{name:c.name,lock:!!c.userLock,st:c.status,sr:c.statusReason,tp:c.campaignTp}])));
  // 소재: 대상 그룹만 재조회
  const allG=[...new Set(Object.values(kw).map(k=>k.gid).filter(Boolean))];
  const ads=has('on_ads.json')?J(F('on_ads.json')):{};
  const need=allG.filter(g=>!ads[g]);
  console.error('소재 조회',need.length);
  if(need.length){let d=0;
    await pool(need,10,async g=>{const r=await api('GET','/ncc/ads?nccAdgroupId='+g);if(r===null)return;
      const l=(Array.isArray(r)?r:[]).filter(a=>!a.delFlag);
      ads[g]={n:l.length,ok:l.filter(a=>!a.userLock&&a.inspectStatus==='APPROVED'&&a.status==='ELIGIBLE').length,
        pend:l.filter(a=>['UNDER_REVIEW','PENDING'].includes(a.inspectStatus)).length,
        rej:l.filter(a=>a.inspectStatus==='REJECTED').length,off:l.filter(a=>a.userLock).length};
      if(++d%200===0)console.error('   ads',d,'/',need.length);});
    save('on_ads.json',ads);}
  console.error('read 완료');
}
if(process.argv[2]==='read')read().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={TOP,ids,bytext,D,D16,F,J,save,api,pool,chunk,sleep};
