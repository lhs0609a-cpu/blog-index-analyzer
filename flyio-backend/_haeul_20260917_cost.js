// 내원 실재 키워드 1,159개를 '제값'에 올렸을 때 월 예상 클릭·비용.
// 순위별 추정입찰가(PC/MOBILE) → 그 입찰가의 추정 실적. 로컬 키(cid 3808925) 직접 호출.
const fs=require('fs'),path=require('path');
const {req}=require('./_sojam_naver');
const CID=3808925;
const D=path.join(__dirname,'reports','haeul_20260917');
const SC='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/4670b754-1f99-4cce-937e-3efb6f6ed66b/scratchpad';
const OUT=path.join(SC,'cost_est.json');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const POS=[1,3,5];
(async()=>{
 const rows=JSON.parse(fs.readFileSync(path.join(D,'visit_all_rows.json'),'utf8')).filter(r=>r.증거!=='9_증거없음');
 const kws=[...new Set(rows.map(r=>r.키워드))];
 console.log('대상 키워드',kws.length);
 let st=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{bid:{},perf:{}};
 // 1) 순위별 추정입찰가
 for(const dev of ['PC','MOBILE'])for(const p of POS){
  const k=dev+'|'+p;st.bid[k]=st.bid[k]||{};
  const todo=kws.filter(w=>!(w in st.bid[k]));
  for(let i=0;i<todo.length;i+=100){
   const r=await req('POST','/estimate/average-position-bid/keyword',{device:dev,items:todo.slice(i,i+100).map(w=>({key:w,position:p}))},CID,3);
   for(const e of r.estimate||[])st.bid[k][e.keyword]=e.bid;
   for(const w of todo.slice(i,i+100))if(!(w in st.bid[k]))st.bid[k][w]=null;
   await sleep(250);
  }
  fs.writeFileSync(OUT,JSON.stringify(st));
  console.log('입찰가',k,'완료',Object.keys(st.bid[k]).length);
 }
 // 2) 그 입찰가의 추정 실적
 for(const dev of ['PC','MOBILE'])for(const p of POS){
  const k=dev+'|'+p;st.perf[k]=st.perf[k]||{};
  const todo=kws.filter(w=>!(w in st.perf[k])&&st.bid[k][w]);
  for(let i=0;i<todo.length;i+=100){
   const items=todo.slice(i,i+100).map(w=>({device:dev,keywordplus:false,keyword:w,bid:st.bid[k][w]}));
   const r=await req('POST','/estimate/performance-bulk',{items},CID,3);
   for(const e of r.items||[])st.perf[k][e.keyword]={clk:e.clicks,imp:e.impressions,cost:e.cost,bid:e.bid};
   for(const w of todo.slice(i,i+100))if(!(w in st.perf[k]))st.perf[k][w]=null;
   await sleep(250);
  }
  fs.writeFileSync(OUT,JSON.stringify(st));
  console.log('실적',k,'완료',Object.keys(st.perf[k]).length);
 }
 console.log('저장',OUT);
})().catch(e=>{console.error('ERR',String(e).slice(0,400));process.exitCode=1;});
