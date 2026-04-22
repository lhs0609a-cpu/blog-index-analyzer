"""
Backward-compatible shim → web_search.py

이 모듈은 web_search.py로 이전되었습니다.
기존 import 호환을 위해 re-export합니다.
"""
from .web_search import (  # noqa: F401
    ProfileResult as NaverProfileResult,
    search_profiles_via_naver,
    lookup_profile_via_naver,
    parse_snippet_counts,
    PLATFORM_CONFIGS,
)
