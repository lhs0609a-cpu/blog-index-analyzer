// 소잠 키워드 발굴 (2026-09-16) — 상담일지 실측 간절신호 + 전국 지역×질환×치료처.
// 검증: keywordstool 은 힌트를 '아는 것만' 그대로 돌려준다 → 정확 일치로 돌아온 것만 실존으로 본다.
//       (임의 문자열 검증기로 쓰면 안 된다 [[keyword-discovery-validation]] — 최종 확인은 자동완성 단계에서 한다.)
// 사용: node _sojam_20260916_mine.js rel | combo | region | merge
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const DIR = path.join(__dirname, '../reports/sojam-20260916/mine');
fs.mkdirSync(DIR, { recursive: true });
const P = n => path.join(DIR, n);
const norm = s => String(s).replace(/\s+/g, '').trim();
const pv = s => { s = String(s); return s.indexOf('<') >= 0 ? 0 : parseInt(s.replace(/[^0-9]/g, '') || '0', 10); };
const load = f => fs.existsSync(P(f)) ? JSON.parse(fs.readFileSync(P(f), 'utf8')) : {};
const save = (f, o) => fs.writeFileSync(P(f), JSON.stringify(o));

// ── 내원 축 질환어 (상담일지 내원 실적 순)
const DIS = ['아토피', '성인아토피', '소아아토피', '태열', '가려움증', '피부가려움', '소양증', '습진', '주부습진', '손습진', '화폐상습진',
  '피부염', '접촉성피부염', '두드러기', '만성두드러기', '콜린성두드러기', '건선', '두피건선', '지루성피부염', '지루성두피염',
  '한포진', '모낭염', '화농성한선염', '피부묘기증', '백반증', '구순염', '탈스테로이드', '피부질환', '난치성피부염', '알레르기피부염'];
// ── 치료처 접미 (내원 직전 행동, 실측 리프트 1.54)
const PLACE = ['한의원', '병원', '의원', '클리닉', '치료', '치료병원', '치료한의원', '잘하는곳', '명의', '전문', '추천', '후기', '비용'];
// ── 상담일지 실측 간절신호 → 검색어 형태
const URG = ['갑자기', '번지는', '퍼지는', '심해지는', '점점심해지는', '계속올라오는', '재발', '재발하는', '자꾸', '반복되는', '안낫는', '낫지않는',
  '만성', '몇년째', '오래된', '완치', '근본치료', '온몸', '전신', '밤에', '잠못자는', '진물', '피나는', '갈라지는', '스테로이드',
  '약끊으면', '어떡하죠', '방법', '도움'];
const FAMILY = ['아기', '아이', '신생아', '영아', '유아', '돌아기', '소아', '초등학생', '중학생', '고등학생', '성인', '20대', '30대', '40대', '50대', '60대', '임산부', '임신중'];

// ── 전국 지역 (시도 + 시군구 + 서울·수도권 생활권/역세권)
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SEOUL = ['강남', '서초', '송파', '강동', '강서', '양천', '구로', '금천', '영등포', '동작', '관악', '마포', '서대문', '은평', '종로', '용산', '성동', '광진', '동대문', '중랑', '성북', '강북', '도봉', '노원'];
const SEOUL_SPOT = ['역삼', '신논현', '논현', '삼성동', '대치', '도곡', '한티', '매봉', '양재', '교대', '반포', '잠원', '압구정', '청담', '신사', '방배', '사당', '이수', '흑석', '목동', '여의도', '당산', '신촌', '홍대', '합정', '상암', '연신내', '수유', '미아', '창동', '상계', '중계', '건대', '왕십리', '성수', '뚝섬', '금호', '옥수', '천호', '길동', '둔촌', '석촌', '문정', '가락', '위례', '개포', '일원', '수서', '세곡'];
const GG = ['수원', '성남', '분당', '판교', '용인', '수지', '기흥', '죽전', '고양', '일산', '파주', '운정', '김포', '부천', '중동', '상동', '광명', '시흥', '안산', '안양', '평촌', '군포', '산본', '의왕', '과천', '의정부', '남양주', '다산', '별내', '구리', '하남', '미사', '이천', '여주', '양평', '포천', '동두천', '양주', '오산', '화성', '동탄', '평택', '송탄', '안성', '가평', '연천'];
const METRO = ['송도', '청라', '검단', '부평', '계양', '연수', '동인천', '해운대', '서면', '센텀', '광안', '동래', '수영', '남포', '사상', '기장',
  '수성', '동성로', '칠곡', '달서', '유성', '둔산', '노은', '상무지구', '첨단', '수완', '광산', '천안', '아산', '청주', '오창', '충주', '제천',
  '전주', '익산', '군산', '목포', '여수', '순천', '포항', '구미', '경주', '안동', '창원', '김해', '양산', '진주', '거제', '통영', '제주시', '서귀포', '원주', '춘천', '강릉', '속초'];
const REGIONS = [...new Set([...SIDO, ...SEOUL, ...SEOUL_SPOT, ...GG, ...METRO, '전국', '근처', '우리동네'])];

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function measure(list, file, label) {
  const vol = load(file);
  const todo = [...new Set(list.map(norm))].filter(k => k && k.length <= 25 && vol[k] === undefined);
  console.error(label, '측정 대상', todo.length, '(캐시', Object.keys(vol).length + ')');
  const gs = chunk(todo, 5); let i = 0;
  for (const h of gs) {
    try {
      const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(h.join(',')) + '&showDetail=1', null, 3808925, 3);
      const got = new Map(((r && r.keywordList) || []).map(k => [norm(k.relKeyword), k]));
      for (const t of h) { const k = got.get(t); vol[t] = k ? { pc: pv(k.monthlyPcQcCnt), mo: pv(k.monthlyMobileQcCnt), comp: k.compIdx } : null; }
      // 연관으로 딸려온 것도 주워 담는다(실존 + 볼륨이 확인된 것들)
      for (const [t, k] of got) if (vol[t] === undefined) vol[t] = { pc: pv(k.monthlyPcQcCnt), mo: pv(k.monthlyMobileQcCnt), comp: k.compIdx, rel: true };
    } catch (e) { for (const t of h) if (vol[t] === undefined) vol[t] = null; }
    if ((++i) % 200 === 0) { save(file, vol); console.error('  ', label, i, '/', gs.length); }
    await sleep(240);
  }
  save(file, vol);
  const real = Object.entries(vol).filter(([, v]) => v && (v.pc + v.mo) > 0);
  console.error(label, '완료 — 조회', Object.keys(vol).length, '| 실존(볼륨>0)', real.length);
}

(async () => {
  const st = process.argv[2];
  if (st === 'rel') {
    const seeds = [];
    for (const d of DIS) { seeds.push(d); for (const p of PLACE) seeds.push(d + p); }
    await measure(seeds, 'vol_rel.json', '연관시드');
  }
  if (st === 'combo') {
    const c = [];
    for (const d of DIS) { for (const u of URG) { c.push(u + d); c.push(d + u); } for (const f of FAMILY) c.push(f + d); }
    await measure(c, 'vol_combo.json', '간절조합');
  }
  if (st === 'region') {
    const TOP = ['아토피', '습진', '두드러기', '건선', '한포진', '지루성피부염', '지루성두피염', '여드름', '가려움증', '접촉성피부염', '모낭염', '피부질환', '피부', '백반증', '묘기증'];
    const SUF = ['한의원', '병원', '치료', '피부과'];
    const c = [];
    for (const r of REGIONS) for (const d of TOP) for (const s of SUF) c.push(r + d + s);
    console.error('지역 조합', c.length, '( 지역', REGIONS.length, '× 질환', TOP.length, '× 접미', SUF.length + ')');
    await measure(c, 'vol_region.json', '지역조합');
  }
  if (st === 'merge') {
    const all = {};
    for (const f of ['vol_rel.json', 'vol_combo.json', 'vol_region.json']) {
      for (const [k, v] of Object.entries(load(f))) if (v && (v.pc + v.mo) > 0 && all[k] === undefined) all[k] = { ...v, src: f.replace('vol_', '').replace('.json', '') };
    }
    save('vol_all.json', all);
    console.log('실존 키워드 총', Object.keys(all).length);
    const by = {}; for (const v of Object.values(all)) by[v.src] = (by[v.src] || 0) + 1;
    console.log(JSON.stringify(by));
  }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
