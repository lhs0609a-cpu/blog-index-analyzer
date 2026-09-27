// 오늘 기준 검색량 재측정 — 9/10 볼륨표에 없는 헤드어가 있어 핵심 판정이 틀어진 전력이 있다([[sojam-rank-audit]]).
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const rows=JSON.parse(fs.readFileSync(D+'rows.json','utf8'));
const F=D+'vol_today.json';
const vol=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const pv=s=>{s=String(s);return s.indexOf('<')>=0?0:parseInt(s.replace(/[^0-9]/g,'')||'0',10);};
const todo=rows.map(r=>r.k).filter(k=>vol[k]===undefined);
(async()=>{
 console.error('검색량 남은',todo.length);
 for(let i=0;i<todo.length;i+=5){
  const h=todo.slice(i,i+5);
  try{
   const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(h.join(','))+'&showDetail=1',null,3808925,3);
   for(const k of (r&&r.keywordList)||[]) if(h.includes(k.relKeyword)) vol[k.relKeyword]={pc:pv(k.monthlyPcQcCnt),mo:pv(k.monthlyMobileQcCnt),comp:k.compIdx};
  }catch(e){}
  for(const t of h) if(vol[t]===undefined) vol[t]=null;
  if((i/5)%100===0){fs.writeFileSync(F,JSON.stringify(vol));console.error(' vol',i,'/',todo.length);}
  await sleep(260);
 }
 fs.writeFileSync(F,JSON.stringify(vol));
 console.error('완료',Object.keys(vol).length);
})();
