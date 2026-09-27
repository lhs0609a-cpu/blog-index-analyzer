// 소잠 WEB_SITE 캠페인을 공유예산에 연결한다.
// 연결 경로는 컬렉션 PUT + 배열 바디다: PUT /ncc/campaigns?fields=sharedBudget
//   body: [{...campaign, sharedBudgetId, sharedDailyBudget, sharedBudgetName}, ...]  (20개씩)
// 검증: GET /ncc/campaigns/shared-budgets/{sharedBudgetId}
// (단건 /ncc/campaigns/{id}?fields=sharedBudget 는 400 — fields 는 userLock,budget,period 만 받는다)
// 사용: node sojam_shared_budget_attach.js --dry / --apply / --detach
const fs = require('fs'), path = require('path'), assert = require('assert');
const dir = path.resolve(__dirname, '../../reports/sojam-20260909/shared-budget');
fs.mkdirSync(dir, { recursive: true });
const url = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
const save = (n, x) => fs.writeFileSync(path.join(dir, n), JSON.stringify(x, null, 2));

async function api(method, p, body = null) {
  for (let n = 0; n < (method === 'GET' ? 4 : 1); n++) try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer_id: '1858907', method, path: p, body }),
      signal: AbortSignal.timeout(40000),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw Error(String(d.error || JSON.stringify(d)).slice(0, 400));
    return d.response;
  } catch (e) { if (method !== 'GET' || n === 3) throw e; }
}
const members = sid => api('GET', '/ncc/campaigns/shared-budgets/' + sid);

(async () => {
  const mode = ['--dry', '--apply', '--detach'].find(m => process.argv.includes(m));
  assert(mode, '--dry / --apply / --detach 중 하나');
  const campaigns = await api('GET', '/ncc/campaigns?recordSize=1000');
  assert(campaigns.length > 100 && campaigns.length < 1000);
  const list = await api('GET', '/ncc/shared-budgets');
  assert(list.length === 1, '공유예산이 1개가 아니다');
  const sb = list[0];
  assert(sb.ownerType === 'CAMPAIGN', 'ownerType 이 CAMPAIGN 이 아니다: ' + sb.ownerType);

  const targets = campaigns.filter(c => c.campaignTp === 'WEB_SITE');
  const before = await members(sb.sharedBudgetId);
  console.log('공유예산 ' + sb.name + ' ' + sb.dailyBudget.toLocaleString() + '원 | 현재 연결 ' + before.length + '개 | WEB_SITE 대상 ' + targets.length + '개');
  console.log('WEB_SITE 개별 일예산 합계 ' + targets.filter(c => c.useDailyBudget).reduce((s, c) => s + c.dailyBudget, 0).toLocaleString() + '원');
  console.log('공유예산 밖에 남는 캠페인: ' + campaigns.filter(c => c.campaignTp !== 'WEB_SITE')
    .map(c => c.name + '(' + c.campaignTp + ', ' + (c.useDailyBudget ? c.dailyBudget + '원' : '계약형') + ')').join(' / '));

  if (mode === '--dry') { save('before_campaigns.json', campaigns); console.log('\n--dry: 아무것도 바꾸지 않았다.'); return; }

  save('before_campaigns.json', campaigns);
  save('before_shared_budget.json', { sharedBudget: sb, members: before });

  if (mode === '--detach') {
    const cur = await members(sb.sharedBudgetId);
    for (let i = 0; i < cur.length; i += 20) {
      const part = cur.slice(i, i + 20).map(c => ({ ...c, sharedBudgetId: null }));
      await api('PUT', '/ncc/campaigns?fields=sharedBudget', part);
    }
    const left = await members(sb.sharedBudgetId);
    console.log('해제 후 연결 ' + left.length + '개');
    assert(left.length === 0, '해제되지 않은 캠페인이 남았다: ' + left.length);
    return;
  }

  const attachedIds = new Set(before.map(c => c.nccCampaignId));
  const pending = targets.filter(c => !attachedIds.has(c.nccCampaignId));
  for (let i = 0; i < pending.length; i += 20) {
    const part = pending.slice(i, i + 20).map(c => ({
      ...c, sharedBudgetId: sb.sharedBudgetId, sharedDailyBudget: sb.dailyBudget, sharedBudgetName: sb.name,
    }));
    await api('PUT', '/ncc/campaigns?fields=sharedBudget', part);
    console.log('연결 ' + Math.min(i + 20, pending.length) + '/' + pending.length);
  }
  const after = await members(sb.sharedBudgetId);
  const afterIds = new Set(after.map(c => c.nccCampaignId));
  const missing = targets.filter(c => !afterIds.has(c.nccCampaignId));
  const campsAfter = await api('GET', '/ncc/campaigns?recordSize=1000');
  const sbAfter = (await api('GET', '/ncc/shared-budgets'))[0];
  save('after_campaigns.json', campsAfter);
  save('after_shared_budget.json', { sharedBudget: sbAfter, members: after });
  console.log('\n연결 완료 ' + after.length + '개 / 대상 ' + targets.length + '개, 누락 ' + missing.length);
  if (missing.length) console.log('누락:', missing.map(c => c.name).slice(0, 10));
  assert(missing.length === 0, '연결되지 않은 캠페인이 있다');
  const still = campsAfter.filter(c => c.campaignTp === 'WEB_SITE' && c.useDailyBudget);
  console.log('연결 후에도 개별 일예산이 살아있는 WEB_SITE: ' + still.length + '개 (합계 ' +
    still.reduce((s, c) => s + c.dailyBudget, 0).toLocaleString() + '원)');
  console.log('공유예산 numberInUse=' + sbAfter.numberInUse + ' dailyBudget=' + sbAfter.dailyBudget.toLocaleString() + '원');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
