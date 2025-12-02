import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def test_playwright():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            print("Navigating to Naver search...")
            await page.goto('https://search.naver.com/search.naver?where=nexearch&query=강남치과&sm=top_hty&fbm=0&ie=utf8',
                          wait_until='networkidle', timeout=30000)
            print("Waiting for JavaScript...")
            await asyncio.sleep(5)
            html = await page.content()
            print(f"HTML length: {len(html)}")

            # Parse HTML and look for smart block keywords
            soup = BeautifulSoup(html, 'html.parser')
            headline_spans = soup.find_all('span', class_=lambda x: x and 'fds-comps-header-headline' in str(x))
            print(f"\nFound {len(headline_spans)} smart block headline spans:")
            for span in headline_spans[:10]:
                print(f"  - {span.get_text(strip=True)}")

        finally:
            await browser.close()

# Run
asyncio.run(test_playwright())
