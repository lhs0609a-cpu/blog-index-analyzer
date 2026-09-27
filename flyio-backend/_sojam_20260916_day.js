// 내원축 키워드 전수의 어제(9/15) 노출·클릭·소진·실순위(avgRnk). 대상 ID 는 어제 만든 targets 를 그대로 쓴다.
const fs=require('fs'),path=require('path'),CID='1858907';
const BASE='https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID;
const DAY=process.argv[2]||'2026-09-15';
const D=path.join(__dirname,'../reports/sojam-20260915/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const enc=x=>encodeURIComponent(JSON.stringify(x));
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
async function api(p,t=4){for(let i=0;i<t;i++){try{const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:CID,method:'GET',path:p,body:null}),signal:AbortSignal.timeout(90000)});if(r.ok){const d=await r.json();if(d.success)return d.response;}}catch(e){}await sleep(600*(i+1));}return null;}
async function pool(items,n,fn){const o=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;o[k]=await fn(items[k]);}}));return o;}
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_targets.json'),'utf8'));
const EX=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_excluded_axes.json'),'utf8'));
const ids=[...new Set([...Object.values(T),...Object.values(EX)].flatMap(t=>t.ids))];
(async()=>{
 const F=D+'day_'+DAY.replace(/-/g,'')+'.json';
 const st=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
 const todo=ids.filter(i=>!st[i]); const gs=chunk(todo,40); let d=0;
 console.error('대상 ID',ids.length,'| 배치',gs.length);
 const res=await pool(gs,6,async b=>{const r=await api('/stats?ids='+encodeURIComponent(b.join(','))+'&fields='+enc(['impCnt','clkCnt','salesAmt','avgRnk'])+'&timeRange='+enc({since:DAY,until:DAY}));if(++d%40===0)console.error('  ',d,'/',gs.length);return r;});
 gs.forEach((b,i)=>{if(!res[i])return;const g=new Map(((res[i].data)||[]).map(x=>[x.id,x]));
  for(const id of b){const x=g.get(id)||{};st[id]={imp:+x.impCnt||0,clk:+x.clkCnt||0,cost:+x.salesAmt||0,rank:(x.avgRnk!=null&&+x.impCnt>0)?+x.avgRnk:null};}});
 fs.writeFileSync(F,JSON.stringify(st));
 console.error('완료',Object.keys(st).length);
})();
