const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rank=JSON.parse(fs.readFileSync(path.join(D,'region_rank.json'),'utf8'));
const meas=new Map(JSON.parse(fs.readFileSync(path.join(D,'region_rank_measured.json'),'utf8')).map(x=>[x.keyword,x]));
const serp=new Map();
const sf=path.join(D,'serp_region.jsonl');
if(fs.existsSync(sf))for(const l of fs.readFileSync(sf,'utf8').split('\n').filter(Boolean)){
 const x=JSON.parse(l);serp.set(x.keyword+'|'+x.device,x);}
const withVol=rank.filter(r=>r.vol>0).sort((a,b)=>b.vol-a.vol);
const noVol=rank.filter(r=>!(r.vol>0));
const bucket=(arr,k)=>{const o={};for(const x of arr){const v=x[k];const g=v===null?'추정불가':v==='5위밖'?'5위밖':v<=1?'1위':v<=2?'2위':v<=3?'3위':'4~5위';o[g]=(o[g]||0)+1;}return o;};
console.log('■ 성장클리닉 계열 4,068개 중 검색 수요가 잡히는 291개가 순위 대상');
console.log('  월검색량 있는 것',withVol.length,'/ 검색량은 없지만 지난주 노출된 것',noVol.length);
console.log('');
console.log('■ 지금 입찰가로 도달 가능한 순위 (네이버 순위별 예상입찰가 역산)');
console.log('  검색량 있는',withVol.length,'개  PC',JSON.stringify(bucket(withVol,'pc')),' 모바일',JSON.stringify(bucket(withVol,'mo')));
console.log('  롱테일  ',noVol.length,'개  PC',JSON.stringify(bucket(noVol,'pc')),' 모바일',JSON.stringify(bucket(noVol,'mo')));
console.log('');
console.log('■ 월검색량 상위 30 상세');
const h=['키워드','검색','입찰','측정PC','측정모바','도달PC','도달모','1위PC필요','1위모필요','관측PC','관측모'];
console.log(h[0].padEnd(13)+h[1].padStart(6)+h[2].padStart(7)+h[3].padStart(7)+h[4].padStart(7)+h[5].padStart(7)+h[6].padStart(6)+h[7].padStart(10)+h[8].padStart(10)+h[9].padStart(7)+h[10].padStart(7));
for(const r of withVol.slice(0,30)){const m=meas.get(r.keyword)||{};
 const sp=serp.get(r.keyword+'|PC'),sm=serp.get(r.keyword+'|MOBILE');
 const s=x=>!x?'-':x.status==='관측_노출'?String(x.rank):x.status==='관측_미노출'?'밖('+x.adCount+')':'?';
 console.log(r.keyword.padEnd(13)+String(r.vol).padStart(6)+String(r.newBid).padStart(7)
  +String(m.pcRank??'-').padStart(7)+String(m.moRank??'-').padStart(7)
  +String(r.pc??'-').padStart(7)+String(r.mo??'-').padStart(6)
  +String(r.pcNeed1??'-').padStart(10)+String(r.moNeed1??'-').padStart(10)
  +s(sp).padStart(7)+s(sm).padStart(7));}
console.log('');
console.log('■ 상한 30,000원으로 1위가 불가능한 키워드 (검색량 있는 것 기준)');
for(const r of withVol.filter(r=>(r.pcNeed1>r.newBid)||(r.moNeed1>r.newBid)))
 console.log('  '+r.keyword.padEnd(13),'입찰',String(r.newBid).padStart(6),'| 1위 필요 PC',String(r.pcNeed1).padStart(6),'모바일',String(r.moNeed1).padStart(6),
  '| 5위 필요 PC',String(r.pcNeed5).padStart(6),'모바일',String(r.moNeed5).padStart(6),'| 검색량',r.vol);
