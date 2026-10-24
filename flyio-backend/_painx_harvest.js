// 소잠 — 피부환자 극심한 통증 검색어 대량 발굴 (2026-09-11 사용자 지시 "극심한 통증 관련 키워드 딥리서치로 대량발굴").
// 두 경로를 병행한다: kt = keywordstool 시드 BFS(포화까지), ac = 자동완성 표면 채굴(실재 검증기).
// 그 뒤 vol = 자동완성 표면을 keywordstool 로 볼륨 확인 + 연관 확장.
// 통증은 '피부 증상과 함께인 통증'만 쫓는다 — 부위+통증(손가락통증)은 정형외과라 확장 시드로 쓰지 않는다.
// 사용: node _painx_harvest.js kt | ac | vol
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const DIR = path.join(__dirname, '../reports/sojam-20260911/painx');
fs.mkdirSync(DIR, { recursive: true });
const P = n => path.join(DIR, n);
const norm = s => String(s).replace(/\s+/g, '').trim();
const pv = s => { s = String(s); const lt = s.indexOf('<') >= 0; return { v: lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10), lt }; };
const JAMO = [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'];

// 통증 신호(엄격): 확장 시드 판정용. 염증·부어 같은 넓은 어는 넣지 않는다(수만 개를 끌고 온다).
const PAIN = /통증|아파|아프|아픔|아픈|쓰라|쓰림|쓰려|쓰리|따가|따갑|따끔|화끈|작열|찌릿|찌르|욱신|쑤시|쑤심|콕콕|타는듯|불타|스치면|스치기|스쳐|닿으면|닿기만|진통|극심|괴로|고통|헐었|헐어|헐때|헐면|헐음|궤양|터져서|터지면|찢어질|이질통|통각/;
// 피부 맥락: 질환명·피부 증상어. 부위만 있는 통증은 여기 걸리지 않는다.
const SKIN = /피부|살갗|물집|수포|진물|짓무|갈라|트임|트고|각질|발진|습진|아토피|한포진|탈스|스테로이드|지루|두피|화농성|한선염|모낭염|구내염|구순염|구각|입꼬리|입술|입안|혓바늘|설염|혀|아프타|베체트|태선|천포창|포진|헤르페스|칸디다|간찰|기저귀|땀띠|무좀|백선|완선|조갑|손톱주위|발톱주위|거스러미|뒤꿈치|손끝|농가진|옴|벌레물|물린|화상|햇빛|일광|동상|욕창|봉와직염|루푸스|혈관염|피부근염|쇼그렌|결절성|양진|사타구니|음부|외음부|질입구|회음|항문|똥꼬|엉덩이|겨드랑|유두|가슴밑|고환|음낭|귀두|포피|음경|상처|딱지|헐|궤양|염증/;

const DIS = ['한포진', '아토피', '성인아토피', '습진', '주부습진', '손습진', '화폐상습진', '탈스테로이드', '탈스', '스테로이드피부염', '스테로이드부작용',
  '지루성피부염', '지루성두피염', '화농성한선염', '모낭염', '두피모낭염', '구내염', '아프타구내염', '구순염', '구각염', '입꼬리염', '베체트', '편평태선', '구강편평태선',
  '경화태선', '천포창', '유사천포창', '단순포진', '입술포진', '헤르페스', '칸디다', '칸디다질염', '간찰진', '기저귀발진', '땀띠', '무좀', '지간무좀', '수포성무좀', '발톱무좀',
  '조갑주위염', '손거스러미', '발뒤꿈치각질', '백선', '완선', '농가진', '옴', '벌레물림', '일광화상', '햇빛알레르기', '광과민', '결절성홍반', '혈관염', '루푸스', '피부근염',
  '결절성양진', '접촉성피부염', '피부염', '피부궤양', '구강작열감증후군', '설염', '혓바늘', '지도상혀', '외음부염', '외음부궤양', '항문주위피부염', '항문소양증', '손끝갈라짐',
  '발뒤꿈치갈라짐', '입술갈라짐', '입꼬리찢어짐', '피부갈라짐', '피부이상감각', '피부작열감', '피부통증'];
const PAIN_W = ['통증', '아파', '아픔', '쓰라림', '따가움', '따끔거림', '화끈거림', '작열감', '찌릿', '욱신', '헐었을때', '진통제', '심할때', '극심한통증'];
const PARTS = ['피부', '손', '손가락', '손끝', '손바닥', '손등', '발', '발바닥', '발뒤꿈치', '발가락', '발가락사이', '손톱주변', '발톱주변', '입술', '입꼬리', '입안',
  '혀', '두피', '얼굴', '목', '겨드랑이', '가슴밑', '사타구니', '음부', '외음부', '질입구', '회음부', '항문', '엉덩이', '허벅지안쪽', '등', '팔', '다리', '무릎뒤',
  '팔꿈치안쪽', '귀', '콧구멍', '코안', '눈가', '고환', '귀두', '유두'];
const PART_W = ['피부통증', '따가움', '쓰라림', '화끈거림', '헐었을때', '갈라짐통증', '물집통증', '진물통증', '피부가아파요', '작열감'];
const EXPR = ['피부통증', '피부가아파요', '피부가따가워요', '피부작열감', '피부화끈거림', '피부이질통', '피부통각과민', '스치기만해도아픈피부', '옷에스치면아픈피부',
  '피부가쓰라려요', '피부가타는듯', '피부가타는느낌', '바늘로찌르는피부통증', '피부신경통', '피부저림', '피부감각이상', '구강작열감', '혀작열감', '입안이화끈', '입안이헐었을때',
  '외음부통증', '외음부작열감', '외음부쓰라림', '항문따가움', '배변후항문따가움', '소변볼때따가움', '물닿으면따가움', '샤워할때따가움', '연고바르면따가움', '보습제바르면따가움',
  '로션바르면따가움', '탈스통증', '탈스작열감', '진물통증', '갈라짐통증', '물집통증', '물집터짐', '물집터졌을때', '피부가벗겨짐통증', '피부까짐', '피부까졌을때', '살갗벗겨짐',
  '피부궤양', '피부괴사', '피부가찢어짐', '손가락갈라짐통증', '손끝갈라짐통증', '발뒤꿈치갈라짐통증', '입꼬리찢어짐통증', '피부진통제', '가려움통증', '가렵고아픔', '가렵고따가움'];

function ktSeeds() {
  const s = new Set();
  for (const d of DIS) { s.add(d); for (const w of PAIN_W) s.add(d + w); }
  for (const p of PARTS) for (const w of PART_W) s.add(p + w);
  for (const e of EXPR) s.add(e);
  return [...s];
}

function loadJsonl(f) { const m = new Map(); if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.trim()) { try { const d = JSON.parse(l); m.set(d.k, d); } catch (e) {} } return m; }

// keywordstool BFS. 다음 시드 = 통증+피부 신호가 둘 다 있고 실볼륨 10+ 인 새 어.
async function bfs(kwFile, doneFile, first, maxWaves, tag) {
  const known = loadJsonl(kwFile);
  const done = new Set(fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf8').split('\n').filter(Boolean) : []);
  let q = first.filter(s => !done.has(s) && s.length <= 25 && !/[^가-힣a-zA-Z0-9]/.test(s));
  for (let w = 1; w <= maxWaves && q.length; w++) {
    console.error(`[${tag}] 웨이브 ${w}: 시드 ${q.length} | 누적 ${known.size}`);
    let fresh = 0;
    for (let i = 0; i < q.length; i += 5) {
      const h = q.slice(i, i + 5);
      const take = r => { for (const k of (r && r.keywordList) || []) { if (known.has(k.relKeyword)) continue; const pc = pv(k.monthlyPcQcCnt), mo = pv(k.monthlyMobileQcCnt);
        const d = { k: k.relKeyword, pc: pc.v, mo: mo.v, pcLt: pc.lt, moLt: mo.lt, comp: k.compIdx, w, src: tag }; known.set(d.k, d); fs.appendFileSync(kwFile, JSON.stringify(d) + '\n'); fresh++; } };
      // req 는 429 가 재시도 끝까지 가면 throw 없이 undefined 를 돌려준다 — 그걸 '완료'로 적으면 힌트가 조용히 사라진다.
      let got = false;
      for (let t = 0; t < 4 && !got; t++) {
        try { const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(h.join(',')) + '&showDetail=1', null, 3808925, 3);
          if (r === undefined) { await sleep(5000 * (t + 1)); continue; } take(r); got = true; }
        catch (e) { for (const x of h) { try { const r1 = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(x) + '&showDetail=1', null, 3808925, 2); if (r1 !== undefined) take(r1); } catch (e2) {} await sleep(250); } got = true; }
      }
      if (!got) { console.error(`  [${tag}] 429 지속, 미완료로 남김:`, h.join(',')); await sleep(280); continue; }
      for (const x of h) { done.add(x); fs.appendFileSync(doneFile, x + '\n'); }
      if ((i / 5) % 100 === 0) console.error(`  [${tag}] ${i}/${q.length} 누적 ${known.size}`);
      await sleep(280);
    }
    q = [...known.values()].filter(d => !(d.pcLt && d.moLt) && PAIN.test(d.k) && SKIN.test(d.k) && !done.has(d.k) && d.k.length <= 25).map(d => d.k);
    console.error(`[${tag}]  → 새 ${fresh}, 다음 시드 ${q.length}`);
  }
  console.log(`${tag} DONE 누적 ${known.size} 남은시드 ${q.length}`);
}

async function ac(q, st) {
  const u = 'https://ac.search.naver.com/nx/ac?' + new URLSearchParams({ q, con: '0', frm: 'nv', ans: '2', r_format: 'json', r_enc: 'UTF-8', r_unicode: '0', t_koreng: '1', run: '2', rev: '4', q_enc: 'UTF-8', st: String(st) });
  for (let t = 0; t < 3; t++) {
    try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }); const j = await r.json(); const out = [];
      for (const blk of j.items || []) for (const it of blk) if (Array.isArray(it) && it[0]) out.push(it[0]); return out; }
    catch (e) { await sleep(500 + 800 * t); }
  }
  return null;
}

const SUBJ = ['손이', '손가락이', '손끝이', '손바닥이', '발바닥이', '발뒤꿈치가', '발가락 사이가', '입술이', '입꼬리가', '입안이', '혀가', '피부가', '두피가', '얼굴이',
  '겨드랑이가', '사타구니가', '음부가', '질입구가', '항문이', '엉덩이가', '가슴밑이', '유두가', '귀가', '콧구멍이', '고환이', '살이', '온몸이', '몸이'];
const SUBJ_T = [' 따가', ' 쓰라', ' 화끈', ' 아파', ' 찢어질듯', ' 헐어', ' 갈라져서', ' 벗겨져', ' 타는듯', ' 찌릿', ' 욱신', ' 너무 아파', ' 스치기만'];
const INTENSE = ['피부가 너무 아파', '피부 통증 극심', '스치기만 해도 아파', '옷만 스쳐도', '바람만 불어도 아파', '물만 닿아도 따가', '샤워할때 따가워', '씻을때 따가',
  '연고 바르면 따가', '보습제 바르면 따가', '로션 바르면 따가', '스테로이드 끊고 통증', '탈스 통증', '탈스 작열감', '탈스 잠', '진물 나고 아파', '진물 따가', '갈라져서 피',
  '찢어져서 피', '피부가 타는', '불타는 느낌', '바늘로 찌르는', '칼로 베는', '전기 오는', '찌릿찌릿', '욱신욱신', '따끔따끔', '화끈화끈', '쓰라려서 잠', '아파서 잠',
  '아파서 걷기', '아파서 못 걷', '물집 터져서', '물집 터지면', '물집 터졌', '진통제 먹어도', '진통제도 안', '너무 아파서 울', '극심한 통증', '참을 수 없는 통증',
  '입안이 다 헐', '입안 헐어서 못먹', '밥 먹을때 아픈', '물 마실때 따가', '소변볼때 따가', '생식기 따가', '걸을때 사타구니', '앉을때 엉덩이', '배변할때 따가', '대변볼때 따가'];
const DIS_T = [' 통증', ' 너무 아파', ' 아플때', ' 아픈이유', ' 따가', ' 쓰라', ' 화끈', ' 작열', ' 진통제', ' 잠', ' 걸을때', ' 극심', ' 심할때', ' 터졌', ' 욱신'];

function acQueries() {
  const q = new Set();
  for (const s of SUBJ) { q.add(s + ' '); for (const t of SUBJ_T) q.add(s + t); for (const j of JAMO) q.add(s + ' ' + j); }
  for (const s of INTENSE) { q.add(s); for (const j of JAMO) q.add(s + ' ' + j); }
  for (const d of DIS) { for (const t of DIS_T) q.add(d + t); for (const j of JAMO) q.add(d + ' 통증 ' + j); }
  return [...q];
}

// 2차 자동완성: 1차에서 나온 통증+피부 표면과 kt 의 통증+피부 실볼륨 어를 뿌리로 자모 접미 드레인.
function ac2Queries() {
  const f = JSON.parse(fs.readFileSync(P('ac_found.json'), 'utf8'));
  const roots = new Set(Object.keys(f).filter(k => PAIN.test(norm(k)) && SKIN.test(norm(k)) && k.length <= 18));
  for (const d of loadJsonl(P('kt.jsonl')).values()) if (!(d.pcLt && d.moLt) && PAIN.test(d.k) && SKIN.test(d.k) && d.k.length <= 14) roots.add(d.k);
  const q = new Set();
  for (const r of roots) { q.add(r + ' '); for (const j of JAMO) q.add(r + ' ' + j); }
  console.error('2차 뿌리', roots.size);
  return [...q];
}

async function stageAC(second) {
  const FF = P('ac_found.json'), DF = P('ac_doneq.txt');
  const found = fs.existsSync(FF) ? JSON.parse(fs.readFileSync(FF, 'utf8')) : {};
  const done = new Set(fs.existsSync(DF) ? fs.readFileSync(DF, 'utf8').split('\n') : []);
  const qs = (second ? ac2Queries() : acQueries()).filter(q => !done.has(q));
  console.error('자동완성 질의', qs.length);
  let i = 0, n = 0, fail = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < qs.length) {
      const q = qs[i++];
      const a = await ac(q, 100), b = await ac(q, 111);
      if (a === null && b === null) { fail++; continue; }
      for (const x of [...(a || []), ...(b || [])]) { const k = x.trim(); if (!k || k.length > 30) continue; (found[k] = found[k] || { n: 0, q }).n++; }
      fs.appendFileSync(DF, q + '\n');
      if (++n % 500 === 0) { fs.writeFileSync(FF, JSON.stringify(found)); console.error(' ', n, '/', qs.length, '표면', Object.keys(found).length, '실패', fail); }
    }
  }));
  fs.writeFileSync(FF, JSON.stringify(found));
  console.log('AC DONE 질의', n, '실패', fail, '표면', Object.keys(found).length);
}

// 자동완성 표면(통증 또는 피부 신호) → keywordstool 볼륨 + 통증·피부 BFS 2웨이브. kt 결과와 파일을 나눠 서로 덮지 않는다.
async function stageVol() {
  const found = JSON.parse(fs.readFileSync(P('ac_found.json'), 'utf8'));
  const cand = [...new Set(Object.keys(found).map(norm))].filter(k => k.length >= 2 && /[가-힣]/.test(k) && (PAIN.test(k) || SKIN.test(k)));
  await bfs(P('vol.jsonl'), P('vol_hints.txt'), cand, 3, 'vol');
}

module.exports = { PAIN, SKIN, norm };
if (require.main === module) {
  const st = process.argv[2];
  (st === 'kt' ? bfs(P('kt.jsonl'), P('kt_seeds.txt'), ktSeeds(), 5, 'kt') : st === 'ac' ? stageAC() : st === 'ac2' ? stageAC(true) : st === 'vol' ? stageVol() : Promise.reject(Error('kt|ac|vol')))
    .catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
}
