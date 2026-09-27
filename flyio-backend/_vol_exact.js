const fs=require('fs');const {req,sleep}=require('./_sojam_naver');
const F='../reports/sojam-20260910/_vol_exact.json';
(async()=>{
const D=JSON.parse(fs.readFileSync('../reports/sojam-20260910/_actionable.json','utf8'));
const texts=[...new Set(D.all.map(r=>r.kw))];
const out=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
const todo=texts.filter(t=>!out[t]);
console.error('texts',texts.length,'todo',todo.length);
const want=new Set(texts);
let n=0;
for(let i=0;i<todo.length;i+=5){
  const hints=todo.slice(i,i+5);
  try{
    const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(hints.join(','))+'&showDetail=1',null,3808925,3);
    for(const k of (r&&r.keywordList)||[]){
      if(!want.has(k.relKeyword))continue;
      const pcRaw=String(k.monthlyPcQcCnt),moRaw=String(k.monthlyMobileQcCnt);
      out[k.relKeyword]={pc:pcRaw.indexOf('<')>=0?0:parseInt(pcRaw.replace(/[^0-9]/g,'')||'0'),
                         mo:moRaw.indexOf('<')>=0?0:parseInt(moRaw.replace(/[^0-9]/g,'')||'0'),
                         pcLt:pcRaw.indexOf('<')>=0,moLt:moRaw.indexOf('<')>=0,comp:k.compIdx};
    }
    for(const h of hints)if(!out[h])out[h]={pc:0,mo:0,pcLt:true,moLt:true,comp:'없음'};
  }catch(e){for(const h of hints)if(!out[h])out[h]={pc:0,mo:0,pcLt:true,moLt:true,comp:'조회실패'};}
  if(++n%25===0){fs.writeFileSync(F,JSON.stringify(out));console.error(' ',i+5,'/',todo.length);}
  await sleep(300);
}
fs.writeFileSync(F,JSON.stringify(out));
const vals=Object.values(out);
console.log('DONE',Object.keys(out).length,
 '| 실볼륨 10+ :',vals.filter(v=>v.pc+v.mo>=10).length,
 '| PC·모바일 둘다 <10 :',vals.filter(v=>v.pcLt&&v.moLt).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
