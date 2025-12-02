# Naver Smart Block Keyword Extraction - Complete Findings

## Executive Summary

**CRITICAL FINDING**: The HTML file `E:\u\blog-index-analyzer\backend\search_view_debug.html` **DOES NOT CONTAIN** smart block keywords.

**Reason**: The search query is too long and specific for Naver to generate smart blocks.

**Query Used**: `"강남 한방병원 브랜드블로그 내원률을 되살리는 전략적 구조 설계"`

**Solution**: Test with shorter queries like `"강남 치과"` or `"강남 임플란트"` to trigger smart blocks.

---

## What We Found

### 1. Current HTML Structure

```
main_pack
└── pack_group
    └── <link>  (unusual parent element)
        └── spw_rerank (single container for ALL blog posts)
            ├── sc_new (blog post #1)
            │   └── api_subject_bx (content wrapper)
            │       └── fds-ugc-single-intention-item-list-rra
            │           └── sds-comps-profile-info-title
            │               └── Blog Author Name (e.g., "Dr 김영삼")
            ├── sc_new (blog post #2)
            ├── sc_new (blog post #3)
            └── ... (28 total blog posts)
```

**Key Observation**: Only ONE `spw_rerank` section containing all blog posts in a flat list. No grouping by keywords.

### 2. What Was Mistaken for Smart Blocks

The current code searches for `class="fds-comps-header-headline"`, which **DOES NOT EXIST** in the HTML.

What actually exists:
- `sds-comps-profile-info-title` - Contains **blog author names**, not smart block keywords
- Example values: "Dr 김영삼", "풋볼리스트", "Daum", "뒷북치는 포스팅"

These are:
- ❌ **NOT** smart block keywords
- ❌ **NOT** grouping headers
- ✅ **ARE** blog post author names
- ✅ **ARE** inside `api_subject_bx` containers (individual blog posts)

### 3. HTML Snippets

#### Blog Author Element (Mistaken for Smart Block)

```html
<div class="sds-comps-horizontal-layout sds-comps-inline-layout sds-comps-profile-info-title">
  <span class="sds-comps-text sds-comps-text-ellipsis sds-comps-text-ellipsis-1 sds-comps-text-type-body2 sds-comps-text-weight-sm sds-comps-profile-info-title-text">
    Dr 김영삼
  </span>
</div>
```

**CSS Selector**: `.sds-comps-profile-info-title`

**What it is**: Blog author name

**What it's NOT**: Smart block keyword

#### Blog Post Container

```html
<div class="cjezTWzWP9yxY_7Qx1vs Gdhdac3danErNIYrbpEZ desktop_mode api_subject_bx">
  <div class="sds-comps-vertical-layout sds-comps-full-layout fds-web-root">
    <div class="sds-comps-vertical-layout sds-comps-full-layout fds-web-list-root">
      <div class="sds-comps-vertical-layout sds-comps-full-layout fds-web-doc-root">
        <!-- Blog post content -->
      </div>
    </div>
  </div>
</div>
```

**CSS Selector**: `.api_subject_bx`

**What it is**: Individual blog post wrapper

---

## How to Find Smart Blocks

### When Smart Blocks Appear

Smart blocks typically appear for:
- ✅ **Short queries** (2-4 words)
- ✅ **Location + service** (e.g., "강남 치과")
- ✅ **Commercial intent** (e.g., "강남 임플란트")
- ✅ **Broad searches** with multiple interpretations

Smart blocks DON'T appear for:
- ❌ Long, specific queries (15+ words)
- ❌ Exact phrase searches
- ❌ Niche/uncommon searches
- ❌ Branded/specific content queries

### Expected Smart Block Structure

```html
<!-- HYPOTHETICAL - What smart blocks SHOULD look like -->

<div class="main_pack">

  <!-- Smart Block Group #1 -->
  <div class="smart-block-section" data-keyword="강남365치과">
    <div class="keyword-header">
      <h3>강남365치과</h3>  <!-- SHORT KEYWORD! -->
    </div>
    <div class="blog-list">
      <div class="blog-post">...</div>
      <div class="blog-post">...</div>
      <div class="blog-post">...</div>
    </div>
  </div>

  <!-- Smart Block Group #2 -->
  <div class="smart-block-section" data-keyword="강남 임플란트치과">
    <div class="keyword-header">
      <h3>강남 임플란트치과</h3>  <!-- SHORT KEYWORD! -->
    </div>
    <div class="blog-list">
      <div class="blog-post">...</div>
      <div class="blog-post">...</div>
    </div>
  </div>

  <!-- Smart Block Group #3 -->
  <div class="smart-block-section" data-keyword="강남역치과">
    <div class="keyword-header">
      <h3>강남역치과</h3>  <!-- SHORT KEYWORD! -->
    </div>
    <div class="blog-list">
      <div class="blog-post">...</div>
    </div>
  </div>

</div>
```

**Key Characteristics**:
1. Multiple section containers (one per keyword)
2. Each has a SHORT keyword header (3-20 characters)
3. Keyword is OUTSIDE blog post containers
4. Each section contains multiple blog posts
5. Keywords act as tabs/dividers/headers

---

## BeautifulSoup Extraction Code

### For Current HTML (No Smart Blocks)

```python
from bs4 import BeautifulSoup

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# No smart blocks present - just extract blog posts
blog_posts = soup.find_all('div', class_='api_subject_bx')
print(f"Total blog posts: {len(blog_posts)}")

# Extract blog authors (NOT smart block keywords!)
for post in blog_posts:
    author_elem = post.find('div', class_='sds-comps-profile-info-title')
    if author_elem:
        author = author_elem.get_text(strip=True)
        print(f"Author: {author}")  # This is a blog author, not a keyword!
```

### For Future HTML (When Smart Blocks Exist)

```python
from bs4 import BeautifulSoup
import re

with open('naver_search_short_query.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Method 1: Look for multiple grouping sections
smart_block_groups = soup.find_all('div', class_=re.compile(r'smart-block|keyword-group|intention-group', re.I))

# Method 2: Look for sections with keyword headers
for section in soup.find_all('div', class_=lambda x: x and 'section' in str(x)):
    # Look for a header element
    header = section.find(['h2', 'h3', 'h4'])
    if header:
        keyword = header.get_text(strip=True)
        if 3 <= len(keyword) <= 20:  # Smart block keywords are short
            print(f"Potential keyword: {keyword}")

            # Count blog posts in this section
            posts = section.find_all('div', class_='blog-post')
            print(f"  Blog posts: {len(posts)}")

# Method 3: Look for data attributes
keyword_elements = soup.find_all(attrs={'data-keyword': True})
for elem in keyword_elements:
    keyword = elem.get('data-keyword')
    print(f"Keyword from data attribute: {keyword}")

# Method 4: Check for multiple rerank sections
rerank_sections = soup.find_all('div', class_=re.compile(r'rerank', re.I))
if len(rerank_sections) > 1:
    print(f"Found {len(rerank_sections)} separate sections (possible smart blocks)")
```

### Complete Extractor Class

See `E:\u\blog-index-analyzer\backend\naver_smart_block_extractor.py` for a comprehensive extractor with 6 different detection methods.

---

## Testing Recommendations

### Step-by-Step Testing Process

1. **Use a short query** that triggers smart blocks:
   ```
   강남 치과
   강남 임플란트
   서울 피부과
   부산 정형외과
   ```

2. **Verify smart blocks in browser**:
   - Open Naver.com
   - Search for the query
   - Look for keyword tabs/chips/headers
   - Confirm blog posts are grouped under keywords

3. **Save the HTML**:
   ```
   Right-click → Save As → Webpage, Complete
   ```
   Or use DevTools:
   ```
   F12 → Elements → Right-click <html> → Copy → Copy outerHTML
   ```

4. **Inspect the structure**:
   - Open HTML in text editor
   - Search for the keyword text (e.g., "강남 치과")
   - Note the parent element's classes
   - Identify the grouping structure

5. **Update extraction code**:
   - Use actual class names found
   - Test extraction on new HTML
   - Validate keywords are correct

6. **Test multiple queries**:
   - Verify code works across different searches
   - Handle cases without smart blocks gracefully

---

## Files Created

1. **`naver_smart_block_extractor.py`** - Complete extractor class with 6 detection methods
2. **`smart_block_examples.py`** - 7 detailed code examples with explanations
3. **`SMART_BLOCK_ANALYSIS.md`** - Technical analysis of HTML structure
4. **`FINDINGS_SUMMARY.md`** - This file (complete findings summary)

---

## Conclusion

### Current Status
- ❌ No smart blocks in current HTML
- ❌ Current code extracts blog author names, not keywords
- ✅ HTML structure fully analyzed
- ✅ Extraction code ready for when smart blocks are present

### Next Steps
1. Search with a shorter query (e.g., "강남 치과")
2. Save new HTML containing actual smart blocks
3. Use `naver_smart_block_extractor.py` to extract keywords
4. Verify extraction accuracy
5. Integrate into main application

### Key Takeaway

**Smart blocks are a query-dependent feature.** They don't exist for all searches. The current HTML doesn't have them because the query is too specific. Use shorter, broader queries to trigger smart blocks, then test the extraction code.

---

## Quick Reference

### CSS Selectors to Try (when smart blocks exist)

```css
/* Possible selectors for smart block keywords */
div[class*="smart-block"] .keyword
div[class*="keyword-group"] > h3
div[class*="intention-group"] > .title
[data-keyword]
.smart-block-header
.keyword-chip
.keyword-tab
```

### Python Quick Test

```python
# Quick test to check if smart blocks exist
from bs4 import BeautifulSoup

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

# Check 1: Multiple rerank sections?
reranks = soup.find_all('div', class_=lambda x: x and 'rerank' in str(x))
print(f"Rerank sections: {len(reranks)} (need 3+ for smart blocks)")

# Check 2: Blog posts
posts = soup.find_all('div', class_='api_subject_bx')
print(f"Blog posts: {len(posts)}")

# Check 3: Verdict
if len(reranks) <= 1:
    print("❌ NO smart blocks - try shorter query")
else:
    print("✅ Possible smart blocks - investigate further")
```

---

**Last Updated**: Analysis completed based on `search_view_debug.html`
**Status**: Ready for testing with appropriate search queries
