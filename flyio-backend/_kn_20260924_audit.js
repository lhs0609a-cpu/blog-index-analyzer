const fs=require('fs');const D=__dirname+'/reports/kiness_20260923/';
const inv=JSON.parse(fs.readFileSync(D+'inventory_final5.json'));
const uniq=new Set(inv.kw.map(r=>r[2]));
const lines=fs.readFileSync(D+'address.csv','utf8').split(/\r?\n/).slice(1).filter(l=>l.trim());
const sido=new Set(),sgg=new Set(),emd=new Set(),ri=new Set();
for(const l of lines){const [code,name,st]=l.split('\t');if(st!=='존재')continue;
 const c=String(code).padStart(10,'0');const last=name.trim().split(/\s+/).pop();
 if(c.slice(2,5)==='000')sido.add(last);
 else if(c.slice(5,8)==='000')sgg.add(last);
 else if(c.slice(8,10)==='00')emd.add(last);
 else ri.add(last);}
const cut=(s,re)=>{const o=new Set();for(const x of s){const y=x.replace(re,'');if(y.length>=2&&y!==x&&!/\d$/.test(y))o.add(y);}return o;};
const st=JSON.parse(fs.readFileSync(D+'stations_audit.json'));
const stAll=new Set([...st,...[...uniq].map(k=>{const m=k.match(/^(.+역)체형교정$/);return m&&m[1];}).filter(Boolean)]);
const stem=new Set([...stAll].map(x=>x.slice(0,-1)).filter(x=>x.length>=2));
const tiers={'시도':sido,'시도 축약':cut(sido,/(특별시|광역시|특별자치시|특별자치도|자치도|도)$/),
 '시군구':sgg,'시군구 축약':cut(sgg,/(시|군|구)$/),
 '법정동':emd,'법정동 축약':cut(emd,/(동|읍|면|가|리)$/),
 '철도·지하철역':stAll,'역 지명':stem};
const axes=['성장클리닉','키성장클리닉','키성장','자세교정','체형교정'];
console.log('티어'.padEnd(16)+'총수'.padStart(7)+axes.map(a=>a.padStart(9)).join(''));
const gaps={};
for(const [tn,set] of Object.entries(tiers)){
 const row=[];
 for(const a of axes){const miss=[...set].filter(x=>!uniq.has(x+a));
  row.push((miss.length?String(set.size-miss.length):'100%').padStart(9));
  if(miss.length)(gaps[tn]=gaps[tn]||{})[a]=miss;}
 console.log(tn.padEnd(16)+String(set.size).padStart(7)+row.join(''));
}
console.log('\n법정리(마을)'.padEnd(16)+String(ri.size).padStart(7)+'  — 의도적으로 제외');
console.log('\n인스턴스',inv.kw.length,'/100000');
if(Object.keys(gaps).length){console.log('\n남은 구멍:');
 for(const [t,o] of Object.entries(gaps))for(const [a,m] of Object.entries(o))console.log(' ',t,a,m.length,m.slice(0,12).join(','));}
else console.log('\n남은 구멍: 없음');
fs.writeFileSync(D+'audit_final.json',JSON.stringify(gaps));
