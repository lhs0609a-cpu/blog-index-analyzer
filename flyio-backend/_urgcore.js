// 내원가능성 높은데 순위가 낮거나 입찰이 낮은 키워드 전수 (2026-09-16).
// 이제 전수 인벤토리(bytext) + 소재 상태(ads.jsonl) 가 있으니 '실제로 도는 등록'만 보고 판단한다.
// 내원가능성 = 상담일지 실측 축 내원율 × 비고에서 잰 간절 리프트 [[sojam-urgency-from-sheet]]
const fs = require('fs'), path = require('path');
const D15 = path.join(__dirname, '../reports/sojam-20260915/');
const D16 = path.join(__dirname, '../reports/sojam-20260916/');
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const norm = s => String(s).replace(/\s+/g, '');

const byText = J(D16 + 'inv/bytext.json');
const groups = new Map(J(D16 + 'inv/groups.json').map(g => [g.id, g]));
const camps = new Map(J(D16 + 'inv/campaigns.json').map(c => [c.id, c]));
const ads = new Map();
for (const l of fs.readFileSync(D16 + 'ads.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; const d = JSON.parse(l); ads.set(d.gid, d); }
// 실순위·노출 (9/12~14 창 + 9/15)
const win = J(D15 + 'stats_win.json'), day = J(D15 + 'day_20260915.json');
// 검색량 — 아는 것 전부 합침
const vol = {};
const addVol = o => { for (const [k, v] of Object.entries(o)) { if (!v) continue; const t = (v.pc || 0) + (v.mo || 0); if (t > 0 && !vol[norm(k)]) vol[norm(k)] = t; } };
for (const f of [D16 + 'mine/vol_all.json', D15 + 'vol_today.json', D15 + 'exax_vol.json']) { try { addVol(J(f)); } catch (e) { } }

const AXES = [
  ['아토피', /아토피|태열/], ['한포진', /한포진/], ['지루성·두피', /지루|두피염|두피가려|두피각질|비듬/], ['접촉성피부염', /접촉성/],
  ['묘기증', /묘기/], ['건선', /건선/], ['두드러기', /두드러기/], ['여드름', /여드름|뾰루지/],
  ['은밀부위', /항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|질입구|소음순|유두|유륜|엉덩이|겨드랑/],
  ['습진', /습진|피부염|화폐상/], ['가려움·소양', /가려|간지|소양/], ['백반증', /백반/], ['무좀·백선', /무좀|백선|어루러기|완선/],
  ['다한증·땀띠', /다한|땀띠/], ['구내염·구순염', /구내염|구순염|입술염|구각/], ['모낭염·한선염', /모낭염|한선염/],
  ['탈스테로이드', /탈스|스테로이드/], ['난치·자가면역', /난치성피부|자가면역|천포창|양진|태선|어린선/], ['피부질환 일반', /피부질환|피부병|피부한의원/],
];
const AXRATE = { '아토피': 62 / 115, '가려움·소양': 55 / 116, '습진': 58 / 138, '두드러기': 48 / 102, '건선': 17 / 41, '피부질환 일반': 17 / 51,
  '여드름': 15 / 22, '지루성·두피': 14 / 34, '접촉성피부염': 13 / 23, '한포진': 12 / 29, '묘기증': 9 / 15, '은밀부위': 8 / 16,
  '모낭염·한선염': 1 / 2, '구내염·구순염': 1 / 4, '난치·자가면역': 1 / 6, '무좀·백선': 1 / 5, '다한증·땀띠': 1 / 2, '탈스테로이드': .3, '백반증': .05 };
const SIG = [['점점 심해짐', 1.66, /번지|퍼지|퍼졌|심해지|점점|갑자기|번짐|악화/], ['재발 반복', 1.64, /재발|자꾸|반복|또생|끊으면|중단하면|낫다가|안낫|안나아/],
  ['오래됨', 1.57, /만성|몇년|수년|오래된|년째/], ['타 치료처', 1.54, /한의원|한방|대학병원|병원|의원|클리닉|잘하는|명의|용한|전문|추천/],
  ['어릴때부터', 1.51, /성인아토피|어릴때|유아기|태열|소아|초등|중학생|고등학생/], ['막막·절박', 1.46, /어떻게해야|어떡|방법없|도와|살려|절박|막막|미치겠|죽겠/],
  ['가족 대리', 1.45, /아기|아이|신생아|영아|유아|돌쟁이|아들|딸|엄마|남편|아내|부모/], ['전신·온몸', 1.41, /전신|온몸|몸전체|여기저기/],
  ['스테로이드', 1.37, /스테로이드|탈스|약끊|리바운드/], ['진물·피', 1.19, /진물|피나|짓무|딱지|터져|갈라져|헐어/]];
const PEN = [['10년 이상', .94, /10년|십년|평생/], ['정보탐색', .70, /사진|종류|차이|전염|뜻|영어|무엇/], ['제품·자가해결', .55, /연고|크림|로션|샴푸|비누|세안제|패치|에센스|영양제|음식|약추천|바르는|먹는약/]];
const CUT = /무좀|백선|완선|어루러기|조갑|콜린성|검사|체질진단|알러지내과/;   // 어제 지시로 내린 축
const JUNK = /피부과|외과|치질|치핵|치루|대장|내시경|항문암|항문출혈|항문농양|피부암|흉터|압출|염증주사|아그네스|보톡스|필러|리프팅|제모|문신|다이어트|반려|강아지|고양이|피부관리|미용|에스테틱|유산균|세정제|청결제|클렌저|보습제|지성피부|닭살|재생|이식|장벽|민감성/;
const NOISE = /간지럼(?!증)|간지럽히/;

const rows = [];
for (const [k, regs] of Object.entries(byText)) {
  if (CUT.test(k) || JUNK.test(k) || NOISE.test(k)) continue;
  const v = vol[k] || 0;
  const ax = AXES.find(([, r]) => r.test(k)); if (!ax) continue;
  const ar = AXRATE[ax[0]]; if (!ar) continue;
  // 실제로 도는 등록만
  const live = regs.filter(r => {
    const g = groups.get(r.gid) || {}, c = camps.get(g.cid) || {}, a = ads.get(r.gid) || { ok: 0 };
    return !r.lock && !g.lock && !c.lock && r.st !== 'PAUSED' && r.ins === 'APPROVED' && a.ok > 0;
  }).map(r => { const g = groups.get(r.gid) || {}; return { ...r, grp: g.name, eff: Math.round((r.ugb ? (g.bid || 0) : (r.bid || 0)) * (g.mw ?? 100) / 100) }; });
  const bid = live.length ? Math.max(...live.map(r => r.eff)) : 0;
  // 실순위 — 4일 노출가중
  let rs = 0, ri = 0, imp = 0, clk = 0;
  for (const r of regs) { const a = win[r.id] || {}, b = day[r.id] || {}; imp += (a.imp || 0) + (b.imp || 0); clk += (a.clk || 0) + (b.clk || 0);
    if (a.rank && a.imp) { rs += a.rank * a.imp; ri += a.imp; } if (b.rank && b.imp) { rs += b.rank * b.imp; ri += b.imp; } }
  let mult = 1; const sig = [];
  for (const [n, w, r] of SIG) if (r.test(k)) { mult *= w; sig.push(n); }
  for (const [n, w, r] of PEN) if (r.test(k)) { mult *= w; sig.push('−' + n); }
  rows.push({ k, axis: ax[0], vol: v, bid, nLive: live.length, grp: live[0] ? live[0].grp : null,
    rank: ri ? +(rs / ri).toFixed(1) : null, imp, clk, sig,
    score: +(40.5 * mult * ar / 0.405).toFixed(1) });
}
module.exports={rows};