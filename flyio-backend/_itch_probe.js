const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const F=path.join(__dirname,'../reports/sojam-20260910/_kwtool_raw.json');
const P=[];
const base=['가려움','가려움증','피부가려움','피부가려움증','몸가려움','몸가려움증','전신가려움','전신가려움증','온몸가려움','온몸가려움증','소양증','피부소양증','전신소양증','간지러움','피부간지러움'];
const suf=['치료','한의원','한방','병원','의원','치료병원','치료한의원','잘하는곳','명의','낫는법','고치는법','근본치료','한약','치료법','치료방법','완치','안낫는이유','재발','만성'];
for(const b of base)for(const s of suf)P.push(b+s);
const pre=['밤에','새벽에','자다가','밤마다','극심한','심한','참을수없는','너무','만성','계속','반복되는','스트레스성','전신','온몸','갑자기','잠못자는'];
for(const p of pre)for(const b of ['가려움','가려움증','피부가려움','피부가려움증','몸가려움증','소양증']) P.push(p+b);
const misc=['가려워서잠을못자요','가려워서미치겠어요','가려움불면증','가려움수면장애','피부가려움증한의원','피부가려움증병원',
'긁어서진물','긁어서상처','피부긁으면','밤에가려운이유','밤에더가려운이유','자다가가려워서','새벽에가려워서',
'만성소양증','노인성소양증','신장가려움','간질환가려움','당뇨가려움','스트레스가려움','스트레스성가려움',
'전신소양감','피부소양감','원인모를가려움','원인불명가려움','안낫는가려움','가려움증안낫','피부가려움안낫',
'피부통증','두피통증','두피따가움','피부따가움','피부화끈거림','피부작열감','얼굴화끈거림','얼굴따가움','피부열감','피부쓰라림'];
P.push(...misc);
(async()=>{
  const store=JSON.parse(fs.readFileSync(F,'utf8'));
  const done=new Set(store.done);
  const todo=[...new Set(P)].filter(x=>!done.has(x));
  console.error('probe',todo.length);
  let n=0,hit=0;
  for(const s of todo){
    try{
      const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(s)+'&showDetail=1',null,3808925,3);
      for(const k of (r&&r.keywordList)||[]){
        const pc=String(k.monthlyPcQcCnt).replace(/[^0-9]/g,'')||'0';
        const mo=String(k.monthlyMobileQcCnt).replace(/[^0-9]/g,'')||'0';
        if(!store.kw[k.relKeyword])hit++;
        store.kw[k.relKeyword]={pc:+pc,mo:+mo,comp:k.compIdx,depth:k.plAvgDepth,ctrM:k.monthlyAveMobileCtr,clkM:k.monthlyAveMobileClkCnt};
      }
      store.done.push(s);
      if(++n%40===0){fs.writeFileSync(F,JSON.stringify(store));console.error(' ',n,'/',todo.length,'new',hit);}
    }catch(e){}
    await sleep(300);
  }
  fs.writeFileSync(F,JSON.stringify(store));
  console.log('DONE probes',todo.length,'new keywords',hit,'total',Object.keys(store.kw).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
