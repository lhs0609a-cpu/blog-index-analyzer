// 소잠한의원 전체 재세팅 — 실제 일소진 15만원 목표. 캠페인 예산 + 키워드 입찰가를 중요도 순으로 다시 깐다.
// 입력 등급/노출이력/지역판정: scripts/sojam_reset_150k_input.py 가 만든 reset-150k/input.json
// 사용: node sojam_reset_150k.js --prepare   /   node sojam_reset_150k.js --apply
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.resolve(__dirname, '../../reports/sojam-20260909/reset-150k');
fs.mkdirSync(dir, { recursive: true });
const url = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const save = (n, x) => fs.writeFileSync(path.join(dir, n), JSON.stringify(x, null, 2));
const read = n => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));

async function api(method, p, body = null) {
  for (let n = 0; n < (method === 'GET' ? 4 : 1); n++) try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: '1858907', method, path: p, body }),
      signal: AbortSignal.timeout(40000),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw Error('API rejected ' + r.status + ' ' + JSON.stringify(d).slice(0, 200));
    return d.response;
  } catch (e) { if (method !== 'GET' || n === 3) throw e; }
}
async function parallel(items, fn, n = 4) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]); } }));
  return out;
}
const idsPath = rs => '/ncc/keywords?ids=' + encodeURIComponent(rs.map(x => x.keyword_id).join(','));

// ── 중요도 순 캠페인 일예산. 합계 141,700 + 나머지 바닥 70원 = 약 149,000원.
const BUDGET = {
  '파워링크': 78000, '소잠_열_땀_탈모_654286': 9000, '소잠_발습진_유두습진_청주곤지름_653065': 8000,
  '소잠_귀_발_당뇨_654255': 7000, '파워링크-대표키워드': 6000, '플레이스': 5000, '소잠_세부보충': 3000,
  '소잠_핵심_강남피부': 3000, '소잠_모공클렌징폼_아차산역한의원_645676': 2500, '소잠_상선_변비_화병_684871': 2000,
  '(liveAD)파워링크_지역키워드_250805': 2000, '소잠_부천비립종_암면역치료_암환자면역_654518': 1800,
  '(liveAD)파워링크_일반키워드_250805': 1500, '소잠_검정고시카페_검정고시비용_739239': 1500,
  '소잠_그루밍랩샴푸_수원인천공항_737232': 1500, '소잠_무좀균_수포무좀_무좀샴푸_654010': 1000,
  '소잠_유두각질원인_유두진물원인_유륜습진원인_658975': 1000, '소잠_두피염약_비듬크림_비듬관리_649374': 1000,
  '소잠_잇몸치료비용_광주피부미용_데이터시각화_657699': 800, '소잠_지루성두피염아기_물사마귀생기는이유_663629': 800,
  '소잠_은밀부위_전체': 800, '소잠_어깨결림한의원_면역력에좋은차_654405': 700,
  '소잠_남자바디샴푸_삼성화재암치료비_732063': 600, '소잠_구순염_구내염완치_기저귀피부염_663246': 500,
  '소잠_파주무좀_판교아토피_입술포진병원_674312': 500, '소잠_몸니증상_서울한포진_서울아토피_668043': 500,
  '소잠_만성피로병원_인천두통병원_고혈압한의원_653778': 500, '소잠_더마세럼_691182': 400,
  '소잠_신림비립종_부산어지럼증_655332': 400, '소잠_서면곤지름_물방울건선완치_662798': 400,
};
const FLOOR = 70;
// ── 중요도별 적용입찰(기기 가중치 반영 후) 상한
const LADDER = { S: 8000, A: 6000, A_AUX: 4500, B: 4000, C_DISEASE: 3300, D_OTHER_SKIN: 1800, D_AUX: 1300, D_INFO: 1200, MEDICAL: 1200, U: 600 };
const OPENING = { S: 3000, A: 2500, A_AUX: 2000, B: 1800 };  // 아직 노출이 없는 핵심 축의 시험 진입가
const REMOTE_CAP = 1000;                                     // 타지역 접두는 진료권 미확인 → 제한
const EXCLUDED_BID = 70;

const round10 = v => Math.max(70, Math.floor(v / 10) * 10);
// 지출의 97.5%가 모바일이므로 모바일 가중치로 잡고, PC 적용입찰은 상한의 1.5배까지만 허용한다
function baseFor(ceiling, g) {
  const mw = (g.mobileNetworkBidWeight || 100) / 100, pw = (g.pcNetworkBidWeight || 100) / 100;
  return round10(Math.min(ceiling / mw, ceiling * 1.5 / pw));
}

async function prepare() {
  assert(!fs.existsSync(path.join(dir, 'result.json')), 'result.json 이 이미 있다 — 지우거나 새 폴더를 써라');
  const input = JSON.parse(fs.readFileSync(path.join(dir, 'input.json'), 'utf8'));
  const campaigns = await api('GET', '/ncc/campaigns?recordSize=1000');
  assert(Array.isArray(campaigns) && campaigns.length < 1000 && campaigns.length > 100);
  const byName = new Map(campaigns.map(c => [c.name, c]));
  for (const n of Object.keys(BUDGET)) assert(byName.has(n), '없는 캠페인명: ' + n);

  const budgets = [];
  for (const c of campaigns) {
    if (!c.useDailyBudget) continue;   // 브랜드검색 등 계약형은 건드리지 않는다
    const after = BUDGET[c.name] ?? FLOOR;
    budgets.push({ id: c.nccCampaignId, name: c.name, before: c.dailyBudget, after, lock: c.userLock, tp: c.campaignTp });
  }

  const groupLists = await parallel(campaigns.map(c => c.nccCampaignId), id => api('GET', '/ncc/adgroups?nccCampaignId=' + id), 4);
  const groups = {};
  for (const list of groupLists) for (const g of list) groups[g.nccAdgroupId] = g;
  const lockedCampaign = new Set(campaigns.filter(c => c.userLock).map(c => c.nccCampaignId));
  const selected = new Set(Object.keys(BUDGET).map(n => byName.get(n).nccCampaignId));

  const cand = input.filter(r => {
    const g = groups[r.group_id];
    if (!g || g.userLock || g.status !== 'ELIGIBLE') return false;
    if (lockedCampaign.has(r.campaign_id)) return false;
    if (r.grade === 'BRAND') return false;
    if (r.excluded) return true;                    // 제외축은 전 캠페인에서 70원으로
    if (!selected.has(r.campaign_id)) return false; // 인상은 운영 캠페인 안에서만
    if (r.has_impression) return true;
    return r.core && r.region !== 'other';
  });

  const parts = [];
  for (let i = 0; i < cand.length; i += 100) parts.push(cand.slice(i, i + 100));
  const fetched = (await parallel(parts, p => api('GET', idsPath(p)), 4)).flat();
  const live = new Map(fetched.map(k => [k.nccKeywordId, k]));

  const actions = [], skipped = [];
  for (const r of cand) {
    const k = live.get(r.keyword_id), g = groups[r.group_id];
    if (!k) { skipped.push({ keyword: r.keyword, reason: '키워드 조회 실패' }); continue; }
    assert(k.customerId === 1858907 && k.nccAdgroupId === r.group_id, '키워드 소속 불일치 ' + r.keyword_id);
    if (k.keyword !== r.keyword) { skipped.push({ keyword: r.keyword, reason: '키워드 문자열 변경됨' }); continue; }
    if (k.userLock || k.status !== 'ELIGIBLE') { skipped.push({ keyword: k.keyword, reason: '키워드 OFF/비적격 ' + k.status }); continue; }
    const before = k.useGroupBidAmt ? g.bidAmt : k.bidAmt;
    let ceiling, kind;
    if (r.excluded) { ceiling = EXCLUDED_BID; kind = '제외축_70원'; }
    else if (r.has_impression) { ceiling = LADDER[r.grade]; kind = '노출보유_중요도래더'; }
    else { ceiling = OPENING[r.grade]; kind = '무노출핵심_진입가'; }
    if (!ceiling) { skipped.push({ keyword: k.keyword, reason: '등급 상한 없음 ' + r.grade }); continue; }
    if (r.region === 'other') ceiling = Math.min(ceiling, REMOTE_CAP);
    const after = r.excluded ? EXCLUDED_BID : baseFor(ceiling, g);
    if (after === before && !k.useGroupBidAmt) { skipped.push({ keyword: k.keyword, reason: '이미 목표값' }); continue; }
    actions.push({
      keyword_id: k.nccKeywordId, keyword: k.keyword, group_id: r.group_id, campaign_id: r.campaign_id,
      campaign_name: r.campaign_name, grade: r.grade, region: r.region, kind,
      period_impressions: r.period_impressions, period_cost: r.period_cost, period_avg_rank: r.period_avg_rank,
      before_base: before, after_base: after, use_group_bid_before: k.useGroupBidAmt,
      pc_weight: g.pcNetworkBidWeight, mobile_weight: g.mobileNetworkBidWeight,
      pc_before: before * (g.pcNetworkBidWeight || 100) / 100, pc_after: after * (g.pcNetworkBidWeight || 100) / 100,
      mobile_before: before * (g.mobileNetworkBidWeight || 100) / 100, mobile_after: after * (g.mobileNetworkBidWeight || 100) / 100,
    });
  }
  // 인하부터 적용해서 중간에 총액이 튀지 않게 한다
  const rank = { '제외축_70원': 0, '노출보유_중요도래더': 1, '무노출핵심_진입가': 2 };
  actions.sort((a, b) => (a.after_base - a.before_base) - (b.after_base - b.before_base) || rank[a.kind] - rank[b.kind]);

  save('before.json', { at: new Date().toISOString(), campaigns, groups, keywords: Object.fromEntries(fetched.map(k => [k.nccKeywordId, k])) });
  const before = read('before.json');
  const plan = {
    at: before.at, target_actual_spend: 150000,
    budget_total_before: budgets.reduce((s, b) => s + b.before, 0),
    budget_total_after: budgets.reduce((s, b) => s + b.after, 0),
    budgets, actions, skipped,
  };
  save('plan.json', plan);
  const byKind = {}, byGrade = {};
  for (const a of actions) {
    const k = byKind[a.kind] ??= { n: 0, up: 0, down: 0 };
    k.n++; a.after_base > a.before_base ? k.up++ : k.down++;
    (byGrade[a.grade] ??= { n: 0 }).n++;
  }
  console.log(JSON.stringify({
    campaigns: campaigns.length, groups: Object.keys(groups).length,
    candidates: cand.length, actions: actions.length, skipped: skipped.length,
    budget_before: plan.budget_total_before, budget_after: plan.budget_total_after,
    budget_changes: budgets.filter(b => b.before !== b.after).length, byKind, byGrade,
    sample: actions.filter(a => ['지루성피부염한의원', '피부가려움증치료', '가려움증한의원', '한포진치료', '아토피한의원'].includes(a.keyword)).slice(0, 8),
  }, null, 1));
}

async function apply() {
  const before = read('before.json'), plan = read('plan.json');
  assert(Date.now() - Date.parse(before.at) < 3 * 3600 * 1000, '스냅샷이 낡았다 — --prepare 다시');
  const resultPath = path.join(dir, 'result.json');
  const result = fs.existsSync(resultPath) ? read('result.json') : { started: new Date().toISOString(), keywords: [], budgets: [], complete: false };
  const done = new Set(result.keywords.map(k => k.keyword_id));
  const todo = plan.actions.filter(a => !done.has(a.keyword_id));
  console.log('남은 키워드 ' + todo.length + ' / ' + plan.actions.length);
  for (let i = 0; i < todo.length; i += 50) {
    const part = todo.slice(i, i + 50);
    const fresh = await api('GET', idsPath(part));
    assert(fresh.length === part.length);
    const body = part.map(r => {
      const k = fresh.find(k => k.nccKeywordId === r.keyword_id), old = before.keywords[r.keyword_id];
      assert(k && old && k.editTm === old.editTm && !k.userLock, '변경 직전 상태 불일치: ' + r.keyword);
      return { ...k, bidAmt: r.after_base, useGroupBidAmt: false };
    });
    await api('PUT', '/ncc/keywords?fields=bidAmt', body);
    const after = await api('GET', idsPath(part));
    for (const r of part) {
      const k = after.find(k => k.nccKeywordId === r.keyword_id);
      result.keywords.push({ ...r, verified: !!k && k.bidAmt === r.after_base && !k.useGroupBidAmt && !k.userLock });
    }
    save('result.json', result);
    assert(result.keywords.every(k => k.verified), '검증 실패');
    if ((i / 50) % 10 === 0) console.log('검증 완료 키워드 ' + result.keywords.length);
  }
  const bdone = new Set(result.budgets.map(b => b.id));
  for (const b of plan.budgets) {
    if (b.before === b.after || bdone.has(b.id)) continue;
    const fresh = await api('GET', '/ncc/campaigns/' + b.id);
    assert(fresh.dailyBudget === b.before && fresh.useDailyBudget, '예산 사전상태 불일치: ' + b.name);
    await api('PUT', '/ncc/campaigns/' + b.id + '?fields=budget', { ...fresh, dailyBudget: b.after, useDailyBudget: true });
    const c = await api('GET', '/ncc/campaigns/' + b.id);
    result.budgets.push({ ...b, verified: c.dailyBudget === b.after && c.useDailyBudget });
    save('result.json', result);
    assert(result.budgets.every(x => x.verified), '예산 검증 실패: ' + b.name);
  }
  const campaigns = await api('GET', '/ncc/campaigns?recordSize=1000');
  save('campaigns_after.json', campaigns);
  result.total_after = campaigns.filter(c => c.useDailyBudget).reduce((s, c) => s + c.dailyBudget, 0);
  result.finished = new Date().toISOString();
  result.complete = true;
  save('result.json', result);
  console.log('COMPLETE keywords=' + result.keywords.length + ' budgets=' + result.budgets.length + ' 일예산합계=' + result.total_after);
}

(async () => {
  if (process.argv.includes('--prepare')) return prepare();
  if (process.argv.includes('--apply')) return apply();
  throw Error('--prepare 또는 --apply');
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
