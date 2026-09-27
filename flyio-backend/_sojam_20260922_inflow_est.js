// 유입키워드(환자 실제 검색어) 의 시장 볼륨·순위별 시장가·순위별 예상성과를 잰다.
// 로컬 키 cid 3808925 ([[naver-estimate-local-creds]]). 항목마다 저장해 중간에 죽어도 재개된다.
const fs = require('fs'), path = require('path');
const { req, sleep } = require('./_sojam_naver');
const D = path.join(__dirname, '../reports/');
const OUT = D + 'sojam-20260922_est.json';
const items = JSON.parse(fs.readFileSync(D + 'sojam-20260922_inflow_items.json', 'utf8'));

const norm = s => s.replace(/\s+/g, '');
const uniq = [...new Set(items.map(i => norm(i.kw)))];

const st = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { vol: {}, bid: {}, perf: {} };
const save = () => { fs.writeFileSync(OUT + '.tmp', JSON.stringify(st)); fs.renameSync(OUT + '.tmp', OUT); };

// "< 10" 함정: 문자열이면 실볼륨 미만으로 별도 표기
const V = v => (typeof v === 'string' && v.indexOf('<') >= 0) ? { n: 0, lt: 1 } : { n: Number(v) || 0, lt: 0 };

(async () => {
  // 1) 월 검색량
  const needV = uniq.filter(k => st.vol[k] === undefined);
  console.error('볼륨 대상', needV.length, '/', uniq.length);
  for (let i = 0; i < needV.length; i += 5) {
    const b = needV.slice(i, i + 5);
    try {
      const r = await req('GET', '/keywordstool?hintKeywords=' + encodeURIComponent(b.join(',')) + '&showDetail=1', null, 3808925, 3);
      const map = {};
      for (const x of (r && r.keywordList) || []) map[norm(x.relKeyword)] = x;
      for (const k of b) {
        const x = map[k];
        st.vol[k] = x ? { pc: V(x.monthlyPcQcCnt), mo: V(x.monthlyMobileQcCnt) } : null;
      }
    } catch (e) { for (const k of b) if (st.vol[k] === undefined) st.vol[k] = null; }
    save();
    if (i % 50 === 0) console.error('  vol', i, '/', needV.length);
    await sleep(220);
  }

  // 2) 순위별 시장가 (MOBILE / PC × 1·3·5위)
  for (const dev of ['MOBILE', 'PC']) {
    for (const pos of [1, 3, 5]) {
      const key = p => dev[0] + pos + '|' + p;
      const left = uniq.filter(k => st.bid[key(k)] === undefined);
      for (let i = 0; i < left.length; i += 100) {
        const b = left.slice(i, i + 100);
        try {
          const r = await req('POST', '/estimate/average-position-bid/keyword',
            { device: dev, items: b.map(k => ({ key: k, position: pos })) }, 3808925, 3);
          for (const x of (r && r.estimate) || []) st.bid[key(norm(x.keyword))] = x.bid;
        } catch (e) { }
        for (const k of b) if (st.bid[key(k)] === undefined) st.bid[key(k)] = null;
        save();
        await sleep(250);
      }
      console.error('  bid', dev, pos, 'done');
    }
  }

  // 3) 순위별 예상 노출·클릭·비용 (모바일, 1/3/5위 시장가로)
  for (const pos of [1, 3, 5]) {
    const need = uniq.filter(k => st.perf[pos + '|' + k] === undefined && st.bid['M' + pos + '|' + k]);
    for (let i = 0; i < need.length; i += 40) {
      const b = need.slice(i, i + 40);
      try {
        const r = await req('POST', '/estimate/performance-bulk',
          { items: b.map(k => ({ device: 'MOBILE', keywordplus: false, keyword: k, bid: st.bid['M' + pos + '|' + k] })) }, 3808925, 3);
        const arr = (r && (r.items || r.estimate)) || [];
        arr.forEach((x, j) => { st.perf[pos + '|' + b[j]] = { imp: x.impressions, clk: x.clicks, cost: x.cost }; });
      } catch (e) { }
      for (const k of b) if (st.perf[pos + '|' + k] === undefined) st.perf[pos + '|' + k] = null;
      save();
      await sleep(280);
    }
    console.error('  perf pos', pos, 'done');
  }
  console.error('완료', OUT);
})();
