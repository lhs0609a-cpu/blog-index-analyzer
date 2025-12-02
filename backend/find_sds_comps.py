# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from bs4 import BeautifulSoup
import json

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

print("=" * 80)
print("Looking for SDS-COMPS patterns (not FDS-COMPS)")
print("=" * 80)

# Find elements with sds-comps classes
sds_elements = soup.find_all(class_=lambda x: x and 'sds-comps' in ' '.join(x) if x else False)
print(f"\nTotal elements with 'sds-comps' classes: {len(sds_elements)}")

# Look for title/header patterns
title_patterns = [
    'sds-comps-profile-info-title',
    'sds-comps-header',
    'sds-comps-title',
]

for pattern in title_patterns:
    elements = soup.find_all(class_=lambda x: x and pattern in ' '.join(x) if x else False)
    if elements:
        print(f"\n'{pattern}': {len(elements)} found")
        for elem in elements[:2]:
            text = elem.get_text(strip=True)[:80]
            print(f"  Text: {text}")
            print(f"  Classes: {elem.get('class', [])}")

# Look for api_subject_bx which we know exists
print("\n" + "=" * 80)
print("Looking for api_subject_bx containers")
print("=" * 80)

api_subjects = soup.find_all(class_=lambda x: x and 'api_subject_bx' in ' '.join(x) if x else False)
print(f"\nFound {len(api_subjects)} api_subject_bx containers")

for i, container in enumerate(api_subjects[:3], 1):
    print(f"\n--- Container {i} ---")

    # Find titles inside this container
    titles = container.find_all(class_=lambda x: x and 'sds-comps-profile-info-title-text' in ' '.join(x) if x else False)
    print(f"Titles found: {len(titles)}")
    for title in titles[:5]:
        text = title.get_text(strip=True)
        print(f"  - {text}")

    # Find links inside
    links = container.find_all('a', href=True)
    print(f"Links found: {len(links)}")
    for link in links[:3]:
        href = link.get('href', '')
        if 'blog.naver.com' in href:
            text = link.get_text(strip=True)[:50]
            print(f"  - Blog: {text}")
            print(f"    URL: {href[:60]}...")
