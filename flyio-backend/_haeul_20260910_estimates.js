// 3축 재설계용 추정입찰가. 상한 25,000원(원장 지시) 기준으로 어디까지 올릴 수 있는지 본다.
const fs=require('fs'),path=require('path'),assert=require('assert');
const CID=3442423,D0=path.join(__dirname,'reports','haeul_20260910');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chunks=(a,n)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,i*n+n));
async function api(method,p,body=null){for(let t=0;t<4;t++){try{
 const r=await fetch('https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id='+CID,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_id:String(CID),method,path:p,body}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok||!d.success)throw Error(String(d.error||JSON.stringify(d)).slice(0,300));return d.response;
}catch(e){if(t===3)throw e;await sleep(2000);}}}
const csv=(n,a)=>{const cs=Object.keys(a[0]);fs.writeFileSync(path.join(D0,n+'.csv'),'﻿'+[cs,...a.map(r=>cs.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));console.log('CSV',n+'.csv',a.length+'행');};

const census=J(path.join(D0,'census.json')),slim=J(path.join(D0,'adgroups_slim.json')),camps=J(path.join(D0,'campaigns.json'));
const full=J(path.join(__dirname,'reports','haeul_intent_20260909','search_reports_full.json'));
const gm=new Map(slim.map(g=>[g.id,g])),cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
const perf=new Map();for(const a of full.adKeywords){if(a.keywordId==='-')continue;const p=perf.get(a.keywordId)||{clk:0,cost:0,imp:0};p.clk+=a.click30;p.cost+=a.cost30;p.imp+=a.imp30;perf.set(a.keywordId,p);}
const AX={head:'두통',dizzy:'어지럼',auto:'자율신경'};
const intent=/병원|한의원|치료(?!제|약)|클리닉|잘하는|전문|진료|어디로|어느과|무슨과/;
const rows=census.rows.map(([ax,keyword,gid,kid,bid,c7])=>{const g=gm.get(gid),c=g&&cm.get(g.cid),p=perf.get(kid)||{clk:0,cost:0,imp:0};
 return{ax,keyword,gid,kid,bid:+bid,kwOn:c7==='0',gOn:g?!g.userLock:false,cOn:c?!c.userLock&&c.status!=='PAUSED':false,
  group:g?g.name:'?',campaign:c?c.name:'?',...p};});

// 후보: (a) 메인 3그룹 전체 (b) 그 밖에서 30일 노출이 있었던 내원의도 키워드
const MAIN=['grp-a001-01-000000049624428','grp-a001-01-000000054603422','grp-a001-01-000000054747687'];
const cand=rows.filter(r=>MAIN.includes(r.gid)||(intent.test(r.keyword)&&r.imp>=3&&r.gOn&&r.cOn));
const keys=[...new Set(cand.map(r=>r.keyword))];
console.log('추정가 조회 대상 키워드',keys.length,'개 / 후보 행',cand.length);

(async()=>{
 const est={};
 for(const device of ['PC','MOBILE'])for(const pos of [1,3]){
  for(const part of chunks(keys,100)){
   const r=await api('POST','/estimate/average-position-bid/keyword',{device,items:part.map(key=>({key,position:pos}))});
   assert(Array.isArray(r.estimate),'estimate shape');
   for(const e of r.estimate)((est[e.keyword||e.key]||={})[device+pos]=e.bid);
   await sleep(400);
  }
  console.log('추정가',device,pos+'위 완료');
 }
 fs.writeFileSync(path.join(D0,'estimates_25k.json'),JSON.stringify(est));
 const out=cand.map(r=>{const e=est[r.keyword]||{};return{
  축:AX[r.ax],키워드:r.keyword,캠페인:r.campaign,그룹:r.group,현재입찰:r.bid,
  '키워드ON':r.kwOn,'그룹ON':r.gOn,'캠페인ON':r.cOn,
  '30일노출':r.imp,'30일클릭':r.clk,'30일소진':Math.round(r.cost),
  'CPC실적':r.clk?Math.round(r.cost/r.clk):'',
  PC1:e.PC1??'',PC3:e.PC3??'',MO1:e.MOBILE1??'',MO3:e.MOBILE3??'',
  '3위추정최대':Math.max(e.PC3||0,e.MOBILE3||0)||'',keywordId:r.kid};})
  .sort((a,b)=>(b['30일소진']-a['30일소진'])||((b['3위추정최대']||0)-(a['3위추정최대']||0)));
 csv('재설계후보_추정가_상한25000',out);
 for(const ax of Object.values(AX)){
  const a=out.filter(x=>x.축===ax&&x['3위추정최대']);
  console.log('\n== '+ax+' 후보 '+a.length+'개, 3위 추정가 상위 12 ==');
  console.table(a.sort((x,y)=>y['3위추정최대']-x['3위추정최대']).slice(0,12).map(({축,keywordId,...r})=>r));
 }
})().catch(e=>{console.error('ERR',e.message);process.exitCode=1;});
