"""Read-only rendering checks for the brand and public SEO pages."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:3109')
args = parser.parse_args()
out = Path('output/blspi-seo')
out.mkdir(parents=True, exist_ok=True)
results, errors = [], []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.on('pageerror', lambda error: errors.append(str(error)))
    for route in ['/', '/about', '/methodology', '/analyze', '/pricing', '/keyword-search', '/keyword-check', '/blog-check', '/draft-check']:
        response = page.goto(args.base + route, wait_until='domcontentloaded', timeout=60000)
        page.locator('h1').first.wait_for(state='visible')
        page.wait_for_timeout(700)
        assert response.status == 200, (route, response.status)
        assert '블스피' in page.title(), (route, page.title())
        assert page.locator('h1').count() == 1, route
        assert '블랭크' not in page.locator('body').inner_text(), route
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), route
        results.append({'route': route, 'title': page.title(), 'h1': page.locator('h1').inner_text()})
        if route in ['/', '/about', '/methodology']:
            page.screenshot(path=str(out / ('desktop-' + (route.strip('/') or 'home') + '.png')))
    page.set_viewport_size({'width': 390, 'height': 844})
    for route in ['/', '/about', '/methodology']:
        page.goto(args.base + route, wait_until='domcontentloaded', timeout=60000)
        page.locator('h1').first.wait_for(state='visible')
        page.wait_for_timeout(500)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), ('mobile', route)
        page.screenshot(path=str(out / ('mobile-' + (route.strip('/') or 'home') + '.png')))
    for route in ['/opengraph-image', '/twitter-image']:
        response = page.request.get(args.base + route, timeout=60000)
        assert response.status == 200, (route, response.status)
        assert 'image/png' in response.headers['content-type']
        (out / (route.strip('/') + '.png')).write_bytes(response.body())
    browser.close()
(out / 'browser.json').write_text(json.dumps({'pages': results, 'errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
assert not errors, errors
print('Browser checks passed: desktop/mobile, nine routes, brand, headings, overflow, social images')
