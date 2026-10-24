const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const t=JSON.parse(fs.readFileSync(path.join(D,'region_targeting.json'),'utf8'));
const m=t.filter(x=>x.targetTp==='MEDIA_TARGET');
const shapes=new Map();
for(const x of m){const k=JSON.stringify(x.target);shapes.set(k,(shapes.get(k)||0)+1);}
for(const [k,v] of [...shapes].sort((a,b)=>b[1]-a[1]).slice(0,4))console.log('x'+v,k.slice(0,700));
const p=t.filter(x=>x.targetTp==='PC_MOBILE_TARGET');
const ps=new Map();for(const x of p){const k=JSON.stringify(x.target);ps.set(k,(ps.get(k)||0)+1);}
console.log('--- PC/모바일');for(const [k,v] of ps)console.log('x'+v,k.slice(0,300));
