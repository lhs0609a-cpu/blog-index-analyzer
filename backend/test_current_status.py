import requests
import json

r = requests.post(
    'http://localhost:8001/api/blogs/search-keyword-with-tabs',
    params={'keyword': '강남치과', 'limit': 5, 'analyze_content': False},
    timeout=120
)

data = r.json()

print('Status:', r.status_code)
print('\nTab counts:')
tabs = data.get('tabs', {})
print(f'  VIEW: {len(tabs.get("VIEW", []))}')
print(f'  SMART_BLOCK: {len(tabs.get("SMART_BLOCK", []))}')
print(f'  BLOG: {len(tabs.get("BLOG", []))}')

print('\nVIEW blogs (checking smart_block_keyword field):')
view_blogs = tabs.get('VIEW', [])
for i, blog in enumerate(view_blogs[:5], 1):
    sbk = blog.get('smart_block_keyword', None)
    print(f'  {i}. {blog.get("blog_id")}')
    print(f'     smart_block_keyword: {sbk}')

print('\nSMART_BLOCK blogs:')
smart_blogs = tabs.get('SMART_BLOCK', [])
for i, blog in enumerate(smart_blogs[:5], 1):
    sbk = blog.get('smart_block_keyword', None)
    print(f'  {i}. {blog.get("blog_id")}')
    print(f'     smart_block_keyword: {sbk}')
