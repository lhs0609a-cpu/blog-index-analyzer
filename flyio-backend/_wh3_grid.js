// 위례해오름 — 통원 가능 지역 × 한의원 진료 질환 전 격자 실검색량 조회 (READ-ONLY, 로컬 키)
// 힌트 자체의 볼륨 + 응답 연관어 중 '지역 토큰으로 시작하는 것' 전부를 모은다.
const fs=require('fs'),path=require('path');
const {req,pool}=require('./_sojam_naver');
const CID=3808925, D=__dirname;
const OUT=path.join(D,'_wh3_grid_vol.json'), DONE=path.join(D,'_wh3_grid_done.json');
const R=JSON.parse(fs.readFileSync(path.join(D,'_wh3_regions.json'),'utf8'));
// 시드 격자는 대표 지역만(동·역 이형은 연관어로 들어온다). 전 토큰은 연관어 필터에 쓴다.
const SEED_REGIONS=R.tokens.filter(t=>!/[0-9]동$/.test(t));
const DISEASE=[
 '한의원','한방병원','한의원추천','잘하는한의원','야간한의원','일요일한의원','여성한의원','소아한의원',
 '한약','보약','공진단','경옥고','녹용','총명탕','침','약침','봉침','추나','추나요법','부항','뜸',
 '교통사고','교통사고한의원','교통사고입원','교통사고후유증','자동차사고','디스크','허리디스크','목디스크',
 '허리통증','목통증','어깨통증','무릎통증','손목통증','발목염좌','골반통증','오십견','거북목','일자목',
 '척추측만증','골반교정','체형교정','자세교정','턱관절','좌골신경통','척추관협착증','관절염','퇴행성관절염',
 '족저근막염','테니스엘보','손목터널증후군','방아쇠수지','담결림','근막통증','섬유근육통','통풍','류마티스',
 '다이어트','다이어트한약','한방다이어트','비만','산후다이어트','부종','체중감량',
 '담적','담적병','소화불량','역류성식도염','위염','과민성대장','과민성대장증후군','변비','설사','식욕부진',
 '두통','편두통','만성두통','어지럼증','이명','이석증','메니에르','불면증','수면장애','공황장애','우울증',
 '불안장애','화병','자율신경실조증','만성피로','기력회복','안면마비','구안와사','대상포진','신경통',
 '비염','알레르기비염','축농증','코막힘','후비루','기침','감기','천식','면역력',
 '아토피','두드러기','습진','건선','한포진','지루성피부염','여드름','탈모','원형탈모','백반증','사마귀',
 '수족냉증','다한증','안면홍조','갑상선','당뇨','고혈압','고지혈증',
 '생리통','생리불순','난임','불임','임신준비','시험관','습관성유산','유산후조리','갱년기','산후조리','산후보약',
 '산후풍','다낭성난소증후군','자궁근종','질염','냉대하','방광염','요실금','전립선',
 '성장','키성장','성장클리닉','성조숙증','틱장애','ADHD','야뇨증','수험생','집중력','소아비염','소아아토피',
 '중풍','뇌졸중후유증','파킨슨','치매','기억력','입냄새','구내염','안구건조증','수술후회복','암치료','항암후유증'];
const store=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{};
const done=new Set(fs.existsSync(DONE)?JSON.parse(fs.readFileSync(DONE,'utf8')):[]);
const grid=[];
for(const r of SEED_REGIONS) for(const d of DISEASE){ const k=(r+d).replace(/\s+/g,''); if(!done.has(k)) grid.push(k); }
const TOK=R.tokens;
const startsRegion=k=>TOK.some(t=>k.startsWith(t));
function num(v){ if(v==null) return {n:0,lt:false}; const s=String(v);
  if(s.indexOf('<')>=0) return {n:0,lt:true}; const d=s.replace(/[^0-9]/g,''); return {n:d?parseInt(d,10):0,lt:false}; }
const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
console.log(`시드 지역 ${SEED_REGIONS.length} × 질환 ${DISEASE.length} → 미조회 ${grid.length}`);
(async()=>{
  const B=chunk(grid,5); let n=0, err=0;
  await pool(B,4,async b=>{
    let r=null;
    try{ r=await req('GET',`/keywordstool?hintKeywords=${encodeURIComponent(b.join(','))}&showDetail=1`,null,CID,4); }
    catch(e){ err++; }
    if(r&&r.keywordList){
      for(const k of r.keywordList){
        const kw=(k.relKeyword||'').replace(/\s+/g,''); if(!kw||!startsRegion(kw)) continue;
        const pc=num(k.monthlyPcQcCnt),mo=num(k.monthlyMobileQcCnt);
        store[kw]={pc:pc.n,mo:mo.n,pcLt:pc.lt,moLt:mo.lt,comp:k.compIdx||'',adCnt:k.plAvgDepth||0};
      }
      b.forEach(x=>done.add(x));
    }
    if(++n%200===0){ fs.writeFileSync(OUT,JSON.stringify(store)); fs.writeFileSync(DONE,JSON.stringify([...done]));
      console.log(`  ${n}/${B.length}  수집 ${Object.keys(store).length}  오류 ${err}`); }
  });
  fs.writeFileSync(OUT,JSON.stringify(store)); fs.writeFileSync(DONE,JSON.stringify([...done]));
  console.log(`완료: 배치 ${B.length} / 지역형 키워드 수집 ${Object.keys(store).length} / 오류배치 ${err}`);
})();
