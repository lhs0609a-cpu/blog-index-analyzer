from bs4 import BeautifulSoup

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("=" * 80)
print("스마트블록 분석 결과")
print("=" * 80)

# 1. 헤드라인 스마트블록 키워드 찾기
headline_spans = soup.find_all('span', class_=lambda x: x and 'fds-comps-header-headline' in str(x))
print(f"\n✅ 헤드라인 스마트블록 키워드: {len(headline_spans)}개 발견")
for i, span in enumerate(headline_spans, 1):
    text = span.get_text(strip=True)
    print(f"  {i}. '{text}'")

    # 해당 스마트블록 섹션 찾기
    parent = span.find_parent('div', class_=lambda x: x and 'fds-comps-container' in str(x))
    if parent:
        # 블로그 링크 찾기
        blog_links = parent.find_all('a', class_=lambda x: x and 'link_name' in str(x))
        print(f"     블로그 링크 {len(blog_links)}개:")
        for j, link in enumerate(blog_links[:5], 1):  # 처음 5개만
            blog_title = link.get_text(strip=True)
            blog_url = link.get('href', '')
            print(f"       {j}. {blog_title[:40]}...")
            print(f"          URL: {blog_url[:60]}...")

        # 더보기 버튼 찾기
        more_buttons = parent.find_all('span', class_=lambda x: x and 'fds-comps-footer-more-button-text' in str(x))
        if more_buttons:
            print(f"     ⭐ '더보기' 버튼 있음 ({len(more_buttons)}개)")
        else:
            print(f"     ❌ '더보기' 버튼 없음")

# 2. 타이틀 스마트블록 키워드 찾기 (혹시 몰라서)
title_spans = soup.find_all('span', class_=lambda x: x and 'fds-comps-footer-more-subject' in str(x))
if title_spans:
    print(f"\n✅ 타이틀 스마트블록 키워드: {len(title_spans)}개 발견")
    for i, span in enumerate(title_spans, 1):
        text = span.get_text(strip=True)
        print(f"  {i}. '{text}'")

# 3. 전체 스마트블록 컨테이너 개수
smart_containers = soup.find_all('div', class_=lambda x: x and 'fds-comps-container' in str(x))
print(f"\n📦 전체 스마트블록 컨테이너: {len(smart_containers)}개")

print("\n" + "=" * 80)
