// 남은 입찰가 작업 — core-min-exposure SQL 토큰 모드(가벼움)로.
//   node _sojam_c0827_bids.js up   [--apply]   ▲ 농가진·구순염 계열 → 3위 상당가
//   node _sojam_c0827_bids.js down [--apply]   ▼ 두드러기·건선 계열 → 10위 상당가
const BASE = 'https://blog-index-analyzer.fly.dev', CID = '1858907';
const Q = `user_id=1&customer_id=${CID}`;
const APPLY = process.argv.includes('--apply');
const cmd = process.argv[2];

const UP_TOKENS = ['농가진', '농포', '고름집', '진물', '딱지', '화농', '물집', '수포', '농양',
                   '구순염', '구각염', '입술', '입꼬리', '구내염', '구순포진', '단순포진',
                   '헤르페스', '입술포진'];
const DOWN_TOKENS = ['두드러기', '건선'];
// 타지역·잡음 제외 — 방금 70원으로 내린 것들을 다시 올리지 않도록.
const EXCLUDE = ['천안', '인천', '부평', '부산', '대구', '울산', '광주', '대전', '제주', '세종',
  '경상', '경남', '경북', '전남', '전북', '충남', '충북', '강원', '창원', '김해', '포항', '전주',
  '청주', '원주', '춘천', '진주', '순천', '목포', '여수', '구미', '경주', '양산', '거제', '통영',
  '아산', '평택', '수원', '성남', '분당', '용인', '화성', '동탄', '안양', '광명', '부천', '일산',
  '고양', '파주', '김포', '시흥', '안산', '의정부', '남양주', '하남', '과천', '군포', '오산',
  '이천', '여주', '양평', '포천', '노원', '강북', '도봉', '중랑', '성북', '동대문', '광진',
  '성동', '용산', '마포', '서대문', '은평', '종로', '영등포', '구로', '금천', '관악', '동작',
  '양천', '강서', '강동', '송파', '잠실', '천호', '목동', '신촌', '홍대', '여의도', '왕십리',
  '건대', '무좀', '여드름', '관절염', '갑상선', '피부과', '성형외과', '치과',
  // 2차 정리 — dry-run 에서 실제로 걸린 오탐
  '물탱크', '탱크', '청소', '레이저후', '두꺼워지는',
  '익산', '군산', '당진', '서산', '논산', '공주', '보령', '태안', '홍성', '예산', '부여', '서천',
  '금산', '옥천', '영동', '진천', '음성', '단양', '괴산', '증평', '보은', '제천', '충주', '정읍',
  '남원', '김제', '완주', '순창', '고창', '부안', '임실', '무주', '장수', '진안', '나주', '광양',
  '안동', '강릉', '속초', '김천', '상주', '밀양', '사천', '거창', '함안', '영주', '문경', '칠곡',
  '세종시', '서귀포'];
// UP 쪽은 두드러기·건선을 반드시 빼야 한다 — '농포성건선' 이 UP 으로 잡혀서 내리려던 걸 올린다.
const UP_EXTRA_EXCLUDE = ['두드러기', '건선'];

const CFG = {
  up:   { toks: UP_TOKENS,   pos: 3,  cap: 20000, exc: EXCLUDE.concat(UP_EXTRA_EXCLUDE),
          label: '▲ 농가진·구순염 → 3위 상당가' },
  down: { toks: DOWN_TOKENS, pos: 10, cap: 20000, exc: EXCLUDE,
          label: '▼ 두드러기·건선 → 10위 상당가' },
}[cmd];
if (!CFG) { console.log('usage: up | down  [--apply]'); process.exit(1); }

(async () => {
  const body = {
    domain_tokens: CFG.toks, intent_tokens: [''], exclude_tokens: CFG.exc,
    device: 'PC', target_position: CFG.pos, bid_cap: CFG.cap,
    dry_run: !APPLY, max_keywords: 150000,
  };
  console.log(`${CFG.label} — 토큰 ${CFG.toks.length}종, 제외 ${CFG.exc.length}종, ${APPLY ? '적용' : 'dry-run'}`);
  const r = await fetch(`${BASE}/api/naver-ad/keyword-pool/bid/core-min-exposure?${Q}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(600000),
  });
  const txt = await r.text();
  console.log(`HTTP ${r.status}`);
  try {
    const d = JSON.parse(txt);
    if (d.matched !== undefined) {
      console.log(`매칭 인스턴스 ${d.matched}개`);
      console.log('샘플:', (d.samples || []).map(s => `${s.keyword}(${s.current_bid}원)`).join(', '));
    } else console.log(JSON.stringify(d).slice(0, 600));
  } catch (e) { console.log(txt.slice(0, 600)); }
})();
