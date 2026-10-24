const fs=require('fs'),path=require('path'),P=n=>path.join(__dirname,n);
const {why}=require('./_sojam_d0828_rule.js');const {isDerm}=require('./_sojam_e0831_derm.js');
let bare=()=>false;try{const b=require('./_sojam_e0831_bare.js');bare=b.isBare||b.bare||bare;}catch(e){}
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const S=JSON.parse(fs.readFileSync(P('_sojam_g0903_kwstats.json'),'utf8'));
const R2=JSON.parse(fs.readFileSync(P('_sojam_f0901_research2.json'),'utf8')).kw;
const vol=k=>{const v=R2[k];return v?(v.pc||0)+(v.mo||0):0;};
const inScope=k=>!why(k)&&!bare(k)&&isDerm(k)&&!/대상포진|사마귀|홍조|검사|진단|예방접종|주사/.test(k);
const PRODUCT=/스케일링|마사지|앰플|괄사|브러쉬|토닉|영양제|스파|에센스|팩$|타투|반영구|점빼기|세럼|트리트먼트|스프레이|샴푸|패치|기기|쿨링|관리샵|구개열|구순열|가글/;
const AX={'지루성':/지루성|두피염|비듬|두피/,'탈스':/탈스|스테로이드|리바운드/,'묘기증':/묘기증|피부묘기/,
 '구순염':/구순|구내염|입술|입안/,'무좀':/무좀|백선|칸디다|완선/,'백반증':/백반증/,'다한증':/다한증|땀띠|땀많/};
for(const [name,re] of Object.entries(AX)){
 const rows=S.keywords.filter(k=>re.test(k.kw)&&inScope(k.kw)&&!PRODUCT.test(k.kw)&&vol(k.kw)>=300);
 const seen=new Set();const uniq=rows.filter(k=>{if(seen.has(k.kw))return false;seen.add(k.kw);return true;});
 const on=uniq.filter(k=>!k.lock&&!k.glock&&!k.clock);
 const V=uniq.reduce((s,k)=>s+vol(k.kw),0), Von=on.reduce((s,k)=>s+vol(k.kw),0);
 const imp=uniq.reduce((s,k)=>s+k.imp33,0), clk=uniq.reduce((s,k)=>s+k.clk33,0), cost=uniq.reduce((s,k)=>s+k.cost33,0);
 console.log(`\n══ ${name} — 키워드 ${uniq.length}개(운영 ${on.length}) · 월검색량 ${won(V)}(운영분 ${won(Von)}) · 33일 노출 ${won(imp)} 클릭 ${clk} 소진 ${won(cost)}원`);
 const blocked=uniq.filter(k=>k.lock||k.glock||k.clock||k.bid<=70).sort((a,b)=>vol(b.kw)-vol(a.kw));
 console.log(`  막힌 것 ${blocked.length}개 (검색량 ${won(blocked.reduce((s,k)=>s+vol(k.kw),0))})`);
 blocked.slice(0,12).forEach(k=>{
  const c=[k.lock&&'키워드잠금',k.glock&&'그룹잠금',k.clock&&'캠페인잠금',(!k.lock&&k.bid<=70)&&'70원'].filter(Boolean).join('·');
  console.log(`    ${won(vol(k.kw)).padStart(7)} · 노출 ${String(k.imp33).padStart(5)} · 입찰 ${String(k.bid).padStart(6)}원 · ${c.padEnd(14)} ${k.kw}`);});
 const live=uniq.filter(k=>!k.lock&&!k.glock&&!k.clock&&k.bid>70&&k.imp33>0).sort((a,b)=>b.imp33-a.imp33);
 if(live.length){console.log(`  살아있는 것 상위 6 (순위/노출):`);
  live.slice(0,6).forEach(k=>console.log(`    ${won(vol(k.kw)).padStart(7)} · 노출 ${String(k.imp33).padStart(6)} · 순위 ${(k.rnk33||0).toFixed(1)} · 입찰 ${won(k.bid).padStart(6)}원 · 클릭 ${k.clk33}  ${k.kw}`));}
}
