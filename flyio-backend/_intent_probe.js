const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const F=path.join(__dirname,'../reports/sojam-20260910/_kwtool_raw.json');
// 상담일지 실측: 내원을 가르는 언어 = 만성/재발(+24p), 얼굴·노출부위(+17p), 병원경유(+14p), 스테로이드(+8p), 극심(+7p), 일상지장(+7p)
const AX=['아토피','습진','한포진','지루성피부염','지루성두피염','접촉성피부염','피부묘기증','가려움증','피부가려움증','백반증','무좀','모낭염','종기','땀띠','주부습진','화폐상습진','피부염','피부질환','피부병'];
const CHRONIC=['만성','재발','안낫는','낫지않는','반복되는','오래된','고질적인'];
const SUF=['재발','완치','근본치료','안낫','낫는법','명의','잘하는곳','한의원','한방치료','한약','치료후기','평생','몇년','악화','심해짐','재발이유'];
const FACE=['얼굴','목','손등','손','입가','눈가','이마','볼','턱','팔뚝','귀뒤','두피'];
const STER=['탈스테로이드','스테로이드부작용','스테로이드끊기','스테로이드리바운드','리바운드','스테로이드내성','스테로이드의존','탈스테','스테로이드중단','비스테로이드'];
const LIFE=['잠못자는','불면','수면장애','일상생활','직장','스트레스성','예민한피부'];
const P=[];
for(const a of AX){ for(const c of CHRONIC)P.push(c+a); for(const s of SUF)P.push(a+s); }
for(const f of FACE)for(const a of ['아토피','습진','가려움','피부염','발진'])P.push(f+a);
P.push(...STER);
for(const l of LIFE)for(const a of ['아토피','가려움','습진'])P.push(l+a);
P.push('피부과안낫는','피부과여러곳','대학병원피부과','피부병원옮김','피부질환명의','한방피부치료','피부한약','아토피한약','습진한약','가려움한약');
(async()=>{
  const store=JSON.parse(fs.readFileSync(F,'utf8'));
  const done=new Set(store.done);
  const todo=[...new Set(P)].filter(x=>!done.has(x));
  console.error('intent probe',todo.length);
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
      if(++n%50===0){fs.writeFileSync(F,JSON.stringify(store));console.error(' ',n,'/',todo.length,'new',hit);}
    }catch(e){}
    await sleep(300);
  }
  fs.writeFileSync(F,JSON.stringify(store));
  console.log('DONE probes',todo.length,'new',hit,'total',Object.keys(store.kw).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
