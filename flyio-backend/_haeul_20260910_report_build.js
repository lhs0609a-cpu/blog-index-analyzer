// 해울한의원 광고 효율 분석 보고서 HTML 생성 → _report_src/해울한의원_광고효율분석_20260910.html
const fs=require('fs'),path=require('path');
const D0=path.join(__dirname,'reports','haeul_20260910');
const M=JSON.parse(fs.readFileSync(path.join(D0,'report_metrics.json'),'utf8'));
const OUT=path.join(__dirname,'..','_report_src','해울한의원_광고효율분석_20260910.html');
const won=n=>Math.round(n).toLocaleString('ko-KR');
const man=n=>(n/10000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'만';
const C={main:'#2a78d6',pool:'#1baf7a',place:'#eb6834',grid:'#e1e0d9',axis:'#c3c2b7',muted:'#898781',ink:'#0b0b0b',ink2:'#52514e',surf:'#fcfcfb'};
const P=Object.fromEntries(M.periods.map(p=>[p.id,p]));
const E=M.estimate,Q=M.quality;
const qPct=(k,f)=>(Q.groups[k]?Q.groups[k][f]/Q.total[f]*100:0);

function nice(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const m=v/p;return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p;}
function stacked(field,fmtTick,title){
 const W=700,H=236,L=46,R=12,T=30,B=36,pw=W-L-R,ph=H-T-B,n=M.byDay.length,band=pw/n,bw=Math.min(16,band*0.62);
 const tot=M.byDay.map(d=>d.main[field]+d.pool[field]+d.place[field]);
 const top=nice(Math.max(...tot)*1.08),y=v=>T+ph-v/top*ph;
 let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">`;
 for(let i=0;i<=4;i++){const v=top*i/4,yy=y(v);s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="${i?C.grid:C.axis}" stroke-width="${i?0.6:0.9}"/><text class="ax" x="${L-6}" y="${yy+2}" text-anchor="end" fill="${C.muted}">${fmtTick(v)}</text>`;}
 const marks={'2026-08-19':'소재 3,783개 부착','2026-09-09':'예산·입찰 재설계'};
 M.byDay.forEach((d,i)=>{const cx=L+band*i+band/2,x=cx-bw/2;let base=0;
  for(const k of ['place','main','pool']){const v=d[k][field];if(v<=0)continue;const y0=y(base+v),h=y(base)-y0;
   s+=`<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" fill="${C[k]}" stroke="${C.surf}" stroke-width="1"/>`;base+=v;}
  const lab=d.day.slice(5).replace('-','/').replace(/^0/,'').replace('/0','/');
  if([0,4,8,12,16,20,25].includes(i))s+=`<text class="ax" x="${cx}" y="${H-B+13}" text-anchor="middle" fill="${C.muted}">${lab}</text>`;
  if(marks[d.day]){s+=`<line x1="${cx}" x2="${cx}" y1="${T-12}" y2="${y(tot[i])-3}" stroke="${C.ink2}" stroke-width="0.6"/><text class="mark" x="${cx+(i>20?-3:3)}" y="${T-15}" text-anchor="${i>20?'end':'start'}" fill="${C.ink}">${marks[d.day]}</text>`;}
 });
 const last=M.byDay.length-1,first=0;
 s+=`<text class="val" x="${L+band*first+band/2}" y="${y(tot[first])-4}" text-anchor="middle" fill="${C.ink}">${fmtTick(tot[first],1)}</text>`;
 s+=`<text class="val" x="${L+band*last+band/2}" y="${y(tot[last])-4}" text-anchor="middle" fill="${C.ink}">${fmtTick(tot[last],1)}</text>`;
 return s+'</svg>';
}
const legend=`<div class="legend"><span><i style="background:${C.place}"></i>플레이스</span><span><i style="background:${C.main}"></i>파워링크 메인(두통·자율신경·어지럼)</span><span><i style="background:${C.pool}"></i>파워링크 자동풀(롱테일)</span></div>`;

function qualityBars(){
 const rows=[['내원의도','병원·한의원·치료 등 내원 표현'],['브랜드','해울한의원 직접 검색'],['증상·정보','두통없애는법·머리아플때 등'],['진료축 밖','이명·체질개선·저혈당 등'],['타지역','광주·안산·군산·부산 등'],['약·제품','편두통약·타이레놀·영양제']];
 const W=700,rowH=27,L=150,R=150,H=rows.length*rowH+18,pw=W-L-R;
 let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="검색어 품질별 비용 비중">`;
 s+=`<line x1="${L}" x2="${L}" y1="4" y2="${H-8}" stroke="${C.axis}" stroke-width="0.9"/>`;
 rows.forEach(([k,sub],i)=>{const cy=10+i*rowH,cost=qPct(k,'cost'),clk=qPct(k,'clk'),w=cost/60*pw;
  s+=`<text class="row" x="${L-8}" y="${cy+8}" text-anchor="end" fill="${C.ink}">${k}</text><text class="ax" x="${L-8}" y="${cy+17}" text-anchor="end" fill="${C.muted}">${sub}</text>`;
  s+=`<rect x="${L}" y="${cy+2}" width="${Math.max(1.5,w).toFixed(1)}" height="12" rx="2" fill="${C.main}"/>`;
  s+=`<text class="val" x="${L+Math.max(1.5,w)+5}" y="${cy+11}" fill="${C.ink}">비용 ${cost.toFixed(1)}%</text>`;
  s+=`<text class="ax" x="${W-4}" y="${cy+11}" text-anchor="end" fill="${C.ink2}">클릭 ${clk.toFixed(1)}% · ${won(Q.groups[k]?.clk||0)}회</text>`;});
 return s+'</svg>';
}

const periodRows=['P1','P2','P3'].map(id=>{const p=P[id];return `<tr><td><b>${p.label}</b><br><span class="sub">${p.desc}</span></td><td>${won(p.total.perDayCost)}</td><td>${p.total.perDayClk}</td><td>${won(p.total.cpc)}</td><td>${p.total.ctr.toFixed(2)}%</td><td>${won(p.power.cpc)}</td><td>${won(p.place.cpc)}</td><td>${(p.place.cost/p.total.cost*100).toFixed(0)}%</td></tr>`;}).join('');
const dailyRows=M.byDay.map(d=>`<tr><td>${d.day.slice(5)}</td><td>${won(d.total.imp)}</td><td>${d.total.clk}</td><td>${won(d.total.cost)}</td><td>${d.total.clk?won(d.total.cost/d.total.clk):'-'}</td><td>${won(d.place.cost)}</td><td>${won(d.main.cost)}</td><td>${won(d.pool.cost)}</td><td>${d.total.conv}</td></tr>`).join('');
const sum=M.byDay.reduce((s,d)=>({imp:s.imp+d.total.imp,clk:s.clk+d.total.clk,cost:s.cost+d.total.cost}),{imp:0,clk:0,cost:0});
const exs=k=>(Q.examples[k]||[]).slice(0,5).map(e=>e[0]).join(' · ');

const html=`<title>해울한의원 광고 효율 분석</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@300;400;500;700;800&display=swap">
<style>
@page{size:A4;margin:10mm}
*,*::before,*::after{box-sizing:border-box}
:root{--ink:#0b0b0b;--ink2:#3d3c39;--muted:#898781;--rule:#e1e0d9;--wash:#f4f4f1;--paper:#fff;--accent:#2a78d6;--loss:#b23b2e;--good:#006300}
html,body{margin:0;padding:0}
body{font-family:'Gothic A1','Malgun Gothic',system-ui,sans-serif;font-weight:400;color:var(--ink2);background:#56585a;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:9.2pt;line-height:14.6pt;word-break:keep-all}
@media screen{body{padding:24px 12px}.sheet{width:210mm;max-width:100%;min-height:297mm;padding:11mm 11mm 12mm;margin:0 auto 22px;background:var(--paper);box-shadow:0 2px 20px rgba(0,0,0,.34)}}
@media print{body{background:#fff}.sheet{padding:0;margin:0;box-shadow:none}.sheet+.sheet{break-before:page}}
b,strong{font-weight:700;color:var(--ink)}
.runner{display:flex;justify-content:space-between;padding-bottom:6pt;border-bottom:1px solid var(--rule);font-size:7.6pt;letter-spacing:.12em;color:var(--muted)}
h1{margin:12pt 0 0;font-weight:800;font-size:21pt;line-height:27pt;color:var(--ink);letter-spacing:-.02em}
h1 .loss{color:var(--loss)}
h2{margin:15pt 0 0;font-weight:800;font-size:12.6pt;line-height:17pt;color:var(--ink)}
h2 .no{display:inline-block;min-width:17pt;color:var(--accent)}
h3{margin:10pt 0 0;font-weight:700;font-size:10pt;color:var(--ink)}
p{margin:5pt 0 0}
.lead{margin-top:7pt;font-size:10pt;line-height:16pt;color:var(--ink2);max-width:165mm}
.caption{margin-top:4pt;font-size:7.8pt;line-height:12pt;color:var(--muted)}
.strip{display:flex;margin-top:10pt;border:1px solid var(--rule);background:var(--rule);gap:1px}
.strip>div{flex:1;background:var(--paper);padding:7pt 8pt 8pt}
.strip .k{font-size:7.4pt;letter-spacing:.04em;color:var(--muted)}
.strip .v{margin-top:3pt;font-weight:800;font-size:16pt;line-height:1.05;color:var(--ink)}
.strip .v.loss{color:var(--loss)}
.strip .s{margin-top:4pt;font-size:7.4pt;line-height:10.5pt;color:var(--ink2)}
.card{margin-top:7pt;padding:8pt 9pt 6pt;border:1px solid var(--rule);break-inside:avoid}
.card .t{font-weight:700;font-size:9pt;color:var(--ink)}
.chart{display:block;width:100%;height:auto;margin-top:3pt}
.chart .ax{font-size:7.2px}.chart .val{font-size:7.6px;font-weight:700}.chart .mark{font-size:7.4px;font-weight:700}.chart .row{font-size:8.2px;font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:4pt 12pt;margin-top:4pt;font-size:7.6pt;color:var(--ink2)}
.legend i{display:inline-block;width:8pt;height:8pt;border-radius:2px;margin-right:4pt;vertical-align:-1pt}
table{width:100%;border-collapse:collapse;margin-top:6pt;font-size:8pt;line-height:11.5pt}
th{font-weight:700;color:var(--ink);text-align:right;padding:4pt 5pt;border-bottom:1px solid var(--ink);white-space:nowrap}
td{padding:4pt 5pt;border-bottom:1px solid var(--rule);text-align:right;font-variant-numeric:tabular-nums;vertical-align:top}
th:first-child,td:first-child{text-align:left}
td .sub{font-size:7pt;color:var(--muted)}
table.daily{font-size:7.3pt;line-height:10pt}table.daily td,table.daily th{padding:2.3pt 4pt}
.why{margin-top:6pt;display:grid;grid-template-columns:22pt 1fr;gap:0 7pt;padding:7pt 0 7pt;border-top:1px solid var(--rule);break-inside:avoid}
.why .n{font-weight:800;font-size:13pt;color:var(--loss);line-height:15pt}
.why .h{font-weight:700;color:var(--ink);font-size:9.6pt}
.why .e{margin-top:2pt;font-size:8.5pt;line-height:13.2pt}
.tl{margin-top:6pt;border-left:2px solid var(--rule);padding-left:10pt}
.tl .it{position:relative;padding:3pt 0 7pt;break-inside:avoid}
.tl .it::before{content:'';position:absolute;left:-14.5pt;top:6pt;width:7pt;height:7pt;border-radius:50%;background:var(--accent)}
.tl .d{font-weight:800;color:var(--ink)}
.tl .r{margin-top:2pt;font-size:8.4pt;line-height:13pt}
.tl .res{margin-top:2pt;font-size:8pt;color:var(--loss)}
.todo td{text-align:left}
.todo td:first-child{font-weight:800;color:var(--accent);width:18pt}
.box{margin-top:8pt;padding:8pt 10pt;background:var(--wash);border-left:3px solid var(--accent);font-size:8.8pt;line-height:14pt;break-inside:avoid}
.box.warn{border-left-color:var(--loss)}
.funnel{display:flex;align-items:stretch;margin-top:8pt;gap:6pt}
.funnel>div{flex:1;border:1px solid var(--rule);padding:7pt 8pt;text-align:center}
.funnel .k{font-size:7.6pt;color:var(--muted)}
.funnel .v{margin-top:3pt;font-weight:800;font-size:15pt;color:var(--ink)}
.funnel .s{margin-top:3pt;font-size:7.4pt;line-height:10.5pt}
.funnel .arrow{flex:0 0 auto;border:0;align-self:center;color:var(--muted);padding:0;font-size:12pt}
</style>

<!-- 1 -->
<section class="sheet">
<div class="runner"><span>해울한의원 · 네이버 검색광고 cid 3442423</span><span>2026-08-15 ~ 09-09 · 작성 2026-09-10</span></div>
<h1>클릭은 4.4배 늘었지만 <span class="loss">문의로 이어질 클릭은 15%뿐입니다</span></h1>
<p class="lead">8월 19일 광고 소재를 전 그룹에 붙인 뒤 하루 클릭이 15회에서 67회로 늘었고 클릭당 비용은 4,024원에서 856원으로 떨어졌습니다. 그러나 최근 30일 파워링크 클릭의 83%는 진료와 무관하거나 정보만 찾는 검색어, 강남까지 오기 어려운 타지역 검색어였습니다. 26일 광고비의 61%는 문의 측정이 불가능한 플레이스로 나갔고, 전환 추적은 10개 캠페인 중 1개만 켜져 있어 <b>26일간 기록된 문의(전환)는 0건</b>입니다.</p>
<div class="strip">
 <div><div class="k">26일 광고비</div><div class="v">${won(sum.cost)}원</div><div class="s">하루 평균 ${won(sum.cost/26)}원 (VAT 별도)</div></div>
 <div><div class="k">클릭</div><div class="v">${won(sum.clk)}회</div><div class="s">파워링크 ${won(E.powerClicks)} · 플레이스 ${won(E.placeClicks)}</div></div>
 <div><div class="k">측정된 문의(전환)</div><div class="v loss">0건</div><div class="s">추적이 꺼져 있어 측정 자체가 안 됨</div></div>
 <div><div class="k">추정 내원 (소잠 실측 비율 적용)</div><div class="v">${Math.round(E.adjustedLow.visits)}~${Math.round(E.naive.visits)}명</div><div class="s">실제 수치 아님 · 3쪽 참고</div></div>
</div>
<h2><span class="no">1</span>하루 광고비 — 총액은 그대로, 구성만 바뀌었습니다</h2>
<div class="card"><div class="t">일별 광고비 (원, VAT 별도)</div>${legend}${stacked('cost',(v,full)=>v===0?'0':(full?man(v)+'원':man(v)),'일별 광고비')}
<div class="caption">8/19 이전에는 파워링크 3,783개 그룹 중 4개에만 광고 소재가 있어 돈의 82%가 플레이스로 나갔습니다. 소재를 붙인 뒤에도 하루 총액은 5~8만원으로 거의 같고, 플레이스가 여전히 절반 이상입니다. 9/8~9/9는 하루 7.8~8.0만원이었습니다.</div></div>
<div class="card"><div class="t">일별 클릭 (회)</div>${legend}${stacked('clk',(v)=>Math.round(v)+'','일별 클릭')}
<div class="caption">늘어난 클릭은 거의 전부 파워링크(파랑·청록)입니다. 플레이스 클릭은 하루 5~10회로 변화가 없습니다. 전체 일별 수치는 6쪽 부록 표에 있습니다.</div></div>
</section>

<!-- 2 -->
<section class="sheet">
<div class="runner"><span>해울한의원 광고 효율 분석</span><span>2</span></div>
<h2><span class="no">2</span>효율은 어떻게 바뀌었나</h2>
<table><thead><tr><th>기간</th><th>하루 광고비</th><th>하루 클릭</th><th>CPC</th><th>CTR</th><th>파워링크 CPC</th><th>플레이스 CPC</th><th>플레이스 비중</th></tr></thead><tbody>${periodRows}</tbody></table>
<div class="caption">CPC=클릭당 비용, CTR=노출 대비 클릭률. 9/9 변경은 오후 2시 35분에 적용돼 9/9 수치는 반나절만 반영됩니다.</div>
<h3>숫자로 보면 좋아졌습니다</h3>
<p>같은 돈으로 클릭이 4.4배 늘었고 클릭당 비용은 1/4.7로 떨어졌습니다. 8/19 이전에는 소재가 없어 파워링크 키워드 대부분이 노출조차 되지 않았기 때문에, 소재를 붙인 효과는 분명히 있었습니다.</p>
<h3>그런데 클릭의 질은 따라오지 않았습니다</h3>
<p>노출 대비 클릭률(CTR)이 0.90%에서 0.11%로 1/8이 됐습니다. 노출은 크게 늘었는데 클릭으로 이어지는 비율은 줄었다는 뜻입니다 — 파워링크 CPC 403원은 70~100원짜리 롱테일 키워드와 확장검색 클릭이 섞인 평균입니다. 아래는 최근 30일(8/10~9/8) 파워링크 실제 검색어 ${won(Q.total.clk)}클릭을 검색 의도별로 나눈 것입니다.</p>
<div class="card"><div class="t">파워링크 실제 검색어의 의도별 비용·클릭 비중 (30일)</div>${qualityBars()}
<div class="caption">내원 의도가 드러난 검색어는 클릭의 ${qPct('내원의도','clk').toFixed(1)}%에 불과하지만 비용은 ${qPct('내원의도','cost').toFixed(1)}%를 씁니다. 반대로 진료축 밖·증상정보·타지역 검색어가 클릭의 ${(qPct('진료축 밖','clk')+qPct('증상·정보','clk')+qPct('타지역','clk')).toFixed(0)}%를 차지합니다. 검색어가 제공되지 않는 지면(플레이스 등)은 이 표에 포함되지 않습니다.</div></div>
<table><thead><tr><th>구분</th><th style="text-align:left">실제 검색어 예시 (비용 순)</th></tr></thead><tbody>
${['내원의도','증상·정보','진료축 밖','타지역','약·제품'].map(k=>`<tr><td><b>${k}</b></td><td style="text-align:left">${exs(k)}</td></tr>`).join('')}
</tbody></table>
<div class="box"><b>정리하면</b> — 8/19 이후 효율 개선은 "싼 클릭을 많이 산" 개선이었습니다. 문의로 이어질 가능성이 높은 내원의도 클릭은 30일 ${Q.groups['내원의도'].clk}회(하루 5회 남짓)뿐이고, 비용이 큰 순서로는 자율신경실조증병원·자율신경실조증한의원·머리아플때병원이 앞섭니다.</div>
</section>

<!-- 3 -->
<section class="sheet">
<div class="runner"><span>해울한의원 광고 효율 분석</span><span>3</span></div>
<h2><span class="no">3</span>클릭이 실제 내원으로 얼마나 이어졌을까</h2>
<div class="box warn"><b>해울한의원의 실제 문의·내원 수는 이 보고서에 없습니다.</b> 네이버 광고의 전환 기록은 26일 내내 0건이고(추적이 메인 캠페인 1개에만 켜져 있음), 상담일지나 유입경로 기록을 받은 적이 없습니다. 아래 숫자는 같은 운영 방식의 <b>소잠한의원 상담일지 실측 비율</b>(클릭 46회당 문의 1건, 문의→내원 47.2%, 2026-01~09)을 빌려 계산한 <b>추정치</b>입니다. 원장님이 알고 계신 실제 문의 수와 비교해 주시면 어느 쪽이 맞는지 판단할 수 있습니다.</div>
<h3>① 모든 클릭이 소잠과 같은 비율로 문의가 된다고 가정할 때 (상한)</h3>
<div class="funnel">
 <div><div class="k">클릭</div><div class="v">${won(E.totalClicks)}</div><div class="s">26일 전체</div></div><div class="arrow">→</div>
 <div><div class="k">문의 (÷46)</div><div class="v">${Math.round(E.naive.inquiries)}건</div><div class="s">하루 1.3건</div></div><div class="arrow">→</div>
 <div><div class="k">내원 (×47.2%)</div><div class="v">${Math.round(E.naive.visits)}명</div><div class="s">내원 1명당 광고비 ${won(E.costPerVisitNaive)}원</div></div>
</div>
<h3>② 내원의도·브랜드 검색 클릭과 플레이스 클릭만 문의가 된다고 볼 때 (보수)</h3>
<div class="funnel">
 <div><div class="k">문의 가능 클릭</div><div class="v">${won(Math.round(E.powerClicks*E.qualityShare/100+E.placeClicks))}</div><div class="s">파워링크 ${E.qualityShare}% + 플레이스 전부</div></div><div class="arrow">→</div>
 <div><div class="k">문의 (÷46)</div><div class="v">${Math.round(E.adjustedLow.inquiries)}건</div><div class="s">3일에 1건</div></div><div class="arrow">→</div>
 <div><div class="k">내원 (×47.2%)</div><div class="v">${Math.round(E.adjustedLow.visits)}명</div><div class="s">내원 1명당 광고비 ${won(E.costPerVisitAdj)}원</div></div>
</div>
<p class="caption">파워링크 클릭 중 내원의도·브랜드 검색어 비중(${E.qualityShare}%)은 2쪽의 30일 실제 검색어 분석에서 가져왔습니다. 증상·정보 검색어까지 넣으면 ${E.qualityBroadShare}%가 됩니다.</p>
<h3>어느 쪽이 현실에 가까운가</h3>
<p>원장님이 "문의가 안 들어온다"고 느끼신다면 실제는 ②에 가깝다고 봐야 합니다. ①이 맞다면 26일간 광고로 문의 34건(하루 1건 이상)이 들어왔어야 합니다. ②라면 26일간 9건 남짓 — 3일에 한 건이라 체감상 "거의 없는" 수준입니다.</p>
<p>②가 맞다면 <b>내원 1명을 만드는 데 광고비 약 37만원</b>, ①이라도 약 10만원이 들고 있는 셈입니다.</p>
<div class="box"><b>필요한 것</b> — 8/15 이후 해울한의원에 들어온 <b>전화·카카오·네이버예약 문의 수와 내원 수</b>(주 단위면 충분), 그리고 앞으로 문의가 올 때 <b>"어떻게 알고 오셨나요"</b> 한 줄 기록. 이게 있어야 광고비를 어디로 옮길지 추정이 아니라 사실로 결정할 수 있습니다.</div>
</section>

<!-- 4 -->
<section class="sheet">
<div class="runner"><span>해울한의원 광고 효율 분석</span><span>4</span></div>
<h2><span class="no">4</span>문의가 들어오지 않는 이유 — 계정에서 확인된 것</h2>
<div class="why"><div class="n">1</div><div><div class="h">광고비의 61~64%가 효과를 잴 수 없는 플레이스로 나갑니다</div><div class="e">플레이스는 26일 946,393원(61%), 최근 30일 1,154,999원(64%) · 227클릭 · CPC 5,088원. 파워링크 평균의 약 10배입니다. 전환 추적이 꺼져 있고 검색어도 제공되지 않아, 이 돈이 전화로 이어졌는지 알 방법이 없습니다. 플레이스도 지역 설정이 "전국"입니다.</div></div></div>
<div class="why"><div class="n">2</div><div><div class="h">강남 한 곳인데 전국에 광고가 나갑니다</div><div class="e">메인 두통·어지럼·자율신경 그룹, 자동풀, 플레이스 모두 지역 타게팅이 없습니다. 30일 클릭 검색어 중 <b>강남·서초가 들어간 건 3건</b>, 광주·안산·군산·부산·대구·포항 등 <b>타지역 이름이 들어간 건 144건(152클릭)</b>입니다. 지역명 없이 검색한 사람의 위치는 알 수 없지만, 전국에 노출되고 있어 상당수가 먼 거리일 가능성이 큽니다.</div></div></div>
<div class="why"><div class="n">3</div><div><div class="h">두통·어지럼 광고를 눌러도 브레인포그 페이지가 뜹니다</div><div class="e">광고 소재 860개 중 <b>856개가 haeulclinic.com/BrainFog</b>로 연결됩니다. 두통을 검색해 들어온 사람이 "브레인포그·집중력 저하" 페이지를 보게 됩니다. 편두통(/Migraine), 어지럼증(/Dizziness), 자율신경(/Dysautonomia) 전용 페이지가 이미 있는데 쓰이지 않습니다. 페이지 자체에는 전화·카카오·네이버예약 버튼이 모두 있습니다.</div></div></div>
<div class="why"><div class="n">4</div><div><div class="h">광고 문구가 860개 전부 똑같습니다</div><div class="e">제목은 모두 "해울한의원" 한 단어, 설명은 "두통, 어지럼증, 자율신경실조증 집중진료. 호흡곤란, 가슴답답, 공황장애, 불안증" 한 가지입니다. 검색한 증상과 광고 문구가 맞지 않으면 클릭률이 낮고, 눌러도 "나를 위한 곳"이라는 확신이 약합니다. 위치(강남역)·예약 방법도 문구에 없습니다.</div></div></div>
<div class="why"><div class="n">5</div><div><div class="h">싸게 걸린 클릭 대부분이 문의할 사람이 아닙니다</div><div class="e">30일 파워링크 검색어 클릭 중 진료축 밖(이명·체질개선·저혈당 등) 39.8%, 증상·정보(두통없애는법·머리아플때) 26.9%, 타지역 14.0%, 약·제품(편두통약·타이레놀) 2.5%. 내원 의도가 드러난 클릭은 15.1%입니다. 확장검색과 70원짜리 롱테일 키워드가 이런 검색어를 끌어왔습니다(확장검색은 9/9에 104개 그룹 해제).</div></div></div>
<div class="why"><div class="n">6</div><div><div class="h">정작 내원 의도가 강한 대표 키워드는 꺼져 있거나 70원이었습니다</div><div class="e">등록 키워드 80,430개 중 97%가 70~100원입니다. 내원의도 키워드(병원·한의원·치료) 중 꺼져 있거나 70~100원인 비율이 두통 95%, 어지럼 84%, 자율신경 72%였고, 어지럼증·이석증·불면증·공황장애·자율신경실조증 같은 대표 키워드가 꺼져 있었습니다.</div></div></div>
<div class="why"><div class="n">7</div><div><div class="h">무엇이 문의를 만드는지 측정하지 못합니다</div><div class="e">전환 추적은 "해울한의원 파워링크" 1개 캠페인에만 켜져 있고 26일 전환 0건입니다. 어떤 키워드·어떤 페이지가 전화를 만드는지 모르니 광고비 배분이 계속 추측으로 이뤄지고 있습니다. 클릭의 89%가 모바일이라 전화 버튼 클릭을 전환으로 잡는 것이 가장 효과적입니다.</div></div></div>
</section>

<!-- 5 -->
<section class="sheet">
<div class="runner"><span>해울한의원 광고 효율 분석</span><span>5</span></div>
<h2><span class="no">5</span>지금까지 개선한 것</h2>
<div class="tl">
 <div class="it"><div class="d">8월 19일 — 광고가 실제로 나가게 만들었습니다</div><div class="r">파워링크 3,783개 그룹 중 4개에만 있던 광고 소재를 전 그룹에 부착(실패 0). 오염 키워드 22,933개 삭제. 입찰 티어 12,757건 재설정, 비수도권 지역 키워드 451건 70원으로 인하.</div><div class="res">결과: 하루 클릭 15 → 67회, CPC 4,024 → 856원. 다만 소재가 모두 /BrainFog 연결·같은 문구라 클릭의 질은 떨어짐.</div></div>
 <div class="it"><div class="d">9월 9일 — 두통 핵심 키워드와 예산을 올렸습니다</div><div class="r">메인 파워링크 일예산 18,000 → 60,000원, 자율신경실조증 캠페인 30,000 → 45,000원, 실수요 캠페인 2,500 → 15,000원. 두통·어지럼 키워드 148개 입찰 인상(두통한의원·두통병원·두통치료 10,000원). 확장검색 104개 그룹 해제로 저혈당·감기약·타지역 검색어 유입 차단.</div><div class="res">결과(하루 뒤): 148개가 만든 클릭 1회. 두통 대표어는 3위 추정가(15,000~30,000원)보다 입찰이 낮아 여전히 노출이 부족.</div></div>
 <div class="it"><div class="d">9월 10일 — 원장님 비율(두통4 : 어지럼3 : 자율신경3)로 다시 설계했습니다</div><div class="r">30일 소진 비율이 2.9 : 0.9 : 6.2로 어지럼이 크게 부족. 꺼져 있던 어지럼 대표 키워드 35개를 켜고(어지럼증·어지럼증치료·이석증치료·메니에르 등, 전부 승인·노출가능 확인), 어지럼 53개·두통 17개 입찰 인상. 어지럼증병원 25,000원, 어지럼증 21,340원, 두통 10,000원. 자율신경은 현 수준 유지.</div><div class="res">결과는 9/12에 축별 소진으로 확인 예정.</div></div>
</div>
<h2><span class="no">6</span>앞으로 할 일 — 우선순위 순</h2>
<table class="todo"><tbody>
<tr><td>1</td><td><b>문의부터 측정</b> — 전 캠페인 전환 추적 켜기, 홈페이지 전화·카카오·네이버예약 버튼 클릭을 전환으로 등록. 상담 시 유입경로 한 줄 기록. <span class="sub">이게 없으면 나머지 개선의 효과도 확인할 수 없습니다.</span></td></tr>
<tr><td>2</td><td><b>지역 좁히기</b> — 파워링크·플레이스 모두 서울·경기 수도권으로 타게팅. 타지역 클릭(30일 152회)과 먼 거리 검색자를 차단합니다.</td></tr>
<tr><td>3</td><td><b>연결 페이지를 질환별로</b> — 두통→편두통·두통 페이지, 어지럼→/Dizziness, 자율신경→/Dysautonomia. 소재 재검수가 걸리므로 메인 3개 그룹부터 순차 적용.</td></tr>
<tr><td>4</td><td><b>광고 문구를 질환별 3종으로</b> — 제목에 질환명+강남역, 설명에 대표 증상과 예약 방법. 검색어와 문구를 맞춰 클릭률과 문의 전환을 함께 올립니다.</td></tr>
<tr><td>5</td><td><b>플레이스 검증</b> — 광고비의 60% 안팎이 가는 채널. 1번으로 전화 문의가 측정되면 플레이스 입찰 5,000원이 적정한지 판단하고, 아니면 파워링크 내원의도 키워드로 옮깁니다.</td></tr>
<tr><td>6</td><td><b>새는 검색어 제외</b> — 약·제품, 진료축 밖, 타지역 검색어를 제외 키워드로 등록.</td></tr>
<tr><td>7</td><td><b>4:3:3 점검</b> — 9/12에 축별 소진을 재고 두통 상한(10,000원) 조정 여부 결정. 공유예산은 광고 관리 화면에서 한 번 만들어 주시면 캠페인 연결은 바로 처리합니다.</td></tr>
</tbody></table>
<div class="box"><b>원장님께 부탁드릴 것</b> — ① 8/15 이후 주별 문의 수·내원 수 ② 홈페이지에 네이버 전환 스크립트가 설치돼 있는지 확인(메인 캠페인은 추적이 켜져 있는데 전환이 0건) ③ 지역을 수도권으로 좁혀도 되는지 ④ 광고 관리 화면에서 공유예산 1개 생성.</div>
</section>

<!-- 6 -->
<section class="sheet">
<div class="runner"><span>해울한의원 광고 효율 분석 · 부록</span><span>6</span></div>
<h2>부록 — 일별 실적 (네이버 검색광고 /stats, VAT 별도)</h2>
<table class="daily"><thead><tr><th>날짜</th><th>노출</th><th>클릭</th><th>광고비</th><th>CPC</th><th>플레이스</th><th>파워링크 메인</th><th>자동풀</th><th>전환</th></tr></thead><tbody>${dailyRows}
<tr><td><b>합계</b></td><td><b>${won(sum.imp)}</b></td><td><b>${won(sum.clk)}</b></td><td><b>${won(sum.cost)}</b></td><td><b>${won(sum.cost/sum.clk)}</b></td><td><b>${won(M.byDay.reduce((s,d)=>s+d.place.cost,0))}</b></td><td><b>${won(M.byDay.reduce((s,d)=>s+d.main.cost,0))}</b></td><td><b>${won(M.byDay.reduce((s,d)=>s+d.pool.cost,0))}</b></td><td><b>0</b></td></tr></tbody></table>
<p class="caption">데이터 출처: 네이버 검색광고 API — 캠페인 일별 /stats(8/15~9/9), 실제 검색어·광고상세 보고서(8/10~9/8), 키워드 마스터 리포트(9/10, 80,430개), 광고 소재·타게팅 조회(9/9~9/10). 8/19~8/23 노출 급증은 소재 부착 직후 롱테일 키워드가 일제히 노출된 영향입니다. 내원 추정의 비율은 소잠한의원 상담일지(2026-01~09-02, 유입 450건) 실측값이며 해울한의원 실측이 아닙니다.</p>
</section>`;
fs.writeFileSync(OUT,html);
console.log('HTML',OUT,(html.length/1024).toFixed(0)+'KB');
