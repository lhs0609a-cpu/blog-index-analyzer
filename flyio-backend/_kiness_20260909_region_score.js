const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_measurable.json'),'utf8'));
const meas=new Map(JSON.parse(fs.readFileSync(path.join(D,'region_rank_measured.json'),'utf8')).map(x=>[x.keyword,x]));
const gids=[...new Set(rows.map(r=>r.gid))];
(async()=>{
 const inv=await pool(gids,6,async gid=>await req('GET','/ncc/keywords?nccAdgroupId='+gid,null,441986,4));
 if(inv.some(x=>!Array.isArray(x)))throw Error('키워드 조회 실패');
 const km=new Map(inv.flat().map(k=>[k.nccKeywordId,k]));
 const out=rows.map(r=>{const k=km.get(r.id),m=meas.get(r.keyword)||{};
  return {keyword:r.keyword,vol:r.vol,bid:k?.bidAmt,rel:k?.adRelevanceScore??null,ctr:k?.expectedClickScore??null,
   pcRank:m.pcRank??null,moRank:m.moRank??null,imp7:r.imp7};});
 fs.writeFileSync(path.join(D,'region_quality.json'),JSON.stringify(out));
 const have=out.filter(x=>x.ctr!==null);
 console.log('품질지수 확보',have.length,'/',out.length);
 const dist=k=>{const o={};for(const x of have)o[x[k]]=(o[x[k]]||0)+1;return o;};
 console.log('광고관련도 분포',JSON.stringify(dist('rel')));
 console.log('예상클릭률 분포',JSON.stringify(dist('ctr')));
 console.log('');
 console.log('예상클릭률 지수별 · 네이버 측정 평균순위 (9/2~9/8)');
 console.log('지수'.padStart(4),'키워드'.padStart(6),'PC평균순위'.padStart(11),'모바일평균순위'.padStart(13));
 for(let s=1;s<=10;s++){const g=have.filter(x=>x.ctr===s);if(!g.length)continue;
  const a=k=>{const v=g.map(x=>x[k]).filter(x=>x!==null);return v.length?(v.reduce((p,c)=>p+c,0)/v.length).toFixed(1)+' ('+v.length+'개)':'-';};
  console.log(String(s).padStart(4),String(g.length).padStart(6),a('pcRank').padStart(11),a('moRank').padStart(13));}
 console.log('');
 console.log('검색량 상위 20 · 입찰가 대비 품질');
 for(const x of have.filter(x=>x.vol>0).sort((a,b)=>b.vol-a.vol).slice(0,20))
  console.log(x.keyword.padEnd(13),'검색'+String(x.vol).padStart(5),'입찰'+String(x.bid).padStart(6),
   '관련도'+String(x.rel).padStart(3),'예상클릭률'+String(x.ctr).padStart(3),
   '| 측정 PC'+String(x.pcRank??'-').padStart(5),'모바일'+String(x.moRank??'-').padStart(5));
})().catch(e=>{console.error(e);process.exitCode=1;});
