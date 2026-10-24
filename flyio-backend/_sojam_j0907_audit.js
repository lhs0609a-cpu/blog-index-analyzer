// 소잠 전수 점검 (2026-09-07) — 돈 새는 곳 / 죽어 있는 곳 / 자기경쟁
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const A=require('./_sojam_i0907_audit_lib.js');
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const INV=JSON.parse(fs.readFileSync(P('_sojam_j0907_live.json'),'utf8'));
const ST=JSON.parse(fs.readFileSync(P('_sojam_j0907_stats.json'),'utf8'));
const byId={};INV.forEach(k=>byId[k.id]=k);
const g=k=>ST[k.id]||{i:0,c:0,m:0};

console.log(`══ 인벤토리 (2026-09-07 실측) ══`);
const camps=new Set(INV.map(k=>k.camp)),grps=new Set(INV.map(k=>k.gid));
console.log(`키워드 ${won(INV.length)} · 광고그룹 ${won(grps.size)} · 캠페인 ${camps.size}`);
const on=INV.filter(k=>!k.lock&&!k.gLock&&!k.campLock);
console.log(`운영중 키워드 ${won(on.length)} (${(on.length/INV.length*100).toFixed(1)}%) · 잠김 ${won(INV.length-on.length)}`);

// ── ① 진료범위 밖 지출
console.log(`\n══ ① 진료범위 밖 지출 (9/1~9/7) ══`);
let tot={i:0,c:0,m:0},ok={i:0,c:0,m:0},by={},bad=[];
INV.forEach(k=>{const d=g(k);if(!d.m&&!d.i)return;const v=A.verdict(k.kw);
 tot.i+=d.i;tot.c+=d.c;tot.m+=d.m;
 if(!v){ok.i+=d.i;ok.c+=d.c;ok.m+=d.m;}else{(by[v]||={c:0,m:0,n:0});by[v].c+=d.c;by[v].m+=d.m;by[v].n++;if(d.m>0)bad.push({...k,...d,v});}});
console.log(`키워드 귀속 소진 ${won(tot.m)}원 · 클릭 ${tot.c} · 내원권 ${won(ok.m)}원 (${(ok.m/tot.m*100).toFixed(1)}%)`);
console.log(`범위 밖 ${won(tot.m-ok.m)}원 (${((tot.m-ok.m)/tot.m*100).toFixed(1)}%) · 일 ${won((tot.m-ok.m)/7)}원`);
bad.sort((a,b)=>b.m-a.m).slice(0,20).forEach(k=>console.log(`   ${won(k.m).padStart(7)}원 ${String(k.c).padStart(2)}클릭 ${k.kw.padEnd(18)} [${k.v}]  ${(k.camp||'').slice(0,20)}`));

// ── ② 돈만 먹고 클릭 없는 구간 (노출 많고 클릭 0)
console.log(`\n══ ② 노출만 먹고 클릭 0 — 순위 낮아 버려지는 노출 ══`);
const noclk=INV.map(k=>({...k,...g(k)})).filter(k=>k.i>=300&&k.c===0).sort((a,b)=>b.i-a.i);
console.log(`대상 ${noclk.length}개 · 버려진 노출 ${won(noclk.reduce((s,k)=>s+k.i,0))}회 (7일)`);
noclk.slice(0,15).forEach(k=>console.log(`   노출 ${won(k.i).padStart(6)} · 입찰 ${won(k.bid).padStart(6)}원 · ${k.kw.padEnd(20)} ${(k.camp||'').slice(0,20)}`));

// ── ③ 고CPC
console.log(`\n══ ③ 클릭당 비용이 상한을 넘는 키워드 ══`);
const AXDEF=[['묘기증',/묘기증|피부묘기/,6000],['지루성',/지루성|두피염|비듬|두피/,5000],['아토피',/아토피|태열/,6000],['두드러기',/두드러기|담마진/,4500],['건선',/건선/,4000],['여드름',/여드름|뾰루지|화농|면포/,2500],['습진',/습진|한포진/,3500],['피부염',/피부염|접촉성|화폐상/,4000],['백반증',/백반증/,70],['다한증',/다한증|땀띠|땀많|한증/,70],['모낭염',/모낭염|종기|봉와직염|절종|옹종/,1500],['무좀',/무좀|백선|칸디다|완선/,1500],['구순염',/구순|구내염|입술|입안|혀|설염/,1500],['탈스',/탈스|스테로이드|리바운드/,1500],['가려움',/가려|간지|소양|양진/,1800]];
const ax=k=>{for(const [n,re] of AXDEF) if(re.test(k)) return n; return '기타'};
const cap=a=>a==='기타'?3000:(AXDEF.find(x=>x[0]===a)||[,,3000])[2];
const over=INV.map(k=>({...k,...g(k),a:ax(k.kw)})).filter(k=>k.c>0&&k.m/k.c>cap(k.a)*1.15&&!A.verdict(k.kw))
 .sort((a,b)=>b.m-a.m);
console.log(`대상 ${over.length}개 · 소진 ${won(over.reduce((s,k)=>s+k.m,0))}원 (7일)`);
over.slice(0,15).forEach(k=>console.log(`   CPC ${won(k.m/k.c).padStart(7)}원 (상한 ${won(cap(k.a))}) · ${String(k.c).padStart(2)}클릭 ${won(k.m).padStart(7)}원 · 입찰 ${won(k.bid).padStart(6)} · ${k.a.padEnd(5)} ${k.kw}`));

// ── ④ 자기경쟁 — 같은 키워드가 여러 그룹에서 살아 있음
console.log(`\n══ ④ 같은 키워드가 여러 광고그룹에서 동시 운영 (자기경쟁) ══`);
const dup={};on.forEach(k=>{(dup[k.kw]||=[]).push(k);});
const dups=Object.entries(dup).filter(([k,v])=>v.length>1);
const dupSpend=dups.reduce((s,[k,v])=>s+v.reduce((t,x)=>t+g(x).m,0),0);
console.log(`중복 키워드 ${won(dups.length)}종 · 운영 중 사본 ${won(dups.reduce((s,[,v])=>s+v.length,0))}개 · 7일 소진 ${won(dupSpend)}원`);
dups.map(([k,v])=>({k,v,m:v.reduce((t,x)=>t+g(x).m,0),n:v.length})).sort((a,b)=>b.m-a.m).slice(0,12)
 .forEach(d=>console.log(`   ${won(d.m).padStart(7)}원 · 사본 ${d.n}개 · 입찰 ${d.v.map(x=>won(x.bid)).join('/')} · ${d.k}`));

// ── ⑤ 소재 없는 그룹 / 잠긴 채 방치
console.log(`\n══ ⑤ 잠금 구조 ══`);
const byLock={키워드잠금:0,그룹잠금:0,캠페인잠금:0,정상:0};
INV.forEach(k=>{byLock[k.campLock?'캠페인잠금':k.gLock?'그룹잠금':k.lock?'키워드잠금':'정상']++;});
Object.entries(byLock).forEach(([k,v])=>console.log(`   ${k.padEnd(8)} ${won(v).padStart(7)}개`));
