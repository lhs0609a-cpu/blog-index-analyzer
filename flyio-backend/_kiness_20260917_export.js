const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260917');
const O=path.join(__dirname,'..','output','kiness_20260917');fs.mkdirSync(O,{recursive:true});
const V=JSON.parse(fs.readFileSync(path.join(__dirname,'_kiness_vols_20260810.json')));
const fresh=new Map();
for(const l of fs.readFileSync(path.join(D,'vols.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const o=JSON.parse(l);if(o.pc<0)continue;
 const lt=String(o.pcRaw).includes('<')&&String(o.moRaw).includes('<');fresh.set(o.k,lt?0:o.pc+o.mo);}
const vol=k=>{const f=fresh.get(k);if(f!==undefined)return f;const c=V[k];return c===undefined?'':(c===10?0:c);};
const bom='﻿';
const csv=(f,head,rows)=>fs.writeFileSync(path.join(O,f),bom+[head,...rows].map(r=>r.map(c=>{const s=String(c??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\r\n'));

// 1) 어제 클릭 키워드
const clicked=fs.readFileSync(path.join(D,'clicked_keywords.tsv'),'utf8').trim().split('\n').slice(1).map(l=>l.split('\t'));
csv('1_어제_클릭키워드_20260916.csv',['키워드','클릭','노출','비용','입찰가','상태','캠페인','광고그룹','월검색량'],
 clicked.map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],vol(r[0])]));

// 2) 고의도 키워드 노출점유율
const out=JSON.parse(fs.readFileSync(path.join(D,'live_tiered.json')));
const A=out.filter(x=>x.t[0]==='A').map(x=>({...x,v:vol(x.kw)})).filter(x=>typeof x.v==='number'&&x.v>=50);
A.sort((a,b)=>b.v-a.v);
csv('2_내원의도_키워드_노출점유율_7일.csv',['키워드','의도등급','월검색량','7일예상검색','7일노출','노출점유율%','클릭','비용','평균순위','최고입찰','ON인스턴스'],
 A.map(x=>{const e=Math.max(1,Math.round(x.v*7/30));return [x.kw,x.t,x.v,e,x.imp,(x.imp/e*100).toFixed(0),x.clk,x.cost,x.rnkImp?(x.rnk/x.rnkImp).toFixed(1):'',x.maxBid,x.on];}));

// 3) 실수요 있는데 7일 노출 0
const gap=JSON.parse(fs.readFileSync(path.join(D,'gap_A.json')));
const diag=JSON.parse(fs.readFileSync(path.join(D,'gap_diag.json')));
const dm=new Map();for(const d of diag){if(!dm.has(d.kw))dm.set(d.kw,[]);dm.get(d.kw).push(d);}
csv('3_내원의도_7일노출0_실수요.csv',['키워드','의도등급','월검색량','최고입찰','ON인스턴스','상태','대표그룹','원인추정'],
 gap.map(x=>{const ds=dm.get(x.kw)||[];const top=ds.sort((a,b)=>(b.bid||0)-(a.bid||0))[0]||{};
  const cause = (x.maxBid<=700)?'입찰 방치(70~700원)': (x.maxBid>=10000)?'고입찰인데 미노출(관련도·소재 문제)' : '예산 조기소진/경쟁';
  return [x.kw,x.t,x.v,x.maxBid,x.on,top.st||'',top.grp||'',cause];}));

// 4) 시간대별 소진
const hr={};for(const l of fs.readFileSync(path.join(D,'AD_DETAIL.tsv'),'utf8').split('\n')){if(!l.trim())continue;const f=l.split('\t');const h=+f[7];hr[h]=hr[h]||{i:0,c:0,s:0};hr[h].i+=+f[11];hr[h].c+=+f[12];hr[h].s+=+f[13];}
let cum=0;csv('4_어제_시간대별_소진.csv',['시각','노출','클릭','비용','누적비용','예산소진율%'],
 Array.from({length:24},(_,i)=>{const h=hr[i]||{i:0,c:0,s:0};cum+=h.s;return [i+'시',h.i,h.c,h.s,cum,(cum/200000*100).toFixed(1)];}));
console.log('exported to',O);
console.log('files:',fs.readdirSync(O).join(', '));
console.log('gap rows',gap.length,'share rows',A.length);
