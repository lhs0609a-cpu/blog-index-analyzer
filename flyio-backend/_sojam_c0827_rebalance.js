// 소잠 입찰가 재조정 계획 (2026-08-27 원장 지시)
//   ▼ 타지역 지명 키워드      — 강남권 밖. 부산·대구·울산·경상·제주는 그룹 지역제외라 노출도 안 됨
//   ▼ 두드러기 / 건선 계열
//   ▲ 농가진 / 구순염 계열    — 지목 키워드 + 관련어 전부
const fs = require('fs'), path = require('path');
const D = __dirname, P = n => path.join(D, n);
const L = n => JSON.parse(fs.readFileSync(P(n), 'utf8'));

const core = L('_sojam_b0827_corekws.json');
const stats = L('_sojam_b0827_kwstats.json');          // kwId -> {cost,clk,imp,rank}
const targets = L('_sojam_c0827_targets.json');
const vol = {}; for (const t of targets) vol[t.kw] = t.vol;
try { for (const r of L('_sojam_b0827_bidtable.json')) if (r.kw && r.vol) vol[r.kw] = Math.max(vol[r.kw] || 0, r.vol); } catch (e) {}

// ── 지역 ────────────────────────────────────────────────────────
// 소잠 = 강남권 소재. 서울·강남권 지명은 살리고 나머지 지명은 내린다.
const KEEP_REGION = ['서울', '강남', '서초', '논현', '역삼', '삼성동', '대치', '도곡', '방배', '잠원',
  '반포', '압구정', '청담', '사당', '양재', '개포', '일원', '수서', '신사', '교대', '남부터미널',
  '학동', '언주', '선릉', '한티', '매봉', '양재역', '뱅뱅'];
const CUT_REGION = ['천안', '인천', '부평', '부산', '대구', '울산', '광주', '대전', '제주', '세종',
  '경상', '경남', '경북', '전남', '전북', '충남', '충북', '강원', '창원', '김해', '포항', '전주',
  '청주', '원주', '춘천', '진주', '순천', '목포', '여수', '구미', '경주', '양산', '거제', '통영',
  '아산', '평택', '수원', '성남', '분당', '용인', '화성', '동탄', '안양', '광명', '부천', '일산',
  '고양', '파주', '김포', '시흥', '안산', '의정부', '남양주', '구리', '하남', '과천', '군포',
  '오산', '이천', '여주', '양평', '포천', '연천', '강화', '송도', '검단', '계양', '남동구',
  '노원', '강북', '도봉', '중랑', '성북', '동대문', '광진', '성동', '용산', '마포', '서대문',
  '은평', '종로', '중구', '영등포', '구로', '금천', '관악', '동작', '양천', '강서', '강동', '송파',
  '잠실', '천호', '목동', '신촌', '홍대', '여의도', '왕십리', '건대', '수유', '미아', '상계',
  '주엽', '석우동', '사하', '부평구', '신논현'];
// ↑ 신논현·강남 인접이지만 원장 지시는 '천안/인천/부산/부평 류'. 서울 비강남권은 별도 표시만.
const SEOUL_NONGANGNAM = new Set(['노원', '강북', '도봉', '중랑', '성북', '동대문', '광진', '성동',
  '용산', '마포', '서대문', '은평', '종로', '중구', '영등포', '구로', '금천', '관악', '동작',
  '양천', '강서', '강동', '송파', '잠실', '천호', '목동', '신촌', '홍대', '여의도', '왕십리',
  '건대', '수유', '미아', '상계']);

// ── 내릴 질환 ────────────────────────────────────────────────────
const DOWN_DISEASE = ['두드러기', '건선'];
// ── 올릴 질환 (지목 + 관련어) ──────────────────────────────────────
const UP_NONGAJIN = ['농가진', '농포', '고름집', '진물', '딱지', '화농', '물집', '수포', '농양'];
const UP_GUSUN = ['구순염', '구각염', '입술', '입꼬리', '구내염', '구순포진', '단순포진', '헤르페스',
                  '입술포진'];
// '입주변'·'인중' 은 전부 여드름 키워드라 뺀다 (입주변여드름·인중여드름원인).

const rows = [];
for (const [gid, g] of Object.entries(core)) {
  for (const k of g.kws) {
    const eff = k.ugb ? (g.gbid || 0) : (k.bid || 0);
    const st = (k.lock || k.st !== 'ELIGIBLE') ? '중지·잠금' : (eff <= 70 ? '70원묶임' : '노출');
    const s = stats[k.id] || {};
    rows.push({ id: k.id, gid, kw: k.kw, g: g.gname, camp: g.camp, eff, ugb: k.ugb, st,
                vol: vol[k.kw] || 0, cost: s.cost || 0, clk: s.clk || 0, imp: s.imp || 0 });
  }
}

const hasTok = (kw, toks) => toks.some(t => kw.includes(t));
const keepReg = kw => hasTok(kw, KEEP_REGION);
// 지역 키워드는 예외 없이 '지역명 + 질환' 접두 형태다(천안한포진·인천아토피·부산건선).
// includes 로 잡으면 옆'구리'가려움, 모유'수유'유두물집 같은 게 딸려온다.
const cutRegTok = kw => CUT_REGION.find(t => kw.startsWith(t));
const cutReg = kw => !!cutRegTok(kw) && !keepReg(kw);

for (const r of rows) {
  if (cutReg(r.kw)) r.bucket = SEOUL_NONGANGNAM.has(cutRegTok(r.kw)) ? '▼서울비강남' : '▼타지역';
  else if (hasTok(r.kw, DOWN_DISEASE)) r.bucket = '▼두드러기·건선';
  else if (hasTok(r.kw, UP_NONGAJIN)) r.bucket = '▲농가진계열';
  else if (hasTok(r.kw, UP_GUSUN)) r.bucket = '▲구순염계열';
  else r.bucket = '-';
}

const B = {};
for (const r of rows) (B[r.bucket] ||= []).push(r);
const money = n => n.toLocaleString('ko-KR');
console.log('=== 버킷별 요약 (인스턴스 기준) ===');
for (const [b, rs] of Object.entries(B).sort((a, c) => c[1].length - a[1].length)) {
  const live = rs.filter(r => r.st === '노출');
  const kws = new Set(rs.map(r => r.kw));
  const bids = live.map(r => r.eff).sort((a, c) => a - c);
  console.log(`${b.padEnd(14)} 키워드 ${String(kws.size).padStart(5)} · 인스턴스 ${String(rs.length).padStart(5)} · 노출 ${String(live.length).padStart(4)}`
    + ` · 입찰 중앙 ${String(bids.length ? bids[Math.floor(bids.length / 2)] : 0).padStart(6)}원 · 최고 ${String(bids.length ? bids[bids.length - 1] : 0).padStart(6)}원`
    + ` · 최근비용 ${money(rs.reduce((s, r) => s + r.cost, 0))}원`);
}

for (const b of ['▼타지역', '▼두드러기·건선', '▲농가진계열', '▲구순염계열', '▼서울비강남']) {
  const rs = (B[b] || []).filter(r => r.st === '노출');
  const byKw = {};
  for (const r of rs) { const u = (byKw[r.kw] ||= { vol: r.vol, bid: 0, cost: 0 }); u.bid = Math.max(u.bid, r.eff); u.cost += r.cost; }
  const list = Object.entries(byKw).sort((a, c) => c[1].bid - a[1].bid).slice(0, 15);
  console.log(`\n--- ${b} · 노출중 입찰가 상위 15 ---`);
  for (const [kw, u] of list) console.log(`   ${kw.padEnd(20)} ${String(u.vol).padStart(7)}회  ${String(u.bid).padStart(6)}원  비용 ${money(u.cost)}원`);
  const dead = (B[b] || []).filter(r => r.st !== '노출');
  const deadKw = [...new Set(dead.map(r => r.kw))].filter(k => !rs.some(r => r.kw === k));
  if (b.startsWith('▲')) {
    console.log(`   … 죽어있는 키워드 ${deadKw.length}개 (검색량 상위: ${deadKw.sort((a, c) => (vol[c] || 0) - (vol[a] || 0)).slice(0, 12).map(k => `${k}(${vol[k] || 0})`).join(', ')})`);
  }
}
fs.writeFileSync(P('_sojam_c0827_rebalance.json'), JSON.stringify(rows), 'utf8');
console.log(`\n계획 저장 — 전체 인스턴스 ${rows.length}`);
