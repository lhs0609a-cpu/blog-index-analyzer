// 소잠 진료범위 전반 키워드 발굴 — 네이버 키워드도구 2홉 (재개 가능)
//   node _sojam_f0901_research2.js [hop]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const EST='3808925', OUT=P('_sojam_f0901_research2.json');
const DEADLINE=Date.now()+8.2*60*1000;
const SEEDS=[
 // 아토피
 '아토피','성인아토피','아토피피부염','소아아토피','아기아토피','태열','아토피가려움','아토피치료',
 '아토피한의원','아토피음식','아토피보습제','아토피진물','아토피각질','아토피밤에가려움',
 // 지루성·두피
 '지루성피부염','지루성두피염','두피가려움','비듬','두피각질','두피염','두피뾰루지','두피진물',
 '얼굴지루성피부염','지루성피부염화장품','두피지루성피부염','머리비듬','두피건선',
 // 습진
 '습진','주부습진','화폐상습진','손습진','발습진','한포진','물집습진','습진연고','만성습진',
 '아토피습진','접촉성피부염','자극성접촉피부염','금속알레르기',
 // 가려움
 '가려움증','피부가려움','전신가려움','몸가려움','밤에가려움','다리가려움','등가려움','얼굴가려움',
 '손가락가려움','발가락가려움','목가려움','팔가려움','두드러기가려움','피부소양증','노인성소양증',
 '스트레스가려움','샤워후가려움','땀나면가려움','옷쓸림가려움',
 // 백반증·색소
 '백반증','백반증초기','백반증치료','백색비강진','흑색가시세포증',
 // 모낭염·종기
 '모낭염','두피모낭염','종기','엉덩이종기','봉와직염','화농성한선염','피부농양','절종','조갑주위염',
 // 진균
 '무좀','발무좀','손무좀','손톱무좀','백선','어루러기','칸디다','간찰진','완선',
 // 땀·다한증
 '땀띠','다한증','수족다한증','겨드랑이다한증','액취증','한포진땀',
 // 알레르기
 '알레르기','알레르기피부염','음식알레르기','알레르기검사','햇빛알레르기','한랭두드러기',
 // 구강
 '구순염','구내염','구각염','입술포진','구강편평태선','구강작열감','설염','혀갈라짐','아프타구내염',
 // 탈스
 '탈스테로이드','스테로이드부작용','스테로이드리바운드','듀피젠트','면역억제제',
 // 기타 난치 피부
 '결절성양진','피부묘기증','장미색비강진','편평태선','경화성태선','어린선','농가진','수족구',
 '켈로이드','비후성흉터','피부건조증','각질','태선화','자가면역피부질환','베체트병','천포창',
 '유천포창','루푸스피부','피부혈관염','자반증','괴저성농피증','스티븐스존슨증후군',
 '기저귀발진','신생아여드름','유아습진','임신소양증','임신두드러기','갱년기피부',
 '피부질환','난치성피부질환','만성피부질환','피부한의원','한방피부치료',
];
const load=()=>fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{done:[],kw:{}};
(async()=>{
 const st=load(); const done=new Set(st.done);
 const hop=Number(process.argv[2]||1);
 let queue;
 if(hop===1) queue=SEEDS.filter(s=>!done.has(s));
 else {
  const SKIN=/아토피|지루|습진|한포진|가려움|간지|소양|백반|모낭염|종기|봉와직염|한선염|무좀|백선|어루러기|칸디다|간찰|완선|땀띠|다한증|액취|알레르기|알러지|구순|구내염|구각|포진|편평태선|작열감|설염|혀갈라짐|스테로이드|듀피젠트|양진|묘기증|비강진|태선|어린선|농가진|수족구|켈로이드|흉터|각질|건조|천포창|루푸스|혈관염|자반증|농피증|발진|두피|비듬|피부/;
  queue=Object.keys(st.kw).filter(k=>SKIN.test(k)&&(st.kw[k].pc+st.kw[k].mo)>=300&&!done.has(k)).slice(0,900);
 }
 console.error(`hop${hop} — 큐 ${queue.length} (완료 ${done.size} · 수집 ${Object.keys(st.kw).length})`);
 let i=0,n=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(i<queue.length){
   if(Date.now()>DEADLINE)break;
   const s=queue[i++];
   try{
    const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(s)+'&showDetail=1',null,EST);
    for(const k of (r.keywordList||[])){
     const pc=k.monthlyPcQcCnt==='< 10'?5:Number(k.monthlyPcQcCnt)||0;
     const mo=k.monthlyMobileQcCnt==='< 10'?5:Number(k.monthlyMobileQcCnt)||0;
     st.kw[k.relKeyword]={pc,mo,comp:k.compIdx||''};
    }
    done.add(s);
   }catch(e){ if(/429|rate/i.test(String(e))) await sleep(3000); }
   if(++n%40===0){st.done=[...done];fs.writeFileSync(OUT,JSON.stringify(st));console.error(`  ${n}/${queue.length} · 수집 ${Object.keys(st.kw).length}`);}
   await sleep(330);
  }
 }));
 st.done=[...done]; fs.writeFileSync(OUT,JSON.stringify(st));
 console.error(`hop${hop} 종료 — 시드 ${done.size} · 수집 ${Object.keys(st.kw).length}`);
})();
