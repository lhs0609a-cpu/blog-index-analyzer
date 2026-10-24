const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260921');
const V=JSON.parse(fs.readFileSync(path.join(__dirname,'_kiness_vols_20260810.json')));
const fresh=new Map();
for(const l of fs.readFileSync(path.join(D,'vols.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const o=JSON.parse(l);if(o.pc<0)continue;
 // 키워드도구가 PC·모바일 둘 다 "<10" 으로 주면 실볼륨 미미 -> 0 처리
 const lt=String(o.pcRaw).includes('<')&&String(o.moRaw).includes('<');
 fresh.set(o.k,lt?0:o.pc+o.mo);}
const vol=k=>{const f=fresh.get(k);if(f!==undefined)return f;const c=V[k];return c===undefined?null:(c===10?0:c);};
const out=JSON.parse(fs.readFileSync(path.join(D,'live_tiered.json')));
const A=out.filter(x=>x.t[0]==='A').map(x=>({...x,v:vol(x.kw)}));
const known=A.filter(x=>typeof x.v==='number');
console.log('A등급',A.length,'볼륨확보',known.length,'미확보',A.length-known.length);
// 1) 노출 0 + 실수요
const gap=known.filter(x=>x.imp===0&&x.v>=20).sort((a,b)=>b.v-a.v);
fs.writeFileSync(path.join(D,'gap_A.json'),JSON.stringify(gap));
console.log('\n[전량미노출] 7일 노출 0 이면서 월검색 20+ :',gap.length,'개 / 월검색 합계',gap.reduce((a,x)=>a+x.v,0));
// 2) 노출은 되지만 점유율이 낮다
const thin=known.filter(x=>x.imp>0&&x.v>=50).map(x=>{const e=Math.max(1,Math.round(x.v*7/30));return {...x,e,share:x.imp/e};})
 .filter(x=>x.share<0.5).sort((a,b)=>(b.v*(1-b.share))-(a.v*(1-a.share)));
fs.writeFileSync(path.join(D,'gap_thin.json'),JSON.stringify(thin));
console.log('[부분미노출] 노출점유율 50% 미만(월검색 50+) :',thin.length,'개');
const all=known.filter(x=>x.imp>0&&x.v>=50);
console.log(' 월검색 50+ 노출중 키워드',all.length,'평균 노출점유율',(all.reduce((a,x)=>a+Math.min(2,x.imp/Math.max(1,Math.round(x.v*7/30))),0)/all.length*100).toFixed(0)+'%');
console.log('\n상위 전량미노출 40개');
console.log('월검색\t최고입찰\tON\t등급\t키워드');
for(const x of gap.slice(0,40))console.log([x.v,x.maxBid,x.on,x.t,x.kw].join('\t'));
