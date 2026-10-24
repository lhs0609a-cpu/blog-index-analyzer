// B3(입찰 충분인데 노출 0) 등록본이 있는 그룹의 타기팅 조건 조회 → 지역(RL/RP)·요일시간(SD) 제한 여부.
// /ncc/criterion/{gid} — 1개씩, 600ms 간격(프록시 서버 3GB).
const fs = require('fs'), path = require('path');
const base = 'https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/debug/naver-raw?user_id=1&customer_id=1858907';
async function api(p) { for (let a = 0; a < 3; a++) { try { const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customer_id: '1858907', method: 'GET', path: p, body: null }), signal: AbortSignal.timeout(45000) }); const d = await r.json(); if (!d.success) throw Error(String(d.error).slice(0, 120)); return d.response; } catch (e) { if (a === 2) return null; await new Promise(s => setTimeout(s, 2500)); } } }
const D = path.join(__dirname, '../reports/sojam-20260911/rankaudit/zeroimp/');
(async () => {
  const gids = JSON.parse(fs.readFileSync(D + 'b3_groups.json', 'utf8'));
  // 옮겨 담을 후보 그룹도 같이 확인
  for (const g of ['grp-a001-01-000000072328280', 'grp-a001-01-000000072333190', 'grp-a001-01-000000017627304']) if (!gids.includes(g)) gids.push(g);
  const out = fs.existsSync(D + 'criteria.json') ? JSON.parse(fs.readFileSync(D + 'criteria.json', 'utf8')) : {};
  for (const g of gids) {
    if (out[g]) continue;
    const c = await api('/ncc/criterion/' + g);
    if (c === null) { console.error('fail', g); continue; }
    const arr = Array.isArray(c) ? c : [];
    const types = [...new Set(arr.map(x => x.type))];
    out[g] = { region: types.includes('RL') || types.includes('RP'), time: types.includes('SD'), age: types.includes('AG'), types,
      rp: arr.filter(x => x.type === 'RP').map(x => x.value), rl: arr.filter(x => x.type === 'RL').map(x => x.value) };
    // 그룹마다 저장 — 9/11 18시 서버 장애 때 끝에서 한 번 쓰는 구조라 도중에 죽으며 전부 잃었다
    fs.writeFileSync(D + 'criteria.json', JSON.stringify(out, null, 1));
    await new Promise(s => setTimeout(s, 600));
  }
  fs.writeFileSync(D + 'criteria.json', JSON.stringify(out, null, 1));
  const v = Object.values(out);
  console.log('그룹', v.length, '| 지역제한', v.filter(x => x.region).length, '| 시간제한', v.filter(x => x.time).length, '| 연령제한', v.filter(x => x.age).length, '| 제한 없음', v.filter(x => !x.region && !x.time && !x.age).length);
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
