// 노출 0 중 '도는데 안 나오는 것' 과 '입찰 바닥' 의 시장가를 잰다 (로컬 키 cid 3808925, [[naver-estimate-local-creds]])
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const q1=JSON.parse(fs.readFileSync(D+'q1.json','utf8'));
const F=D+'est.json';
const est=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const want=q1.filter(r=>!r.imp&&(r.vol||0)>=30).map(r=>r.k);
const todo=[...new Set(want)].filter(k=>est['M5|'+k]===undefined);
(async()=>{
  console.error('시장가 조회 대상',want.length,'· 남은',todo.length);
  for(const pos of [5,3]){
    const left=[...new Set(want)].filter(k=>est['M'+pos+'|'+k]===undefined);
    for(let i=0;i<left.length;i+=100){
      const b=left.slice(i,i+100);
      try{
        const r=await req('POST','/estimate/average-position-bid/keyword',{device:'MOBILE',items:b.map(k=>({key:k,position:pos}))},3808925,3);
        for(const x of (r&&r.estimate)||[]) est['M'+pos+'|'+x.keyword]=x.bid;
      }catch(e){}
      for(const k of b) if(est['M'+pos+'|'+k]===undefined) est['M'+pos+'|'+k]=null;
      fs.writeFileSync(F+'.tmp',JSON.stringify(est));fs.renameSync(F+'.tmp',F);
      if((i/100)%5===0)console.error('  pos',pos,i,'/',left.length);
      await sleep(250);
    }
  }
  console.error('완료');
})();
