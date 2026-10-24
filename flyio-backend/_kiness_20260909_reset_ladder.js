// 키네스 입찰 재설정: 문의 의도 우선순위 사다리.
// 등급은 운영 우선순위이며 내원 확률이나 진단이 아니다.
const fs=require('fs'),path=require('path');
const {evaluate}=require('./_kiness_review_rubric');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');

// 지점 소재 생활권(core/adjacent)만 내원 가능 지역으로 본다.
const CORE=new Set(['core']),NEAR=new Set(['adjacent']);
const BRANDRX=/키네스/;
const SERVICE=/성장클리닉|성장센터|성장센타|키성장클리닉|성장판검사|성장검사|성장정밀|키검사|신장검사|성장상담|키상담|성장예측|예상키검사|예측키검사|키크는병원|성장병원|키성장센터|성장전문/;
const ACTION=/상담|예약|문의|전화|방문|접수|가격|비용|얼마|후기|추천|어디|잘하는|유명|전문|비교|검사|검진/;
const CONCERN=/저신장|왜소증|성장부진|성장지연|안커|안크|안자라|성장멈|멈춘키|또래보다|너무작|키가작|성장판닫|급성장|성장속도/;
const ADJACENT=/성조숙|초경|소아비만|어린이비만|청소년비만|아동비만|자세교정|체형교정|척추측만|거북목|굽은등|휜다리/;

function tierOf(keyword,e,perf){
 const k=keyword.replace(/\s/g,'');
 const zone=e.geo?.zone,branch=e.geo?.branch;
 const local=CORE.has(zone)||NEAR.has(zone);
 if(BRANDRX.test(k))               return 'T1_브랜드';
 if(local&&(SERVICE.test(k)||ACTION.test(k)))  return 'T2_지점생활권';
 if(e.category==='B')              return 'T2_지점생활권';
 if(SERVICE.test(k)&&!/원거리/.test(zone||''))  return 'T3_대표상담검사';
 if(e.category==='C'&&ACTION.test(k))  return 'T3_대표상담검사';
 if(CONCERN.test(k)&&!/평균|계산|표준|방법|운동|음식|시기|몇살|몇세/.test(k)) return 'T4_성장고민';
 if(e.category==='C')              return 'T5_상담롱테일';
 if(ADJACENT.test(k))              return 'T6_인접진료';
 if(perf&&perf.cost>0)             return 'T6_인접진료';
 return 'T7_억제';
}
// 목표 노출순위와 PC 기준 상한. 상한은 지출 상한이 아니라 클릭당 허용 가격이다.
const LADDER={
 T1_브랜드:      {rank:1,cap:3000, floor:300,order:1},
 T2_지점생활권:   {rank:2,cap:25000,floor:500,order:2},
 T3_대표상담검사:  {rank:3,cap:22000,floor:500,order:3},
 T4_성장고민:     {rank:3,cap:8000, floor:300,order:4},
 T5_상담롱테일:   {rank:5,cap:6000, floor:300,order:5},
 T6_인접진료:     {rank:5,cap:8000, floor:300,order:6},
 T7_억제:        {rank:null,cap:70,floor:70, order:7},
};
module.exports={tierOf,LADDER};

if(require.main===module){
 const inv=JSON.parse(fs.readFileSync(path.join(D,'inventory.json'),'utf8'));
 const ads=new Map(JSON.parse(fs.readFileSync(path.join(D,'ads.json'),'utf8')).map(a=>[a.gid,a]));
 const groups=new Map(JSON.parse(fs.readFileSync(path.join(D,'groups.json'),'utf8')).map(g=>[g.nccAdgroupId,g]));
 const camps=new Map(JSON.parse(fs.readFileSync(path.join(D,'campaigns.json'),'utf8')).map(c=>[c.nccCampaignId,c]));
 const perf=new Map(JSON.parse(fs.readFileSync(path.join(D,'kw7d.json'),'utf8')).map(x=>[x.id,x]));
 const rows=[];
 for(const x of inv){
  if(!ads.get(x.gid)?.serving)continue;
  const g=groups.get(x.gid),c=camps.get(g.nccCampaignId);
  for(const k of x.keywords){
   if(k.userLock||k.status!=='ELIGIBLE')continue;
   const e=evaluate(k.keyword),p=perf.get(k.nccKeywordId)||null;
   const tier=tierOf(k.keyword,e,p);
   rows.push({id:k.nccKeywordId,gid:x.gid,cid:g.nccCampaignId,keyword:k.keyword,
    campaign:c.name,group:g.name,tier,order:LADDER[tier].order,
    zone:e.geo?.zone||'none',branch:e.geo?.branch||'',category:e.category,
    oldBid:k.useGroupBidAmt?g.bidAmt:k.bidAmt,useGroupBid:!!k.useGroupBidAmt,groupBid:g.bidAmt,
    pcW:g.pcNetworkBidWeight??100,moW:g.mobileNetworkBidWeight??100,
    imp7:p?p.imp:0,clk7:p?p.clk:0,cost7:p?p.cost:0,rank7:p&&p.imp?+(p.rankSum/p.imp).toFixed(1):null});
  }
 }
 fs.writeFileSync(path.join(D,'ladder_rows.json'),JSON.stringify(rows));
 const t={};for(const r of rows){const a=t[r.tier]||(t[r.tier]={n:0,imp:0,clk:0,cost:0,withImp:0});a.n++;a.imp+=r.imp7;a.clk+=r.clk7;a.cost+=r.cost7;a.withImp+=r.imp7>0?1:0;}
 console.log('tier'.padEnd(16),'키워드'.padStart(7),'노출有'.padStart(6),'7일노출'.padStart(8),'7일클릭'.padStart(6),'7일비용'.padStart(9));
 for(const [k,v] of Object.entries(t).sort((a,b)=>LADDER[a[0]].order-LADDER[b[0]].order))
  console.log(k.padEnd(16),String(v.n).padStart(7),String(v.withImp).padStart(6),String(v.imp).padStart(8),String(v.clk).padStart(6),String(v.cost).padStart(9));
 console.log('합계 키워드',rows.length);
}
