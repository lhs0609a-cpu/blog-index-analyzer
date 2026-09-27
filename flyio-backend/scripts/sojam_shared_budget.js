// 소잠 공유예산 금액 조회/변경. 캠페인 연결은 API로 불가능하다 —
// PUT /ncc/campaigns 는 fields=userLock,budget,period 만 받는다(네이버 400 응답으로 확인, 2026-09-09).
// 사용: node sojam_shared_budget.js                       (조회)
//       node sojam_shared_budget.js --set 300000          (일예산)
//       node sojam_shared_budget.js --delivery STANDARD   (STANDARD=균등배분 / ACCELERATED=빠른소진)
const assert = require('assert');
const url = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(method, p, body = null) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ customer_id: '1858907', method, path: p, body }),
    signal: AbortSignal.timeout(40000),
  });
  const d = await r.json();
  if (!r.ok || !d.success) throw Error(String(d.error || JSON.stringify(d)).slice(0, 300));
  return d.response;
}
(async () => {
  const list = await api('GET', '/ncc/shared-budgets');
  assert(list.length === 1, '공유예산이 1개가 아니다: ' + list.length);
  const sb = list[0];
  const show = x => JSON.stringify({ name: x.name, dailyBudget: x.dailyBudget, deliveryMethod: x.deliveryMethod, numberInUse: x.numberInUse, budgetLock: x.budgetLock });
  const i = process.argv.indexOf('--set'), j = process.argv.indexOf('--delivery');
  if (i < 0 && j < 0) { console.log(JSON.stringify(sb, null, 1)); return; }

  const patch = {};
  if (i >= 0) {
    const amount = Number(process.argv[i + 1]);
    assert(Number.isInteger(amount) && amount >= 70 && amount <= 1000000, '금액이 이상하다: ' + amount);
    patch.dailyBudget = amount;
  }
  if (j >= 0) {
    const dm = process.argv[j + 1];
    assert(['STANDARD', 'ACCELERATED'].includes(dm), 'deliveryMethod 는 STANDARD 또는 ACCELERATED: ' + dm);
    patch.deliveryMethod = dm;
  }
  console.log('변경 전:', show(sb));
  await api('PUT', '/ncc/shared-budgets/' + sb.sharedBudgetId, { ...sb, ...patch });
  const after = (await api('GET', '/ncc/shared-budgets'))[0];
  for (const [k, v] of Object.entries(patch)) assert(after[k] === v, '재조회 불일치 ' + k + '=' + after[k]);
  console.log('변경 후:', show(after));
  console.log(after.numberInUse === 0
    ? '연결된 캠페인 0개 — 이 금액은 화면에서 캠페인을 연결하기 전까지 아무 효과가 없다.'
    : '연결된 캠페인 ' + after.numberInUse + '개 — 이 금액이 그 캠페인들의 합산 상한이다.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
