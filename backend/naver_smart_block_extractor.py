"""
Naver Smart Block Keyword Extractor

This module provides multiple strategies to extract smart block keywords from Naver search results.
Smart blocks are grouping/categorization features that Naver uses to organize search results
by relevant keywords.

Note: Smart blocks only appear for certain types of queries (typically shorter, broader searches).
If no smart blocks are found, the page likely doesn't have them for that particular query.
"""

from bs4 import BeautifulSoup
from typing import List, Dict, Optional
import re


class NaverSmartBlockExtractor:
    """Extract smart block keywords from Naver search result HTML"""

    def __init__(self, html_content: str):
        """
        Initialize the extractor with HTML content

        Args:
            html_content: Raw HTML string from Naver search results
        """
        self.soup = BeautifulSoup(html_content, 'html.parser')

    def extract_all_methods(self) -> Dict[str, List[str]]:
        """
        Try all extraction methods and return results from each

        Returns:
            Dictionary mapping method names to their extracted keywords
        """
        results = {
            'method_1_intention_groups': self.extract_from_intention_groups(),
            'method_2_keyword_tabs': self.extract_from_keyword_tabs(),
            'method_3_data_attributes': self.extract_from_data_attributes(),
            'method_4_section_headers': self.extract_from_section_headers(),
            'method_5_smart_classes': self.extract_from_smart_classes(),
            'method_6_rerank_sections': self.extract_from_rerank_sections(),
        }
        return results

    def extract_smart_blocks(self) -> List[str]:
        """
        Extract smart block keywords using the best available method

        Returns:
            List of smart block keyword strings
        """
        # Try all methods
        all_results = self.extract_all_methods()

        # Return the first non-empty result
        for method_name, keywords in all_results.items():
            if keywords:
                print(f"✓ Found keywords using {method_name}")
                return keywords

        print("⚠ No smart block keywords found - this query may not trigger smart blocks")
        return []

    # Method 1: Look for intention-based grouping
    def extract_from_intention_groups(self) -> List[str]:
        """Extract from elements with 'intention' in class name"""
        keywords = []

        # Find elements with intention-related classes
        for element in self.soup.find_all(class_=re.compile(r'intention', re.I)):
            # Look for header/title elements within
            headers = element.find_all(['h3', 'h4', 'h5', 'div', 'span'],
                                      class_=re.compile(r'(title|headline|header|keyword)', re.I))

            for header in headers:
                text = header.get_text(strip=True)
                if self._is_valid_keyword(text):
                    keywords.append(text)

        return list(dict.fromkeys(keywords))  # Remove duplicates while preserving order

    # Method 2: Look for tab-like structures with keywords
    def extract_from_keyword_tabs(self) -> List[str]:
        """Extract from tab or button groups that might be keywords"""
        keywords = []

        # Find potential tab/button containers
        containers = self.soup.find_all(['ul', 'div'],
                                       class_=re.compile(r'(chip|pill|tag|keyword|filter)', re.I))

        for container in containers:
            # Find links or buttons within
            items = container.find_all(['a', 'button', 'span'])

            for item in items:
                text = item.get_text(strip=True)
                if self._is_valid_keyword(text):
                    keywords.append(text)

        return list(dict.fromkeys(keywords))

    # Method 3: Look for data attributes containing keywords
    def extract_from_data_attributes(self) -> List[str]:
        """Extract from data-keyword or data-title attributes"""
        keywords = []

        # Find elements with data-keyword, data-title, or similar
        for attr in ['data-keyword', 'data-title', 'data-name', 'data-label']:
            elements = self.soup.find_all(attrs={attr: True})

            for element in elements:
                text = element.get(attr, '').strip()
                if self._is_valid_keyword(text):
                    keywords.append(text)

        return list(dict.fromkeys(keywords))

    # Method 4: Look for section headers before blog groups
    def extract_from_section_headers(self) -> List[str]:
        """Extract keywords from headers that precede blog post groups"""
        keywords = []

        # Find all blog post containers
        blog_containers = self.soup.find_all(class_=re.compile(r'(api_subject_bx|sc_new)', re.I))

        checked_parents = set()
        for container in blog_containers:
            # Check parent for header elements
            parent = container.find_parent(['div', 'section', 'article'])

            if parent and id(parent) not in checked_parents:
                checked_parents.add(id(parent))

                # Look for headers before this blog group
                headers = parent.find_all(['h2', 'h3', 'h4', 'h5'], recursive=False)

                for header in headers:
                    text = header.get_text(strip=True)
                    if self._is_valid_keyword(text):
                        keywords.append(text)

        return list(dict.fromkeys(keywords))

    # Method 5: Look for classes with 'smart' or 'block' keywords
    def extract_from_smart_classes(self) -> List[str]:
        """Extract from elements with 'smart' or 'block' in class names"""
        keywords = []

        # Find elements with smart/block classes
        elements = self.soup.find_all(class_=re.compile(r'(smart|block).*?(title|keyword|header)', re.I))

        for element in elements:
            text = element.get_text(strip=True)
            if self._is_valid_keyword(text):
                keywords.append(text)

        return list(dict.fromkeys(keywords))

    # Method 6: Look for multiple rerank sections (each might be a smart block group)
    def extract_from_rerank_sections(self) -> List[str]:
        """Extract keywords from multiple rerank/grouping sections"""
        keywords = []

        # Find all rerank sections
        rerank_sections = self.soup.find_all('div', class_=re.compile(r'rerank|group', re.I))

        # If there are multiple rerank sections, they might each represent a smart block
        if len(rerank_sections) > 1:
            for section in rerank_sections:
                # Look for a title/header at the start of each section
                first_child = next((child for child in section.children
                                   if hasattr(child, 'name') and child.name), None)

                if first_child:
                    # Check if it's a header-like element
                    if first_child.name in ['h2', 'h3', 'h4', 'h5']:
                        text = first_child.get_text(strip=True)
                        if self._is_valid_keyword(text):
                            keywords.append(text)
                    else:
                        # Check if it has a title/header class
                        title_elem = first_child.find(class_=re.compile(r'(title|headline|header)', re.I))
                        if title_elem:
                            text = title_elem.get_text(strip=True)
                            if self._is_valid_keyword(text):
                                keywords.append(text)

        return list(dict.fromkeys(keywords))

    def _is_valid_keyword(self, text: str) -> bool:
        """
        Check if text is a valid smart block keyword

        Args:
            text: Text to validate

        Returns:
            True if valid, False otherwise
        """
        if not text:
            return False

        # Length check: smart block keywords are typically 2-30 characters
        if len(text) < 2 or len(text) > 30:
            return False

        # Should contain Korean, English, or numbers
        if not re.search(r'[가-힣a-zA-Z0-9]', text):
            return False

        # Exclude common UI text
        ui_text = ['블로그', '카페', '이미지', '뉴스', '지식in', '동영상',
                   '더보기', '전체', '이전', '다음', 'keep', '저장']
        if text.lower() in [t.lower() for t in ui_text]:
            return False

        return True

    def get_blog_structure_info(self) -> Dict[str, any]:
        """
        Get information about the blog post structure in the HTML

        Returns:
            Dictionary with structure information
        """
        info = {
            'total_blog_posts': len(self.soup.find_all(class_='api_subject_bx')),
            'has_rerank_section': bool(self.soup.find('div', class_=re.compile(r'rerank', re.I))),
            'blog_post_containers': [],
        }

        # Get details about blog containers
        blog_posts = self.soup.find_all(class_='api_subject_bx')[:5]  # First 5
        for post in blog_posts:
            # Try to extract title
            title_elem = post.find(class_=re.compile(r'title|headline', re.I))
            title = title_elem.get_text(strip=True)[:100] if title_elem else 'No title found'

            info['blog_post_containers'].append({
                'title_preview': title,
                'has_title_element': bool(title_elem),
            })

        return info


def main():
    """Example usage"""
    import sys

    # Set UTF-8 encoding for stdout
    sys.stdout.reconfigure(encoding='utf-8')

    # Read HTML file
    html_file = 'search_view_debug.html'

    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
    except FileNotFoundError:
        print(f"Error: {html_file} not found")
        sys.exit(1)

    # Create extractor
    extractor = NaverSmartBlockExtractor(html_content)

    # Get structure info
    print("=== Blog Structure Information ===")
    info = extractor.get_blog_structure_info()
    print(f"Total blog posts: {info['total_blog_posts']}")
    print(f"Has rerank section: {info['has_rerank_section']}")
    print()

    # Try all extraction methods
    print("=== Trying All Extraction Methods ===")
    all_results = extractor.extract_all_methods()

    for method_name, keywords in all_results.items():
        print(f"\n{method_name}:")
        if keywords:
            for kw in keywords:
                print(f"  - {kw}")
        else:
            print("  (no keywords found)")

    # Get best result
    print("\n=== Best Result ===")
    keywords = extractor.extract_smart_blocks()
    if keywords:
        print("Smart block keywords found:")
        for kw in keywords:
            print(f"  • {kw}")
    else:
        print("\nNo smart blocks detected in this HTML.")
        print("Possible reasons:")
        print("  1. The search query is too long/specific")
        print("  2. Naver didn't generate smart blocks for this query")
        print("  3. Try a shorter query like '강남 치과' or '강남 임플란트'")


if __name__ == '__main__':
    main()
