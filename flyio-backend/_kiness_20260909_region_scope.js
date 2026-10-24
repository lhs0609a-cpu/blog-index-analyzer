const fs=require('fs'),path=require('path');const {evaluate}=require('./_kiness_review_rubric');
console.log('evaluate 반환 형태:',JSON.stringify(evaluate('강남성장클리닉')));
const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const list=JSON.parse(fs.readFileSync(path.join(D,'region_clinic_keywords.json'),'utf8'));
const meas=list.filter(r=>(r.vol>0)||r.imp7>0);
console.log('성장클리닉 계열',list.length,'| 검색량 또는 노출이 있는 것',meas.length,
 '(검색량>0',list.filter(r=>r.vol>0).length,', 7일노출>0',list.filter(r=>r.imp7>0).length,')');
const t={};for(const r of list){t[r.tier]=(t[r.tier]||0)+1;}
console.log('티어 분포',JSON.stringify(t));
fs.writeFileSync(path.join(D,'region_clinic_measurable.json'),JSON.stringify(meas));
