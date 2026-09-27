// 은밀부위 피부질환 키워드 발굴 — 네이버 키워드도구 2홉 확장 (재개 가능)
//   node _sojam_f0901_research.js [hop]
const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {req,sleep}=require('./_sojam_naver');
const EST='3808925';
const OUT=P('_sojam_f0901_research.json');
const DEADLINE=Date.now()+8.2*60*1000;

const SEEDS=[
 // 부위
 '고환','음낭','음경','귀두','성기','사타구니','서혜부','회음부','항문','외음부','음부','질',
 '유두','유륜','겨드랑이','엉덩이','허벅지안쪽','배꼽','팬티라인','비키니라인','항문주변','고간','불두덩',
 // 부위+증상
 '음낭습진','고환습진','사타구니습진','사타구니가려움','항문가려움','항문소양증','외음부가려움',
 '외음부소양증','회음부가려움','귀두염','귀두가려움','음경가려움','음낭가려움','고환가려움',
 '유두습진','유륜습진','유두가려움','겨드랑이가려움','엉덩이여드름','엉덩이종기','허벅지안쪽가려움',
 '팬티라인가려움','항문진물','항문각질','사타구니각질','사타구니착색','겨드랑이착색',
 // 질환명
 '완선','간찰진','화농성한선염','모낭염','곤지름','성기포진','음부포진','옴','백선','칸디다',
 '경화성태선','편평태선','외음부백반증','흑색가시세포증','진주양음경구진','포경','땀띠',
 '한선염','서혜부백선','항문습진','항문피부염','음부습진','음부가려움','질염','칸디다질염',
 '외음질염','세균성질염','트리코모나스','사면발이','모소낭','모소동','치루','치핵',
];
const load=()=>fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{done:[],kw:{}};
(async()=>{
 const st=load();
 const done=new Set(st.done);
 const hop=Number(process.argv[2]||1);
 let queue;
 if(hop===1) queue=SEEDS.filter(s=>!done.has(s));
 else {
  // 2홉: 1홉 결과 중 검색량 있고 은밀부위 관련인 것을 새 시드로
  const AREA=/고환|음낭|음경|귀두|(?<![만여남악양급독다])성기|사타구니|서혜|회음|항문|외음|음부|질염|유두|유륜|겨드랑이|엉덩이|팬티라인|비키니|허벅지|배꼽|고간|불두덩|완선|간찰진|한선염|곤지름|포진|옴|모소/;
  queue=Object.keys(st.kw).filter(k=>AREA.test(k)&&(st.kw[k].pc+st.kw[k].mo)>=100&&!done.has(k)).slice(0,400);
 }
 console.error(`hop${hop} — 큐 ${queue.length}개 (완료 ${done.size} · 수집 ${Object.keys(st.kw).length})`);
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
     st.kw[k.relKeyword]={pc,mo,comp:k.compIdx||'',depth:k.plAvgDepth||0};
    }
    done.add(s);
   }catch(e){ if(/429|rate/i.test(String(e))) await sleep(3000); }
   if(++n%25===0){st.done=[...done];fs.writeFileSync(OUT,JSON.stringify(st));console.error(`  ${n}/${queue.length} · 수집 ${Object.keys(st.kw).length}`);}
   await sleep(350);
  }
 }));
 st.done=[...done];
 fs.writeFileSync(OUT,JSON.stringify(st));
 console.error(`hop${hop} 종료 — 시드 완료 ${done.size} · 수집 키워드 ${Object.keys(st.kw).length}`);
})();
