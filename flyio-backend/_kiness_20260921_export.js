const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260921');
const O=path.join(__dirname,'..','output','kiness_20260921');fs.mkdirSync(O,{recursive:true});
const bom='﻿';
const csv=(f,head,rows)=>{fs.writeFileSync(path.join(O,f),bom+[head,...rows].map(r=>r.map(c=>{const s=String(c??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n'));console.log(' '+f,rows.length+'행');};
const V=JSON.parse(fs.readFileSync(path.join(__dirname,'_kiness_vols_20260810.json')));
const fresh=new Map();
for(const l of fs.readFileSync(path.join(D,'vols.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const o=JSON.parse(l);if(o.pc<0)continue;
 const lt=String(o.pcRaw).includes('<')&&String(o.moRaw).includes('<');fresh.set(o.k,lt?0:o.pc+o.mo);}
const vol=k=>{const f=fresh.get(k);if(f!==undefined)return f;const c=V[k];return c===undefined?'':(c===10?0:c);};

// 1) 어제 클릭 키워드
const clicked=JSON.parse(fs.readFileSync(path.join(D,'clicked.json')));
csv('1_어제_클릭키워드_20260920.csv',['키워드','비용','클릭','CPC','노출','평균순위','입찰가','품질지수','기기별클릭','캠페인','광고그룹','월검색량'],
 clicked.map(r=>[r.kw,r.cost,r.clicks,r.cpc,r.imps,r.avgRnk,r.bid,r.qi,r.dev,r.camp,r.grp,vol(r.kw)]));
// 1b) 실제 검색어
const st=JSON.parse(fs.readFileSync(path.join(D,'search_terms.json')));
csv('2_어제_클릭된_실제검색어_20260920.csv',['검색어','비용','클릭','노출'],st.map(r=>[r.q,r.s,r.c,r.i]));
// 3) 시간대별 소진
const hr=JSON.parse(fs.readFileSync(path.join(D,'hourly.json')));
let cum=0;csv('3_어제_시간대별_소진_20260920.csv',['시각','노출','클릭','비용','누적비용','예산소진율%'],
 Array.from({length:24},(_,i)=>{const h=hr[i]||{i:0,c:0,s:0};cum+=h.s;return [i+'시',h.i,h.c,h.s,cum,(cum/200000*100).toFixed(1)];}));
// 4) 전량 미노출 (내원의도 + 실수요)
const gap=JSON.parse(fs.readFileSync(path.join(D,'gap_A.json')));
const diag=JSON.parse(fs.readFileSync(path.join(D,'gap_diag.json')));
const dm=new Map();for(const d of diag){if(!dm.has(d.kw))dm.set(d.kw,[]);dm.get(d.kw).push(d);}
csv('4_내원의도_7일노출0_실수요.csv',['키워드','의도등급','월검색량','최고입찰','ON인스턴스','상태','품질지수','대표그룹','지역타기팅','원인추정'],
 gap.map(x=>{const ds=(dm.get(x.kw)||[]).sort((a,b)=>(b.bid||0)-(a.bid||0));const top=ds[0]||{};
  const reg=ds.some(d=>String(d.tgt||'').includes('REGION'))?'있음':'없음';
  const cause=(x.maxBid<=700)?'입찰 방치(70~700원)':(x.maxBid>=10000)?'고입찰인데 미노출 → 관련도·소재 문제':'경쟁 밀림(입찰 1천~1만)';
  return [x.kw,x.t,x.v,x.maxBid,x.on,top.st||'',top.qi??'',top.grp||'',reg,cause];}));
// 5) 부분 미노출 (점유율 낮음)
const thin=JSON.parse(fs.readFileSync(path.join(D,'gap_thin.json')));
csv('5_내원의도_노출점유율_50미만.csv',['키워드','의도등급','월검색량','7일예상검색','7일실노출','노출점유율%','클릭','7일비용','평균순위','최고입찰','ON인스턴스'],
 thin.map(x=>[x.kw,x.t,x.v,x.e,x.imp,(x.share*100).toFixed(0),x.clk,x.cost,x.rnkImp?(x.rnk/x.rnkImp).toFixed(1):'',x.maxBid,x.on]));
// 6) 내원의도 전체 노출점유율
const out=JSON.parse(fs.readFileSync(path.join(D,'live_tiered.json')));
const A=out.filter(x=>x.t[0]==='A').map(x=>({...x,v:vol(x.kw)})).filter(x=>typeof x.v==='number'&&x.v>=50).sort((a,b)=>b.v-a.v);
csv('6_내원의도_월50이상_전량.csv',['키워드','의도등급','월검색량','7일예상검색','7일실노출','노출점유율%','클릭','7일비용','평균순위','최고입찰','ON인스턴스'],
 A.map(x=>{const e=Math.max(1,Math.round(x.v*7/30));return [x.kw,x.t,x.v,e,x.imp,(x.imp/e*100).toFixed(0),x.clk,x.cost,x.rnkImp?(x.rnk/x.rnkImp).toFixed(1):'',x.maxBid,x.on];}));
console.log('출력 폴더',O);
