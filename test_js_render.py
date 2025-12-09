import asyncio
from requests_html import AsyncHTMLSession

async def test_render():
    session = AsyncHTMLSession()
    try:
        print("Fetching URL...")
        r = await session.get('https://search.naver.com/search.naver?where=nexearch&query=강남치과&sm=top_hty&fbm=0&ie=utf8')
        print(f"Got response: {r.status_code}")
        print("Starting render...")
        await r.html.arender(sleep=2, timeout=20)
        print("Render completed!")
        print(f"HTML length: {len(r.html.html)}")

        # Check for smart block keywords
        spans = r.html.find('span.fds-comps-header-headline')
        print(f"Found {len(spans)} smart block headline spans")

    except Exception as e:
        print(f"Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await session.close()

# Run in new event loop
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
try:
    loop.run_until_complete(test_render())
finally:
    loop.close()
