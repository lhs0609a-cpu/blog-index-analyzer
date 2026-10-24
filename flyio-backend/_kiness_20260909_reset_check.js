const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const a=JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8'));const bids=new Map(a.bids);
const perf=plan.filter(p=>p.cost7>0).map(p=>({...p,newBid:bids.get(p.id)})).sort((x,y)=>y.cost7-x.cost7);
console.log('지난주 지출 발생 키워드',perf.length,'중 입찰 인하',perf.filter(p=>p.newBid<p.oldBid).length,'/ 70원 억제',perf.filter(p=>p.newBid<=70).length);
console.log('--- 지난주 지출 상위 30의 새 입찰가');
for(const p of perf.slice(0,30))
 console.log([p.keyword.padEnd(14),p.tier.padEnd(14),'7일'+String(p.cost7).padStart(6)+'원/'+p.clk7+'클릭','순위'+(p.rank7||'-'),
  ('입찰 '+p.oldBid+'→'+p.newBid).padEnd(20),p.newBid<=70?'[억제]':'',p.campaign+'/'+p.group].join(' | '));
console.log('');
console.log('--- 지출 있었는데 70원으로 억제된 키워드');
for(const p of perf.filter(p=>p.newBid<=70))
 console.log([p.keyword,p.tier,'7일'+p.cost7+'원',p.campaign+'/'+p.group].join(' | '));
