// 위례해오름 — 환자 검색 키워드 발굴 (READ-ONLY, /keywordstool)
const fs=require('fs'),path=require('path');
const {req,pool}=require('./_sojam_naver');
const CID=3808925;               // 로컬 .env 키 (시장 데이터 조회용)
const OUT=path.join(__dirname,'_wh2_discover_raw.json');

const REGION=['위례','위례동','위례신도시','창곡동','학암동','장지동','문정동','가락동',
 '마천동','거여동','복정동','오금동','방이동','석촌동','삼전동','송파','송파구','잠실',
 '성남','성남시','수정구','산성동','단대동','수진동','신흥동','태평동','신촌동','양지동',
 '하남','하남시','감일동','감북동','미사','덕풍동','신장동','풍산동',
 '강동','강동구','천호동','둔촌동','명일동','고덕동','상일동','길동',
 '가천대','복정역','장지역','문정역','산성역','남위례','우남역','마천역','거여역',
 '가락시장역','송파나루역','잠실역','석촌역','강남','수서','세곡동','자곡동','율현동','일원동'];

const AXIS=['한의원','한방병원','한의원추천','다이어트한의원','한방다이어트','비만한의원',
 '교통사고한의원','교통사고한방병원','추나요법','도수치료','허리디스크한의원','목디스크한의원',
 '척추측만증','거북목','오십견','무릎통증한의원','담적한의원','담적','소화불량한의원',
 '역류성식도염한의원','과민성대장증후군한의원','비염한의원','축농증한의원','알레르기비염',
 '성장한의원','키성장','성조숙증','소아한의원','한약','보약','공진단','경옥고','녹용',
 '산후보약','산후조리한약','생리통한의원','생리불순','난임한의원','갱년기한의원','자궁근종',
 '다낭성난소증후군','두통한의원','편두통','어지럼증한의원','이명한의원','불면증한의원',
 '공황장애한의원','만성피로한의원','안면마비','구안와사','대상포진한의원','수족냉증',
 '아토피한의원','두드러기한의원','건선한의원','탈모한의원','턱관절','이석증','수험생한약'];

const seeds=new Set();
for(const a of AXIS) seeds.add(a);
for(const r of REGION) for(const a of ['한의원','한방병원','다이어트한의원','교통사고한의원','비염한의원','성장한의원','추나','보약','한약','산후조리']) seeds.add(r+a);
const SEEDS=[...seeds];

function num(v){ // "< 10" 함정 방어
  if(v===null||v===undefined) return {n:0,lt10:false};
  const s=String(v);
  if(s.indexOf('<')>=0) return {n:0,lt10:true};
  const d=s.replace(/[^0-9]/g,'');
  return {n:d?parseInt(d,10):0,lt10:false};
}

(async()=>{
  const store={};
  const chunk=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
  let wave=SEEDS, seen=new Set(SEEDS), W=Number(process.argv[2]||2);
  for(let w=0;w<W;w++){
    const batches=chunk(wave,5);
    console.log(`wave ${w+1}: 시드 ${wave.length} / 배치 ${batches.length}`);
    let done=0;
    const res=await pool(batches,3,async b=>{
      const q=encodeURIComponent(b.join(','));
      const r=await req('GET',`/keywordstool?hintKeywords=${q}&showDetail=1`,null,CID,4);
      if(++done%40===0) console.log(`  ${done}/${batches.length}`);
      return (r&&r.keywordList)||[];
    });
    const next=new Set();
    for(const list of res){
      if(!Array.isArray(list)) continue;
      for(const k of list){
        const kw=(k.relKeyword||'').trim(); if(!kw) continue;
        const pc=num(k.monthlyPcQcCnt), mo=num(k.monthlyMobileQcCnt);
        if(!store[kw]) store[kw]={kw,pc:pc.n,mo:mo.n,pcLt:pc.lt10,moLt:mo.lt10,
          comp:k.compIdx||'',adCnt:k.plAvgDepth||0,
          ctrPc:k.monthlyAvePcCtr||0,ctrMo:k.monthlyAveMobileCtr||0};
        if(!seen.has(kw)&&(pc.n+mo.n)>=50){ next.add(kw); }
      }
    }
    if(w+1<W){ wave=[...next].slice(0,3000); wave.forEach(x=>seen.add(x)); }
  }
  fs.writeFileSync(OUT,JSON.stringify(store));
  console.log('수집 고유',Object.keys(store).length);
})();
