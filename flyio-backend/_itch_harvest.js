const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const OUT=path.join(__dirname,'../reports/sojam-20260910');
fs.mkdirSync(OUT,{recursive:true});
const F=path.join(OUT,'_kwtool_raw.json');
const SEEDS=[
// 가려움 본어 · 부위
'가려움','가려움증','피부가려움','온몸가려움','전신가려움','밤에가려움','극심한가려움','참을수없는가려움',
'간지러움','간지럼','소양증','피부소양증','전신소양증','노인성소양증','임신소양증',
'두피가려움','얼굴가려움','목가려움','등가려움','배가려움','가슴가려움','팔가려움','다리가려움',
'손가려움','손바닥가려움','발가려움','발바닥가려움','발등가려움','종아리가려움','허벅지가려움',
'겨드랑이가려움','사타구니가려움','항문가려움','음부가려움','유두가려움','귀가려움','코가려움','눈가려움',
'엉덩이가려움','무릎가려움','팔꿈치가려움','손가락가려움','발가락가려움','겨드랑가려움','턱가려움',
// 고통 강도 · 시간
'밤에더가려움','자다가가려움','새벽에가려움','가려워서잠못잠','가려움불면','가려움수면장애',
'긁으면','긁어서상처','피나도록긁','진물','피부진물','각질','피부각질','열감','화끈거림','작열감',
'따가움','피부따가움','쓰라림','피부통증','피부아픔','피부저림','따끔거림','바늘로찌르는듯',
// 만성 · 치료실패 (고관여)
'만성가려움','안낫는가려움','재발성','가려움원인','가려움증원인','가려움치료','가려움증치료',
'가려움한의원','가려움병원','피부가려움치료','스테로이드','탈스테로이드','스테로이드부작용','리바운드',
'피부질환한의원','난치성피부질환','만성피부질환','자가면역피부질환','피부병안낫는','피부과안낫는',
// 소잠 주력 축 + 고통
'아토피가려움','습진가려움','한포진가려움','지루성가려움','접촉성가려움','두드러기가려움','묘기증가려움',
'아토피밤에','아토피진물','아토피각질','습진진물','한포진물집','한포진통증'
];
(async()=>{
  const store=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{done:[],kw:{}};
  const done=new Set(store.done);
  const todo=SEEDS.filter(s=>!done.has(s));
  console.error('seeds',SEEDS.length,'todo',todo.length);
  let n=0;
  for(const s of todo){
    try{
      const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(s)+'&showDetail=1',null,3808925,3);
      const L=(r&&r.keywordList)||[];
      for(const k of L){
        const pc=String(k.monthlyPcQcCnt).replace('< ','').replace(/[^0-9]/g,'')||'0';
        const mo=String(k.monthlyMobileQcCnt).replace('< ','').replace(/[^0-9]/g,'')||'0';
        store.kw[k.relKeyword]={pc:+pc,mo:+mo,comp:k.compIdx,depth:k.plAvgDepth,
          ctrM:k.monthlyAveMobileCtr,clkM:k.monthlyAveMobileClkCnt};
      }
      store.done.push(s);
      if(++n%10===0){fs.writeFileSync(F,JSON.stringify(store));console.error(' ',n,'/',todo.length,'unique',Object.keys(store.kw).length);}
    }catch(e){console.error('  fail',s,e.message.slice(0,60));}
    await sleep(350);
  }
  fs.writeFileSync(F,JSON.stringify(store));
  console.log('DONE seeds',store.done.length,'unique keywords',Object.keys(store.kw).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
