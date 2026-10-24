import json,re,time
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
D=Path(__file__).resolve().parents[1]/'reports/sojam-20260914/proposal-improvements/site-before';D.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(headless=True);c=b.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1,locale='ko-KR');page=c.new_page();out=[]
    for slug in ['','26','27','49']:
        r={'url':'https://www.sojam.co.kr/'+slug,'at':datetime.now(timezone.utc).isoformat()}
        try:
            response=page.goto(r['url'],wait_until='domcontentloaded',timeout=45000);page.wait_for_timeout(1500);text=page.locator('body').inner_text();name=slug or'home';(D/(name+'.html')).write_text(page.content(),encoding='utf8');(D/(name+'.txt')).write_text(text,encoding='utf8');page.screenshot(path=str(D/(name+'.png')),full_page=False)
            r.update(status=response.status,title=page.title(),hasPlaceholder=bool(re.search(r'OOO|20XX|회사명',page.content())),imweb='imweb'in page.content(),horizontalOverflow=page.evaluate('document.documentElement.scrollWidth > innerWidth+2'),links=page.locator('a[href^="tel:"],a[href*="kakao.com"],a[href*="booking.naver"]').evaluate_all('(a)=>a.map(e=>({text:e.innerText,url:e.href}))'),timing=page.evaluate('(()=>{let n=performance.getEntriesByType("navigation")[0];return {domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,transferBytes:n.transferSize}})()'))
        except Exception as e:r['error']=str(e)[:200]
        out.append(r);print(json.dumps({k:v for k,v in r.items()if k!='links'},ensure_ascii=False),flush=True)
    (D/'audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8');b.close()
