// 내원 후보 10,466개의 '실재 증거' 수집: 90일 노출·클릭 (사람이 실제로 그 말을 쳤다는 증거)
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,SINCE=process.env.SINCE||'2026-06-19',UNTIL=process.env.UNTIL||'2026-09-16';
const D=path.join(__dirname,'reports','haeul_20260917');
const SC='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/4670b754-1f99-4cce-937e-3efb6f6ed66b/scratchpad';
const OUT=path.join(SC,'evidence_stats.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(m,p){for(let t=0;t<5;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method:m,path:p,body:null}),signal:AbortSignal.timeout(90000)});
 const d=await r.json(); if(!r.ok||!d.success)throw Error('API '+r.status+' '+String(d.error||d.detail||'').slice(0,200));
 return d.response;}catch(e){if(t===4)throw e;await sleep(4000);}}}
(async()=>{
 const cand=JSON.parse(fs.readFileSync(path.join(SC,'cand.json'),'utf8'));
 const ids=cand.flatMap(c=>c.inst.map(i=>i.kid));
 console.log('대상 키워드ID',ids.length,'기간',SINCE,'~',UNTIL);
 let done={};if(fs.existsSync(OUT))done=JSON.parse(fs.readFileSync(OUT,'utf8'));
 const todo=ids.filter(id=>!(id in done));
 console.log('남은',todo.length);
 const F=encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']));
 const T=encodeURIComponent(JSON.stringify({since:SINCE,until:UNTIL}));
 for(let i=0;i<todo.length;i+=40){
  const c=todo.slice(i,i+40);
  const r=await api('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+F+'&timeRange='+T);
  assert(Array.isArray(r.data),'stats shape');
  for(const id of c)done[id]={imp:0,clk:0,cost:0,rnk:null};
  for(const x of r.data)done[x.id]={imp:x.impCnt||0,clk:x.clkCnt||0,cost:x.salesAmt||0,rnk:x.avgRnk??null};
  if((i/40)%15===0){fs.writeFileSync(OUT,JSON.stringify(done));console.log('  ',i+c.length,'/',todo.length);}
  await sleep(700);
 }
 fs.writeFileSync(OUT,JSON.stringify(done));
 const v=Object.values(done);
 console.log('완료',v.length,'| 노출>0',v.filter(x=>x.imp>0).length,'| 클릭>0',v.filter(x=>x.clk>0).length);
})().catch(e=>{console.error('ERR',String(e));process.exitCode=1;});
