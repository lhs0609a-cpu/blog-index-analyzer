const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const q=JSON.parse(fs.readFileSync(path.join(D,'region_quality.json'),'utf8')).filter(x=>x.rel!==null);
const low=q.filter(x=>x.rel<=2),hi=q.filter(x=>x.rel>=8);
const avg=(a,k)=>{const v=a.map(x=>x[k]).filter(x=>x!==null);return v.length?(v.reduce((p,c)=>p+c,0)/v.length).toFixed(1)+'('+v.length+')':'-';};
console.log('광고관련도 1~2점',low.length,'개 | 검색량 있는 것',low.filter(x=>x.vol>0).length,'| 측정 PC순위',avg(low,'pcRank'),'모바일',avg(low,'moRank'));
console.log('광고관련도 8~10점',hi.length,'개 | 검색량 있는 것',hi.filter(x=>x.vol>0).length,'| 측정 PC순위',avg(hi,'pcRank'),'모바일',avg(hi,'moRank'));
console.log('관련도 1~2점 중 검색량 있는 것:',low.filter(x=>x.vol>0).map(x=>x.keyword+'('+x.vol+')').join(', ')||'없음');
