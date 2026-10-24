const fs=require('fs'),path=require('path');
const {req,sleep}=require('./_sojam_naver');
const OUT=path.join(__dirname,'../reports/sojam-20260910');
const F=path.join(OUT,'_kwtool_raw.json');
const ITCH=/가려|가렵|간지|소양|긁|따가|따끔|화끈|작열|진물|쓰라/;
const EXTRA=[
// 고관여 · 치료처 탐색
'피부병원추천','피부한의원','한방피부과','피부질환한의원','피부질환병원','난치성피부','만성피부병',
'피부과안낫는','피부병안낫는','피부병완치','피부질환완치','피부병근본치료','피부한약','피부명의',
'스테로이드끊기','스테로이드부작용','탈스테로이드','리바운드','스테로이드연고부작용','면역억제제',
'듀피젠트','두피젠트','생물학적제제','광선치료','자외선치료',
// 통증 · 감각이상
'통증','신경통','저림','욱신거림','쓰림','피부열감','피부화끈','피부작열','감각이상','따끔',
// 악화 · 시간 · 생활파괴
'밤에심해지는','새벽에심해지는','스트레스피부질환','수면장애','불면','일상생활불가','업무불가',
'긁어서피','상처딱지','2차감염','세균감염','진물딱지','림프액',
// 부위 확장
'귀뒤가려움','겨드랑이습진','유륜가려움','배꼽가려움','발목가려움','손목가려움','허리가려움',
'정강이가려움','팔꿈치안쪽가려움','무릎뒤가려움','턱가려움','인중가려움','두피따가움','두피통증',
'목뒤가려움','어깨가려움','등한가운데가려움','겨드랑가려움','회음부가려움','음낭가려움','외음부가려움'
];
(async()=>{
  const store=JSON.parse(fs.readFileSync(F,'utf8'));
  const done=new Set(store.done);
  const found=Object.keys(store.kw).filter(k=>ITCH.test(k)&&(store.kw[k].pc+store.kw[k].mo)>=100);
  const seeds=[...new Set([...found,...EXTRA])].filter(s=>!done.has(s));
  console.error('wave2 seeds',seeds.length);
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
      if(++n%20===0){fs.writeFileSync(F,JSON.stringify(store));console.error(' ',n,'/',seeds.length,'unique',Object.keys(store.kw).length);}
    }catch(e){console.error('  fail',s,e.message.slice(0,50));}
    await sleep(320);
  }
  fs.writeFileSync(F,JSON.stringify(store));
  console.log('DONE seeds',store.done.length,'unique',Object.keys(store.kw).length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
