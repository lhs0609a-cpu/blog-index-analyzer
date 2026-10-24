// 네이버 검색광고 API 직접 호출 클라이언트 (프록시 우회).
// 서명: HMAC-SHA256("{ts}.{METHOD}.{path}", secret) → base64. path 만, query 제외.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const D = __dirname;

function loadEnv() {
  const txt = fs.readFileSync(path.join(D, '.env'), 'utf8');
  const e = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) e[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return e;
}
const ENV = loadEnv();
const BASE = 'https://api.searchad.naver.com';
const API_KEY = ENV.NAVER_AD_API_KEY, SECRET = ENV.NAVER_AD_SECRET_KEY;
if (!API_KEY || !SECRET) throw new Error('.env 에 NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY 없음');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function headers(method, uri, customerId) {
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${method}.${uri}`).digest('base64');
  return { 'Content-Type': 'application/json; charset=UTF-8', 'X-Timestamp': ts,
           'X-API-KEY': API_KEY, 'X-Customer': String(customerId), 'X-Signature': sig };
}

// endpoint 는 query 포함 가능. 서명에는 path 만 쓴다.
async function req(method, endpoint, body, customerId, tries = 4) {
  const uri = endpoint.split('?')[0];
  for (let t = 0; t < tries; t++) {
    try {
      const r = await fetch(BASE + endpoint, {
        method, headers: headers(method, uri, customerId),
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const txt = await r.text();
      if (r.ok) { try { return JSON.parse(txt); } catch (e) { return txt; } }
      if (r.status >= 400 && r.status < 500 && r.status !== 429)
        throw new Error(`HTTP ${r.status} ${txt.slice(0, 200)}`);
    } catch (e) {
      if (t === tries - 1) throw e;
    }
    await sleep(Math.min(1000 * 2 ** t, 8000));
  }
}

// 동시 실행 제한
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { __err: String(e).slice(0, 150) }; } }
  }));
  return out;
}

module.exports = { req, pool, sleep, ENV };
