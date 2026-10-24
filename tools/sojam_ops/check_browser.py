import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];D=ROOT/'reports/sojam-20260914/proposal-improvements/landing-preview'
results=[]
with sync_playwright()as p:
    b=p.chromium.launch(headless=True)
    for width in [390,1280]:
        c=b.new_context(viewport={'width':width,'height':900});page=c.new_page()
        for code in ['p01','p02']:
            page.goto((D/(code+'.html')).as_uri()+'?af=c01&phone=TEST-PRIVATE&n_keyword=TEST-HEALTH',wait_until='load')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+2')
            assert page.locator('h1').count()==1
            assert page.locator('a[data-contact="kakao"]').count()>=2
            # Trigger instrumentation while preventing navigation or contacting anyone.
            page.evaluate('document.addEventListener("click", e=>e.preventDefault(), {capture:true})')
            page.locator('a[data-contact="kakao"]').first.click()
            records=page.evaluate('SojamMeasurement.getEvents()')
            assert [r['event']for r in records]==['page_view','contact_click']
            assert all(set(r)=={'event','page_code','channel','campaign_code'}for r in records)
            assert 'TEST-'not in json.dumps(records)
            assert page.evaluate('SojamMeasurement.getConsentedCampaign()')is None
            page.screenshot(path=str(D/f'{code}-{width}.png'),full_page=True)
            results.append({'page':code,'width':width,'events':len(records),'piiLeak':False,'horizontalOverflow':False})
        page.goto((D/'p01.html').as_uri()+'?af=TEST-PRIVATE',wait_until='load')
        assert page.evaluate('SojamMeasurement.getEvents()[0].campaign_code')is None
        c.close()
    b.close()
(D/'browser-check.json').write_text(json.dumps(results,indent=2),encoding='utf8');print(json.dumps(results))
