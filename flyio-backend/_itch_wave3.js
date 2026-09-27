const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const F=path.join(__dirname,'../reports/sojam-20260910/_kwtool_raw.json');
const SIG=/가려|가렵|간지|소양|긁|따가|따끔|화끈|작열|진물|쓰라|통증|열감|저림/;
(async()=>{
  const store=JSON.parse(fs.readFileSync(F,'utf8'));
  const done=new Set(store.done);
  const seeds=Object.keys(store.kw).filter(k=>SIG.test(k)&&(store.kw[k].pc+store.kw[k].mo)>=50&&!done.has(k));
  console.error('wave3 seeds',seeds.length);
  let n=0;
  for(const s of seeds){
    try{
      const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(s)+'&showDetail=1',null,3808925,3);
      for(const k of (r&&r.keywordList)||[]){
        const pc=String(k.monthlyPcQcCnt).replace(/[^0-9]/g,'')||'0';
        const mo=String(k.monthlyMobileQcCnt).replace(/[^0-9]/g,'')||'0';
        store.kw[k.relKeyword]={pc:+pc,mo:+mo,comp:k.compIdx,depth:k.plAvgDepth,ctrM:k.monthlyAveMobileCtr,clkM:k.monthlyAveMobileClkCnt};
      }
      store.done.push(s);
      if(++n%25===0){fs.writeFileSync(F,JSON.stringify(store));console.error(' ',n,'/',seeds.length,'unique',Object.keys(store.kw).length);}
    }catch(e){console.error('  fail',s,e.message.slice(0,50));}
    await sleep(320);
  }
  fs.writeFileSync(F,JSON.stringify(store));
  console.log('DONE seeds',store.done.length,'unique',Object.keys(store.kw).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
