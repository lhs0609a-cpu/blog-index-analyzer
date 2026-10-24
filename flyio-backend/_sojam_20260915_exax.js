// 원장 제외축(건선·두드러기·여드름) 현황 — 동의 9건 중 7건이 이 축을 달고 있어 사실 확인이 필요하다.
const fs=require('fs'),path=require('path');
const CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260915/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(p,tries=4){for(let t=0;t<tries;t++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(90000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(t+1));}return null;}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k],k);}}));return out;}
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_excluded_axes.json'),'utf8'));
const ids=[...new Set(Object.values(T).flatMap(t=>t.ids))];
(async()=>{
 const F=D+'exax_stats.json';
 const st=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
 const todo=ids.filter(i=>!st[i]); const gs=chunk(todo,40); let d=0;
 console.error('stats 배치',gs.length);
 const res=await pool(gs,6,async b=>{const r=await api('/stats?ids='+encodeURIComponent(b.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:'2026-09-12',until:'2026-09-14'}));if(++d%25===0)console.error('  ',d,'/',gs.length);return r;});
 gs.forEach((b,i)=>{if(!res[i])return;const g=new Map(((res[i].data)||[]).map(x=>[x.id,x]));for(const id of b){const x=g.get(id)||{};st[id]={imp:+x.impCnt||0,clk:+x.clkCnt||0,cost:+x.salesAmt||0,rank:(x.avgRnk!=null&&+x.impCnt>0)?+x.avgRnk:null};}});
 fs.writeFileSync(F,JSON.stringify(st));
 const G=D+'exax_kw.json';
 const kw=fs.existsSync(G)?JSON.parse(fs.readFileSync(G,'utf8')):{};
 const todo2=ids.filter(i=>!kw[i]); const gs2=chunk(todo2,20); let d2=0;
 console.error('meta 배치',gs2.length);
 const r2=await pool(gs2,6,async b=>{const r=await api('/ncc/keywords?ids='+encodeURIComponent(b.join(',')));if(++d2%25===0)console.error('   meta',d2,'/',gs2.length);return r;});
 for(const r of r2) for(const k of (Array.isArray(r)?r:[])) kw[k.nccKeywordId]={k:k.keyword,gid:k.nccAdgroupId,bid:k.bidAmt,useGrp:!!k.useGroupBidAmt,lock:!!k.userLock,st:k.status};
 for(const i of todo2) if(!kw[i]) kw[i]={missing:true};
 fs.writeFileSync(G,JSON.stringify(kw));
 const H=D+'meta_grp.json';
 const grp=JSON.parse(fs.readFileSync(H,'utf8'));
 const need=[...new Set(Object.values(kw).filter(k=>k.gid).map(k=>k.gid))].filter(g=>!grp[g]);
 console.error('그룹',need.length);
 const r3=await pool(need,6,g=>api('/ncc/adgroups/'+g));
 need.forEach((g,i)=>{const r=r3[i];if(r)grp[g]={name:r.name,cid:r.nccCampaignId,bid:r.bidAmt,mw:r.mobileChannelWeight??r.mobileNetworkBidWeight??100,pw:r.pcChannelWeight??r.pcNetworkBidWeight??100,lock:!!r.userLock,st:r.status};});
 fs.writeFileSync(H,JSON.stringify(grp));
 console.error('완료');
})();
