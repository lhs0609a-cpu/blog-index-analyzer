const fs=require('fs');const D='reports/medilon_20260921/';
const kw=JSON.parse(fs.readFileSync(D+'kwclass.json','utf8'));
const MOD=/(금리비교|한도조회|신청방법|저금리|금리|한도|조건|신청|비교|후기|서류|승인|상담|자격|심사|추천|순위|지원|절차|방법|가격|비용)$/;
const head=new Set();
for(const r of kw){ if(!/^A_|^B_/.test(r.cat)) continue;
  const base=r.kw.replace(MOD,'');
  if(base.length>=3&&base.length<=12) head.add(base);
  if(r.kw.length<=10) head.add(r.kw); }
// 자동완성으로 찾은 미등록 후보
const g1=JSON.parse(fs.readFileSync(D+'ac_missing.json','utf8'));
fs.writeFileSync(D+'gap_raw.json',JSON.stringify(g1));
const SUBJ=['병원','의원','치과','치과의원','한의원','한방병원','약국','동물병원','요양병원','요양원','산후조리원','검진센터','클리닉',
 '내과','정형외과','피부과','성형외과','안과','이비인후과','소아과','산부인과','신경외과','비뇨기과','정신과','재활의학과','가정의학과','마취통증의학과','치과교정과'];
const T=['개원비용','개원자금','권리금','인수비용','양도양수','양수도','매매','승계','개원컨설팅','인테리어비용','개설비용','창업비용','임대료','보증금','의료장비리스','장비리스','개원대출','인수대출','권리금대출'];
const cand=new Set();
for(const s of SUBJ)for(const t of T)cand.add(s+t);
for(const x of g1)cand.add(x.replace(/\s/g,''));
for(const x of ['전문직대출','의료인대출','고소득자대출','의사신용대출','약사신용대출','메디컬론','메디칼론','닥터론','의사마이너스통장','약사마이너스통장','의대생마이너스통장','전공의대출','페이닥터대출','봉직의대출','개원의대출','병원운영자금','약국운영자금','병원급전','약국급전','의사급전','병원사업자대출','약국사업자대출','의료기기할부','의료기기리스','병원대환대출','약국대환대출'])cand.add(x);
fs.writeFileSync(D+'headlist.json',JSON.stringify([...head]));
fs.writeFileSync(D+'gaplist.json',JSON.stringify([...cand]));
console.log('헤드',head.size,'· 갭후보',cand.size);
