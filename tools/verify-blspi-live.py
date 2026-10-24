"""Read-only production crawler, redirects, structured data and sitemap checks."""
import concurrent.futures
import json
from pathlib import Path
import urllib.request
from urllib.error import HTTPError
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

BASE = 'https://www.blrank.co.kr'

def fetch(path, agent='Mozilla/5.0 (compatible; SEOAudit/1.0)'):
    request = urllib.request.Request(BASE + path, headers={'User-Agent': agent})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return response.status, response.url, dict(response.headers), response.read()
    except HTTPError as error:
        return error.code, error.url, dict(error.headers), error.read()

results = []
for agent in ['Googlebot', 'Yeti', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot']:
    status, url, headers, body = fetch('/', agent)
    assert status == 200, (agent, status)
    assert 'noindex' not in str(headers).lower(), agent
    assert '블스피' in body.decode('utf-8'), agent
    results.append({'agent': agent, 'status': status})

status, _, _, body = fetch('/')
soup = BeautifulSoup(body, 'html.parser')
visible = soup.get_text(' ', strip=True)
schemas = [json.loads(tag.get_text()) for tag in soup.select('script[type="application/ld+json"]')]
faqs = [item for item in schemas if item.get('@type') == 'FAQPage']
assert faqs, 'Home FAQ schema missing'
for faq in faqs:
    for question in faq['mainEntity']:
        assert question['name'] in visible, question['name']
        assert question['acceptedAnswer']['text'] in visible, question['name']

for path in ['/sitemap.xml', '/sitemap-index.xml', '/rss.xml']:
    status, _, _, body = fetch(path)
    assert status == 200, (path, status)
    ET.fromstring(body)
    if path == '/sitemap.xml':
        assert b'/about</loc>' in body and b'/methodology</loc>' in body
    results.append({'path': path, 'xml_valid': True})

for path in ['/sitemap-keywords/not-a-chunk', '/sitemap-keywords/-1.xml', '/not-a-blspi-page-20260914']:
    status, _, _, _ = fetch(path)
    assert status == 404, (path, status)
    results.append({'path': path, 'status': status})

status, final_url, _, _ = fetch('/landing')
assert status == 200 and final_url.rstrip('/') == BASE, final_url
with urllib.request.urlopen('https://blrank.co.kr/about', timeout=45) as response:
    assert response.url == BASE + '/about', response.url
results.append({'redirects': 'landing and apex reach canonical URLs'})

status, _, _, body = fetch('/login')
assert status == 200
soup = BeautifulSoup(body, 'html.parser')
assert any('noindex' in (tag.get('content') or '') for tag in soup.select('meta[name="robots"]'))
results.append({'private_page': '/login', 'noindex': True})
Path('output/blspi-seo/live-contracts.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print('Live checks passed: 5 crawler user agents, visible FAQ, XML feeds, 404s, redirects, account noindex')
