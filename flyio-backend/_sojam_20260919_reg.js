// 자동완성 발굴 미등록어 등록 (2026-09-19). 사용: est | plan | apply | verify
// 오탐 필터는 _sojam_20260919_regfilter.js (표본 80 → 70 → 60, 3차 회귀 점검까지 통과)
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const {req,sleep:s2}=require('./_sojam_naver');
const R=path.join(__dirname,'../reports/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,o)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(o));fs.renameSync(p+'.tmp',p);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(m,p,b){for(let t=0;t<3;t++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:m,path:p,body:b===undefined?null:b}),signal:AbortSignal.timeout(90000)});const d=await r.json();if(!r.ok||!d.success)throw Error('rej '+String(d.error||'').slice(0,200));return d.response;}catch(e){if(t===2)throw e;await sleep(2500);}}}
const POOL=R+'sojam-20260919_regkeep.json', EST=R+'sojam-20260919_regest.json', PLAN=R+'sojam-20260919_regplan.json', RES=R+'sojam-20260919_regresult.json';

async function est(){
  const rows=J(POOL); const e=fs.existsSync(EST)?J(EST):{};
  const todo=[...new Set(rows.map(r=>r.k))].filter(t=>e['M3|'+t]===undefined);
  console.error('3위 추정가 남은',todo.length);
  for(let i=0;i<todo.length;i+=100){
    try{const r=await req('POST','/estimate/average-position-bid/keyword',{device:'MOBILE',items:todo.slice(i,i+100).map(k=>({key:k,position:3}))},3808925,3);
      for(const x of (r&&r.estimate)||[])e['M3|'+x.keyword]=x.bid;}catch(err){}
    if((i/100)%10===0)console.error('  ',i,'/',todo.length);
    await s2(250);
  }
  for(const t of todo)if(e['M3|'+t]===undefined)e['M3|'+t]=null;
  W(EST,e); console.error('완료');
}
function plan(){
  const rows=J(POOL), e=J(EST), grps=J(R+'sojam-20260919_grpok.json');
  const CAP=3000, FAR_BID=70;
  const items=rows.map(r=>{
    const v=e['M3|'+r.k];
    const bid=r.far?FAR_BID:Math.max(70,Math.min(CAP,Math.round((v||70)/10)*10));
    return {k:r.k,axis:r.axis,score:r.score,far:!!r.far,est3:v,bid};
  });
  let gi=0; const used={};
  for(const it of items){
    let tries=0;
    while(tries<grps.length&&(used[grps[gi].gid]||0)>=grps[gi].room-20){gi=(gi+1)%grps.length;tries++;}
    it.gid=grps[gi].gid; it.grp=grps[gi].name;
    used[it.gid]=(used[it.gid]||0)+1; gi=(gi+1)%grps.length;
  }
  W(PLAN,items);
  const won=n=>Math.round(n||0).toLocaleString('ko-KR');
  console.log('등록 계획',items.length,'개');
  console.log('  입찰: 70원',items.filter(i=>i.bid<=70).length,'· 71~1,000원',items.filter(i=>i.bid>70&&i.bid<=1000).length,'· 1,001~3,000원',items.filter(i=>i.bid>1000).length,'| 평균',won(items.reduce((a,i)=>a+i.bid,0)/items.length),'원');
  const ax={};for(const i of items)ax[i.axis]=(ax[i.axis]||0)+1;
  console.log('  축별:',Object.entries(ax).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join(' · '));
  const g={};for(const i of items)g[i.grp]=(g[i.grp]||0)+1;
  console.log('  그룹 배치:',Object.entries(g).map(([k,v])=>k+' '+v).join(' · '));
}
async function apply(){
  const items=J(PLAN);
  const st=fs.existsSync(RES)?J(RES):{created:[],rejected:[],skip:[],fail:[]};
  const done=new Set([...st.created,...st.rejected,...st.skip].map(x=>x.k+'|'+x.gid));
  const byGid={}; for(const it of items) if(!done.has(it.k+'|'+it.gid))(byGid[it.gid]=byGid[it.gid]||[]).push(it);
  const LIM=Number(process.argv[3]||0); let used=0;
  for(const [gid,list] of Object.entries(byGid)){
    if(LIM&&used>=LIM)break;
    const exist=new Set(((await api('GET','/ncc/keywords?nccAdgroupId='+gid))||[]).map(k=>String(k.keyword).replace(/\s+/g,'')));
    const go=list.filter(x=>{if(exist.has(x.k)){st.skip.push({k:x.k,gid,why:'이미 있음'});return false;}return true;});
    for(const part of chunk(go,40)){
      if(LIM&&used>=LIM)break;
      try{
        const r=await api('POST','/ncc/keywords?nccAdgroupId='+gid,part.map(x=>({keyword:x.k,bidAmt:x.bid,useGroupBidAmt:false,userLock:false})));
        for(const c of part){
          const k=(Array.isArray(r)?r:[]).find(x=>x&&String(x.keyword).replace(/\s+/g,'')===c.k)||{};
          if(k.nccKeywordId)st.created.push({k:c.k,gid,id:k.nccKeywordId,bid:k.bidAmt,axis:c.axis,ins:k.inspectStatus,stt:k.status});
          else st.rejected.push({k:c.k,gid,res:k.resultStatus||null});
        }
      }catch(e){st.fail.push({gid,kws:part.map(x=>x.k),err:String(e).slice(0,200)});}
      used+=part.length; W(RES,st);
      console.error('  등록',st.created.length,'거절',st.rejected.length,'건너뜀',st.skip.length,'실패',st.fail.length);
      await sleep(1100);
    }
  }
  console.log(JSON.stringify({등록:st.created.length,거절:st.rejected.length,건너뜀:st.skip.length,실패:st.fail.length}));
}
async function verify(){
  const st=J(RES); const ids=st.created.map(x=>x.id);
  const byIns={},byStt={}; let ok=0;
  for(const b of chunk(ids,20)){
    const r=await api('GET','/ncc/keywords?ids='+encodeURIComponent(b.join(',')));
    for(const k of (Array.isArray(r)?r:[])){ok++;byIns[k.inspectStatus]=(byIns[k.inspectStatus]||0)+1;byStt[k.status]=(byStt[k.status]||0)+1;}
    await sleep(200);
  }
  console.log('검증 — 등록',ids.length,'· 조회됨',ok,'· 누락',ids.length-ok);
  console.log('  검수:',JSON.stringify(byIns),'| 상태:',JSON.stringify(byStt));
}
const m=process.argv[2];
({est,plan:async()=>plan(),apply,verify}[m]||(async()=>console.log('est|plan|apply|verify')))().catch(e=>{console.error(e.stack);process.exitCode=1;});
