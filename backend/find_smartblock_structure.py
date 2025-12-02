from bs4 import BeautifulSoup
import json

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Search for the smart block keywords we know exist
keywords = ['강남역 치과', '강남 교정치과', '강남아인스치과']

print("=" * 80)
print("Searching for smart block keywords in HTML...")
print("=" * 80)

for keyword in keywords:
    print(f"\n\nSearching for: '{keyword}'")
    print("-" * 80)

    # Find all text nodes containing the keyword
    elements = soup.find_all(string=lambda text: text and keyword in text)

    if not elements:
        print(f"  NOT FOUND in rendered text")
        continue

    print(f"  Found {len(elements)} occurrence(s)")

    for i, elem in enumerate(elements[:3], 1):  # Show first 3
        print(f"\n  Occurrence {i}:")
        print(f"    Text: '{elem[:100]}'")

        # Get parent structure
        parent = elem.parent
        if parent:
            print(f"    Parent tag: <{parent.name}>")
            print(f"    Parent classes: {parent.get('class', [])}")

            # Go up the tree to find the container
            container = parent
            for level in range(5):
                container = container.parent
                if container and container.name:
                    classes = container.get('class', [])
                    print(f"    Ancestor {level+1}: <{container.name}> classes={classes[:3]}")

                    # Check if this looks like a smart block container
                    class_str = ' '.join(classes) if classes else ''
                    if 'smart' in class_str.lower() or 'block' in class_str.lower() or 'fds-comps' in class_str:
                        print(f"      ^^^ POTENTIAL SMART BLOCK CONTAINER!")

print("\n" + "=" * 80)
print("\nNow searching for common Naver class patterns...")
print("=" * 80)

# Search for common Naver component patterns
patterns = [
    'fds-comps-header',
    'fds-comps-headline',
    'api_subject_bx',
    'sp_nplace',
    'total_area',
    'api_txt_lines'
]

for pattern in patterns:
    elements = soup.find_all(class_=lambda x: x and pattern in str(x))
    if elements:
        print(f"\n'{pattern}': Found {len(elements)} elements")
        if elements:
            first = elements[0]
            print(f"  Example classes: {first.get('class', [])}")
            text = first.get_text(strip=True)[:100]
            print(f"  Example text: '{text}'")
