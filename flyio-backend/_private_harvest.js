// 소잠 — 은밀부위 피부질환 검색어 포화 탐색 (네이버 키워드도구, 로컬 자격증명 3808925).
// 볼륨은 원문 문자열을 보존한다: "< 10" 은 lt=true 로 남기고 숫자 0 으로 둔다.
// 웨이브마다 새로 나온 은밀부위 어를 다음 시드로 쓴다. 저장은 JSONL 누적(잘림 없음).
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const DIR = path.join(__dirname, '../reports/sojam-20260910/private');
fs.mkdirSync(DIR, { recursive: true });
const KWF = path.join(DIR, 'kw.jsonl'), SEEDF = path.join(DIR, 'seeds_done.txt');

const PART = /항문|똥꼬|엉덩이|볼기|꼬리뼈|사타구니|서혜부|샅|허벅지안쪽|음부|외음부|회음부|음순|질입구|질주변|성기|음경|귀두|포피|고환|음낭|불알|치골|음모|유두|유륜|젖꼭지|가슴밑|가슴아래|겨드랑|엉덩이골|엉덩이사이|사타구니사이|비키니라인|y존|Y존|소음순|대음순|pubic/;
function parseVol(s) { s = String(s); const lt = s.indexOf('<') >= 0; return { v: lt ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10), lt }; }

const PARTS = ['항문', '똥꼬', '엉덩이', '엉덩이사이', '사타구니', '서혜부', '허벅지안쪽', '음부', '외음부', '회음부', '음순', '소음순', '대음순',
  '고환', '음낭', '성기', '음경', '귀두', '포피', '치골', '음모', '유두', '유륜', '젖꼭지', '가슴밑', '겨드랑이', 'y존', '비키니라인'];
const SYMS = ['가려움', '간지러움', '습진', '피부염', '발진', '진물', '각질', '따가움', '쓰라림', '통증', '붉은반점', '색소침착', '착색',
  '종기', '뾰루지', '모낭염', '염증', '곰팡이', '진균', '땀띠', '물집', '갈라짐', '건조', '냄새', '두드러기', '태선화'];
const DISEASE = ['완선', '칸디다', '칸디다증', '사타구니완선', '음부완선', '경화태선', '편평태선', '만성단순태선', '항문소양증', '음부소양증',
  '외음부소양증', '외음부습진', '음낭습진', '고환습진', '항문습진', '유두습진', '겨드랑이습진', '간찰진', '간찰성피부염', '마찰피부염',
  '접촉성피부염음부', '기저귀발진', '성인기저귀발진', '화농성한선염', '모낭염사타구니', '베체트', '외음부백반증', '음부백반증',
  '사면발니', '옴', '헤르페스', '성기헤르페스', '생식기헤르페스', '음부포진', '곤지름', '외음부곤지름'];
const INTENT = ['한의원', '병원', '치료', '원인', '증상', '낫는법', '만성', '재발', '안낫는', '연고'];

function seedList() {
  const s = new Set();
  for (const p of PARTS) { for (const y of SYMS) s.add(p + y); s.add(p); }
  for (const d of DISEASE) { s.add(d); for (const i of INTENT) s.add(d + i); }
  for (const p of ['항문', '음부', '외음부', '사타구니', '고환', '음낭', '유두', '회음부', '엉덩이'])
    for (const i of INTENT) s.add(p + '가려움' + i);
  return [...s];
}

(async () => {
  const known = new Map();
  if (fs.existsSync(KWF)) for (const l of fs.readFileSync(KWF, 'utf8').split('\n')) if (l.trim()) { try { const d = JSON.parse(l); known.set(d.k, d); } catch (e) {} }
  const done = new Set(fs.existsSync(SEEDF) ? fs.readFileSync(SEEDF, 'utf8').split('\n').filter(Boolean) : []);
  const maxWaves = parseInt(process.argv[2] || '6', 10);
  let queue = seedList().filter(s => !done.has(s));
  for (let wave = 1; wave <= maxWaves && queue.length; wave++) {
    console.error(`웨이브 ${wave}: 시드 ${queue.length} | 누적 검색어 ${known.size}`);
    let fresh = 0;
    for (let i = 0; i < queue.length; i += 5) {
      const hints = queue.slice(i, i + 5);
      try {
        const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(hints.join(',')) + '&showDetail=1', null, 3808925, 3);
        for (const k of (r && r.keywordList) || []) {
          if (known.has(k.relKeyword)) continue;
          const pc = parseVol(k.monthlyPcQcCnt), mo = parseVol(k.monthlyMobileQcCnt);
          const d = { k: k.relKeyword, pc: pc.v, mo: mo.v, pcLt: pc.lt, moLt: mo.lt, comp: k.compIdx, depth: k.plAvgDepth, w: wave };
          known.set(d.k, d); fs.appendFileSync(KWF, JSON.stringify(d) + '\n'); fresh++;
        }
      } catch (e) { console.error('  실패', hints.join(','), String(e).slice(0, 80)); }
      for (const h of hints) { done.add(h); fs.appendFileSync(SEEDF, h + '\n'); }
      await sleep(300);
    }
    // 다음 웨이브 시드: 은밀부위 토큰이 있고 실볼륨(10+)이 있는 새 어
    queue = [...known.values()].filter(d => PART.test(d.k) && !(d.pcLt && d.moLt) && !done.has(d.k)).map(d => d.k);
    console.error(`  → 새 검색어 ${fresh}, 다음 시드 ${queue.length}`);
  }
  const priv = [...known.values()].filter(d => PART.test(d.k));
  console.log('DONE 누적 검색어', known.size, '| 은밀부위 토큰 포함', priv.length,
    '| 그중 실볼륨 10+', priv.filter(d => !(d.pcLt && d.moLt)).length, '| 남은 시드', queue.length);
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
