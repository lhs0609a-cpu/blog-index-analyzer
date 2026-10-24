const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const A=require('./_sojam_i0907_audit_lib.js');
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const KW={};S.keywords.forEach(k=>KW[k.id]=k);
const V={};Object.values(KW).forEach(k=>V[k.id]=A.verdict(k.kw));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const CAMP={jul:4860629,aug:5362711,sep:871496},DAYS={jul:31,aug:31,sep:6};
const F={jul:'_sojam_i0907_jul2.json',aug:'_sojam_i0907_aug2.json',sep:'_sojam_i0907_sep2.json'};
const out={};
for(const w of ['jul','aug','sep']){
 if(!fs.existsSync(P(F[w]))){console.log(w,'미수집');continue;}
 const D=JSON.parse(fs.readFileSync(P(F[w]),'utf8'));
 let tot={i:0,c:0,m:0},ok={i:0,c:0,m:0},by={},list=[];
 for(const id in D){const k=KW[id];if(!k)continue;const d=D[id],v=V[id];
  tot.i+=d.i;tot.c+=d.c;tot.m+=d.m;
  if(!v){ok.i+=d.i;ok.c+=d.c;ok.m+=d.m;}else{(by[v]||={c:0,m:0,n:0,i:0});by[v].c+=d.c;by[v].m+=d.m;by[v].i+=d.i;by[v].n++;if(d.m>0)list.push({kw:k.kw,v,m:d.m,c:d.c,camp:k.camp});}}
 out[w]={tot,ok,by};
 const cov=tot.m/CAMP[w]*100;
 console.log(`\n══ ${w} · ${DAYS[w]}일 · 계정소진 ${won(CAMP[w])}원 ══`);
 console.log(`  키워드 귀속 ${won(tot.m)}원 (계정의 ${cov.toFixed(1)}%) · 클릭 ${tot.c} · 노출 ${won(tot.i)} · CTR ${(tot.c/tot.i*100).toFixed(3)}%`);
 console.log(`  ├ 내원권    ${won(ok.m).padStart(10)}원 (${(ok.m/tot.m*100).toFixed(1)}%) · 클릭 ${String(ok.c).padStart(5)} · 노출 ${won(ok.i).padStart(9)} · CTR ${(ok.c/ok.i*100).toFixed(3)}% · CPC ${won(ok.m/ok.c)}원`);
 console.log(`  └ 범위밖    ${won(tot.m-ok.m).padStart(10)}원 (${((tot.m-ok.m)/tot.m*100).toFixed(1)}%) · 클릭 ${String(tot.c-ok.c).padStart(5)} · 노출 ${won(tot.i-ok.i).padStart(9)} · 일 ${won((tot.m-ok.m)/DAYS[w])}원`);
 Object.entries(by).sort((a,b)=>b[1].m-a[1].m).filter(x=>x[1].m>0).forEach(([k,v])=>
  console.log(`       ${k.padEnd(12)} ${won(v.m).padStart(9)}원 · ${String(v.c).padStart(4)}클릭 · 노출 ${won(v.i).padStart(9)} · ${v.n}개`));
 console.log(`  유효클릭 일평균 ${(ok.c/DAYS[w]).toFixed(1)}건`);
}
fs.writeFileSync(P('_sojam_i0907_final.json'),JSON.stringify(out));
