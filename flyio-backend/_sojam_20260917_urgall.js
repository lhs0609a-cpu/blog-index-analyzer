// 소잠 2026-09-17 — 검색량 바닥을 빼고, 간절도만으로 내원가능성 상위 전수 실순위.
// 분류기는 _sojam_20260916_weak.js 원본을 그대로 재사용하고 볼륨 게이트만 제거(_urgcore.js).
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const D=path.join(__dirname,'../reports/sojam-20260917/'); fs.mkdirSync(D,{recursive:true});
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const F=n=>D+n, has=n=>fs.existsSync(F(n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(p,t=4){for(let i=0;i<t;i++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(90000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(700*(i+1));}return null;}
async function pool(items,n,fn){const o=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;o[k]=await fn(items[k]);}}));return o;}

const {rows:all}=require('./_urgcore.js');
const HI=all.filter(r=>r.score>=40);
const bytext=J(path.join(__dirname,'../reports/sojam-20260916/inv/bytext.json'));
const ids=[...new Set(HI.flatMap(r=>(bytext[r.k]||[]).map(x=>x.id)))];
console.error('간절도 기준 이상',HI.length,'어 · 등록',ids.length);

async function stats(tr,file,seeds){
  let st=has(file)?J(F(file)):{};
  for(const s of (seeds||[])){try{const o=J(s);for(const [k,v] of Object.entries(o)) if(!st[k]) st[k]=v;}catch(e){}}
  const todo=ids.filter(i=>!st[i]);
  if(todo.length){
    const gs=chunk(todo,40); let d=0,fail=0;
    console.error(file,'배치',gs.length);
    const res=await pool(gs,6,async b=>{const r=await api('/stats?ids='+encodeURIComponent(b.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc(tr));if(++d%100===0)console.error('  ',file,d,'/',gs.length);return r;});
    gs.forEach((b,i)=>{if(!res[i]){fail+=b.length;return;}const g=new Map(((res[i].data)||[]).map(x=>[x.id,x]));
      for(const id of b){const x=g.get(id)||{};st[id]={imp:+x.impCnt||0,clk:+x.clkCnt||0,cost:+x.salesAmt||0,rank:(x.avgRnk!=null&&+x.impCnt>0)?+x.avgRnk:null};}});
    if(fail)console.error('  응답 실패 ID',fail);
    fs.writeFileSync(F(file),JSON.stringify(st));
  }
  console.error(file,'완료',ids.filter(i=>st[i]).length,'/',ids.length);
}
(async()=>{
  const stage=process.argv[2]||'day';
  const D15=path.join(__dirname,'../reports/sojam-20260915/');
  if(stage==='day') await stats({since:'2026-09-16',until:'2026-09-16'},'urg_day16.json',[F('day16.json'),D15+'day_20260916.json']);
  if(stage==='win') await stats({since:'2026-09-10',until:'2026-09-16'},'urg_win7.json',[]);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
