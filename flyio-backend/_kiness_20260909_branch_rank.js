const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rank=new Map(JSON.parse(fs.readFileSync(path.join(D,'region_rank.json'),'utf8')).map(x=>[x.keyword,x]));
const meas=new Map(JSON.parse(fs.readFileSync(path.join(D,'region_rank_measured.json'),'utf8')).map(x=>[x.keyword,x]));
const BR=['강남','잠실','목동','반포','성북','마포','분당','일산','부천','수원','평촌','평택','수지','송도','대구','부산','창원'];
console.log('지점'.padEnd(6),'키워드'.padEnd(14),'검색량'.padStart(6),'입찰'.padStart(7),'측정PC'.padStart(7),'측정모바일'.padStart(9),'1위필요PC'.padStart(10),'1위필요모'.padStart(10),'도달'.padStart(6));
for(const b of BR){const kw=b+'성장클리닉';const r=rank.get(kw),m=meas.get(kw)||{};
 if(!r){console.log(b.padEnd(6),kw.padEnd(14),'(수요 없음 · 순위 대상 아님)');continue;}
 const reach=r.pc===r.mo?String(r.pc):('PC'+r.pc+'/모'+r.mo);
 console.log(b.padEnd(6),kw.padEnd(14),String(r.vol??'-').padStart(6),String(r.newBid).padStart(7),
  String(m.pcRank??'-').padStart(7),String(m.moRank??'-').padStart(9),
  String(r.pcNeed1??'-').padStart(10),String(r.moNeed1??'-').padStart(10),reach.padStart(6));}
