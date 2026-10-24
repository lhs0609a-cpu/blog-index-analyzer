// 소잠 9월 신환 50명 — 파워링크/플레이스 매입 설계
const fs=require('fs'),P=n=>require('path').join(__dirname,n);
const S=JSON.parse(fs.readFileSync(P('_sojam_k0907_supply.json'),'utf8'));
const L=JSON.parse(fs.readFileSync(P('_sojam_k0907_ladder.json'),'utf8'));
const won=n=>Math.round(n||0).toLocaleString('ko-KR');
const TREAT=/치료|한의원|한방|병원|잘하는곳|추천|후기|비용|가격|명의|클리닉|의원/;
const SELF=/연고|약$|약추천|약가격|음식|관리|방법|없애는|낫는법|좋은|씻|세안|팩|민간요법/;
const cls=k=>TREAT.test(k)?'치료의도':SELF.test(k)?'자가관리':'질환·증상';

const PL_BUDGET=300000;          // 플레이스 월 30만 (일 1만) — 시험 확대
const PW_BUDGET=4500000-PL_BUDGET;

// 층별 규칙: 치료의도는 비싸도 산다(8천 상한), 질환·증상은 3천 상한, 자가관리는 1.5천 상한
const RULE={'치료의도':8000,'질환·증상':3000,'자가관리':1500};
const pick=S.map(r=>({...r,c:cls(r.kw)})).filter(r=>r.bid<=RULE[r.c]);
// 층 우선순위대로 담되 예산 초과분은 CPC 낮은 것부터
const order=['치료의도','질환·증상','자가관리'];
let acc=0,clk=0;const buy=[];
for(const layer of order){
  const s=pick.filter(r=>r.c===layer).sort((a,b)=>a.bid-b.bid);
  for(const r of s){ if(acc+r.cost>PW_BUDGET) continue; acc+=r.cost; clk+=r.clk; buy.push(r); }
}
const byL={};buy.forEach(r=>{(byL[r.c]||={n:0,c:0,m:0});byL[r.c].n++;byL[r.c].c+=r.clk;byL[r.c].m+=r.cost;});
console.log('══ 파워링크 매입 계획 (월 예산 '+won(PW_BUDGET)+'원 = 일 '+won(PW_BUDGET/30)+'원) ══');
console.log('층          상한     키워드   월클릭    월비용     평균CPC   비중');
order.forEach(l=>{const v=byL[l];if(!v)return;
 console.log('  '+l.padEnd(9)+won(RULE[l]).padStart(7)+String(v.n).padStart(8)+Math.round(v.c).toString().padStart(9)+won(v.m).padStart(11)+won(v.m/v.c).padStart(9)+(v.m/acc*100).toFixed(0).padStart(6)+'%');});
console.log('  '+'합계'.padEnd(16)+String(buy.length).padStart(8)+Math.round(clk).toString().padStart(9)+won(acc).padStart(11)+won(acc/clk).padStart(9));

const PL_CPC=3651, plClk=PL_BUDGET/PL_CPC;
console.log('\n══ 플레이스 (월 '+won(PL_BUDGET)+'원, 실측 CPC '+won(PL_CPC)+'원) ══');
console.log('  현재 일예산 3,500원 → 10,000원 · 월클릭 '+Math.round(plClk)+'건');

const totClk=clk+plClk;
console.log('\n══ 합계 ══');
console.log('  월 클릭 '+Math.round(totClk)+'건  (현재 약 1,500건 · +'+((totClk/1500-1)*100).toFixed(0)+'%)');
const inq=totClk*0.0479;
console.log('  월 문의 '+inq.toFixed(0)+'건  (현재 77건)');
console.log('\n  내원율별 착지');
[[0.299,'현재 8월 수준'],[0.356,'DB구성 유지 예측'],[0.429,'★3+ 33% 회복'],[0.479,'★3+ 40%·미기재 0']].forEach(([v,l])=>
 console.log('    '+(v*100).toFixed(1).padStart(5)+'% ('+l.padEnd(18)+') → '+(inq*v).toFixed(0).padStart(3)+'명'+(inq*v>=50?'  ★ 50명 달성':'')));

// 실행용 목록 저장
fs.writeFileSync(P('_sojam_k0907_buylist.json'),JSON.stringify(buy.map(r=>({kw:r.kw,layer:r.c,vol:r.v,bid:r.bid,clk:+r.clk.toFixed(1),cost:Math.round(r.cost),live:r.live}))));
console.log('\n매입 목록 저장 → _sojam_k0907_buylist.json ('+buy.length+'개)');
const need=buy.filter(r=>!r.live);
console.log('  그중 지금 막혀 있어 새로 열어야 할 것 '+need.length+'개 · 월클릭 '+Math.round(need.reduce((s,r)=>s+r.clk,0))+' · 월비용 '+won(need.reduce((s,r)=>s+r.cost,0))+'원');
