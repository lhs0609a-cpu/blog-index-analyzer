// 오늘(9/21) 기준 검색량 재측정 — 과거 볼륨표를 쓰면 헤드어가 null 로 빠져 판정이 틀어진다([[sojam-rank-audit]]).
// ⚠️ 네이버는 10 미만을 "< 10" 문자열로 준다 → 0 으로 두고 별도 플래그 [[naver-estimate-local-creds]]
const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const D=path.join(__dirname,'../reports/sojam-20260921/');
const rows=JSON.parse(fs.readFileSync(D+'rows.json','utf8'));
const F=D+'vol.json';
const vol=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const pv=s=>{s=String(s);return s.indexOf('<')>=0?0:parseInt(s.replace(/[^0-9]/g,'')||'0',10);};
const lo=s=>String(s).indexOf('<')>=0;

const want=rows.filter(r=>(r.axis&&!r.noise&&r.score>=40.5&&!r.excl.length&&!r.far)||r.clk>0||r.imp>0).map(r=>r.k);
const todo=[...new Set(want)].filter(k=>vol[k]===undefined);
const CONC=3;
(async()=>{
  console.error('대상',want.length,'· 조회 남은',todo.length);
  const batches=[];for(let i=0;i<todo.length;i+=5)batches.push(todo.slice(i,i+5));
  let done=0,idx=0;
  const worker=async()=>{
    while(idx<batches.length){
      const h=batches[idx++];
      try{
        const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(h.join(','))+'&showDetail=1',null,3808925,3);
        for(const k of (r&&r.keywordList)||[]) if(h.includes(k.relKeyword))
          vol[k.relKeyword]={pc:pv(k.monthlyPcQcCnt),mo:pv(k.monthlyMobileQcCnt),lo:(lo(k.monthlyPcQcCnt)||lo(k.monthlyMobileQcCnt))?1:0,comp:k.compIdx};
      }catch(e){}
      for(const t of h) if(vol[t]===undefined) vol[t]=null;
      if(++done%200===0){fs.writeFileSync(F+'.tmp',JSON.stringify(vol));fs.renameSync(F+'.tmp',F);console.error(' vol',done,'/',batches.length);}
      await sleep(180);
    }
  };
  await Promise.all(Array.from({length:CONC},worker));
  fs.writeFileSync(F+'.tmp',JSON.stringify(vol));fs.renameSync(F+'.tmp',F);
  const got=Object.values(vol).filter(v=>v&&(v.pc+v.mo)>0).length;
  console.error('완료',Object.keys(vol).length,'· 실볼륨 1+',got);
})();
