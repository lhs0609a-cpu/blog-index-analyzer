const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const plan=JSON.parse(fs.readFileSync(path.join(D,'plan_vol.json'),'utf8'));
const bids=new Map(JSON.parse(fs.readFileSync(path.join(D,'alloc2.json'),'utf8')).bids);
const w={};for(const p of plan){const k=p.pcW+'/'+p.moW;w[k]=(w[k]||0)+1;}
console.log('그룹 가중치 분포 (PC/모바일)',JSON.stringify(w));
const off=plan.filter(p=>bids.get(p.id)>70&&(p.pcW!==100||p.moW!==100));
console.log('가중치 100이 아닌 운영 키워드',off.length);
const byW={};for(const p of off){const k=p.pcW+'/'+p.moW;byW[k]=(byW[k]||0)+1;}
console.log(JSON.stringify(byW));
