// 소잠 간절 키워드 순위 점검 — HTML 보고서 빌더 (2026-09-11). 입력 rankaudit/urgency.json. 출력 = argv[2] 경로.
// 스타일은 _report_src/sojam-ranks-template.html(9/10 소잠 순위 보고서)의 토큰·서체를 잇는다.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/');
const { summary: S, rows } = JSON.parse(fs.readFileSync(D + 'urgency.json', 'utf8'));
const OUT = process.argv[2];
if (!OUT) throw Error('출력 경로 필요');
const LIMIT = 4500000;
const won = n => Math.round(n).toLocaleString('ko-KR');
const man = n => (Math.round(n / 1000) / 10).toLocaleString('ko-KR') + '만';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 여유분으로 올릴 대표어(간절 신호 없음, 월 1,000+) — 추가 클릭당 비용 싼 순, 한도까지
// 연고·크림 같은 상품어와 음식 검색은 내원 의도가 약하고 사용자가 빼라고 한 축이라 후보에서 제외
const NOT_HEAD = /연고|크림|로션|음식|좋은|영양제/;
let room = LIMIT - S.alloc.cost; const heads = [];
const headCands = rows.filter(o => o.tier === '하' && o.cls !== '노출불가' && o.vol >= 1000 && o.target && o.target.pos === 5 && !NOT_HEAD.test(o.k))
  .map(o => ({ o, dc: o.cost3 - o.cost5, dk: o.clk3 - o.clk5 })).filter(h => h.dk > 0 && h.dc > 0).sort((a, b) => a.dc / a.dk - b.dc / b.dk);
for (const h of headCands) if (h.dc <= room) { room -= h.dc; heads.push(h); }
const headCost = heads.reduce((a, h) => a + h.dc, 0), headClk = heads.reduce((a, h) => a + h.dk, 0);

const out5 = rows.filter(o => o.cls === '입찰 5위 밖').sort((a, b) => b.vol - a.vol);
const p45big = rows.filter(o => o.cls === '4~5위 입찰').sort((a, b) => b.vol - a.vol).slice(0, 12);
const mism = rows.filter(o => o.cls !== '노출불가' && o.mPos && o.mPos <= 5 && o.rank != null && o.rank > 5.5).sort((a, b) => b.vol - a.vol);
const hotLow = rows.filter(o => o.tier === '상' && (o.cls === '입찰 5위 밖' || o.cls === '4~5위 입찰'));
const M = S.matrix, tiers = ['상', '중', '하'], cls = ['1~3위 입찰', '4~5위 입찰', '입찰 5위 밖', '노출불가'];
const tierN = t => cls.reduce((a, c) => a + M[t][c].n, 0);
const sc = [
  ['지금 입찰가 그대로', S.scen.cur[0], S.scen.cur[1], ''],
  ['전부 5위 입찰가', S.scen.all5[0], S.scen.all5[1], ''],
  ['간절 키워드 3위 · 나머지 5위', S.scen.urgent[0], S.scen.urgent[1], 'pick'],
  ['위 + 여유분으로 대표어 ' + heads.length + '개 3위', S.scen.urgent[0] + headCost, S.scen.urgent[1] + headClk, 'pick2'],
  ['전부 3위 입찰가', S.scen.all3[0], S.scen.all3[1], ''],
];
const scMax = Math.max(...sc.map(s => s[1]), LIMIT) * 1.08;

// 표 데이터(가볍게)
const data = rows.map(o => ({ k: o.k, a: o.axis, t: o.tier, s: o.sig, v: o.vol, c: o.cls, f: o.off, m: o.mob, mp: o.mPos, e1: o.e1, e3: o.e3, e5: o.e5,
  r: o.rank, i: o.imp, g: o.grp, tp: o.target ? o.target.pos : null, tb: o.target ? o.target.bid : null, mv: o.move }));

const clsKey = { '1~3위 입찰': 'top', '4~5위 입찰': 'mid', '입찰 5위 밖': 'low', '노출불가': 'off' };
const barRow = t => {
  const n = tierN(t);
  const segs = cls.map(c => { const v = M[t][c].n; if (!v) return ''; const w = 100 * v / n;
    return `<i class="seg s-${clsKey[c]}" style="width:${w.toFixed(2)}%" data-tip="${esc(`간절도 ${t} · ${c}: ${v.toLocaleString('ko-KR')}개 (${(100 * v / n).toFixed(1)}%) · 월 검색 ${M[t][c].vol.toLocaleString('ko-KR')}회`)}"></i>`; }).join('');
  const topPct = (100 * M[t]['1~3위 입찰'].n / n).toFixed(0);
  return `<div class="mrow"><div class="mlab"><b>간절도 ${t}</b><span>${n.toLocaleString('ko-KR')}개</span></div><div class="mbar">${segs}</div><div class="mval"><b>${topPct}%</b><span>3위 안</span></div></div>`;
};
const volRow = t => {
  const tot = cls.reduce((a, c) => a + M[t][c].vol, 0);
  return `<td class="l"><b>${t}</b></td>` + cls.map(c => `<td>${M[t][c].n.toLocaleString('ko-KR')}<span class="sub">${M[t][c].vol ? '월 ' + M[t][c].vol.toLocaleString('ko-KR') : ''}</span></td>`).join('') + `<td>${tot.toLocaleString('ko-KR')}</td>`;
};
const tierChip = t => `<span class="tier t-${t === '상' ? 'hi' : t === '중' ? 'md' : 'lo'}">${t}</span>`;
const rankCell = r => r == null ? '<span class="dim">노출 없음</span>' : `<span class="rank ${r <= 3.5 ? 'r-top' : r <= 5.5 ? 'r-mid' : 'r-low'}">${r}</span>`;

const html = `<title>소잠 간절 키워드 순위 점검</title>
<meta name="description" content="소잠한의원 내원 핵심 키워드 ${rows.length.toLocaleString('ko-KR')}개의 실순위와 입찰가를 간절도 기준으로 점검">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>
:root{
  --paper:#F6F7F3; --surface:#FFFFFF; --raised:#FBFCF9;
  --ink:#17251F; --body:#31403A; --muted:#6D7A70; --faint:#8E9A93;
  --line:#DDE2DA; --line-soft:#EAEEE6;
  --accent:#0E6B55; --accent-soft:#E3F0EB; --on-accent:#FFFFFF;
  --top:#1F7A4D; --mid:#C08A1E; --low:#A8412B; --off:#A7B0AA;
  --top-bg:#E6F2EA; --mid-bg:#F7EFDC; --low-bg:#F8E7E2;
  --hi:#0E6B55; --md:#5E8C7E; --lo:#A7B0AA;
  --limit:#17251F; --gap:#FFFFFF;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#121A17; --surface:#1A2420; --raised:#202C27;
  --ink:#EAF0EC; --body:#C6D2CC; --muted:#93A29A; --faint:#75847C;
  --line:#2B3A33; --line-soft:#243128;
  --accent:#54C2A0; --accent-soft:#1B3A30; --on-accent:#0E1A16;
  --top:#5FC98D; --mid:#D9A94B; --low:#E08A72; --off:#5A6961;
  --top-bg:#1A3328; --mid-bg:#332914; --low-bg:#3A1E17;
  --hi:#54C2A0; --md:#7FA697; --lo:#5A6961;
  --limit:#EAF0EC; --gap:#1A2420;
}}
:root[data-theme="dark"]{
  --paper:#121A17; --surface:#1A2420; --raised:#202C27;
  --ink:#EAF0EC; --body:#C6D2CC; --muted:#93A29A; --faint:#75847C;
  --line:#2B3A33; --line-soft:#243128;
  --accent:#54C2A0; --accent-soft:#1B3A30; --on-accent:#0E1A16;
  --top:#5FC98D; --mid:#D9A94B; --low:#E08A72; --off:#5A6961;
  --top-bg:#1A3328; --mid-bg:#332914; --low-bg:#3A1E17;
  --hi:#54C2A0; --md:#7FA697; --lo:#5A6961;
  --limit:#EAF0EC; --gap:#1A2420;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--body);margin:0;
  font-family:"IBM Plex Sans KR",-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;
  font-size:14px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:32px 20px 72px}
h1,h2,h3{font-family:"Gowun Batang",Batang,serif;color:var(--ink);text-wrap:balance;margin:0}
h1{font-size:30px;font-weight:700;letter-spacing:-.01em}
h2{font-size:20px;font-weight:700}
h3{font-size:16px;font-weight:700}
.eyebrow{font-size:11px;letter-spacing:.13em;color:var(--accent);font-weight:600}
.lede{color:var(--muted);max-width:66ch;margin:10px 0 0}
p{max-width:70ch}
header.top{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end;justify-content:space-between;
  padding-bottom:20px;border-bottom:2px solid var(--ink);margin-bottom:8px}
.stamp{display:flex;gap:24px;flex-wrap:wrap}
.stamp div{text-align:right}
.stamp b{display:block;font-size:17px;color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.stamp span{font-size:11px;color:var(--faint);letter-spacing:.04em}
section{margin-top:40px}
.shead{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.shead p{margin:0;font-size:12.5px;color:var(--muted)}
.verdict{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:3px;overflow:hidden;margin-top:24px}
.verdict div{background:var(--surface);padding:16px 18px;display:flex;flex-direction:column;gap:6px}
.verdict .k{font-size:11px;letter-spacing:.06em;color:var(--faint);font-weight:600}
.verdict .v{font-family:"Gowun Batang",Batang,serif;font-size:17px;color:var(--ink);font-weight:700;line-height:1.35;text-wrap:balance}
.verdict .n{font-size:12.5px;color:var(--muted)}
.verdict .n b{color:var(--ink);font-variant-numeric:tabular-nums}
/* 간절도 × 순위 막대 */
.matrix{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:18px 18px 14px}
.mrow{display:grid;grid-template-columns:110px 1fr 72px;gap:14px;align-items:center;padding:7px 0}
.mlab b{display:block;color:var(--ink);font-weight:600}
.mlab span,.mval span{font-size:11.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.mval{text-align:right}
.mval b{display:block;font-size:18px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}
.mbar{display:flex;gap:2px;height:22px}
.seg{display:block;height:100%;min-width:3px;cursor:default}
.seg:first-child{border-radius:4px 0 0 4px}.seg:last-child{border-radius:0 4px 4px 0}.seg:only-child{border-radius:4px}
.s-top{background:var(--top)}.s-mid{background:var(--mid)}.s-low{background:var(--low)}.s-off{background:var(--off)}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.tablebox{overflow-x:auto;border:1px solid var(--line);border-radius:3px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:7px 10px;text-align:right;border-bottom:1px solid var(--line-soft);white-space:nowrap}
th{position:sticky;top:0;background:var(--raised);z-index:1;font-size:11px;font-weight:600;color:var(--muted);letter-spacing:.04em;border-bottom:1px solid var(--line)}
th.l,td.l{text-align:left}
tbody tr:hover{background:var(--raised)}
td.kw{font-weight:600;color:var(--ink)}
.sub{display:block;font-size:11px;color:var(--faint)}
.dim{color:var(--faint)}
.rank{display:inline-block;min-width:38px;padding:1px 6px;border-radius:3px;font-weight:600;font-size:12.5px;text-align:center}
.r-top{background:var(--top-bg);color:var(--top)}.r-mid{background:var(--mid-bg);color:var(--mid)}.r-low{background:var(--low-bg);color:var(--low)}
.tier{display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:3px;font-size:12px;font-weight:700}
.t-hi{background:var(--hi);color:var(--on-accent)}.t-md{background:var(--accent-soft);color:var(--accent)}.t-lo{background:var(--line-soft);color:var(--muted)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:600}
.p-top{background:var(--top-bg);color:var(--top)}.p-mid{background:var(--mid-bg);color:var(--mid)}.p-low{background:var(--low-bg);color:var(--low)}.p-off{background:var(--line-soft);color:var(--muted)}
.up{color:var(--low);font-weight:600}.down{color:var(--top)}
.note{font-size:13px;color:var(--muted);margin-top:12px;max-width:78ch}
.note b{color:var(--ink)}
/* 예산 막대 */
.budget{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:18px}
.brow{display:grid;grid-template-columns:230px 1fr 150px;gap:14px;align-items:center;padding:6px 0}
.bname{font-size:13px;color:var(--ink)}
.bname.pick{font-weight:700}
.btrack{position:relative;height:18px}
.bfill{position:absolute;left:0;top:0;bottom:0;border-radius:0 4px 4px 0;background:var(--lo)}
.bfill.pick,.bfill.pick2{background:var(--hi)}
.bfill.over{background:var(--low)}
.limit{position:absolute;top:-6px;bottom:-6px;width:2px;background:var(--limit)}
.bval{text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
.bval span{display:block;font-size:11px;color:var(--faint)}
.limitlab{position:relative;height:18px;margin-left:244px;margin-right:164px;font-size:11px;color:var(--muted)}
.limitlab span{position:absolute;transform:translateX(-50%);white-space:nowrap}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:18px}
.list{background:var(--surface);border:1px solid var(--line);border-radius:3px;padding:14px 16px}
.list h3{margin-bottom:8px}
.list ol,.list ul{margin:0;padding-left:18px;font-size:13px}
.list li{padding:3px 0;font-variant-numeric:tabular-nums}
.list li b{color:var(--ink)}
/* 전체 표 */
.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
button.chip{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:99px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--muted)}
button.chip:hover{border-color:var(--accent);color:var(--accent)}
button.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
input[type=search]{font:inherit;font-size:13px;padding:6px 11px;border:1px solid var(--line);border-radius:3px;background:var(--surface);color:var(--ink);min-width:180px}
input[type=search]:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.count{font-size:12px;color:var(--faint);margin-left:auto;font-variant-numeric:tabular-nums}
#full th button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;letter-spacing:inherit}
#full th button:hover{color:var(--accent)}
#fullbox{max-height:640px;overflow:auto}
.decide{border-top:2px solid var(--ink);padding-top:16px}
.decide ol{padding-left:20px;margin:0;display:grid;gap:10px;max-width:78ch}
.decide li b{color:var(--ink)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--paper);font-size:12px;padding:6px 9px;border-radius:3px;max-width:320px;z-index:10}
footer{margin-top:46px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--faint)}
footer p{max-width:none;margin:4px 0}
@media (max-width:720px){h1{font-size:24px}.stamp div{text-align:left}.wrap{padding:22px 14px 56px}
  .mrow{grid-template-columns:78px 1fr 56px;gap:10px}.brow{grid-template-columns:1fr;gap:4px}.bval{text-align:left}.limitlab{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

<div class="wrap">
<header class="top">
  <div>
    <div class="eyebrow">소잠한의원 · 네이버 파워링크 · 2026-09-11</div>
    <h1>간절 키워드 순위 점검</h1>
    <p class="lede">내원 핵심 질환 축에서 치료처를 찾거나, 오래 앓았거나, 아파서 괴로운 검색어를 간절도로 나누고, 네이버가 실제 노출에서 잰 순위와 지금 입찰가가 5위 안을 지키는지, 일 15만 원 예산에 맞는지를 전부 봤습니다.</p>
  </div>
  <div class="stamp">
    <div><b>${rows.length.toLocaleString('ko-KR')}</b><span>점검한 키워드</span></div>
    <div><b>9/10~9/11</b><span>실순위 구간</span></div>
    <div><b>일 15만 원</b><span>예산 기준</span></div>
  </div>
</header>

<div class="verdict">
  <div><span class="k">간절한 키워드</span><span class="v">이미 거의 다 3위 안에 있습니다</span>
    <span class="n">간절도 상 <b>${tierN('상').toLocaleString('ko-KR')}</b>개 중 <b>${M['상']['1~3위 입찰'].n.toLocaleString('ko-KR')}</b>개가 1~3위 입찰가. 4위 이하는 ${hotLow.length}개이고 전부 월 검색 30회 이하입니다.</span></div>
  <div><span class="k">빈 곳</span><span class="v">5위 밖은 간절 신호 없는 대표어에 몰려 있습니다</span>
    <span class="n">5위 밖 <b>${out5.length}</b>개가 월 <b>${out5.reduce((a, o) => a + o.vol, 0).toLocaleString('ko-KR')}</b>회 검색을 차지합니다 — 한포진 · 백반증 · 지루성두피염 · 지루성피부염 · 항문가려움.</span></div>
  <div><span class="k">예산</span><span class="v">간절 키워드 전부 3위에 일 ${man(S.scen.urgent[0] / 30)} 원이면 됩니다</span>
    <span class="n">나머지를 5위 입찰가에 두면 월 <b>${won(S.scen.urgent[0])}</b>원. 한도까지 남는 월 <b>${won(LIMIT - S.scen.urgent[0])}</b>원으로 대표어 ${heads.length}개를 3위에 올릴 수 있습니다.</span></div>
</div>

<section>
  <div class="shead"><h2>간절도별 입찰 순위</h2><p>지금 모바일 유효입찰가(그룹 입찰·모바일 가중치 반영)가 네이버 1~5위 추정가 중 어디에 닿는지</p></div>
  <div class="matrix">
    ${tiers.map(barRow).join('\n    ')}
    <div class="legend"><span><i class="s-top"></i>1~3위 입찰</span><span><i class="s-mid"></i>4~5위 입찰</span><span><i class="s-low"></i>입찰 5위 밖</span><span><i class="s-off"></i>노출 불가</span></div>
  </div>
  <div class="tablebox" style="margin-top:12px"><table>
    <thead><tr><th class="l">간절도</th>${cls.map(c => `<th>${c}</th>`).join('')}<th>월 검색 합</th></tr></thead>
    <tbody>${tiers.map(t => `<tr>${volRow(t)}</tr>`).join('')}</tbody>
  </table></div>
  <p class="note"><b>간절도 기준</b> — 9/10 상담 의도 판정의 신호 다섯 가지를 가중합했습니다. 치료처 탐색(한의원·병원·잘하는곳·강남권 지명) 4점, 만성·재발(안낫는·재발·몇년째) 3점, 고통 강도(심할때·진물·밤에·따가움) 3점, 완치·근본(완치·낫는법·치료) 2점, 노출 부위(얼굴·손·두피·은밀부위) 1점. 6점 이상이거나 치료처 탐색에 다른 신호가 붙으면 <b>상</b>, 3~5점 <b>중</b>, 그 아래 <b>하</b>입니다. 간절 키워드는 검색량이 작아서(상 전체 월 ${cls.reduce((a, c) => a + M['상'][c].vol, 0).toLocaleString('ko-KR')}회) 경쟁이 적고 싸게 1~3위에 섭니다.</p>
</section>

<section>
  <div class="shead"><h2>입찰가가 5위에 못 미치는 키워드</h2><p>${out5.length}개 · 검색량 순 · 실순위는 9/10~9/11 네이버 측정 평균</p></div>
  <div class="tablebox"><table>
    <thead><tr><th class="l">키워드</th><th>간절도</th><th>월 검색</th><th>모바일 입찰가</th><th>5위 추정가</th><th>3위 추정가</th><th>실순위</th><th class="l">그룹</th></tr></thead>
    <tbody>${out5.map(o => `<tr><td class="l kw">${esc(o.k)}</td><td>${tierChip(o.tier)}</td><td>${o.vol.toLocaleString('ko-KR')}</td><td>${won(o.mob)}</td><td class="up">${o.e5 ? won(o.e5) : '-'}</td><td>${o.e3 ? won(o.e3) : '-'}</td><td>${rankCell(o.rank)}</td><td class="l dim">${esc(o.grp)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="note"><b>회음부가려움은 입찰가가 70원입니다.</b> 9/9 일괄 재세팅 때 정책 모듈이 이 검색어를 진료범위 밖으로 잘못 분류해 최저가로 내린 것이 그대로 남아 있습니다. 강남아토피·강남지루성두피염처럼 '강남+질환'은 5위 추정가가 1만~2만 원대라 입찰가 1,500원 이하로는 닿지 않습니다.</p>
</section>

<section>
  <div class="shead"><h2>4~5위에 걸린 큰 검색어</h2><p>계정 실측으로 4위부터 클릭률이 1위의 4분의 1로 떨어집니다 (1위 0.24% · 4위 0.06% · 5위 0.02%)</p></div>
  <div class="tablebox"><table>
    <thead><tr><th class="l">키워드</th><th>간절도</th><th>월 검색</th><th>모바일 입찰가</th><th>3위 추정가</th><th>실순위</th></tr></thead>
    <tbody>${p45big.map(o => `<tr><td class="l kw">${esc(o.k)}</td><td>${tierChip(o.tier)}</td><td>${o.vol.toLocaleString('ko-KR')}</td><td>${won(o.mob)}</td><td class="up">${o.e3 ? won(o.e3) : '-'}</td><td>${rankCell(o.rank)}</td></tr>`).join('')}</tbody>
  </table></div>
</section>

<section>
  <div class="shead"><h2>입찰가는 5위 안인데 실제로는 6위 밖</h2><p>${mism.length}개 · 입찰가가 아니라 지역 설정·품질이 원인인 곳</p></div>
  <div class="tablebox"><table>
    <thead><tr><th class="l">키워드</th><th>월 검색</th><th>모바일 입찰가</th><th>입찰 기준 순위</th><th>실순위</th><th class="l">그룹</th></tr></thead>
    <tbody>${mism.map(o => `<tr><td class="l kw">${esc(o.k)}</td><td>${o.vol.toLocaleString('ko-KR')}</td><td>${won(o.mob)}</td><td>${o.mPos}위</td><td>${rankCell(o.rank)}</td><td class="l dim">${esc(o.grp)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="note"><b>임신소양증·항문소양증</b>은 강남역 반경 20km로 묶인 '0. 대표키워드' 그룹 쪽 등록본이 노출 0이고, 다른 그룹 등록본이 5.8~7.7위에 나옵니다. '소잠_핵심_강남피부' 그룹들은 입찰가가 80~550원이라 6~35위에 머뭅니다.</p>
</section>

<section>
  <div class="shead"><h2>일 15만 원에 맞는 배분</h2><p>네이버 입찰가별 예상 성과(월, 전국 기준) · 세로선이 월 450만 원 한도</p></div>
  <div class="budget">
    <div class="limitlab"><span style="left:${(100 * LIMIT / scMax).toFixed(2)}%">월 450만 원 (일 15만)</span></div>
    ${sc.map(([n, c, k, cl]) => `<div class="brow"><div class="bname ${cl ? 'pick' : ''}">${esc(n)}</div>
      <div class="btrack" data-tip="${esc(n + ' · 월 ' + won(c) + '원 · 일 ' + won(c / 30) + '원 · 월 클릭 ' + won(k))}"><i class="bfill ${cl} ${c > LIMIT ? 'over' : ''}" style="width:${(100 * c / scMax).toFixed(2)}%"></i><i class="limit" style="left:${(100 * LIMIT / scMax).toFixed(2)}%"></i></div>
      <div class="bval">${man(c)} 원<span>클릭 ${won(k)} · 일 ${man(c / 30)}</span></div></div>`).join('\n    ')}
  </div>
  <div class="two">
    <div class="list"><h3>간절 키워드 3위 배치</h3>
      <ul><li>3위 입찰가로 올리는 간절 키워드 <b>${S.alloc.up}</b>개 (상 ${S.alloc.upByTier['상']} · 중 ${S.alloc.upByTier['중']})</li>
      <li>나머지는 5위 입찰가 — 5위 안은 지킵니다</li>
      <li>월 <b>${won(S.scen.urgent[0])}</b>원 · 일 ${won(S.scen.urgent[0] / 30)}원 · 월 클릭 ${won(S.scen.urgent[1])}</li>
      <li>지금 입찰가와 비교하면 인상 ${S.moves['인상']} · 인하 ${S.moves['인하']} · 유지 ${S.moves['유지']}</li></ul></div>
    <div class="list"><h3>남는 월 ${man(LIMIT - S.scen.urgent[0])} 원으로 올릴 대표어</h3>
      <ol>${heads.map(h => `<li><b>${esc(h.o.k)}</b> 월 ${h.o.vol.toLocaleString('ko-KR')} · +${man(h.dc)} 원 · 클릭 +${h.dk}</li>`).join('')}</ol></div>
  </div>
  <p class="note"><b>인하 ${S.moves['인하'].toLocaleString('ko-KR')}개는 한꺼번에 내리지 않는 게 좋습니다.</b> 대부분 경쟁이 없는 롱테일이라 입찰가를 1위 추정가의 몇 배로 두어도 실제 과금은 낮습니다(내려도 월 예상비용 차이 약 32만 원). 9/9에 입찰을 대량 인하했다가 하루 소진이 14만 원에서 5만 원대로 무너진 적이 있습니다. 예상 성과는 전국 기준이라 지역을 좁힌 그룹의 실제 소진은 이보다 낮습니다.</p>
</section>

<section>
  <div class="shead"><h2>키워드 전체</h2><p>간절도·순위로 좁히거나 검색어를 찾고, 열 제목을 눌러 정렬하세요</p></div>
  <div class="controls">
    <div class="chips" id="tierChips" role="group" aria-label="간절도">
      <button class="chip" aria-pressed="true" data-v="">간절도 전체</button><button class="chip" aria-pressed="false" data-v="상">상</button><button class="chip" aria-pressed="false" data-v="중">중</button><button class="chip" aria-pressed="false" data-v="하">하</button></div>
    <div class="chips" id="clsChips" role="group" aria-label="입찰 순위">
      <button class="chip" aria-pressed="true" data-v="">순위 전체</button><button class="chip" aria-pressed="false" data-v="입찰 5위 밖">5위 밖</button><button class="chip" aria-pressed="false" data-v="4~5위 입찰">4~5위</button><button class="chip" aria-pressed="false" data-v="1~3위 입찰">1~3위</button><button class="chip" aria-pressed="false" data-v="노출불가">노출 불가</button></div>
    <input type="search" id="q" placeholder="검색어 찾기" aria-label="검색어 찾기">
    <span class="count" id="cnt"></span>
  </div>
  <div class="tablebox" id="fullbox"><table id="full">
    <thead><tr>
      <th class="l"><button data-s="k">키워드</button></th><th><button data-s="t">간절도</button></th><th class="l"><button data-s="a">축</button></th>
      <th><button data-s="v">월 검색</button></th><th class="l">입찰 순위</th><th><button data-s="m">모바일 입찰가</button></th>
      <th><button data-s="e5">5위 추정가</button></th><th><button data-s="e3">3위 추정가</button></th><th><button data-s="r">실순위</button></th>
      <th><button data-s="tb">배분안</button></th><th class="l">그룹</th></tr></thead>
    <tbody></tbody>
  </table></div>
</section>

<section class="decide">
  <h2 style="margin-bottom:14px">결정할 것</h2>
  <ol>
    <li><b>간절 키워드 ${S.alloc.up}개를 3위 입찰가로</b> 올리는 배치를 적용할지 — 인상 ${S.moves['인상']}건만 먼저 하고 인하는 보류하는 방식을 권합니다.</li>
    <li><b>남는 예산으로 대표어를 올릴지</b> — ${heads.slice(0, 4).map(h => h.o.k).join(' · ')} 순으로 추가 클릭당 비용이 쌉니다. 한포진·지루성두피염처럼 비싼 대표어는 한도 안에 다 들어가지 않습니다.</li>
    <li><b>회음부가려움 70원</b>을 3위 추정가(${won(rows.find(o => o.k === '회음부가려움')?.e3 || 3350)}원)로 바로 올려도 되는지.</li>
    <li><b>공유예산이 일 30만 원</b>으로 잡혀 있습니다(9/11 10:04 수정). 목표 15만 원과 다르니 누가 바꿨는지 확인이 필요합니다.</li>
  </ol>
</section>

<footer>
  <p>실순위: 네이버 검색광고 /stats 평균 노출순위(9/10~9/11, 노출 가중, 같은 검색어의 등록본 합산). 주력 그룹이 서울·경기 권역과 강남역 반경 20km로 타기팅돼 있고 측정 PC가 네이버상 창원으로 잡혀 검색 화면을 직접 긁는 방식은 쓰지 않았습니다.</p>
  <p>추정가·예상 성과: 네이버 순위별 평균 입찰가 추정, 입찰가별 성과 추정(월 단위). 핵심 키워드 = 내원 핵심 질환 축 × (치료처 의도 · 월 1,000회 이상 · 최근 9일 클릭). 입찰가는 아직 바꾸지 않았습니다.</p>
</footer>
</div>
<div id="tip" hidden></div>

<script type="application/json" id="data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
(function(){
  var rows = JSON.parse(document.getElementById('data').textContent);
  var tb = document.querySelector('#full tbody'), cnt = document.getElementById('cnt'), q = document.getElementById('q');
  var st = { t: '', c: '', q: '', s: 'v', d: -1 };
  var tierW = { '상': 3, '중': 2, '하': 1 };
  var clsP = { '1~3위 입찰': 'p-top', '4~5위 입찰': 'p-mid', '입찰 5위 밖': 'p-low', '노출불가': 'p-off' };
  var clsL = { '1~3위 입찰': '1~3위', '4~5위 입찰': '4~5위', '입찰 5위 밖': '5위 밖', '노출불가': '노출 불가' };
  function n(v){ return v == null ? '<span class="dim">-</span>' : Number(v).toLocaleString('ko-KR'); }
  function e(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function rk(r){ if (r == null) return '<span class="dim">노출 없음</span>'; return '<span class="rank ' + (r <= 3.5 ? 'r-top' : r <= 5.5 ? 'r-mid' : 'r-low') + '">' + r + '</span>'; }
  function tc(t){ return '<span class="tier ' + (t === '상' ? 't-hi' : t === '중' ? 't-md' : 't-lo') + '">' + t + '</span>'; }
  function val(o, k){ if (k === 't') return tierW[o.t]; var v = o[k]; return v == null ? -1 : v; }
  function render(){
    var a = rows.filter(function(o){ return (!st.t || o.t === st.t) && (!st.c || o.c === st.c) && (!st.q || o.k.indexOf(st.q) >= 0); });
    a.sort(function(x, y){ var p = val(x, st.s), r = val(y, st.s); if (typeof p === 'string') return st.d * p.localeCompare(r); return st.d * (p - r); });
    cnt.textContent = a.length.toLocaleString('ko-KR') + '개' + (a.length > 400 ? ' · 상위 400개 표시' : '');
    tb.innerHTML = a.slice(0, 400).map(function(o){
      var plan = o.tb == null ? '<span class="dim">-</span>' : n(o.tb) + '<span class="sub">' + o.tp + '위' + (o.mv === '인상' ? ' · 인상' : o.mv === '인하' ? ' · 인하' : '') + '</span>';
      return '<tr><td class="l kw">' + e(o.k) + '</td><td>' + tc(o.t) + '</td><td class="l dim">' + e(o.a) + '</td><td>' + n(o.v) + '</td><td class="l"><span class="pill ' + clsP[o.c] + '">' + clsL[o.c] + '</span>' + (o.f ? ' <span class="dim">' + e(o.f) + '</span>' : '') + '</td><td>' + n(o.m) + '</td><td>' + n(o.e5) + '</td><td>' + n(o.e3) + '</td><td>' + rk(o.r) + '</td><td>' + plan + '</td><td class="l dim">' + e(o.g) + '</td></tr>';
    }).join('');
  }
  function chips(id, key){ var g = document.getElementById(id); g.addEventListener('click', function(ev){ var b = ev.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); }); st[key] = b.dataset.v; render(); }); }
  chips('tierChips', 't'); chips('clsChips', 'c');
  q.addEventListener('input', function(){ st.q = q.value.trim(); render(); });
  document.querySelectorAll('#full th button').forEach(function(b){ b.addEventListener('click', function(){ var k = b.dataset.s; if (st.s === k) st.d = -st.d; else { st.s = k; st.d = (k === 'k' || k === 'a') ? 1 : -1; } render(); }); });
  render();
  var tip = document.getElementById('tip');
  document.addEventListener('mousemove', function(ev){ var t = ev.target.closest('[data-tip]'); if (!t){ tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
    var x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 16) + 'px'; });
})();
</script>
`;
fs.writeFileSync(OUT, html);
console.log('HTML', OUT, (html.length / 1024).toFixed(0) + 'KB', '| 여유분 대표어', heads.length, heads.map(h => h.o.k).join(','), '+', headCost, '원', '+', headClk, '클릭');
