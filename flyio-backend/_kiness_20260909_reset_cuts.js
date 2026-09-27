const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const bids=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).bids);
for(const p of plan.filter(p=>p.cost7>0&&bids.get(p.id)<p.oldBid))
 console.log([p.keyword,p.tier,'7일'+p.cost7+'원/'+p.clk7+'클릭','실측CPC'+p.cpc7,'입찰 '+p.oldBid+'→'+bids.get(p.id),p.campaign+'/'+p.group].join(' | '));
