// 내원 후보 전수 + 실재 증거 병합 → CSV.
// 증거 우선순위: 클릭(90일) > 노출(90일) > 월검색≥10 > 자동완성 제안 > 없음(조합 생성물 추정)
const fs=require('fs'),path=require('path');
const G=require('./_haeul_20260917_gate.js');
const D=path.join(__dirname,'reports','haeul_20260917');
const SC='C:/Users/leegu/AppData/Local/Temp/claude/D--developer-blog-index-analyzer/4670b754-1f99-4cce-937e-3efb6f6ed66b/scratchpad';
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cand=J(path.join(SC,'cand.json'));
const st=J(path.join(SC,'evidence_stats.json'));
const vol=J(path.join(SC,'vol_evidence.json'));
const acOld=new Set(J(path.join(SC,'ac_evidence.json')));
// 이번 자동완성 검증: 질의별 제안수 + 제안어 풀
let acDone={},acPool={};
try{const s=J(path.join(SC,'ac_verify.json.state.json'));acDone=s.done;acPool=s.pool;}catch(e){}
const acPoolN=new Set(Object.keys(acPool).map(G.norm));
const groups=J(path.join(D,'adgroups.json'));const gm=new Map(groups.map(g=>[g.id,g]));
const camps=J(path.join(D,'campaigns.json'));const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));

const rows=cand.map(c=>{
 // 인스턴스 합산(같은 어휘가 여러 그룹에 있으면 합치고, 대표는 최고입찰 ON)
 const ins=c.inst.map(i=>({...i,s:st[i.kid]||{imp:0,clk:0,cost:0,rnk:null}}));
 const imp=ins.reduce((s,i)=>s+i.s.imp,0), clk=ins.reduce((s,i)=>s+i.s.clk,0), cost=ins.reduce((s,i)=>s+i.s.cost,0);
 const wr=ins.filter(i=>i.s.imp>0);
 const rnk=wr.length?+(wr.reduce((s,i)=>s+i.s.rnk*i.s.imp,0)/wr.reduce((s,i)=>s+i.s.imp,0)).toFixed(1):'';
 const on=ins.filter(i=>!i.off);
 const rep=(on.length?on:ins).slice().sort((a,b)=>b.bid-a.bid)[0];
 const v=vol[c.n];
 const acN=acDone[c.n];                       // 이 어휘로 질의했을 때 제안 개수
 const acSelf=acPoolN.has(c.n)||acOld.has(c.n); // 자동완성이 이 어휘 자체를 제안
 let ev;
 if(clk>0)ev='1_클릭';
 else if(imp>0)ev='2_노출';
 else if(v>=10)ev='3_월검색10+';
 else if(acSelf)ev='4_자동완성';
 else ev='9_증거없음';
 const g=gm.get(rep.gid)||{};
 return{키워드:c.kw,등급:c.grade,신호:c.sig.join('/'),증거:ev,
  월검색:v===undefined?'':v,'90일노출':imp,'90일클릭':clk,'90일비용':cost,평균순위:rnk,
  입찰가:rep.bid,상태:on.length?'ON':'OFF',등록수:ins.length,
  그룹:g.name||'',캠페인:cm.get(g.cid)?.name||'',자동완성제안수:acN===undefined?'':acN,
  조합냄새:c.synth?'Y':'',kid:rep.kid,gid:rep.gid};
});
const ord={'1_클릭':0,'2_노출':1,'3_월검색10+':2,'4_자동완성':3,'9_증거없음':9};
const gord={S:0,A:1,B:2};
rows.sort((a,b)=>ord[a.증거]-ord[b.증거]||gord[a.등급]-gord[b.등급]||(b.월검색||0)-(a.월검색||0)||b['90일노출']-a['90일노출']);
fs.writeFileSync(path.join(D,'visit_all_rows.json'),JSON.stringify(rows));
const csv=(n,a)=>{const c=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'\uFEFF'+[c,...a.map(r=>c.map(x=>r[x]??''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));};
const real=rows.filter(r=>r.증거!=='9_증거없음');
csv('내원키워드_전수_20260917',rows);
csv('내원키워드_실재확인_20260917',real);
const cnt=k=>rows.reduce((m,r)=>(m[r[k]]=(m[r[k]]||0)+1,m),{});
console.log('후보 총',rows.length);console.log('증거별',cnt('증거'));console.log('등급별',cnt('등급'));
console.log('실재 확인',real.length,'| 그중 S',real.filter(r=>r.등급==='S').length,'A',real.filter(r=>r.등급==='A').length,'B',real.filter(r=>r.등급==='B').length);
const byEvGrade={};for(const r of real)byEvGrade[r.증거+'|'+r.등급]=(byEvGrade[r.증거+'|'+r.등급]||0)+1;
console.log(byEvGrade);
console.log('실재 확인 중 상태 OFF',real.filter(r=>r.상태==='OFF').length,'| 입찰 70~100원',real.filter(r=>r.입찰가<=100).length);
