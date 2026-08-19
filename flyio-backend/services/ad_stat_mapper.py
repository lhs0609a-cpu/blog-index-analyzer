"""
네이버 SearchAd 통계 필드 → 우리 이름. 단일 소스.

왜 이 파일이 있나:
코드 여러 곳이 `stat.get("convCnt")` 로 전환수를 읽고 있었다. 그런 필드는
네이버에 **존재하지 않는다** — 전환수의 실제 필드명은 `ccnt` 다. 그래서
자동입찰의 전환 기반 계산은 언제나 conversions=0 을 받았고, ROAS 분기는
한 번도 실행되지 않았다. 조용히 틀리는 종류의 버그다.

전환매출(`convAmt`)에는 두 번째 함정이 있다. 필드명은 맞지만 요청 fields 에
넣지 않으면 응답에 아예 없다. 기본 fields 목록에 빠져 있어 결과는 역시 0 이었다.

⚠️ /stats 의 fields 는 entity 종류에 따라 지원 범위가 다르다. 지원하지 않는
필드를 섞으면 11001(잘못된 파라미터)로 **응답 전체가 실패**한다. 그래서
전환 필드를 추가할 때는 STAT_FIELDS_BASE 로 폴백할 수 있어야 한다.
"""
from typing import Any, Dict, List, Optional

# 어느 entity 에서든 안전한 최소 집합.
STAT_FIELDS_BASE: List[str] = [
    "impCnt", "clkCnt", "salesAmt", "ctr", "cpc", "avgRnk",
]

# 전환까지 포함한 집합. 11001 이 나면 BASE 로 내려간다.
STAT_FIELDS_WITH_CONVERSION: List[str] = STAT_FIELDS_BASE + [
    "ccnt",      # 전환수        ← convCnt 아님
    "convAmt",   # 전환매출액
    "crto",      # 전환율
    "ror",       # 광고수익률(ROAS)
]

# 네이버 필드 → 우리 이름.
# 값이 여러 후보인 것은 앞에서부터 먼저 잡히는 것을 쓴다.
_FIELD_MAP = {
    "impressions": ("impCnt",),
    "clicks":      ("clkCnt",),
    "cost":        ("salesAmt",),
    "ctr":         ("ctr",),
    "cpc":         ("cpc",),
    "avg_rank":    ("avgRnk",),
    # ccnt 가 정식. convCnt 는 과거 우리 코드가 쓰던 잘못된 이름인데,
    # 혹시 어딘가에서 그 키로 만들어진 dict 가 흘러와도 죽지 않게 남겨 둔다.
    "conversions": ("ccnt", "convCnt"),
    "conv_amount": ("convAmt",),
    "conv_rate":   ("crto",),
    "roas":        ("ror",),
}

_INT_FIELDS = ("impressions", "clicks")


def _num(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def normalize_stat(row: Dict[str, Any]) -> Dict[str, Any]:
    """네이버 stat 한 행을 우리 이름의 숫자 dict 로."""
    out: Dict[str, Any] = {}
    for ours, candidates in _FIELD_MAP.items():
        val = 0.0
        for c in candidates:
            if c in row and row[c] is not None:
                val = _num(row[c])
                break
        out[ours] = int(val) if ours in _INT_FIELDS else val
    return out


def conversions_of(row: Dict[str, Any]) -> float:
    """전환수만 필요할 때. `convCnt` 오독을 다시 만들지 않기 위한 진입점."""
    return normalize_stat(row)["conversions"]


def conv_amount_of(row: Dict[str, Any]) -> float:
    return normalize_stat(row)["conv_amount"]


def is_unsupported_field_error(err: Any) -> bool:
    """11001 = 잘못된 파라미터. 전환 필드 미지원 entity 에서 나온다."""
    s = str(err)
    return "11001" in s or "Invalid" in s and "field" in s.lower()


def stat_fields(with_conversion: bool = True) -> List[str]:
    return list(STAT_FIELDS_WITH_CONVERSION if with_conversion else STAT_FIELDS_BASE)
