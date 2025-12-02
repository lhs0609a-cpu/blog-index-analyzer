from bs4 import BeautifulSoup

html = open('search_result_debug.html', 'r', encoding='utf-8').read()
soup = BeautifulSoup(html, 'html.parser')

patterns = [
    ('.total_wrap .total_tit', 'total_wrap + total_tit'),
    ('.api_subject_bx', 'api_subject_bx'),
    ('.sh_blog_top', 'sh_blog_top'),
    ('.view_wrap .title_link', 'view_wrap + title_link'),
    ('a[href*="blog.naver.com"]', 'blog.naver.com links'),
    ('li.bx', 'li.bx'),
    ('.total_area', 'total_area'),
    ('ul.lst_total > li', 'lst_total > li'),
]

print("CSS 셀렉터 테스트 결과:")
print("=" * 50)
for selector, name in patterns:
    items = soup.select(selector)
    print(f"{name:30s}: {len(items):3d}개")

# 가장 많은 결과를 가진 패턴 확인
print("\n가장 적합한 패턴: .api_subject_bx")
items = soup.select('.api_subject_bx')
print(f"총 {len(items)}개 아이템 발견\n")

# li.bx 분석
print("\nli.bx 아이템 분석:")
print("=" * 50)
bx_items = soup.select('li.bx')
print(f"총 {len(bx_items)}개 li.bx 발견\n")

for i, item in enumerate(bx_items, 1):
    links = item.find_all('a', href=lambda x: x and 'blog.naver.com' in x)
    print(f"아이템 {i}: {len(links)}개의 blog.naver.com 링크")
    if links:
        for j, link in enumerate(links[:2], 1):
            href = link.get('href', '')
            text = link.get_text(strip=True)
            print(f"  링크 {j}: {text[:30]} -> {href[:50]}")
