const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const res=JSON.parse(fs.readFileSync(path.join(D,'region_rank.json'),'utf8'));
const est=JSON.parse(fs.readFileSync(path.join(D,'region_rank_estimates.json'),'utf8'));
for(const w of ['부산성장클리닉','반포성장클리닉','대구성장클리닉','성장클리닉','목동성장클리닉','강남성장클리닉']){
 const r=res.find(x=>x.keyword===w);if(!r){console.log(w,'없음');continue;}
 console.log('■',w,'입찰',r.newBid,'| 역산 PC',r.pc,'MOBILE',r.mo);
 console.log('   PC 순위별 예상입찰가 ',JSON.stringify(est[r.id]?.PC));
 console.log('   모바일 순위별 예상입찰가',JSON.stringify(est[r.id]?.MOBILE));
}
