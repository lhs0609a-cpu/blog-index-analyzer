// 발굴분(vol_all) vs 계정 전수(bytext) 대조 → 미등록 / 등록됐지만 꺼짐 / 정상 으로 가른다.
const fs = require('fs'), path = require('path');
const { why } = require('./_sojam_d0828_rule');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = s => String(s).replace(/\s+/g, '');
const vol = J(D16 + 'mine/vol_all.json');
const byText = J(D16 + 'inv/bytext.json');
const groups = new Map(J(D16 + 'inv/groups.json').map(g => [g.id, g]));
const camps = new Map(J(D16 + 'inv/campaigns.json').map(c => [c.id, c]));

const AXES = [
  ['아토피', /아토피|태열/], ['한포진', /한포진/], ['지루성·두피', /지루|두피염|두피가려|두피각질|비듬/], ['접촉성피부염', /접촉성/],
  ['묘기증', /묘기/], ['건선', /건선/], ['두드러기', /두드러기/], ['여드름', /여드름|뾰루지/],
  ['은밀부위', /항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|질입구|소음순|유두|유륜|엉덩이|겨드랑/],
  ['습진', /습진|피부염|화폐상/], ['가려움·소양', /가려|간지|소양/], ['백반증', /백반/], ['무좀·백선', /무좀|백선|어루러기|완선/],
  ['다한증·땀띠', /다한|땀띠/], ['구내염·구순염', /구내염|구순염|입술염|구각/], ['모낭염·한선염', /모낭염|한선염/],
  ['탈스테로이드', /탈스|스테로이드/], ['난치·자가면역', /난치성피부|자가면역|천포창|양진|태선|어린선/],
  ['피부질환 일반', /피부질환|피부병|피부한의원|피부과|피부/],
];
const PRODUCT = /연고|크림|로션|샴푸|비누|세안제|패치|에센스|화장품|영양제|음식|짜는|도구|파스|올리브영|다이소|쿠팡|가격비교/;
const PET = /강아지|고양이|반려|애견|댕댕|냥이/;
const OOS = /사마귀|성형|레이저|제모|기미|비립종|한관종|보톡스|필러|리프팅|문신|다이어트|난임|비염|축농증|변비|두통|어지럼|당뇨|고혈압|암치료|검정고시|풋살|청소|창업|탈모|하지정맥/;

const rows = [];
for (const [k, v] of Object.entries(vol)) {
  const t = norm(k);
  if (!t || t.length > 25) continue;
  if (PET.test(t) || OOS.test(t)) continue;
  const ax = AXES.find(([, r]) => r.test(t));
  if (!ax) continue;                                   // 진료 축에 안 걸리면 버린다
  const total = (v.pc || 0) + (v.mo || 0);
  if (total <= 0) continue;
  const regs = byText[t] || [];
  const live = regs.filter(r => {
    const g = groups.get(r.gid) || {}, c = camps.get(g.cid) || {};
    return !r.lock && !g.lock && !c.lock && r.st !== 'PAUSED';
  });
  const bestBid = live.length ? Math.max(...live.map(r => {
    const g = groups.get(r.gid) || {};
    return Math.round((r.ugb ? (g.bid || 0) : (r.bid || 0)) * (g.mw ?? 100) / 100);
  })) : 0;
  const scope = why(t);
  rows.push({
    k: t, axis: ax[0], vol: total, pc: v.pc, mo: v.mo, src: v.src, product: PRODUCT.test(t),
    scope, nReg: regs.length, nLive: live.length, bid: bestBid,
    state: !regs.length ? '미등록' : !live.length ? '등록됐지만 꺼짐' : bestBid <= 100 ? '켜짐·70원' : '켜짐·입찰있음',
  });
}
rows.sort((a, b) => b.vol - a.vol);
fs.writeFileSync(D16 + 'gap.json', JSON.stringify(rows));
const won = n => Math.round(n || 0).toLocaleString('ko-KR');
const by = {}; for (const r of rows) { const x = by[r.state] = by[r.state] || { n: 0, vol: 0 }; x.n++; x.vol += r.vol; }
console.log('발굴 실존 중 진료 축 =', rows.length, '개 (제품어', rows.filter(r => r.product).length, '· 타지역', rows.filter(r => r.scope === '타지역').length, ')');
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].vol - a[1].vol)) console.log('  ' + k + ': ' + v.n + '개 · 월검색 합 ' + won(v.vol));
console.log('');
const NEW = rows.filter(r => r.state === '미등록' && !r.product);
console.log('★ 미등록(제품어 제외)', NEW.length, '개 · 월검색 합', won(NEW.reduce((a, r) => a + r.vol, 0)));
const nby = {}; for (const r of NEW) { const x = nby[r.axis] = nby[r.axis] || { n: 0, vol: 0 }; x.n++; x.vol += r.vol; }
for (const [k, v] of Object.entries(nby).sort((a, b) => b[1].vol - a[1].vol)) console.log('   ' + k.padEnd(14) + v.n + '개 · 월 ' + won(v.vol));
console.log('');
console.log('   미등록 상위 40:');
for (const r of NEW.slice(0, 40)) console.log('     ' + r.k.padEnd(22) + ('월' + won(r.vol)).padStart(9) + '  ' + r.axis + (r.scope ? ' [' + r.scope + ']' : ''));
