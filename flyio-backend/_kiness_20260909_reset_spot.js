const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const bids=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).bids);
const want=['강남성장클리닉','목동성장클리닉','잠실성장클리닉','반포성장클리닉','성북성장클리닉','마포성장클리닉',
 '분당성장클리닉','일산성장클리닉','평촌성장클리닉','평택성장클리닉','수지성장클리닉','송도성장클리닉',
 '대구성장클리닉','부산성장클리닉','창원성장클리닉','키네스','키네스강남','성장클리닉','키성장클리닉','성장판검사'];
for(const w of want){const rows=plan.filter(p=>p.keyword===w).map(p=>({...p,nb:bids.get(p.id)})).sort((a,b)=>b.nb-a.nb);
 if(!rows.length){console.log(w,'| (계정에 없음)');continue;}
 const r=rows[0];
 console.log([w.padEnd(10),r.tier.padEnd(14),'입찰 '+String(r.oldBid).padStart(6)+'→'+String(r.nb).padStart(6),
  '월검색량 '+(r.vol??'-'),'중복 '+rows.length+'곳',r.campaign+'/'+r.group].join(' | '));}
