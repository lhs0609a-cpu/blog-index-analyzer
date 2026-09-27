// 소잠 2026-09-17 — 어제(9/16) 실적 + 내원가능성 상위 키워드 전수 실순위(/stats avgRnk).
// 대상: reports/sojam-20260916/weak.json 의 score>=40 (상담일지 기저 내원율 40.5% 이상) 전 등록 ID.
// 단계: day(9/16) → win(9/14~16) → meta(현재 입찰·상태) 
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260917/'); fs.mkdirSync(D,{recursive:true});
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const F=n=>D+n, has=n=>fs.existsSync(F(n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(p,t=4){for(let i=0;i<t;i++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(90000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(i+1));}return null;}
async function pool(items,n,fn){const o=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;o[k]=await fn(items[k]);}}));return o;}

const weak=J(path.join(__dirname,'../reports/sojam-20260916/weak.json'));
const bytext=J(path.join(__dirname,'../reports/sojam-20260916/inv/bytext.json'));
const HI=weak.filter(r=>r.score>=40);
const ids=[...new Set(HI.flatMap(r=>(bytext[r.k]||[]).map(x=>x.id)))];
console.error('내원가능성 기준 이상',HI.length,'어 · 등록',ids.length);

async function stats(tr,file,seed){
  const st=has(file)?J(F(file)):(seed?{...seed}:{});
  const todo=ids.filter(i=>!st[i]);
  if(todo.length){
    const gs=chunk(todo,40); let d=0;
    console.error(file,'배치',gs.length);
    const res=await pool(gs,6,async b=>{const r=await api('/stats?ids='+encodeURIComponent(b.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc(tr));if(++d%25===0)console.error('  ',file,d,'/',gs.length);return r;});
    let fail=0;
    gs.forEach((b,i)=>{if(!res[i]){fail+=b.length;return;}const g=new Map(((res[i].data)||[]).map(x=>[x.id,x]));
      for(const id of b){const x=g.get(id)||{};st[id]={imp:+x.impCnt||0,clk:+x.clkCnt||0,cost:+x.salesAmt||0,rank:(x.avgRnk!=null&&+x.impCnt>0)?+x.avgRnk:null};}});
    if(fail)console.error('  실패 ID',fail);
    fs.writeFileSync(F(file),JSON.stringify(st));
  }
  const cov=ids.filter(i=>st[i]).length;
  console.error(file,'완료',cov,'/',ids.length);
}
async function meta(){
  const kw=has('kwnow.json')?J(F('kwnow.json')):{};
  const todo=ids.filter(i=>!kw[i]);
  if(!todo.length){console.error('meta 캐시 완료');return;}
  const gs=chunk(todo,20); let d=0;
  console.error('meta 배치',gs.length);
  const res=await pool(gs,6,async b=>{const r=await api('/ncc/keywords?ids='+encodeURIComponent(b.join(',')));if(++d%25===0)console.error('   meta',d,'/',gs.length);return r;});
  for(const r of res) for(const k of (Array.isArray(r)?r:[])) kw[k.nccKeywordId]={k:k.keyword,gid:k.nccAdgroupId,bid:k.bidAmt,ugb:!!k.useGroupBidAmt,lock:!!k.userLock,st:k.status,sr:k.statusReason,ins:k.inspectStatus,del:!!k.delFlag};
  fs.writeFileSync(F('kwnow.json'),JSON.stringify(kw));
  console.error('meta 완료',ids.filter(i=>kw[i]).length,'/',ids.length);
}
(async()=>{
  const stage=process.argv[2]||'all';
  const seed=(()=>{try{return J(path.join(__dirname,'../reports/sojam-20260915/day_20260916.json'));}catch(e){return null;}})();
  if(stage==='day'||stage==='all') await stats({since:'2026-09-16',until:'2026-09-16'},'day16.json',seed);
  if(stage==='win'||stage==='all') await stats({since:'2026-09-14',until:'2026-09-16'},'win3.json');
  if(stage==='meta'||stage==='all') await meta();
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
