"""Inspect the HTML a crawler receives, without executing client JavaScript."""
import argparse
import concurrent.futures
import json
from pathlib import Path
import urllib.request
from urllib.error import HTTPError
from bs4 import BeautifulSoup

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='https://www.blrank.co.kr')
parser.add_argument('--output', default='output/blspi-seo/live-audit.json')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
paths = ['/', '/analyze', '/keyword-search', '/keyword-check', '/blog-check', '/draft-check',
         '/guides', '/pricing', '/about', '/methodology', '/robots.txt', '/sitemap.xml', '/sitemap-index.xml', '/rss.xml', '/llms.txt', '/llms-full.txt']


def inspect(path):
    url = args.base.rstrip('/') + path
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; SEOAudit/1.0)'})
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode('utf-8')
            item = {'path': path, 'status': response.status, 'url': response.url,
                    'x_robots_tag': response.headers.get('X-Robots-Tag'),
                    'content_type': response.headers.get('Content-Type'), 'bytes': len(body.encode())}
        if 'text/html' in (item['content_type'] or ''):
            soup = BeautifulSoup(body, 'html.parser')
            canonical = soup.select_one('link[rel="canonical"]')
            item.update(title=soup.title.get_text() if soup.title else None,
                        canonical=canonical.get('href') if canonical else None,
                        descriptions=[x.get('content') for x in soup.select('meta[name="description"]')],
                        robots=[x.get('content') for x in soup.select('meta[name="robots"]')],
                        h1=[x.get_text(' ', strip=True) for x in soup.select('h1')],
                        json_ld=[json.loads(x.string or x.get_text()) for x in soup.select('script[type="application/ld+json"]')])
            for x in soup(['script', 'style']):
                x.decompose()
            item['visible_text_chars'] = len(soup.get_text(' ', strip=True))
            item['old_brand_visible'] = '블랭크' in soup.get_text()
            item['new_brand_visible'] = '블스피' in soup.get_text()
        else:
            item['content'] = body[:15000]
        return item
    except Exception as exc:
        return {'path': path, 'error': str(exc)}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(inspect, paths))
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
for r in results:
    print(json.dumps({k: r[k] for k in ['path', 'status', 'title', 'canonical', 'h1', 'x_robots_tag', 'error'] if k in r}, ensure_ascii=False))
if all('error' in r for r in results):
    raise SystemExit(1)
if args.check:
    for item in results:
        assert item.get('status') == 200, item
        if 'title' in item:
            assert '블스피' in item['title'], item['path']
            assert len(item['h1']) == 1, item['path']
            assert not item['old_brand_visible'], item['path']
            assert item['canonical'] == 'https://www.blrank.co.kr' + ('' if item['path'] == '/' else item['path']), item['path']
            assert len(item['descriptions']) == 1 and item['descriptions'][0], item['path']
            assert not any('noindex' in (x or '') for x in item['robots']), item['path']
            assert item['json_ld'], item['path']
    print('Public SEO HTML checks passed')
