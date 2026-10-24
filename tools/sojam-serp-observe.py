import json,re,sys
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright
D=Path(__file__).resolve().parents[1]/'reports/sojam-20260914/intent-audit/serp'
D.mkdir(parents=True,exist_ok=True)
terms=sys.argv[1:] or ['소잠한의원','아토피한의원','외음부가려움치료','강남습진한의원']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    ctx=browser.new_context(**p.devices['iPhone 13'],locale='ko-KR',timezone_id='Asia/Seoul',geolocation={'latitude':37.5007,'longitude':127.0365},permissions=['geolocation'])
    page=ctx.new_page();out=json.loads((D/'observations.json').read_text(encoding='utf-8'))if(D/'observations.json').exists()else[]
    for i,term in enumerate(terms):
        r={'term':term,'observedAt':datetime.now(timezone.utc).isoformat(),'device':'mobile','requestedGeolocation':'강남구 역삼동','verifiedSearchLocation':None,'rank':None}
        try:
            response=page.goto('https://m.search.naver.com/search.naver?query='+quote(term),wait_until='domcontentloaded',timeout=30000)
            page.wait_for_timeout(2000)
            body=page.locator('body').inner_text()
            stem=str(len(out))+'_'+term
            (D/(stem+'.txt')).write_text(body,encoding='utf-8')
            (D/(stem+'.html')).write_text(page.content(),encoding='utf-8')
            page.screenshot(path=str(D/(stem+'.png')),full_page=False)
            sections=page.locator('[class*=ad_section], [class*=power_link], [class*=powerlink]').evaluate_all('(els)=>els.map(e=>({tag:e.tagName,cls:e.className,text:e.innerText?.slice(0,7000)}))')
            links=page.locator('a[onclick*="pwl.tit"]').evaluate_all('(els)=>els.map(e=>({text:e.innerText,tracking:e.getAttribute("onclick"),parent:e.closest("li")?.innerText?.slice(0,1600)}))')
            for j,ad in enumerate(links):
                match=re.search(r'&r=(\d+)',ad['tracking']or'')
                ad['position']=int(match.group(1))if match else j+1
            own=[a['position']for a in links if '소잠'in a['text']or'sojam.co.kr'in(a['tracking']or'')]
            r.update(status=response.status if response else None,title=page.title(),sojamInPage='소잠' in body,powerlinkInPage=bool(links),bodyPrefix=body[:900],bodySuffix=body[-1800:],sections=sections,links=links,rank=min(own)if own else None,topAdCount=len(links),ageFilter='연령 확인 후'in body,rankScope='이 비로그인 측정 환경에서 관찰한 상단 광고; 강남 위치 검증 안 됨')
        except Exception as e:r['error']=str(e)[:200]
        out.append(r)
        (D/'observations.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({k:v for k,v in r.items()if k not in ['sections','links','bodySuffix']},ensure_ascii=False),flush=True)
    browser.close()
