// 어제 올린 148개 입찰이 하루 뒤 실제로 노출·클릭을 만들었는지, 축별로 본다.
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,D9=path.join(__dirname,'reports','haeul_intent_20260909'),D0=path.join(__dirname,'reports','haeul_20260910');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function api(method,p,body=null){for(let t=0;t<4;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,300));return d.response;
}catch(e){if(t===3)throw e;await sleep(2000);}}}
function axis(kw){const k=String(kw).replace(/\s/g,'');
 if(/자율신경|미주신경성|미주신경|불면|잠이안|잠을못|수면장애|불안장애|불안감|공황|두근|심계|가슴이답답|과호흡|기립성|브레인포그|신경쇠약|화병|번아웃/.test(k))return '자율신경';
 if(/어지럼|어지러|어질|현훈|이석증|메니에르|전정|평형|빙글|휘청|중심을못/.test(k))return '어지럼';
 if(/두통|편두통|머리(가)?아[프플파픔]|머리통증|머리(가)?찌릿|머리지끈|뒷골|관자놀이|삼차신경통|후두신경통|머리가무겁|머리압박|정수리통증/.test(k))return '두통';
 return '기타';}
const csv=(n,a)=>{const cs=Object.keys(a[0]);fs.writeFileSync(path.join(D0,n+'.csv'),'﻿'+[cs,...a.map(r=>cs.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));console.log('CSV',n+'.csv',a.length);};
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(D9,'change_plan.json'),'utf8')).keywords;
 const rr=[];for(const c of chunks(plan.map(p=>p.id),40)){
  rr.push(await api('GET','/stats?ids='+encodeURIComponent(c.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','avgRnk']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-09-09',until:'2026-09-09'}))));
  await sleep(500);}
 assert(rr.every(x=>Array.isArray(x.data)));
 const sm=new Map(rr.flatMap(x=>x.data).map(x=>[x.id,x]));
 const rows=plan.map(p=>{const s=sm.get(p.id)||{};return{축:axis(p.keyword),키워드:p.keyword,tier:p.tier,이전입찰:p.before,이후입찰:p.after,
  어제노출:s.impCnt||0,어제클릭:s.clkCnt||0,어제비용:s.salesAmt||0,어제평균순위:s.avgRnk||'',변경전7일노출:p.imp7,변경전7일클릭:p.click7};});
 csv('입찰증액148개_하루뒤_결과',rows.sort((a,b)=>b.어제노출-a.어제노출));
 const t={};for(const r of rows){const a=t[r.축]||={n:0,imp:0,clk:0,cost:0,zero:0,bid:0};a.n++;a.imp+=r.어제노출;a.clk+=r.어제클릭;a.cost+=r.어제비용;a.bid+=r.이후입찰;if(!r.어제노출)a.zero++;}
 console.log('\n== 148개 입찰증액, 하루 뒤(09-09) 결과 ==');
 console.table(Object.entries(t).map(([k,v])=>({축:k,키워드:v.n,'노출0개':v.zero,노출:v.imp,클릭:v.clk,비용:v.cost,'입찰가합':v.bid})));
 console.log('\n== 148개 중 자율신경축 ==');console.table(rows.filter(r=>r.축==='자율신경'));
 console.log('\n== 148개 중 어제 클릭 발생 ==');console.table(rows.filter(r=>r.어제클릭>0));
 console.log('\n== 어지럼축 상위 노출 12 ==');console.table(rows.filter(r=>r.축==='어지럼').sort((a,b)=>b.어제노출-a.어제노출).slice(0,12));
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
