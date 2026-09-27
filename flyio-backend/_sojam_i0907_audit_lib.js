const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why,REGION:R1}=require('./_sojam_d0828_rule.js');
const {isDerm}=require('./_sojam_e0831_derm.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const GANGNAM=['강남','강남역','신논현','논현','신사','압구정','청담','삼성','선릉','역삼','서초','교대','방배','양재','매봉','도곡','대치','한티','개포','일원','수서','잠원','반포','고속터미널','학동','언주','삼성중앙','봉은사','서울','수도권','전국'];
let R2=[];try{const src=fs.readFileSync(P('_sojam_e0831_bare.js'),'utf8');const m=src.match(/const REGION=\[([\s\S]*?)\];/);if(m)R2=[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);}catch(e){}
const OTHER=[...new Set([...R1,...R2])].filter(r=>!GANGNAM.includes(r)&&r.length>=2).filter(r=>!['삼성'].includes(r));
const EXCL=[['대상포진',/대상포진|헤르페스조스터|조스터/],['사마귀',/사마귀/],['홍조',/홍조/],
 ['검사·진단',/검사|진단(?!.*공진단)|알러지테스트|알레르기테스트/],
 ['주사(시술)',/예방접종|접종|태반주사|백옥주사|신데렐라주사|줄기세포|골다공증주사|영양주사|비타민주사|마늘주사|감초주사|링거|수액/],
 ['비피부질환',/중이염|식도염|위염|류마티스|골다공증|면역력|백일해|갑상선|공황|불면|자궁|디스크|이명|비염|축농증|천식|당뇨|고혈압|통풍|관절/],
 ['통증',/통증(?!.*가려)/]];
const AMBIG={'가락':/가락(동|시장|역|한의원|병원|피부)/,'일광':/^일광(?!화상|노출|알레르기|피부염)/,'동백':/동백(동|역|한의원|병원|피부)/,'수지':/^수지(?!침|점|요법)|수지(구|한의원|병원|피부)/,'중동':/중동(역|한의원|병원|피부)/,'성동':/성동(구|역|한의원|병원)/,'신사':/^신사(동|역|한의원|병원|피부)/,'구의':/구의(동|역|한의원|병원)/,'서면':/^서면(?!.)|서면(역|한의원|병원)/,'연수':/연수(구|동|한의원)/};
const otherRegion2=kw=>OTHER.find(r=>AMBIG[r]?AMBIG[r].test(kw):kw.includes(r))||null;
function verdict(kw){const w=why(kw);if(w&&!/^타지역/.test(w))return w;
 for(const [n,re] of EXCL) if(re.test(kw)) return n;
 if(w)return w; const r=otherRegion2(kw); if(r)return '타지역';
 if(bare(kw))return '지역+업종만'; if(!isDerm(kw))return '비피부'; return null;}
module.exports={verdict};
