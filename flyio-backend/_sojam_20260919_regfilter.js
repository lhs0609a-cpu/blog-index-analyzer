// 표본 80개 육안 검수에서 나온 오탐 패턴을 규칙화한다 (2026-09-19).
// 오탐 유형: 제품·브랜드명(비판텐/바세린/리도맥스/다이소), 약·약국·편의점, 시술·기기(레이저/광선치료/압출),
//            타 진료과(소아과/내과/이비인후), 외과 영역(항문주위농양), 타 질환(사마귀/곰팡이균=완선)
const fs=require('fs');
const PRODUCT=/비판텐|바세린|리도맥스|더모베이트|락티케어|데시틴|아토팜|세타필|피지오겔|아벤느|유세린|이소티논|이소트레티논|이소트레티노인|아큐탄|로아큐탄|다이소|올리브영|편의점|약국|약값|약$|약추천|약먹|연고|크림|로션|오일|세럼|앰플|토너|팩$|마스크팩|클렌징|폼클렌|클렌저|바디워시|워시|비누|샴푸|린스|트리트먼트|화장품|보습제|수딩젤|젤$|패치|스티커|영양제|유산균|보조제|한약재|차종류|수란트라|이베르멕틴|프로토픽|엘리델|듀악|디페린|아크네스|약졸림|약처방|약부작용|에스로반|쁘리마쥬|무피로신|후시딘|마데카솔/;
const PROC=/PDT|레이저|광선치료|자외선치료|압출|필링|필러|보톡스|아그네스|스케일링|톡톡|시술|기기|관리실|에스테틱|피부관리/;
const OTHERDEPT=/소아과|내과|이비인후|산부인과|정형외과|성형외과|가정의학|응급실|보건소|치과/;
const SURGICAL=/항문주위농양|항문농양|항문주변농양|항문종기|항문튀어나옴|항문출혈|항문열상|치질|치핵|치루|탈항|농양수술|절개배농/;
const OTHERDX=/사마귀|티눈|수두|헤르페스대상|대상포진|곰팡이균|무좀|백선|완선|어루러기|옴$|비립종|쥐젖|점빼기/;
const DREAM=/꿈|해몽/;
const INSUR=/실비|실손|보험/;
const STD=/성병|매독|임질|클라미디아/;
const PIGMENT=/착색|색소침착|흉터|자국/;                      // 원장 결정 대기 축 [[sojam-private-area-demand]]
const FAR=new RegExp(`(용인|동탄|수원|성남|창원|천안|대전|대구|부산|광주|인천|분당|일산|청주|전주|울산|제주|김해|포항|구미|원주|춘천|평택|화성|안산|안양|부천|의정부|남양주|파주|김포|시흥|광명|군포|이천|세종|목포|여수|순천|진주|양산|경주|아산|서산|공주|익산|군산|강릉|거제|통영|사천|밀양|나주|광양|서면|해운대|수성|동탄)`);
function judge(k){
  if(DREAM.test(k))return '꿈해몽';
  if(INSUR.test(k))return '보험·실비';
  if(STD.test(k))return '성병';
  if(SURGICAL.test(k))return '외과 영역';
  if(OTHERDX.test(k))return '타 질환·제외축';
  if(PRODUCT.test(k))return '제품·약';
  if(PROC.test(k))return '시술·기기';
  if(OTHERDEPT.test(k))return '타 진료과';
  if(PIGMENT.test(k))return '색소·흉터(원장 결정 대기)';
  return null;
}
module.exports={judge,FAR};
if(require.main===module){
  const rows=JSON.parse(fs.readFileSync('../reports/sojam-20260917/ac_missing_scored.json','utf8')).filter(r=>r.score>=40);
  const keep=[],drop={};
  for(const r of rows){const w=judge(r.k); if(w){(drop[w]=drop[w]||[]).push(r.k);}else keep.push({...r,far:FAR.test(r.k)});}
  fs.writeFileSync('../reports/sojam-20260919_regkeep.json',JSON.stringify(keep));
  console.log('후보',rows.length,'→ 통과',keep.length,'· 제외',rows.length-keep.length);
  for(const [k,v] of Object.entries(drop).sort((a,b)=>b[1].length-a[1].length))console.log('  '+k.padEnd(22)+String(v.length).padStart(5)+'  예: '+v.slice(0,5).join(', '));
  console.log('  통과분 중 타지역',keep.filter(r=>r.far).length,'· 그 외',keep.filter(r=>!r.far).length);
}
