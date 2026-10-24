// report_metrics.json → _report_src/해울한의원_성과보고_20260715_20260815.html (화이트톤 A4)
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'reports', 'haeul_20260915');
const M = JSON.parse(fs.readFileSync(path.join(D, 'report_metrics.json'), 'utf8'));
const NAR = JSON.parse(fs.readFileSync(path.join(D, 'narrative.json'), 'utf8'));
const OUT = path.join(__dirname, '..', '_report_src', '해울한의원_성과보고_20260715_20260815.html');
const cur = M.cur, prv = M.prv;

const won = n => Math.round(n).toLocaleString('ko-KR');
const man = n => { const v = n / 10000; return (v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')) + '만'; };
const pct = (a, b) => b ? (a - b) / b * 100 : 0;
const sign = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const C = { main: '#2a78d6', pool: '#1baf7a', place: '#eb6834', grid: '#ebeae5', axis: '#c9c8bf', muted: '#8a8883' };
const kindName = { main: '파워링크', pool: '롱테일 자동풀', place: '네이버 플레이스' };

function nice(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

function stacked(field, fmtTick, title) {
  const S = cur.series, W = 700, H = 208, L = 50, R = 10, T = 14, B = 28;
  const pw = W - L - R, ph = H - T - B, n = S.length, band = pw / n, bw = Math.min(14, band * 0.62);
  const tot = S.map(d => d.main[field] + d.pool[field] + d.place[field]);
  const top = nice(Math.max(...tot, 1) * 1.08), y = v => T + ph - v / top * ph;
  // x축 라벨 위치: 5칸마다 + 마지막 날. 마지막 날과 3칸 이내로 붙는 눈금은 겹치므로 뺀다.
  const last = n - 1, ticks = new Set([last]);
  for (let i = 0; i <= last; i += 5) if (last - i >= 3) ticks.add(i);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + title + '">';
  for (let i = 0; i <= 4; i++) {
    const v = top * i / 4, yy = y(v);
    s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '" stroke="' + (i ? C.grid : C.axis) + '" stroke-width="' + (i ? 0.6 : 0.9) + '"/>'
      + '<text class="ax" x="' + (L - 6) + '" y="' + (yy + 2.4).toFixed(1) + '" text-anchor="end" fill="' + C.muted + '">' + fmtTick(v) + '</text>';
  }
  S.forEach((d, i) => {
    const cx = L + band * i + band / 2, x = cx - bw / 2; let base = 0;
    for (const k of ['place', 'main', 'pool']) {
      const v = d[k][field]; if (v <= 0) continue;
      const y0 = y(base + v), h = y(base) - y0;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.4, h).toFixed(1) + '" fill="' + C[k] + '" stroke="#fff" stroke-width=".7"/>';
      base += v;
    }
    if (ticks.has(i)) {
      const lab = d.day.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
      s += '<text class="ax" x="' + cx.toFixed(1) + '" y="' + (H - B + 13) + '" text-anchor="middle" fill="' + C.muted + '">' + lab + '</text>';
    }
  });
  return s + '</svg>';
}

function compare(rows) {
  return '<table class="cmp"><thead><tr><th>지표</th><th>직전 32일</th><th>이번 32일</th><th>증감</th><th></th></tr></thead><tbody>'
    + rows.map(r => {
      const d = pct(r.cur, r.prv), good = r.betterIsUp ? d >= 0 : d <= 0, w = Math.min(100, Math.abs(d));
      return '<tr><td class="nm">' + r.name + '</td><td class="n">' + r.f(r.prv) + '</td><td class="n b">' + r.f(r.cur) + '</td>'
        + '<td class="n ' + (good ? 'up' : 'dn') + '">' + sign(d) + '</td>'
        + '<td class="bar"><i class="' + (good ? 'up' : 'dn') + '" style="width:' + w.toFixed(0) + '%"></i></td></tr>';
    }).join('') + '</tbody></table>';
}

function kindTable() {
  const cell = (v, pv, f, up) => { const d = pct(v, pv); return '<td class="n">' + f(v) + '<em class="' + ((up ? d >= 0 : d <= 0) ? 'up' : 'dn') + '">' + sign(d) + '</em></td>'; };
  return '<table class="grid"><thead><tr><th>구분</th><th>노출</th><th>클릭</th><th>CTR</th><th>소진</th><th>CPC</th><th>평균순위</th></tr></thead><tbody>'
    + ['main', 'pool', 'place'].filter(k => cur.byKind[k].imp + prv.byKind[k].imp > 0).map(k => {
      const a = cur.byKind[k], b = prv.byKind[k];
      return '<tr><td class="nm"><i class="sw" style="background:' + C[k] + '"></i>' + kindName[k] + '</td>'
        + cell(a.imp, b.imp, won, true) + cell(a.clk, b.clk, won, true)
        + cell(a.ctr, b.ctr, n => n.toFixed(2) + '%', true)
        + cell(a.cost, b.cost, n => won(n) + '원', true)
        + cell(a.cpc, b.cpc, n => won(n) + '원', false)
        + cell(a.rnk, b.rnk, n => n ? n.toFixed(2) + '위' : '–', false) + '</tr>';
    }).join('')
    + '<tr class="tot"><td class="nm">합계</td><td class="n">' + won(cur.total.imp) + '</td><td class="n">' + won(cur.total.clk)
    + '</td><td class="n">' + cur.total.ctr.toFixed(2) + '%</td><td class="n">' + won(cur.total.cost)
    + '원</td><td class="n">' + won(cur.total.cpc) + '원</td><td class="n">' + cur.total.rnk.toFixed(2) + '위</td></tr>'
    + '</tbody></table>';
}

function campTable() {
  const rows = Object.entries(cur.byCamp).map(([id, a]) => ({ id, ...a, prv: prv.byCamp[id] }))
    .sort((x, y) => y.cost - x.cost || y.clk - x.clk);
  return '<table class="grid sm"><thead><tr><th>캠페인</th><th>노출</th><th>클릭</th><th>CTR</th><th>소진</th><th>CPC</th></tr></thead><tbody>'
    + rows.map(r => {
      const p = r.prv || { imp: 0, clk: 0, cost: 0, cpc: 0, ctr: 0 };
      const dl = pct(r.clk, p.clk), dc = pct(r.cpc, p.cpc);
      return '<tr><td class="nm"><i class="sw" style="background:' + C[r.kind] + '"></i>' + r.name + '</td>'
        + '<td class="n">' + won(r.imp) + '</td>'
        + '<td class="n">' + won(r.clk) + (p.clk ? '<em class="' + (dl >= 0 ? 'up' : 'dn') + '">' + sign(dl) + '</em>' : '') + '</td>'
        + '<td class="n">' + r.ctr.toFixed(2) + '%</td>'
        + '<td class="n">' + won(r.cost) + '원</td>'
        + '<td class="n">' + (r.cpc ? won(r.cpc) + '원' : '–') + (p.cpc && r.cpc ? '<em class="' + (dc <= 0 ? 'up' : 'dn') + '">' + sign(dc) + '</em>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 주차별(8일 단위) 추이 — 보고서의 핵심 주장인 "클릭률이 계속 올랐다"를 숫자로 보여준다
function weeks(p) {
  const out = [];
  for (let i = 0; i < p.series.length; i += 8) {
    const w = p.series.slice(i, i + 8);
    const t = w.reduce((s, d) => ({
      imp: s.imp + d.main.imp + d.pool.imp + d.place.imp,
      clk: s.clk + d.main.clk + d.pool.clk + d.place.clk,
      cost: s.cost + d.main.cost + d.pool.cost + d.place.cost,
    }), { imp: 0, clk: 0, cost: 0 });
    const lab = d => d.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
    out.push({ span: lab(w[0].day) + '–' + lab(w[w.length - 1].day), ...t, ctr: t.imp ? t.clk / t.imp * 100 : 0, cpc: t.clk ? t.cost / t.clk : 0 });
  }
  return out;
}
function weekTable() {
  const a = weeks(cur), b = weeks(prv), n = Math.max(a.length, b.length);
  let rows = '';
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    rows += '<tr><td class="nm">' + (i + 1) + '주차</td>'
      + '<td class="n">' + (y ? y.span : '–') + '</td><td class="n">' + (y ? y.ctr.toFixed(2) + '%' : '–') + '</td><td class="n">' + (y ? won(y.clk) : '–') + '</td>'
      + '<td class="n sep">' + (x ? x.span : '–') + '</td><td class="n b">' + (x ? x.ctr.toFixed(2) + '%' : '–') + '</td><td class="n">' + (x ? won(x.clk) : '–') + '</td></tr>';
  }
  return '<table class="grid sm"><thead><tr><th></th><th colspan="3">직전 32일</th><th colspan="3" class="sep">이번 32일</th></tr>'
    + '<tr><th></th><th>기간</th><th>CTR</th><th>클릭</th><th class="sep">기간</th><th>CTR</th><th>클릭</th></tr></thead><tbody>'
    + rows + '</tbody></table>';
}

const liveKinds = ['main', 'pool', 'place'].filter(k => cur.byKind[k].imp + prv.byKind[k].imp > 0);
const legend = '<div class="leg">' + liveKinds.map(k => '<span><i class="sw" style="background:' + C[k] + '"></i>' + kindName[k] + '</span>').join('') + '</div>';

const strip = '<div class="strip">' + NAR.highlights.map(h => {
  const a = h.path.split('.').reduce((o, k) => o[k], cur), b = h.path.split('.').reduce((o, k) => o[k], prv);
  const f = h.fmt === 'won' ? (n => won(n) + '원') : h.fmt === 'man' ? (n => man(n) + '회') : h.fmt === 'pct' ? (n => n.toFixed(2) + '%') : h.fmt === 'rnk' ? (n => n.toFixed(2) + '위') : (n => won(n) + '회');
  const d = pct(a, b), good = h.up ? d >= 0 : d <= 0;
  return '<div><div class="k">' + h.k + '</div><div class="v">' + f(a) + '</div><div class="d ' + (good ? 'up' : 'dn') + '">' + sign(d) + '</div><div class="s">직전 ' + f(b) + '</div></div>';
}).join('') + '</div>';

const cards = '<div class="cards">' + NAR.cards.map(c => '<div><div class="t">' + c.t + '</div><div class="b">' + c.b + '</div></div>').join('') + '</div>';

const CSS = [
  '@page{size:A4;margin:11mm}',
  '*,*::before,*::after{box-sizing:border-box}',
  ':root{--ink:#0b0b0b;--ink2:#3d3c39;--muted:#8a8883;--rule:#e6e5df;--axis:#c9c8bf;--wash:#f7f7f4;--paper:#fff;--accent:#2a78d6;--up:#0a7a43;--dn:#b23b2e}',
  'html,body{margin:0;padding:0}',
  "body{font-family:'Gothic A1','Malgun Gothic',system-ui,sans-serif;color:var(--ink2);background:#e9e9e6;font-size:9.2pt;line-height:14.4pt;word-break:keep-all;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
  '@media screen{body{padding:22px 10px}.sheet{width:210mm;max-width:100%;min-height:297mm;padding:12mm;margin:0 auto 20px;background:var(--paper);box-shadow:0 1px 14px rgba(0,0,0,.16)}}',
  '@media print{body{background:#fff}.sheet{padding:0;margin:0;box-shadow:none}.sheet+.sheet{break-before:page}}',
  'b,strong{font-weight:700;color:var(--ink)}',
  '.runner{display:flex;justify-content:space-between;padding-bottom:6pt;border-bottom:1px solid var(--rule);font-size:7.6pt;letter-spacing:.11em;color:var(--muted)}',
  'h1{margin:13pt 0 0;font-weight:800;font-size:20pt;line-height:26pt;color:var(--ink);letter-spacing:-.02em}',
  'h2{margin:16pt 0 0;font-weight:800;font-size:12.2pt;line-height:16pt;color:var(--ink)}',
  'h2 .no{display:inline-block;min-width:16pt;color:var(--accent)}',
  'h3{margin:11pt 0 0;font-weight:700;font-size:9.8pt;color:var(--ink)}',
  'p{margin:5pt 0 0}',
  '.lead{margin-top:7pt;font-size:10pt;line-height:16pt;max-width:168mm}',
  '.caption{margin-top:4pt;font-size:7.7pt;line-height:11.6pt;color:var(--muted)}',
  '.strip{display:flex;margin-top:11pt;border:1px solid var(--rule);background:var(--rule);gap:1px}',
  '.strip>div{flex:1;background:var(--paper);padding:7pt 7pt 8pt}',
  '.strip .k{font-size:7.6pt;color:var(--muted);letter-spacing:.04em}',
  '.strip .v{margin-top:2pt;font-size:13.4pt;line-height:17pt;font-weight:800;color:var(--ink);letter-spacing:-.01em}',
  '.strip .d{margin-top:1pt;font-size:8.6pt;font-weight:700}',
  '.strip .s{margin-top:2pt;font-size:7.4pt;color:var(--muted)}',
  '.up{color:var(--up)}.dn{color:var(--dn)}',
  '.chart{width:100%;height:auto;margin-top:8pt}',
  '.chart .ax{font-size:7pt}',
  '.leg{margin-top:3pt;display:flex;gap:12pt;font-size:7.8pt;color:var(--muted)}',
  '.sw{display:inline-block;width:7pt;height:7pt;border-radius:1.5pt;margin-right:4pt;vertical-align:-.5pt}',
  'table{width:100%;border-collapse:collapse;margin-top:9pt;font-size:8.4pt}',
  'th{font-weight:700;color:var(--muted);font-size:7.6pt;letter-spacing:.05em;text-align:right;padding:0 5pt 4pt;border-bottom:1px solid var(--axis)}',
  'th:first-child{text-align:left}',
  'td{padding:4.6pt 5pt;border-bottom:1px solid var(--rule);text-align:right}',
  'td.nm{text-align:left;color:var(--ink);font-weight:500}',
  'td.n{font-variant-numeric:tabular-nums}',
  'td.n em{display:inline-block;margin-left:5pt;font-style:normal;font-size:7.3pt;font-weight:700}',
  'tr.tot td{border-top:1.2px solid var(--axis);border-bottom:none;font-weight:800;color:var(--ink)}',
  'table.sm{font-size:8pt}',
  'th[colspan]{text-align:center}',
  'td.sep,th.sep{border-left:1px solid var(--rule);padding-left:8pt}',
  'td.b{font-weight:700;color:var(--ink)}',
  'table.cmp td.bar{width:34%;padding-right:0}',
  'table.cmp td.bar i{display:block;height:6pt;border-radius:1pt;background:var(--up);opacity:.82}',
  'table.cmp td.bar i.dn{background:var(--dn)}',
  '.cards{display:flex;gap:1px;margin-top:10pt;background:var(--rule);border:1px solid var(--rule)}',
  '.cards>div{flex:1;background:var(--paper);padding:9pt 9pt 10pt}',
  '.cards .t{font-weight:800;color:var(--ink);font-size:9.6pt;line-height:13pt}',
  '.cards .b{margin-top:4pt;font-size:8.4pt;line-height:13pt}',
  '.note{margin-top:11pt;padding:8pt 9pt;background:var(--wash);border-left:2.4pt solid var(--accent);font-size:8.4pt;line-height:13.2pt}',
  '.foot{margin-top:14pt;padding-top:6pt;border-top:1px solid var(--rule);font-size:7.4pt;color:var(--muted)}',
  'ul{margin:5pt 0 0;padding-left:13pt}li{margin-top:3pt}',
].join('\n');

const R = n => '<div class="runner"><span>해울한의원 · 네이버 검색광고</span><span>' + cur.label + '</span><span>' + n + '</span></div>';

const html = '<title>해울한의원 성과보고 2026.07.15–08.15</title>\n'
  + '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@300;400;500;700;800&display=swap">\n'
  + '<style>' + CSS + '</style>\n'
  + '<section class="sheet">' + R('1 / 3')
  + '<h1>' + NAR.title + '</h1>'
  + '<p class="lead">' + NAR.lead + '</p>'
  + strip
  + '<p class="caption">네이버 검색광고 <b>/stats</b> API 실측값. 소진액은 부가세 별도. 평균 노출순위는 노출 가중평균이며 숫자가 작을수록 상위입니다.</p>'
  + '<h2><span class="no">01</span>일별 흐름</h2>'
  + '<p>' + NAR.flow + '</p>'
  + '<h3>일별 클릭</h3>' + stacked('clk', v => won(v), '일별 클릭') + legend
  + '<h3>일별 소진</h3>' + stacked('cost', v => man(v), '일별 소진') + legend
  + '<div class="foot">해울한의원 네이버 검색광고 성과보고 · 대상 기간 ' + cur.label + ' · 비교 기간 ' + prv.label + '</div>'
  + '</section>\n'
  + '<section class="sheet">' + R('2 / 3')
  + '<h1>무엇이 좋아졌나</h1>' + cards
  + '<h2><span class="no">02</span>지표 비교</h2>'
  + compare([
    { name: '클릭 수', prv: prv.total.clk, cur: cur.total.clk, f: won, betterIsUp: true },
    { name: '노출 수', prv: prv.total.imp, cur: cur.total.imp, f: won, betterIsUp: true },
    { name: '클릭률 CTR', prv: prv.total.ctr, cur: cur.total.ctr, f: n => n.toFixed(2) + '%', betterIsUp: true },
    { name: '클릭당 비용 CPC', prv: prv.total.cpc, cur: cur.total.cpc, f: n => won(n) + '원', betterIsUp: false },
    { name: '총 광고비', prv: prv.total.cost, cur: cur.total.cost, f: n => won(n) + '원', betterIsUp: false },
    { name: '평균 노출순위', prv: prv.total.rnk, cur: cur.total.rnk, f: n => n.toFixed(2) + '위', betterIsUp: false },
  ])
  + '<p class="caption">막대 길이는 증감률의 크기입니다. 초록은 개선, 빨강은 악화 방향입니다.</p>'
  + '<h2><span class="no">03</span>광고 유형별</h2>' + kindTable()
  + '<p class="caption">작은 글씨는 직전 32일 대비 증감률입니다. CPC 와 평균순위는 내려간 쪽이 개선입니다.</p>'
  + '<div class="note">' + NAR.kindNote + '</div>'
  + '<div class="foot">해울한의원 네이버 검색광고 성과보고 · ' + cur.label + '</div>'
  + '</section>\n'
  + '<section class="sheet">' + R('3 / 3')
  + '<h1>캠페인별 성과</h1>' + campTable()
  + '<p class="caption">소진액 순. 작은 글씨는 직전 32일 대비 증감률이며, CPC 는 내려간 쪽이 개선입니다.</p>'
  + '<h2><span class="no">04</span>주차별 클릭률</h2>'
  + weekTable()
  + '<p class="caption">8일 단위. 직전 32일은 0.56% → 0.40% 로 내려갔고, 이번 32일은 0.37% → 0.68% 로 올라갔습니다.</p>'
  + '<h2><span class="no">05</span>다음 한 달</h2>'
  + '<ul>' + NAR.next.map(x => '<li>' + x + '</li>').join('') + '</ul>'
  + '<div class="note">' + NAR.caveat + '</div>'
  + '<div class="foot">해울한의원 네이버 검색광고 성과보고 · ' + cur.label + ' · 생성 ' + new Date().toISOString().slice(0, 10) + '</div>'
  + '</section>';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('HTML 생성:', path.relative(path.join(__dirname, '..'), OUT), Math.round(html.length / 1024) + 'KB');
