"""
네이버 대량 리포트 TSV 컬럼 스펙.

⚠️ 이 리포트들에는 **헤더 행이 없다.** 컬럼 순서가 곧 스펙이다.
아래 인덱스는 추측이 아니라 2026-08-19 라이브 실측으로 확정했다.
확정 방법과 결과를 남겨 둔다 — 나중에 의심스러우면 같은 방법으로 다시 재라.

확정 방법:
  리포트 컬럼별 합계를 같은 날짜의 /stats 계정 총계와 대조했다.
  cid 1858907 / 2026-08-18 기준 정답지는 imp=70,939 clk=133 cost=223,923.
  AD_DETAIL col11/12/13 이 각각 70,939 / 133 / 223,919 로 일치했다(반올림 오차).
  EXPKEYWORD 는 그룹 단위로 AD_DETAIL 합과 대조해 col8/9/10 을 확정했다
  (클릭·비용은 62개 그룹 전부 일치).
  MasterReport Keyword 는 /ncc/keywords 실값 38개와 1:1 대조로 확정했다.

실측에서 같이 드러난 사실:
  · AD_DETAIL 의 키워드ID 는 등록 키워드로 귀속되지 않는 트래픽에서 "-" 로 온다.
    2026-08-18 소잠 기준 **클릭의 57.9%, 노출의 51.8%** 가 "-" 였다.
    키워드 통계만 보면 이 절반이 안 보인다.
  · MasterReport Keyword 는 96,411행을 한 번에 준다. /ncc/keywords 를
    그룹마다 도는 것과 비교 불가한 차이다.
  · **MasterReport Ad 에는 검수상태(inspectStatus)가 없다.** 전 행이 같은 값이라
    소재 반려 감지에 쓸 수 없다. 검수상태는 /ncc/ads?nccAdgroupId= 로만 온다.
"""
from typing import Any, Dict, List, Optional

# ── StatReport ───────────────────────────────────────────────
# 지원 reportTp (그 밖에는 11001 로 거부된다):
STAT_REPORT_TYPES = ("AD", "AD_DETAIL", "AD_CONVERSION",
                     "EXPKEYWORD", "ADEXTENSION", "CRITERION")

# AD_DETAIL — 16열. 계정에서 가장 해상도 높은 성과 데이터.
AD_DETAIL = {
    "date": 0,          # YYYYMMDD
    "customer_id": 1,
    "campaign_id": 2,
    "adgroup_id": 3,
    "keyword_id": 4,    # "-" = 등록 키워드로 귀속 안 됨(키워드확장 등)
    "ad_id": 5,
    "business_channel_id": 6,
    # 7, 8, 9 는 매체/지역 계열 코드. 의미 미확정이라 쓰지 않는다.
    "device": 10,       # M | P
    "impressions": 11,  # 확정
    "clicks": 12,       # 확정
    "cost": 13,         # 확정
    "rank_sum": 14,     # 노출순위 합 — 평균순위 = rank_sum / impressions
    "conversions": 15,
}
AD_DETAIL_COLS = 16

# EXPKEYWORD — 12열. 실제 검색어 단위. 키워드확장 사각지대의 정체.
EXPKEYWORD = {
    "date": 0,
    "customer_id": 1,
    "campaign_id": 2,
    "adgroup_id": 3,
    "search_term": 4,   # 사용자가 실제로 친 말
    # 5 는 매체 코드
    "device": 6,        # M | P
    # 7 은 의미 미확정
    "impressions": 8,   # 확정(그룹 570/608 일치)
    "clicks": 9,        # 확정(그룹 62/62 일치)
    "cost": 10,         # 확정(그룹 62/62 일치)
    "conversions": 11,
}
EXPKEYWORD_COLS = 12

# AD — 14열. 소재 단위 성과. 어느 소재가 실제로 노출됐는지 알려준다.
AD_STAT = {
    "date": 0,
    "customer_id": 1,
    "campaign_id": 2,
    "adgroup_id": 3,
    "keyword_id": 4,
    "ad_id": 5,
    "business_channel_id": 6,
    "device": 8,
    "impressions": 9,   # 확정
    "clicks": 10,       # 확정
    "cost": 11,         # 확정
    "rank_sum": 12,
    "conversions": 13,
}
AD_STAT_COLS = 14

# ── MasterReport ─────────────────────────────────────────────
MASTER_REPORT_ITEMS = ("Campaign", "Adgroup", "Keyword", "Ad",
                       "AdExtension", "BusinessChannel", "Qi")

# Keyword — 13열. 계정 전 키워드를 한 번에.
MASTER_KEYWORD = {
    "customer_id": 0,
    "adgroup_id": 1,
    "keyword_id": 2,
    "keyword": 3,
    "bid_amt": 4,           # 확정 38/38
    # 5, 6 은 링크 계열 — 소잠에서는 전 행 공란
    "user_lock": 7,         # 확정 38/38. 1 = 사용자가 끔
    "status_code": 8,       # 20 이 대다수, 10/30 도 관측됨
    "use_group_bid": 9,     # 확정 38/38. 1 = 그룹 입찰가 상속
    "reg_time": 10,
}
MASTER_KEYWORD_COLS = 13

# Ad — 11열. ⚠️ 검수상태가 없다.
MASTER_AD = {
    "customer_id": 0,
    "adgroup_id": 1,
    "ad_id": 2,
    "ad_type": 3,
    "headline": 4,
    "description": 5,
    "display_url": 6,
    "final_url": 7,
    "user_lock": 8,
    "reg_time": 9,
}
MASTER_AD_COLS = 11

# 귀속 불가 키워드 표식.
UNATTRIBUTED = "-"


def _f(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def parse_rows(text: str, expected_cols: int) -> List[List[str]]:
    """TSV 를 행 리스트로. 열 수가 안 맞는 행은 버리되 몇 개인지 세어 둔다.

    조용히 버리면 파서가 어긋나도 눈치채지 못한다 — 호출자가 확인할 수 있게
    버려진 수를 리스트에 실어 보낸다.
    """
    rows: List[List[str]] = []
    skipped = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < expected_cols:
            skipped += 1
            continue
        rows.append(parts)
    if skipped:
        rows.append(["__SKIPPED__", str(skipped)])
    return rows


def take_skipped(rows: List[List[str]]) -> int:
    if rows and rows[-1] and rows[-1][0] == "__SKIPPED__":
        return int(rows.pop()[1])
    return 0


def row_date(row: List[str], spec: Dict[str, int]) -> Optional[str]:
    """YYYYMMDD → YYYY-MM-DD."""
    v = row[spec["date"]] if spec["date"] < len(row) else ""
    v = v.strip()
    if len(v) != 8 or not v.isdigit():
        return None
    return f"{v[:4]}-{v[4:6]}-{v[6:]}"


def metrics(row: List[str], spec: Dict[str, int]) -> Dict[str, float]:
    """성과 5종을 우리 이름으로."""
    imp = _f(row[spec["impressions"]])
    return {
        "impressions": int(imp),
        "clicks": int(_f(row[spec["clicks"]])),
        "cost": _f(row[spec["cost"]]),
        "conversions": _f(row[spec["conversions"]]) if spec.get("conversions") is not None
                       and spec["conversions"] < len(row) else 0.0,
        "rank_sum": _f(row[spec["rank_sum"]]) if spec.get("rank_sum") is not None
                    and spec["rank_sum"] < len(row) else 0.0,
    }
