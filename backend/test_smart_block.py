import requests
import json

r = requests.post(
    'http://localhost:8001/api/blogs/search-keyword-with-tabs',
    params={'keyword': '강남치과', 'limit': 10, 'analyze_content': False},
    timeout=180
)

data = r.json()

print('Total found:', data.get('total_found'))
print('\nTab counts:')
tabs = data.get('tabs', {})
print(f"  VIEW: {len(tabs.get('VIEW', []))}")
print(f"  SMART_BLOCK: {len(tabs.get('SMART_BLOCK', []))}")
print(f"  BLOG: {len(tabs.get('BLOG', []))}")

print('\nSMART_BLOCK blogs:')
for i, blog in enumerate(tabs.get('SMART_BLOCK', [])[:5], 1):
    keyword = blog.get('smart_block_keyword', 'N/A')
    if len(keyword) > 50:
        keyword = keyword[:47] + '...'
    print(f"  {i}. {blog.get('blog_id')} - keyword: {keyword}")
