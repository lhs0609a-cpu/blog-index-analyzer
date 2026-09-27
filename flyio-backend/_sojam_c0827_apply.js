// 소잠 — 대상 키워드 실제 PC 입찰가(순위3 캐스케이드)로 세팅.
//   node _sojam_c0827_apply.js snapshot   현재 입찰가 롤백 스냅샷(라이브 조회)
//   node _sojam_c0827_apply.js dry        core-min-exposure dry_run (DB 매칭 개수 확인)
//   node _sojam_c0827_apply.js apply      실제 적용 (백그라운드 시작)
//   node _sojam_c0827_apply.js verify     적용 결과 조회 + 미달분 리포트
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));
const BASE = 'https://blog-index-analyzer.fly.dev';
const CID = '1858907';
const Q = `user_id=1&customer_id=${CID}`;
const CAP = 20000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(url, body, tries = 5, timeout = 600000) {
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
      });
      const txt = await r.text();
      if (r.ok) { try { return JSON.parse(txt); } catch (e) { return { raw: txt }; } }
      if (r.status === 400) return { success: false, error: `400 ${txt.slice(0, 300)}` };
    } catch (e) { if (t === tries - 1) return { success: false, error: String(e).slice(0, 200) }; }
    await sleep(Math.min(2000 * (t + 1), 15000));
  }
  return { success: false, error: 'retry exhausted' };
}
const raw = (p, method = 'GET', body = null) =>
  post(`${BASE}/api/naver-ad/keyword-pool/debug/naver-raw?${Q}`,
       { path: p, method, body, customer_id: CID });

const targets = L('_sojam_c0827_targets.json');
const kws = targets.map(t => t.kw);
const cmd = process.argv[2] || 'dry';

// _sojam_c0827_scope.js 의 CAT 토큰을 그대로 평탄화 — 서버 SQL LIKE 필터용
const DOMAIN = [
  '가려움', '가려운', '가렵', '간지러', '간지럼', '간지럽', '소양증', '소양감', '근질',
  '통증', '아픔', '쓰라림', '따가움', '따끔', '화끈거림', '욱신', '종기', '봉와직염',
  '대상포진', '농가진', '단순포진', '구순포진', '화농', '고름', '물집', '수포',
  '고름집', '연조직염', '결절성양진', '농양', '피부염증', '두피염증',
  '아토피', '습진', '한포진', '피부염', '건선', '태선', '두드러기',
  '사타구니', '서혜부', '엉덩이', '둔부', '항문', '똥꼬', '똥구멍', '회음부', '생식기',
  '성기', '음부', '음순', '질염', '질입구', '질가려', '질건조', '고환', '음낭', '귀두',
  '포피', '포경', '유두', '젖꼭지', '유방', '겨드랑이', '액취', '음모', '치골', '자궁경부',
  '외음', '내음', '사타구', '허벅지안쪽', '엉덩', '항문가려',
  '구순염', '구각염', '입술', '입꼬리', '구내염', '혓바닥', '혀갈라짐',
];
const EXCLUDE = ['피부과', '성형외과', '내과의원', '치과', '한의원추천', '강남', '청담', '압구정',
                 '병원비', '가격', '비용', '보험', '실비', '연예인', '후기사진',
                 '관절염', '무좀', '갑상선', '류마티스', '켈로이드', '피어싱'];

(async () => {
  if (cmd === 'snapshot') {
    const gids = [...new Set(targets.flatMap(t => t.inst.map(i => i.gid)))];
    console.log(`그룹 ${gids.length}개 라이브 조회 중…`);
    const snap = {};
    for (let i = 0; i < gids.length; i++) {
      const r = await raw(`/ncc/keywords?nccAdgroupId=${gids[i]}`);
      if (r.success) {
        for (const k of r.response || []) {
          snap[k.nccKeywordId] = {
            gid: gids[i], kw: (k.keyword || '').trim(),
            bid: k.bidAmt, ugb: k.useGroupBidAmt, st: k.status, lock: k.userLock,
          };
        }
      } else console.log(`  실패 ${gids[i]}: ${String(r.error).slice(0, 80)}`);
      if (i % 5 === 0) console.log(`  ${i + 1}/${gids.length}  누적 ${Object.keys(snap).length}`);
    }
    fs.writeFileSync(P('_sojam_c0827_ROLLBACK.json'), JSON.stringify(snap), 'utf8');
    console.log(`스냅샷 저장 — 키워드 인스턴스 ${Object.keys(snap).length}개`);
    return;
  }

  if (cmd === 'dry' || cmd === 'apply') {
    // 명시 keywords 모드는 서버가 registered_keywords 전체를 fetchall 해서 머신을 죽인다
    // (routers/naver_ad.py:12499). SQL 단계에서 걸러지는 domain+intent 모드를 쓴다:
    //   (domain OR) AND (intent OR) AND NOT (exclude OR)   — intent 에 '' 를 넣어 전체 통과.
    const body = {
      domain_tokens: DOMAIN, intent_tokens: [''], exclude_tokens: EXCLUDE,
      device: 'PC', target_position: 3,
      dry_run: cmd === 'dry', bid_cap: CAP, max_keywords: 150000,
    };
    console.log(`${cmd} — domain 토큰 ${DOMAIN.length}종 / 제외 ${EXCLUDE.length}종, 순위3 캐스케이드, 상한 ${CAP}원`);
    console.log(`  (Node 산정 대상: 키워드 ${kws.length} / 인스턴스 ${targets.reduce((s, t) => s + t.inst.length, 0)})`);
    const r = await post(`${BASE}/api/naver-ad/keyword-pool/bid/core-min-exposure?${Q}`, body);
    console.log(JSON.stringify(r, null, 1).slice(0, 2000));
    return;
  }

  if (cmd === 'verify') {
    const bidmap = {};
    for (let i = 0; i < kws.length; i += 60) {
      const batch = kws.slice(i, i + 60);
      const r = await post(`${BASE}/api/naver-ad/keyword-pool/bid/inspect-by-name?${Q}&like=false&max_groups=300`, batch);
      for (const k of (r.keywords || [])) {
        const kw = (k.keyword || '').trim();
        if (kw) bidmap[kw] = Math.max(bidmap[kw] || 0, k.naver_bid || 0);
      }
      if ((i / 60) % 5 === 0) console.log(`  ${i + batch.length}/${kws.length}  확보 ${Object.values(bidmap).filter(v => v > 70).length}`);
    }
    fs.writeFileSync(P('_sojam_c0827_verify.json'), JSON.stringify(bidmap), 'utf8');
    const rows = targets.map(t => ({ kw: t.kw, vol: t.vol, bid: bidmap[t.kw] || 0, cats: t.cats }));
    const low = rows.filter(r => r.bid <= 70);
    console.log(`\n확인 ${rows.length}개 / 70원 이하 잔여 ${low.length}개`);
    for (const th of [10000, 3000, 1000, 100]) {
      const s = rows.filter(r => r.vol >= th);
      console.log(`  검색량>=${String(th).padEnd(6)} ${String(s.length).padStart(4)}개 · 70원초과 ${s.filter(r => r.bid > 70).length}개 · 중앙 ${med(s.map(r => r.bid))}원`);
    }
    console.log('\n검색량 상위 25 적용가:');
    for (const r of rows.sort((a, b) => b.vol - a.vol).slice(0, 25))
      console.log(`   ${r.kw.padEnd(18)} ${String(r.vol).padStart(7)}회  ${String(r.bid).padStart(6)}원  [${r.cats.filter(c => !c.startsWith('기존축')).join(',')}]`);
    return;
  }
  console.log('usage: snapshot | dry | apply | verify');
})();

function med(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
