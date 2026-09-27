// 소잠 딥리서치 — 리프트 높은 축(아토피 11.2 / 치료처 8.2 / 건선 4.9 / 두드러기·화농성 3.1 / 한포진 2.5 / 지루성 2.1 / 자반 2.1)에서
// '사람이 실제로 치는 말'을 자동완성으로 캔다. [[keyword-discovery-validation]] 의 교훈을 그대로 적용:
//   · 완성형 조합을 던지지 않는다 → 접두형(어간 + 1~2글자)으로 네이버가 완성하게 한다 (수율 34배)
//   · 초성은 반드시 띄어쓰고 1자만 (2자는 즉시 포화)
//   · 자동완성만이 실재 검증기다. keywordstool 은 아무 문자열이나 돌려준다.
//   · 의사결정 꼬리(후기·비용·실비·보험)는 자동완성에서만 나오고 내원에 가장 가깝다.
// 사용: node _sojam_20260922_dig.js ac | jamo | rel | vol
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const DIR = path.join(__dirname, '../reports/sojam-20260922-dig');
fs.mkdirSync(DIR, { recursive: true });
const P = n => path.join(DIR, n);
const norm = s => String(s).replace(/\s+/g, '').trim();
const pv = s => { s = String(s); const lt = s.indexOf('<') >= 0; return { v: lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10), lt }; };
const JAMO = [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'];

// ── 리프트 높은 축의 어간. 계정 보유량이 얇은 축(자반·주사·화농성·접촉성)을 특히 촘촘히.
const STEM = [
  // 아토피 (리프트 11.2)
  '아토피', '성인아토피', '어른아토피', '아기아토피', '영아아토피', '소아아토피', '유아아토피', '태열', '신생아태열',
  '얼굴아토피', '눈아토피', '목아토피', '손아토피', '전신아토피', '아토피피부염', '중증아토피', '만성아토피',
  // 치료처 일반 (8.2)
  '피부질환', '피부염', '난치성피부염', '만성피부염', '피부병', '피부트러블', '피부면역', '자가면역피부',
  // 건선 (4.9)
  '건선', '두피건선', '손톱건선', '물방울건선', '농포성건선', '전신건선',
  // 두드러기 (3.1)
  '두드러기', '만성두드러기', '콜린성두드러기', '한랭두드러기', '압박두드러기', '피부묘기증',
  // 화농성한선염 (3.1) — 계정 179개뿐
  '화농성한선염', '한선염', '겨드랑이화농성', '사타구니화농성', '엉덩이화농성',
  // 한포진 (2.5)
  '한포진', '손한포진', '발한포진', '손가락한포진', '만성한포진', '재발성한포진',
  // 지루성 (2.1)
  '지루성피부염', '지루성두피염', '얼굴지루성', '두피지루성',
  // 자반증 (2.1) — 계정 65개뿐
  '자반증', '알레르기성자반증', '색소성자반증', '다리자반증', '혈관성자반증', '특발성자반증',
  // 주사피부염 (1.0) — 계정 133개뿐
  '주사피부염', '안면홍조', '코주사', '주사코', '딸기코',
  // 습진 (1.0)
  '습진', '주부습진', '손습진', '화폐상습진', '사타구니습진', '발습진', '귀습진', '유두습진', '한포성습진',
  // 계정이 비어 있는 인접 축 (수집 단계에선 넓게 받는다 — 교훈 8/14)
  '결절성양진', '편평태선', '경화태선', '천포창', '유사천포창', '접촉성피부염', '농가진', '다형홍반', '장미색비강진',
  '편평사마귀', '어루러기', '백색비강진', '한관종', '비립종',
];

// ── 접두 꼬리: 완성형을 만들지 않고 1~2글자만 준다.
const TAIL_CARE = ['한', '한의', '한방', '병', '병원', '의원', '치', '치료', '잘', '유명', '명의', '전문', 'centre'];
const TAIL_DEC = ['후', '후기', '비', '비용', '가격', '실', '보험', '추천', '효과', '완치', '낫', '고치'];
const TAIL_WHO = ['성인', '아기', '어른', '아이', '임산부', '노인'];

function acQueries() {
  const q = new Set();
  for (const s of STEM) {
    q.add(s);
    for (const t of TAIL_CARE) q.add(s + ' ' + t);
    for (const t of TAIL_DEC) q.add(s + ' ' + t);
    for (const t of TAIL_WHO) q.add(t + ' ' + s);   // 대상 선행 (교훈 5) — 질환어가 함께 있어야 유효
  }
  return [...q].filter(x => x.length <= 22);
}

async function ac(q, st = 100) {
  const u = 'https://ac.search.naver.com/nx/ac?' + new URLSearchParams({
    q, con: '0', frm: 'nv', ans: '2', r_format: 'json', r_enc: 'UTF-8', r_unicode: '0',
    t_koreng: '1', run: '2', rev: '4', q_enc: 'UTF-8', st: String(st),
  });
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000), headers: { referer: 'https://search.naver.com/' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const out = [];
      for (const blk of j.items || []) for (const it of blk || []) if (it && it[0]) out.push(String(it[0]));
      return out;
    } catch (e) { if (t === 2) return null; await sleep(400 * (t + 1)); }
  }
}

function loadSeen(f) {
  const s = new Set();
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) { try { s.add(JSON.parse(l).k); } catch (e) {} }
  return s;
}
function loadDone(f) { return new Set(fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : []); }

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < list.length) { const j = i++; await fn(list[j], j); }
  }));
}

async function runAc(queries, tag) {
  const KF = P(tag + '_kw.jsonl'), DF = P(tag + '_done.txt');
  const seen = loadSeen(KF), done = loadDone(DF);
  const todo = queries.filter(q => !done.has(q));
  console.error(`[${tag}] 질의 ${queries.length} · 남은 ${todo.length} · 누적어 ${seen.size}`);
  let fresh = 0, n = 0;
  await pool(todo, 6, async (q) => {
    const r = await ac(q);
    n++;
    if (r === null) return;                      // 실패는 done 에 적지 않는다 (조용한 유실 방지)
    for (const s of r) {
      const k = norm(s);
      if (!k || seen.has(k)) continue;
      seen.add(k); fresh++;
      fs.appendFileSync(KF, JSON.stringify({ k, q, src: tag }) + '\n');
    }
    fs.appendFileSync(DF, q + '\n');
    if (n % 200 === 0) console.error(`  ${n}/${todo.length} · 신규 ${fresh} · 누적 ${seen.size}`);
    await sleep(60);
  });
  console.error(`[${tag}] 끝 · 신규 ${fresh} · 누적 ${seen.size} · 수율 ${(fresh / Math.max(1, n)).toFixed(2)}/질의`);
}

(async () => {
  const mode = process.argv[2] || 'ac';

  if (mode === 'ac') {
    await runAc(acQueries(), 'ac');

  } else if (mode === 'jamo') {
    // 초성 라운드 — 띄어쓰고 1자. 짧은 어간부터 (롱테일 시드는 수율 0)
    const base = [...loadSeen(P('ac_kw.jsonl'))].filter(k => k.length >= 3 && k.length <= 9);
    const seeds = [...new Set([...STEM.map(norm), ...base])];
    const q = [];
    for (const s of seeds) for (const j of JAMO) q.push(s + ' ' + j);
    console.error('초성 질의', q.length);
    await runAc(q, 'jamo');

  } else if (mode === 'rel') {
    // keywordstool 연관확장 — 응답의 연관어 자체가 수확 채널 (교훈 20). 힌트 에코는 못 믿는다.
    const pool_ = [...new Set([...loadSeen(P('ac_kw.jsonl')), ...loadSeen(P('jamo_kw.jsonl'))])];
    const hint = pool_.filter(k => k.length >= 3 && k.length <= 14).slice(0, 4000);
    const KF = P('rel_kw.jsonl'), DF = P('rel_done.txt');
    const seen = loadSeen(KF), done = loadDone(DF);
    const todo = []; for (let i = 0; i < hint.length; i += 5) { const b = hint.slice(i, i + 5); if (!done.has(b.join(','))) todo.push(b); }
    console.error('연관확장 힌트묶음', todo.length, '누적', seen.size);
    let fresh = 0;
    for (let i = 0; i < todo.length; i++) {
      const b = todo[i];
      let r = null;
      try { r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(b.join(',')) + '&showDetail=1', null, 3808925, 3); } catch (e) {}
      if (r && r.keywordList) {
        for (const x of r.keywordList) {
          const k = norm(x.relKeyword);
          if (seen.has(k)) continue;
          const pc = pv(x.monthlyPcQcCnt), mo = pv(x.monthlyMobileQcCnt);
          seen.add(k); fresh++;
          fs.appendFileSync(KF, JSON.stringify({ k, pc: pc.v, mo: mo.v, lt: (pc.lt || mo.lt) ? 1 : 0, comp: x.compIdx, src: 'rel' }) + '\n');
        }
        fs.appendFileSync(DF, b.join(',') + '\n');
      }
      if (i % 50 === 0) console.error(`  ${i}/${todo.length} · 신규 ${fresh} · 누적 ${seen.size}`);
      await sleep(230);
    }
    console.error('연관확장 끝 · 신규', fresh, '· 누적', seen.size);

  } else if (mode === 'vol') {
    // 자동완성 출신 전부의 볼륨을 잰다. 자동완성 출신의 '< 10' 만 '실재하되 월 10 미만' 으로 읽을 수 있다(교훈 18).
    const acs = [...new Set([...loadSeen(P('ac_kw.jsonl')), ...loadSeen(P('jamo_kw.jsonl'))])];
    const F = P('vol.json');
    const V = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : {};
    const todo = acs.filter(k => V[k] === undefined && k.length <= 25 && !/[^가-힣a-zA-Z0-9]/.test(k));
    console.error('볼륨 대상', todo.length, '/', acs.length);
    for (let i = 0; i < todo.length; i += 5) {
      const b = todo.slice(i, i + 5);
      let r = null;
      try { r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(b.join(',')) + '&showDetail=1', null, 3808925, 3); } catch (e) {}
      const m = {};
      for (const x of (r && r.keywordList) || []) m[norm(x.relKeyword)] = x;
      for (const k of b) {
        const x = m[k];
        if (!x) { V[k] = null; continue; }
        const pc = pv(x.monthlyPcQcCnt), mo = pv(x.monthlyMobileQcCnt);
        V[k] = { pc: pc.v, mo: mo.v, lt: (pc.lt || mo.lt) ? 1 : 0, comp: x.compIdx };
      }
      if (i % 250 === 0) { fs.writeFileSync(F + '.tmp', JSON.stringify(V)); fs.renameSync(F + '.tmp', F); console.error(`  ${i}/${todo.length}`); }
      await sleep(210);
    }
    fs.writeFileSync(F + '.tmp', JSON.stringify(V)); fs.renameSync(F + '.tmp', F);
    console.error('볼륨 끝', Object.keys(V).length);
  }
})();
