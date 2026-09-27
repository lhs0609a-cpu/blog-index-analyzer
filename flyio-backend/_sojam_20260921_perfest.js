// 3위가로 올리면 실제로 얼마가 드는가 — /estimate/performance-bulk (월 단위, [[sojam-rank-audit]])
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const q1=JSON.parse(fs.readFileSync(D+'q1.json','utf8'));
const est=JSON.parse(fs.readFileSync(D+'est.json','utf8'));
const F=D+'perfest.json';
const pe=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const real=q1.filter(r=>!r.imp&&(r.vol||0)>=30);
const items=[];
for(const r of real){const b=est['M3|'+r.k];if(!b||pe[r.k]!==undefined)continue;items.push({device:'MOBILE',keywordplus:false,keyword:r.k,bid:b});}
(async()=>{
  console.error('performance-bulk 대상',items.length);
  for(let i=0;i<items.length;i+=40){
    const b=items.slice(i,i+40);
    try{
      const r=await req('POST','/estimate/performance-bulk',{items:b},3808925,3);
      for(const x of (r&&(r.items||r.estimate))||[]) pe[x.keyword]={imp:x.impressions,clk:x.clicks,cost:x.cost,cpc:x.clicks?Math.round(x.cost/x.clicks):null};
    }catch(e){console.error(' 실패',String(e).slice(0,100));}
    for(const x of b) if(pe[x.keyword]===undefined) pe[x.keyword]=null;
    fs.writeFileSync(F+'.tmp',JSON.stringify(pe));fs.renameSync(F+'.tmp',F);
    if((i/40)%5===0)console.error('  ',i,'/',items.length);
    await sleep(250);
  }
  console.error('완료',Object.keys(pe).length);
})();
