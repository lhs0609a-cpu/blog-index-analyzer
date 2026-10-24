const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const A=require('./_sojam_i0907_audit_lib.js');
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const KW={};S.keywords.forEach(k=>KW[k.id]=k);
const D=JSON.parse(fs.readFileSync(P('_sojam_i0907_sepfull.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
let tot={i:0,c:0,m:0},ok={i:0,c:0,m:0},by={},list=[];
for(const id in D){const k=KW[id];if(!k)continue;const d=D[id],v=A.verdict(k.kw);
 tot.i+=d.i;tot.c+=d.c;tot.m+=d.m;
 if(!v){ok.i+=d.i;ok.c+=d.c;ok.m+=d.m;}else{(by[v]||={c:0,m:0,n:0});by[v].c+=d.c;by[v].m+=d.m;by[v].n++;if(d.m>0)list.push({kw:k.kw,v,m:d.m,c:d.c,camp:k.camp});}}
console.log(`9/1~9/6 키워드 귀속 소진 ${won(tot.m)}원 · 클릭 ${tot.c} · 노출 ${won(tot.i)}`);
console.log(`  내원권 ${won(ok.m)}원 (${(ok.m/tot.m*100).toFixed(1)}%) · 클릭 ${ok.c} · CTR ${(ok.c/ok.i*100).toFixed(3)}% · CPC ${won(ok.m/ok.c)}원`);
Object.entries(by).sort((a,b)=>b[1].m-a[1].m).forEach(([k,v])=>console.log(`  ${k.padEnd(12)} ${won(v.m).padStart(9)}원 (${(v.m/tot.m*100).toFixed(1)}%) · ${v.c}클릭 · ${v.n}개`));
console.log('\n── 범위 밖인데 돈 나간 것 상위 15');
list.sort((a,b)=>b.m-a.m).slice(0,15).forEach(k=>console.log(`  ${won(k.m).padStart(7)}원 ${String(k.c).padStart(3)}클릭 ${k.kw.padEnd(20)} ${k.v}  [${(k.camp||'').slice(0,20)}]`));
