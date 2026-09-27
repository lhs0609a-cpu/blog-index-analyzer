// 소잠 — 고통·괴로움 표현 검색어 발굴 (2026-09-11).
// 9/10 은밀부위·가려움 축은 keywordstool 로만 포화시켰다. 여기선 자동완성(실재 검증기)으로
// "주어형·고통 표현" 질의를 긁고, 나온 표면을 keywordstool 로 볼륨 확인 + 연관 1웨이브 확장한다.
// 사용: node _pain_harvest.js ac | vol
// 볼륨 원문 보존: "< 10" 은 lt=true, v=0.
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const DIR = path.join(__dirname, '../reports/sojam-20260911/pain');
fs.mkdirSync(DIR, { recursive: true });
const P = n => path.join(DIR, n);
const norm = s => String(s).replace(/\s+/g, '').trim();
const pv = s => { s = String(s); const lt = s.indexOf('<') >= 0; return { v: lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10), lt }; };
const JAMO = [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'];

// 피부 신호: 증상·질환 어간. 통증은 피부 통증 표현만(허리·관절 통증 제외).
const SKIN = /가려|가렵|간지|소양|따가|따끔|쓰라|쓰려|화끈|작열|진물|짓무|갈라|트임|트고|찢어|벗겨|까져|헐어|헐었|물집|수포|각질|비늘|발진|습진|피부염|아토피|태열|한포진|지루|두피|비듬|양진|태선|완선|칸디다|간찰|백선|무좀|어루러기|모낭염|한선염|구순염|입술|구각|구내염|포진|헤르페스|곤지름|스테로이드|탈스|리바운드|땀띠|다한|백반|피부|살갗|긁|딱지|고름|착색|색소|붉은|빨갛|두드러|습해|축축|건조|거칠|진피|상처|염증|곰팡이|진균|소양증|묘기/;
const PART = /항문|똥꼬|엉덩이|사타구니|서혜|허벅지안쪽|음부|외음부|회음|음순|질입구|질주변|성기|생식기|음경|귀두|포피|고환|음낭|불알|치골|음모|유두|유륜|젖꼭지|가슴밑|가슴아래|겨드랑|y존|Y존|밑이|밑부분|꼬리뼈/;
const SUFFER = /너무|미치|미칠|죽겠|죽을|못참|참을수|잠을|잠못|못자|밤에|밤마다|새벽|피나|피가|진물|안낫|안나|계속|심해|심할|심한|극심|악화|재발|평생|몇년|수년|오래|만성|난치|완치|고통|괴로|아파|아프|통증|쓰라|따가|화끈|찢어|갈라|벗겨|안멈|끊|안들|소용없/;

const PRIV_SUBJ = ['항문이', '항문 주변', '항문 주위', '똥꼬가', '똥꼬', '사타구니가', '사타구니', '허벅지 안쪽', '음부가', '음부', '외음부가', '외음부',
  '질입구가', '질입구', '소음순이', '소음순', '대음순이', '회음부가', '회음부', '고환이', '고환', '음낭이', '음낭', '불알이', '귀두가', '귀두',
  '성기가', '성기', '음경', '생식기가', '생식기', '유두가', '유두', '젖꼭지가', '젖꼭지', '가슴 밑', '가슴밑', '가슴 아래', '겨드랑이가', '겨드랑이',
  '엉덩이가', '엉덩이', '엉덩이 사이', '엉덩이골', '꼬리뼈', 'y존', 'Y존이', '밑이', '밑이 가려', '치골', '음모', '서혜부'];
const PRIV_TAIL = [' 가려', ' 간지러', ' 따가', ' 쓰라', ' 아파', ' 짓무', ' 갈라', ' 진물', ' 붉', ' 빨갛', ' 화끈', ' 헐', ' 까져', ' 습진', ' 각질', ' 착색', ' 물집', ' 뭐가', ' 오돌토돌', ' 하얗', ' 거뭇', ' 냄새'];
const SUFFER_Q = ['가려워서 잠을', '가려워서 잠', '가려워 미칠', '가려워 죽겠', '가려워 죽을', '너무 가려워', '너무 가려워요', '미치도록 가려', '미칠듯한 가려움',
  '참을 수 없는 가려움', '피나도록 긁', '피가 나도록', '긁어서 피', '긁어서 진물', '긁으면 진물', '긁으면 피', '밤마다 가려', '밤에 너무 가려', '밤만 되면 가려',
  '자려고 누우면 가려', '잘때 가려', '새벽에 가려', '온몸이 가려', '온몸이 간지러', '몸이 가려', '몸이 간지러', '몸이 너무 가려', '전신이 가려', '다리가 가려', '팔이 가려', '등이 가려',
  '피부가 따가', '피부가 쓰라', '피부가 화끈', '피부가 아파', '피부가 찢어', '피부가 갈라', '피부가 벗겨', '피부가 따끔', '피부가 헐', '피부가 두꺼워', '피부가 코끼리',
  '피부 진물', '진물이 계속', '진물이 안멈', '진물 안멈', '진물 멈추는', '진물 날때', '손이 갈라', '손가락 갈라', '손끝 갈라', '손가락 끝 갈라', '손바닥 갈라', '손바닥 벗겨',
  '발뒤꿈치 갈라', '발바닥 갈라', '발가락 사이 갈라', '발가락 사이 짓무', '입술이 갈라', '입술 갈라짐', '입꼬리 찢어', '입꼬리 갈라', '손에 물집', '발에 물집', '손 물집 가려',
  '손가락 물집', '한포진 너무', '한포진 통증', '한포진 진물', '한포진 터트', '아토피 너무', '아토피 밤에', '아토피 진물', '아토피 피나', '아토피 잠', '아토피 고통',
  '아이 아토피 긁', '아기 밤에 긁', '아기 긁어서', '아기가 너무 긁', '아이가 밤에 긁', '아이가 가려워', '스테로이드 끊', '스테로이드 끊고', '탈스 너무', '탈스 진물', '탈스테로이드 기간',
  '연고 안들', '연고 발라도', '연고 끊으면', '피부과 가도 안낫', '피부과 다녀도', '병원 가도 안낫', '몇년째 가려', '몇년째 습진', '10년 습진', '평생 가려', '가려움 안낫',
  '가려움 원인 모름', '원인 모를 가려움', '약 먹어도 가려', '항히스타민 안들', '가려움 안멈', '긁고 싶', '긁는 버릇', '긁은 자국', '긁은 상처', '긁어서 상처', '긁어서 딱지', '딱지가 계속',
  '피부가 너무 건조해서', '건조해서 가려', '씻고 나면 가려', '샤워 후 가려', '땀나면 가려', '더우면 가려', '추우면 가려', '술 마시면 가려', '스트레스 받으면 가려', '생리전 가려', '생리할때 가려',
  '임신중 가려', '출산후 가려', '갱년기 가려', '노인 가려', '할머니 가려', '할아버지 가려', '어르신 가려'];
const DIS = ['한포진', '아토피', '습진', '지루성피부염', '지루성두피염', '주부습진', '화폐상습진', '결절성양진', '양진', '태선', '완선', '칸디다', '간찰진', '탈스테로이드',
  '스테로이드', '구순염', '입술염', '구각염', '구내염', '단순포진', '입술포진', '모낭염', '화농성한선염', '백선', '무좀', '발톱무좀', '손발톱무좀', '피부소양증', '소양증',
  '접촉성피부염', '어린선', '땀띠', '다한증', '백반증', '천포창', '피부묘기증', '진물', '각질', '손습진', '발습진', '귀습진', '눈가습진', '입주변습진'];
const DIS_TAIL = [' 너무', ' 통증', ' 아파', ' 따가', ' 쓰라', ' 진물', ' 갈라', ' 피', ' 밤', ' 잠', ' 미치', ' 심할때', ' 심해', ' 악화', ' 안낫', ' 재발', ' 끊', ' 완치', ' 후기', ' 고통', ' 괴로', ' 극복', ' 오래', ' 만성'];
const WHO = ['아기', '아이', '우리아이', '신생아', '유아', '초등학생', '중학생', '고등학생', '수험생', '임산부', '임신중', '노인', '어르신', '남자', '여자', '직장인', '군인',
  '출산후', '생리전', '갱년기', '샤워후', '땀나면', '밤에', '새벽에', '잘때', '겨울에', '여름에', '환절기', '술먹으면', '스트레스'];
const WHO_TAIL = [' 가려움', ' 피부', ' 습진', ' 아토피', ' 진물', ' 따가', ' 간지러', ' 두드러기 아닌', ' 긁'];

function queries() {
  const q = new Set();
  for (const s of PRIV_SUBJ) { q.add(s); q.add(s + ' '); for (const j of JAMO) q.add(s + ' ' + j); for (const t of PRIV_TAIL) q.add(s + t); }
  for (const s of SUFFER_Q) { q.add(s); for (const j of JAMO) q.add(s + ' ' + j); }
  for (const d of DIS) for (const t of DIS_TAIL) q.add(d + t);
  for (const w of WHO) for (const t of WHO_TAIL) q.add(w + t);
  return [...q];
}

async function ac(q, st) {
  const u = 'https://ac.search.naver.com/nx/ac?' + new URLSearchParams({ q, con: '0', frm: 'nv', ans: '2', r_format: 'json', r_enc: 'UTF-8', r_unicode: '0', t_koreng: '1', run: '2', rev: '4', q_enc: 'UTF-8', st: String(st) });
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
      const j = await r.json(); const out = [];
      for (const blk of j.items || []) for (const it of blk) if (Array.isArray(it) && it[0]) out.push(it[0]);
      return out;
    } catch (e) { await sleep(500 + 800 * t); }
  }
  return null;
}

async function stageAC(extraRoots) {
  const FF = P('ac_found.json'), DF = P('ac_doneq.txt');
  const found = fs.existsSync(FF) ? JSON.parse(fs.readFileSync(FF, 'utf8')) : {};
  const done = new Set(fs.existsSync(DF) ? fs.readFileSync(DF, 'utf8').split('\n').filter(Boolean) : []);
  const qs = (extraRoots || queries()).filter(q => !done.has(q));
  console.error('자동완성 질의', qs.length, '| 기존 표면', Object.keys(found).length);
  let i = 0, n = 0, fail = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < qs.length) {
      const q = qs[i++];
      const a = await ac(q, 100), b = await ac(q, 111);
      if (a === null && b === null) { fail++; continue; }
      for (const x of [...(a || []), ...(b || [])]) { const k = x.trim(); if (!k || k.length > 30) continue; (found[k] = found[k] || { n: 0, q: q }).n++; }
      fs.appendFileSync(DF, q + '\n');
      if (++n % 300 === 0) { fs.writeFileSync(FF, JSON.stringify(found)); console.error(' ', n, '/', qs.length, '표면', Object.keys(found).length, '실패', fail); }
    }
  }));
  fs.writeFileSync(FF, JSON.stringify(found));
  console.log('AC DONE 질의', n, '실패', fail, '표면', Object.keys(found).length);
}

// 자동완성 표면 중 피부·고통 신호가 있는 것을 keywordstool 로 볼륨 확인 + 연관 1웨이브.
async function stageVol() {
  const found = JSON.parse(fs.readFileSync(P('ac_found.json'), 'utf8'));
  const cand = new Map();
  for (const k of Object.keys(found)) { const nk = norm(k); if (nk.length < 2 || !/[가-힣]/.test(nk)) continue; if (SKIN.test(nk) || PART.test(nk)) { if (!cand.has(nk)) cand.set(nk, k); } }
  const VF = P('vol.jsonl'), HF = P('vol_hints.txt');
  const vol = new Map();
  if (fs.existsSync(VF)) for (const l of fs.readFileSync(VF, 'utf8').split('\n')) if (l.trim()) { const d = JSON.parse(l); vol.set(d.k, d); }
  const hdone = new Set(fs.existsSync(HF) ? fs.readFileSync(HF, 'utf8').split('\n').filter(Boolean) : []);
  const wave = async (list, w) => {
    const todo = list.filter(k => !hdone.has(k) && k.length <= 25 && !/[^가-힣a-zA-Z0-9]/.test(k));
    console.error('웨이브', w, '힌트', todo.length);
    let fresh = 0;
    for (let i = 0; i < todo.length; i += 5) {
      const h = todo.slice(i, i + 5);
      let r = null;
      try { r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(h.join(',')) + '&showDetail=1', null, 3808925, 3); }
      catch (e) { // 한 개가 배치를 깨면 단건으로
        for (const x of h) { try { const r1 = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(x) + '&showDetail=1', null, 3808925, 2); fresh += take(r1, w); } catch (e2) {} await sleep(250); }
      }
      if (r) fresh += take(r, w);
      for (const x of h) { hdone.add(x); fs.appendFileSync(HF, x + '\n'); }
      if ((i / 5) % 100 === 0) console.error('  ', i, '/', todo.length, '누적', vol.size);
      await sleep(280);
    }
    return fresh;
  };
  const take = (r, w) => {
    let f = 0;
    for (const k of (r && r.keywordList) || []) {
      if (vol.has(k.relKeyword)) continue;
      const pc = pv(k.monthlyPcQcCnt), mo = pv(k.monthlyMobileQcCnt);
      const d = { k: k.relKeyword, pc: pc.v, mo: mo.v, pcLt: pc.lt, moLt: mo.lt, comp: k.compIdx, w };
      vol.set(d.k, d); fs.appendFileSync(VF, JSON.stringify(d) + '\n'); f++;
    }
    return f;
  };
  await wave([...cand.keys()], 1);
  // 연관 확장: 피부·고통(또는 은밀부위) 신호가 있고 실볼륨 10+ 인 새 어
  const w2 = [...vol.values()].filter(d => !(d.pcLt && d.moLt) && SKIN.test(d.k) && (SUFFER.test(d.k) || PART.test(d.k))).map(d => d.k);
  await wave(w2, 2);
  console.log('VOL DONE 후보', cand.size, '| keywordstool 누적', vol.size);
}

module.exports = { SKIN, PART, SUFFER, norm };
if (require.main === module) {
  const st = process.argv[2];
  (st === 'ac' ? stageAC() : st === 'vol' ? stageVol() : Promise.reject(new Error('ac|vol')))
    .catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
}
