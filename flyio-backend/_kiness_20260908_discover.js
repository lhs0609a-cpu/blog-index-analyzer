const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const P=n=>path.join(__dirname,'_kiness_20260908_'+n+'.json');
const branches={강남:['강남','역삼','대치','도곡','선릉','개포','압구정'],잠실:['잠실','송파','석촌','삼전','강동','가락'],목동:['목동','양천','신정','신월','강서','화곡'],반포:['반포','서초','잠원','방배','교대'],성북:['성북','길음','돈암','종암','정릉','노원'],마포:['마포','홍대','상수','공덕','서대문','은평'],분당:['분당','성남','정자','수내','서현','판교'],일산:['일산','고양','주엽','정발산','백석','파주'],부천:['부천','상동','중동','소사','부평'],수원:['수원','영통','광교','권선','장안','팔달','동탄','화성'],평촌:['평촌','안양','범계','군포','산본','의왕'],평택:['평택','송탄','안성','고덕'],수지:['수지','용인','죽전','성복','풍덕천','기흥'],송도:['송도','인천','연수','청라','논현동'],대구:['대구','수성구','수성','범어','만촌','경산'],부산:['부산','동래','연산','해운대','금정','사직','양산'],창원:['창원','마산','진해','성산','상남','김해']};
const places=Object.values(branches).flat().sort((a,b)=>b.length-a.length);
const place=k=>places.find(r=>k.startsWith(r)||k.endsWith(r))||null;
const branch=k=>{const r=place(k);return r?Object.keys(branches).find(b=>branches[b].includes(r)):null;};
const src=fs.readFileSync(path.join(__dirname,'data/journey_lexicon.py'),'utf8');
const regionBlock=src.slice(src.indexOf('REGION_TOKENS:'),src.indexOf('\n]',src.indexOf('REGION_TOKENS:')));
const regions=[...new Set([...places,...'강북 과천 광명 금천 기장 김제 논산 논현 정읍 연제 김천 덕양 상주 삼척 이천 칠곡 성동 밀양 함안 광양 동안 상록 동해 도봉 동대문 문경 사하 사천 중원 단원 홍천 만안 담양 서귀포 달서 구파발 난곡 중계 진영 옥정 오산 양주 동두천 포천 여주 가평 양평 의성 영주 영천 안동 영덕 영동 보령 당진 태안 서천 홍성 예산 계룡 청양 정선 철원 인제 고성 양양 완주 나주 무안 해남 영암 장성 순창 남원 김포 통영 거창 합천 남해 하동 진천 증평 음성 옥천'.split(' '),...[...regionBlock.matchAll(/"([^"]+)"/g)].map(m=>m[1])])];
const regionClinic=k=>/(?:키성장|성장)클리닉/.test(k)&&regions.some(r=>k.startsWith(r)||k.endsWith(r));
regions.push(...'삼성동 양재 구리 아현 운정 강화 대화 마두 풍산 호매실 동백 보정 미추홀 달성 장유 의창 합포 율하 남동 구월 만수 간석 서창 검단 계산 공릉 구성 노은 대학로 문정 방이 봉선 상계 상무 서구 센텀 송내 야탑 오리 월계 창녕 하계 수서 천호 계양 다산 미사 별내 주안 처인 공주 마곡 등촌 연천 불당 고흥 강진 곡성 고창 구례 금산 단양 장흥 태백 화순 중구 동구 사상 북구부산 고령'.split(' '));
function classify(k){
 k=k.replace(/\s/g,'');
 if(/키네스타시스|키네스테틱/.test(k))return {tier:'exclude',score:0,branch:null};
 if(/키네스/.test(k))return {tier:'brand',score:100,branch:branch(k)};
 if(/함소아|톨앤핏|키넥스|서정한의|고시환|아주대|고려대|연세대|한의원|한방|한약|대학병원|성장클리닉세트/.test(k))return {tier:'exclude',score:0,branch:branch(k)};
 if(regionClinic(k))return {tier:'region_clinic',score:95,branch:branch(k)};
 if(/(?:키성장|성장)클리닉/.test(k)&&!/주식|채용|논문|영어/.test(k))return {tier:'clinic',score:85,branch:branch(k)};
 if(/영양제|비타민|칼슘|유산균|홍삼|녹용|한약|한의원|한방|주사|호르몬|수술|정형외과|대학병원|보건소|실비|보험|신발|깔창|운동화|교복|장난감|필통|선물|주식|채용|논문|다운로드|계산|평균키|성장표|표준키|키재는|마사지|기구|기계|키작은남자키큰여자/.test(k))return {tier:'exclude',score:0,branch:branch(k)};
 if(/키성장센터|성장센터|성장정밀검사|성장검사|성장판검사|키성장검사|성장상담|키성장상담|키성장프로그램|키크는센터/.test(k))return {tier:'consult',score:place(k)?90:80,branch:branch(k)};
 if(/키성장|키크는|키크기|저신장|작은키|키작은|성장부진|성장지연|예상키|예측키/.test(k)&&!/성인|군대|20대|30대|40대|50대/.test(k))return {tier:'growth',score:/비용|가격|상담|검사|센터|관리|프로그램/.test(k)?75:55,branch:branch(k)};
 if(/성조숙|소아비만|어린이비만|청소년비만|(?:어린이|청소년|아동|초등학생)(?:자세|체형|척추)/.test(k))return {tier:'adjacent',score:40,branch:branch(k)};
 return {tier:'other',score:10,branch:branch(k)};
}
async function main(){
 const seeds=new Set(['키네스','성장클리닉','키성장클리닉','키성장센터','성장정밀검사','성장판검사','성장검사비용','키성장상담','키성장프로그램','키성장운동','저신장검사','성장부진','초등학생키성장','중학생키성장','청소년키성장','어린이성장검사','예상키검사','사춘기키성장','키크는운동','고등학생키성장']);
 for(const b of Object.keys(branches))for(const tail of ['성장클리닉','키네스','성장검사','키성장센터'])seeds.add(b+tail);
 const chunks=[],arr=[...seeds];for(let i=0;i<arr.length;i+=5)chunks.push(arr.slice(i,i+5));
 const r=await pool(chunks,2,x=>req('GET','/keywordstool?hintKeywords='+encodeURIComponent(x.join(','))+'&showDetail=1',null,441986));
 const map=new Map();for(const x of r)for(const k of x.keywordList||[])map.set(k.relKeyword.replace(/\s/g,''),k);
 const generated=new Set();
 for(const r of places)for(const tail of ['성장클리닉','키성장클리닉','성장센터','키성장센터','성장검사','키성장검사','성장정밀검사','성장판검사','키성장상담','키성장프로그램'])for(const suffix of ['','비용','추천','상담'])generated.add(r+tail+suffix);
 for(const a of ['초등학생','중학생','고등학생','청소년','어린이','남자아이','여자아이','사춘기','초등남아','초등여아'])for(const b of ['키성장','성장검사','성장클리닉','키성장센터','키성장프로그램','키성장상담'])for(const s of ['','비용','상담','추천'])generated.add(a+b+s);
 const result={seedCount:seeds.size,errors:r.filter(x=>x.__err),related:[...map].map(([kw,data])=>({kw,...classify(kw),data})),generated:[...generated].map(kw=>({kw,...classify(kw)}))};
 fs.writeFileSync(P('discovery'),JSON.stringify(result));console.log({seeds:seeds.size,related:map.size,generated:generated.size,qualified:result.related.filter(x=>x.score>=55).length,errors:result.errors});
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={branches,places,place,branch,classify};
