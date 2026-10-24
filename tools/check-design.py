"""Read-only browser checks for the Blank workspace redesign."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect

OUT = Path('output/design-review')
OUT.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:3016'
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1100}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append({"url": page.url, "message": str(error), "stack": error.stack}))
    page.goto(BASE, wait_until='networkidle', timeout=120000)
    page.get_by_role('heading', level=1).first.wait_for()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / 'desktop.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Desktop overflow'
    page.get_by_role('button', name='무료 분석', exact=True).click()
    assert page.url.rstrip('/') == BASE
    page.get_by_role('button', name='키워드 검색', exact=True).click()
    page.get_by_role('textbox', name='검색할 키워드').fill('블로그 성장')
    # Capture destination before the existing analyzer issues external requests.
    page.route('**/keyword-search?keyword=*', lambda route: route.fulfill(status=200, content_type='text/html', body='<html><body>Navigation verified</body></html>'))
    page.get_by_role('button', name='검색하기', exact=True).click()
    page.wait_for_url('**/keyword-search?keyword=*')
    assert '%EB%B8%94%EB%A1%9C%EA%B7%B8' in page.url
    page.unroute('**/keyword-search?keyword=*')
    for route in ['/login', '/register', '/analyze', '/keyword-search', '/pricing']:
        page.goto(BASE + route, wait_until='domcontentloaded', timeout=120000)
        page.wait_for_timeout(1500)
        assert page.locator('h1').count(), f'Missing heading: {route}'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow: {route}'
        page.screenshot(path=str(OUT / (route.strip('/') + '.png')), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE, wait_until='domcontentloaded', timeout=120000)
    page.get_by_role('heading', level=1).first.wait_for()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / 'mobile.png'))
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
    page.get_by_role('button', name='메뉴 열기').click()
    page.get_by_role('dialog', name='주 메뉴').wait_for()
    page.screenshot(path=str(OUT / 'mobile-menu.png'))
    page.keyboard.press('Escape')
    expect(page.get_by_role('button', name='메뉴 열기')).to_have_attribute('aria-expanded', 'false')
    assert page.get_by_role('button', name='메뉴 열기').evaluate('(el) => el === document.activeElement')
    page.get_by_role('button', name='메뉴 열기').click()
    page.get_by_role('dialog').get_by_role('link', name='블로그 분석').click()
    page.wait_for_url('**/analyze')
    expect(page.get_by_role('button', name='메뉴 열기')).to_have_attribute('aria-expanded', 'false')
    page.get_by_role('heading', level=1).first.wait_for()
    page.wait_for_load_state('networkidle')
    (OUT / 'browser-results.json').write_text(json.dumps({"errors": errors, "checks": "desktop, mobile, input validation, keyword navigation, core routes, mobile menu, escape and focus return"}, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
    assert not errors, errors
    print('Design browser checks passed')
