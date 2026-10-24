const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const bids=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).bids);
// 지역명이 붙은 성장클리닉/키성장클리닉 계열만 본다. 브랜드어와 전국 대표어는 제외.
const RX=/성장클리닉|키성장클리닉|성장크리닉/;
const rows=plan.filter(p=>RX.test(p.keyword)&&!/키네스/.test(p.keyword))
 .map(p=>({...p,newBid:bids.get(p.id)}));
const uniq=new Map();
for(const r of rows){const cur=uniq.get(r.keyword);if(!cur||r.newBid>cur.newBid)uniq.set(r.keyword,r);}
const list=[...uniq.values()];
const regional=list.filter(r=>r.keyword!=='성장클리닉'&&r.keyword!=='키성장클리닉');
console.log('성장클리닉 계열 고유 키워드',list.length);
console.log('  운영중(70원 초과)',list.filter(r=>r.newBid>70).length,'/ 억제(70원)',list.filter(r=>r.newBid<=70).length);
const zone={};for(const r of list){const k=r.zone||'none';zone[k]=(zone[k]||0)+1;}
console.log('  지역구분',JSON.stringify(zone));
fs.writeFileSync(path.join(D,'region_clinic_keywords.json'),JSON.stringify(list));
console.log('--- 월검색량 상위 30');
for(const r of list.sort((a,b)=>(b.vol||0)-(a.vol||0)).slice(0,30))
 console.log([r.keyword.padEnd(14),'검색량'+String(r.vol??'-').padStart(6),'입찰'+String(r.newBid).padStart(6),
  '7일순위'+String(r.rank7??'-').padStart(5),'노출'+String(r.imp7).padStart(4),r.zone,r.branch||'-'].join(' | '));
