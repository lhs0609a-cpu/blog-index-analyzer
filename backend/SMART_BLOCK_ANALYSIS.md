# Naver Smart Block Keyword Analysis

## Summary
**CRITICAL FINDING**: The HTML file `search_view_debug.html` does NOT contain smart block keywords.

## Why No Smart Blocks?

The search query used was:
```
"강남 한방병원 브랜드블로그 내원률을 되살리는 전략적 구조 설계"
```

This is a very **long, specific query** (15+ words). Naver's smart blocks only appear for:
- **Short queries** (2-4 words)
- **Location + service keywords** (e.g., "강남 치과", "강남 임플란트")
- **Broad, commercial intent searches**

## HTML Structure Found

### Blog Post Organization

```html
<div class="main_pack">
  <div class="pack_group">
    <link>  <!-- Strange parent element -->
      <div class="spw_rerank _slog_visible type_head _rra_head">
        <!-- Container for ALL blog posts (no grouping) -->

        <div class="sc_new _slog_visible">
          <!-- Individual blog post #1 -->
          <div class="api_subject_bx">
            <!-- Blog post content -->
            <div class="fds-ugc-single-intention-item-list-rra">
              <!-- User intention matching (not smart blocks!) -->
              <div class="sds-comps-profile-info-title">
                <!-- Blog author/title -->
              </div>
            </div>
          </div>
        </div>

        <div class="sc_new _slog_visible">
          <!-- Individual blog post #2 -->
        </div>

        <!-- ... more blog posts (28 total) ... -->

      </div>
    </link>
  </div>
</div>
```

### Key Classes

| Class | Purpose |
|-------|---------|
| `main_pack` | Main search results container |
| `spw_rerank` | Container for all blog results (no sub-grouping) |
| `sc_new` | Individual blog post wrapper |
| `api_subject_bx` | Blog post content container |
| `fds-ugc-single-intention-item-list-rra` | **User-intent matching** (not smart blocks!) |
| `sds-comps-profile-info-title` | Blog author name/title |

## What Smart Blocks WOULD Look Like

If smart blocks existed, you would see:

```html
<!-- HYPOTHETICAL - Not in current HTML -->
<div class="smart-block-container">

  <!-- Smart Block #1 -->
  <div class="smart-block-group">
    <div class="smart-block-keyword">강남365치과</div>  <!-- KEYWORD -->
    <div class="blog-post">...</div>
    <div class="blog-post">...</div>
  </div>

  <!-- Smart Block #2 -->
  <div class="smart-block-group">
    <div class="smart-block-keyword">강남 임플란트치과</div>  <!-- KEYWORD -->
    <div class="blog-post">...</div>
    <div class="blog-post">...</div>
  </div>

  <!-- Smart Block #3 -->
  <div class="smart-block-group">
    <div class="smart-block-keyword">강남역치과</div>  <!-- KEYWORD -->
    <div class="blog-post">...</div>
  </div>

</div>
```

**Characteristics of Smart Blocks:**
- **Multiple grouping sections** (not just one `spw_rerank`)
- **Short keyword headers** (3-20 chars like "강남365치과")
- **Each group has multiple blog posts**
- **Keywords act as tabs/chips/headers**

## What Was Mistaken for Smart Blocks

The current code looks for `class="fds-comps-header-headline"` which does NOT exist in the HTML.

What DOES exist:
- `sds-comps-profile-info-title` - Blog author names (NOT keywords)
- `sds-comps-text-type-headline1/3` - Various text styling (NOT grouping keywords)

## Testing Recommendations

To properly test smart block extraction, you need to:

1. **Use a shorter query** that triggers smart blocks:
   ```
   강남 치과
   강남 임플란트
   강남역 한의원
   서울 피부과
   ```

2. **Save the HTML** from that search

3. **Look for these patterns** in the new HTML:
   - Multiple section containers (not just one `spw_rerank`)
   - Tab-like structures with short text
   - Grouping elements with `data-keyword` or similar attributes
   - Classes containing: `smart`, `block`, `keyword-group`, `tab-group`

## Correct BeautifulSoup Code

### For the CURRENT HTML (no smart blocks):

```python
from bs4 import BeautifulSoup

with open('search_view_debug.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Extract blog posts (no smart blocks present)
blog_posts = soup.find_all('div', class_='api_subject_bx')
print(f"Found {len(blog_posts)} blog posts (no keyword grouping)")

# No smart blocks to extract!
smart_blocks = []  # Empty - not present in this HTML
```

### For FUTURE HTML (when smart blocks exist):

```python
from bs4 import BeautifulSoup

with open('naver_search_short_query.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Strategy 1: Look for multiple grouping sections
groups = soup.find_all('div', class_=lambda x: x and 'group' in str(x).lower())

# Strategy 2: Look for keyword/tab elements
keyword_tabs = soup.find_all(['a', 'button', 'span'],
                             class_=lambda x: x and any(kw in str(x).lower()
                             for kw in ['keyword', 'chip', 'tab']))

# Strategy 3: Check data attributes
keyword_elements = soup.find_all(attrs={'data-keyword': True})

# Strategy 4: Look for section headers before blog groups
# (Find elements that precede multiple blog posts)
```

## Example Selectors to Try (when smart blocks exist)

```css
/* Possible CSS selectors for smart block keywords */
div[class*="smart-block"] .keyword
div[class*="keyword-group"] > .title
div[class*="intention-group"] > h3
a[data-keyword]
button.keyword-chip
div.smart-block-header
```

## Next Steps

1. **Search with a shorter query** like "강남 치과"
2. **Save that HTML** to a new file
3. **Inspect the structure** manually (browser DevTools)
4. **Look for keyword headers** that group blog posts
5. **Update extraction code** based on actual structure found

## Conclusion

The current HTML does NOT contain smart blocks because the query is too specific. You need to:
- Test with broader queries
- Get new HTML that actually has smart blocks
- Then analyze THAT structure to find the correct selectors

The code in `naver_smart_block_extractor.py` provides 6 different extraction strategies that should work once you have HTML that actually contains smart blocks.
