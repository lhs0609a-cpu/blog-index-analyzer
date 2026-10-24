const fs=require('fs');const D='reports/medilon_20260921/';
const raw=JSON.parse(fs.readFileSync(D+(process.env.WAVE||'ac_raw')+'.json','utf8'));
const live=new Set(JSON.parse(fs.readFileSync(D+'kwclass.json','utf8')).map(r=>r.kw.replace(/\s/g,'').toLowerCase()));
const all=new Map();
for(const [seed,v] of Object.entries(raw))for(const x of v){const n=x.replace(/\s/g,'').toLowerCase();
  if(!all.has(n))all.set(n,x);}
const MED=/병원|의원|치과|한의원|한방|약국|약사|의사|전문의|수의사|동물병원|간호|의료|메디컬|메디칼|닥터|제약|요양|개원|개국|의대|치대|한의대|약대|전공의|레지던트|페이닥|봉직|원장|클리닉|조무사|물리치료|방사선사|임상병리|치위생|한약사|산후조리/;
const FIN=/대출|론$|론[가-힣]|자금|융자|마이너스통장|마통|대환|담보|금리|한도|캐피탈|저축은행|급전|신용|상환|연체|채무|회생|파산|빚|권리금|인수|개원비용|창업비용|리스|할부|보증|정책/;
const med=[...all.values()].filter(x=>MED.test(x));
const medfin=med.filter(x=>FIN.test(x));
const missing=medfin.filter(x=>!live.has(x.replace(/\s/g,'').toLowerCase()));
const haveIt=medfin.length-missing.length;
console.log('자동완성 수집 고유',all.size,'· 의료 관련',med.length,'· 의료×금융',medfin.length);
console.log('그중 계정에 이미 있음',haveIt,'· 미등록',missing.length);
fs.writeFileSync(D+'ac_missing.json',JSON.stringify(missing,null,1));
console.log('\n[미등록 의료×금융]');console.log(missing.join(' | '));
const medOnly=med.filter(x=>!FIN.test(x)&&!live.has(x.replace(/\s/g,'').toLowerCase()));
console.log('\n[미등록 의료(금융어 없음) '+medOnly.length+']');console.log(medOnly.slice(0,120).join(' | '));
