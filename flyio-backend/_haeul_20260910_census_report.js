// 계정 전체 키워드 80,430개를 원장 3축으로 나눠 재고·활성·입찰가·30일 소진을 본다.
// 비율 기준은 원장 지시대로 "소진 금액" 4:3:3.
const fs=require('fs'),path=require('path'),assert=require('assert');
const B=__dirname,D0=path.join(B,'reports','haeul_20260910'),D9=path.join(B,'reports','haeul_intent_20260909');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const census=J(path.join(D0,'census.json'));
const slim=J(path.join(D0,'adgroups_slim.json'));
const camps=J(path.join(D0,'campaigns.json'));
const full=J(path.join(D9,'search_reports_full.json'));
const yday=J(path.join(D0,'raw_20260909.json'));
const csv=(n,a)=>{if(!a.length)return;const cs=Object.keys(a[0]);fs.writeFileSync(path.join(D0,n+'.csv'),'﻿'+[cs,...a.map(r=>cs.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));console.log('CSV',n+'.csv',a.length+'행');};
const won=n=>Math.round(n).toLocaleString();

const AX={head:'두통',dizzy:'어지럼',auto:'자율신경'};
const gm=new Map(slim.map(g=>[g.id,g])),cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
assert.equal(slim.length,4364);assert.equal(census.totalKeywords,80430);

// 30일 키워드별 성과(AD_DETAIL) + 어제
const perf30=new Map();
for(const a of full.adKeywords){if(a.keywordId==='-')continue;const p=perf30.get(a.keywordId)||{clk:0,cost:0,imp:0};p.clk+=a.click30;p.cost+=a.cost30;p.imp+=a.imp30;perf30.set(a.keywordId,p);}
const perfY=new Map();
for(const a of yday.clicked){if(a.keywordId==='-')continue;const p=perfY.get(a.keywordId)||{clk:0,cost:0};p.clk+=a.click;p.cost+=a.cost;perfY.set(a.keywordId,p);}

const rows=census.rows.map(([ax,keyword,gid,kid,bid,c7])=>{
 const g=gm.get(gid),c=g&&cm.get(g.cid),p=perf30.get(kid)||{clk:0,cost:0,imp:0};
 const kwOn=c7==='0',gOn=g?!g.userLock:false,cOn=c?!c.userLock&&c.status!=='PAUSED':false;
 return {ax,keyword,gid,kid,bid:+bid,kwOn,gOn,cOn,live:kwOn&&gOn&&cOn,
  group:g?g.name:'(그룹불명)',campaign:c?c.name:'(캠페인불명)',
  imp30:p.imp,clk30:p.clk,cost30:p.cost,costY:(perfY.get(kid)||{}).cost||0};});

console.log('\n=== 1. 계정 전체 키워드 '+census.totalKeywords.toLocaleString()+'개 축별 재고 ===');
const tbl=[];
for(const [k,label] of Object.entries(AX)){
 const r=rows.filter(x=>x.ax===k),live=r.filter(x=>x.live);
 const live70=live.filter(x=>x.bid<=100);
 tbl.push({축:label,등록:r.length,'살아있음':live.length,'살아있음%':(live.length/r.length*100).toFixed(1),
  '그중 70~100원':live70.length,'실질 노출가능':live.length-live70.length,
  '중위입찰(살아있는것)':live.length?live.map(x=>x.bid).sort((a,b)=>a-b)[Math.floor(live.length/2)]:0,
  '30일 소진':Math.round(r.reduce((s,x)=>s+x.cost30,0)),'30일 클릭':r.reduce((s,x)=>s+x.clk30,0)});
}
tbl.push({축:'기타(축밖)',등록:census.counts.etc,'살아있음':'-','살아있음%':'-','그중 70~100원':'-','실질 노출가능':'-','중위입찰(살아있는것)':'-',
 '30일 소진':Math.round(full.adKeywords.reduce((s,a)=>s+a.cost30,0)-rows.reduce((s,x)=>s+x.cost30,0)),'30일 클릭':'-'});
console.table(tbl);

const c3=tbl.slice(0,3).reduce((s,t)=>s+t['30일 소진'],0);
console.log('3축 30일 소진 비율(10점 환산, 소진금액 기준):',tbl.slice(0,3).map(t=>t.축+' '+(t['30일 소진']/c3*10).toFixed(1)).join(' : '));
console.log('목표: 두통 4 : 어지럼 3 : 자율신경 3');

console.log('\n=== 2. 축별 "살아있고 입찰가 200원 이상" 키워드가 어느 캠페인에 있나 ===');
for(const [k,label] of Object.entries(AX)){
 const live=rows.filter(x=>x.ax===k&&x.live&&x.bid>100);
 const byC={};for(const x of live){const b=byC[x.campaign]||={n:0,cost30:0};b.n++;b.cost30+=x.cost30;}
 console.log('\n['+label+'] 실질 노출가능 '+live.length+'개');
 console.table(Object.entries(byC).map(([c,v])=>({캠페인:c,키워드:v.n,'30일 소진':Math.round(v.cost30)})).sort((a,b)=>b.키워드-a.키워드));
}

console.log('\n=== 3. 죽어 있는 핵심 키워드 (내원의도 = 병원·한의원·치료·클리닉·잘하는곳) ===');
const intent=/병원|한의원|치료|클리닉|잘하는|전문|진료|어디로|어느과|무슨과/;
for(const [k,label] of Object.entries(AX)){
 const dead=rows.filter(x=>x.ax===k&&intent.test(x.keyword)&&(!x.live||x.bid<=100));
 const all=rows.filter(x=>x.ax===k&&intent.test(x.keyword));
 console.log('['+label+'] 내원의도 키워드 '+all.length+'개 중 죽어있음(OFF이거나 70~100원) '+dead.length+'개 ('+(dead.length/all.length*100).toFixed(0)+'%)');
}
const deadCore=rows.filter(x=>intent.test(x.keyword)&&(!x.live||x.bid<=100)&&x.imp30>0)
 .sort((a,b)=>b.imp30-a.imp30).slice(0,40)
 .map(x=>({축:AX[x.ax],키워드:x.keyword,입찰가:x.bid,'키워드ON':x.kwOn,'그룹ON':x.gOn,'캠페인ON':x.cOn,'30일노출':x.imp30,'30일클릭':x.clk30,'30일소진':Math.round(x.cost30),그룹:x.group}));
console.log('\n-- 노출은 나오는데 꺼져 있거나 70원인 내원의도 키워드 상위 40 --');
console.table(deadCore);

console.log('\n=== 4. 두 핵심 그룹의 실태 ===');
for(const gid of ['grp-a001-01-000000054603422','grp-a001-01-000000054747687','grp-a001-01-000000049624428']){
 const g=gm.get(gid),ks=rows.filter(x=>x.gid===gid);
 const on=ks.filter(x=>x.kwOn),on200=on.filter(x=>x.bid>100);
 console.log('['+g.name+'] 일예산 '+won(g.dailyBudget)+'원 | 키워드 '+ks.length+'개 | ON '+on.length+'개 | 그중 200원↑ '+on200.length+'개 | 30일 소진 '+won(ks.reduce((s,x)=>s+x.cost30,0))+'원');
}

// 산출물
csv('축별_전체키워드_재고',rows.map(x=>({축:AX[x.ax],키워드:x.keyword,입찰가:x.bid,'키워드ON':x.kwOn,'그룹ON':x.gOn,'캠페인ON':x.cOn,활성:x.live,
 캠페인:x.campaign,그룹:x.group,'30일노출':x.imp30,'30일클릭':x.clk30,'30일소진':Math.round(x.cost30),'어제소진':Math.round(x.costY),keywordId:x.kid}))
 .sort((a,b)=>b['30일소진']-a['30일소진']||b['30일노출']-a['30일노출']));
csv('자율신경축_전체',rows.filter(x=>x.ax==='auto').map(x=>({키워드:x.keyword,입찰가:x.bid,활성:x.live,'키워드ON':x.kwOn,'그룹ON':x.gOn,캠페인:x.campaign,그룹:x.group,'30일노출':x.imp30,'30일클릭':x.clk30,'30일소진':Math.round(x.cost30)}))
 .sort((a,b)=>b['30일소진']-a['30일소진']||b['30일노출']-a['30일노출']));
csv('어지럼축_전체',rows.filter(x=>x.ax==='dizzy').map(x=>({키워드:x.keyword,입찰가:x.bid,활성:x.live,'키워드ON':x.kwOn,'그룹ON':x.gOn,캠페인:x.campaign,그룹:x.group,'30일노출':x.imp30,'30일클릭':x.clk30,'30일소진':Math.round(x.cost30)}))
 .sort((a,b)=>b['30일소진']-a['30일소진']||b['30일노출']-a['30일노출']));
