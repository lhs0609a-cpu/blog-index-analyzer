const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260915/');
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'../reports/sojam-20260915_excluded_axes.json'),'utf8'));
const F=D+'exax_vol.json';
const vol=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const pv=s=>{s=String(s);return s.indexOf('<')>=0?0:parseInt(s.replace(/[^0-9]/g,'')||'0',10);};
const todo=Object.keys(T).filter(k=>vol[k]===undefined);
(async()=>{
 console.error('검색량 남은',todo.length);
 for(let i=0;i<todo.length;i+=5){
  const h=todo.slice(i,i+5);
  try{const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(h.join(','))+'&showDetail=1',null,3808925,3);
   for(const k of (r&&r.keywordList)||[]) if(h.includes(k.relKeyword)) vol[k.relKeyword]={pc:pv(k.monthlyPcQcCnt),mo:pv(k.monthlyMobileQcCnt)};}catch(e){}
  for(const t of h) if(vol[t]===undefined) vol[t]=null;
  if((i/5)%100===0){fs.writeFileSync(F,JSON.stringify(vol));console.error(' ',i,'/',todo.length);}
  await sleep(260);
 }
 fs.writeFileSync(F,JSON.stringify(vol));console.error('완료',Object.keys(vol).length);
})();
