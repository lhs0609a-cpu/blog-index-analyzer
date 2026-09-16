"""
성장 진단 — "왜 가입을 안 하고, 왜 결제가 안 되는가"에 숫자로 답한다.

## 하는 일

1. 실데이터로 퍼널을 만든다 (방문 → 가입 → 활성화 → 요금제 → 결제).
2. 각 구간을 **세계 SaaS 벤치마크**와 비교해 0~100 점을 매긴다.
3. 점수가 낮은 구간에 대해, 관측된 증거(실패 사유 분포, 기기별 차이)와
   우리 제품의 구조적 사실을 엮어 **어느 파일을 고칠지까지** 처방을 낸다.

## 양보하지 않은 것

**모르면 모른다고 한다.** 조사해보니 공개된 신뢰할 만한 벤치마크가 **아예 없는**
구간이 있다(요금제→결제시작, 이메일 인증 완료율). 이런 구간은 점수를 내지 않고
비율만 보여준다. 업계에 떠도는 "요금제 페이지는 3~5%" 류 숫자는 출처를 따라가면
전부 콘텐츠 마케팅으로 돌아가는 유령 통계라 여기에 넣지 않았다.

**표본이 적으면 점수를 내지 않는다.** 전환 10건 미만이거나 분모 50 미만이면
점수 자리를 비운다. 방문자 12명으로 "가입 전환율 8.3%" 를 띄우면 그건 정보가
아니라 노이즈고, 그 숫자를 보고 멀쩡한 화면을 뜯어고치게 된다.

**로그오즈로 보간한다.** 2%→4% 와 40%→57% 은 같은 크기의 성취다. 선형으로
보간하면 저전환 구간(방문→가입 같은)이 전부 0점 근처에 뭉개져 구분이 사라진다.

**구조적 지적은 점수를 깎지 않는다.** "소셜 로그인이 없다"는 관측이 아니라
의견이다. 의견이 점수를 움직이면 점수를 믿을 수 없게 되므로 처방 목록에만 올린다.

## 이 제품의 과금 모델 — 채점 기준이 갈리는 지점

가입은 카드 없이 무료다(프리미엄). 유료 전환은 '7일 무료체험'이라 부르지만
실제로는 **즉시 결제 후 미사용 시 환불** 이다. 따라서

- 방문→가입, 가입→유료는 **프리미엄(freemium) 밴드**로 채점한다.
- "무료체험(카드 선등록) 25~35%" 밴드를 쓰면 안 된다. 그 숫자는 '카드를 넣고
  체험을 시작한 사람 중 유료로 넘어간 비율'이라 우리의 **결제 성공률**에
  해당하지 가입자 대비 유료 전환율이 아니다. 잘못 맞추면 멀쩡한 퍼널이 낙제로 보인다.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from math import log, sqrt
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


# =============================================================================
# 1. 세계 SaaS 벤치마크
# =============================================================================
# 출처 없는 숫자는 넣지 않는다. source 는 관리자 화면에 그대로 노출되어
# "이 점수 기준이 뭐냐"는 질문에 화면 안에서 답이 되게 한다.
#
# floor → 0점, median → 50점, great → 90점. 100점은 great 를 크게 넘을 때만.
# grade 는 근거의 급이다: A=대규모 연구·실험, B=벤더 집계(실측이나 이해관계 있음).
# C급(콘텐츠 마케팅에서 재인용되며 숫자가 흔들리는 것)은 **채점에 쓰지 않는다**.


@dataclass
class Benchmark:
    key: str
    label: str
    floor: float
    median: float
    great: float
    source: str
    grade: str          # A | B
    note: str = ""


BENCHMARKS: Dict[str, Benchmark] = {
    "visit_to_signup": Benchmark(
        key="visit_to_signup",
        label="방문자 → 가입 (프리미엄 모델)",
        floor=0.015, median=0.090, great=0.150,
        source=(
            "Growth Unhinged × ChartMogul × ProductLed, 셀프서브 200개 제품, 2026-01 "
            "(프리미엄 방문→가입 9%) · FirstPageSage 100+개사 2018–2026 "
            "(프리미엄 오가닉 13.3% / 유료 15.9%)"
        ),
        grade="A",
        note=(
            "카드를 받지 않고 가입시키는 모델의 값이다. 카드 선등록 무료체험은 3.5% 로 "
            "훨씬 낮은데, 우리는 가입 때 카드를 받지 않으므로 이 밴드가 맞다."
        ),
    ),
    "signup_to_activation": Benchmark(
        key="signup_to_activation",
        label="가입 → 활성화 (첫 가치 경험)",
        floor=0.10, median=0.30, great=0.45,
        source=(
            "Lenny's Newsletter 활성화율 서베이 500+ 응답 2022 (SaaS 중앙값 30%) · "
            "Userpilot Product Metrics Benchmark 547개 SaaS 2024 (PLG 평균 34.6%)"
        ),
        grade="A",
        note="great 는 Lenny's 기준 80분위. 활성화 정의가 회사마다 달라 방향성으로 읽을 것.",
    ),
    "checkout_success": Benchmark(
        key="checkout_success",
        label="결제창 진입 → 결제 성공",
        floor=0.30, median=0.55, great=0.82,
        source=(
            "Baymard Institute 장바구니 이탈 메타분석 50개 연구 2006–2025 "
            "(평균 이탈 70.22% → 성공 29.8%) · Bolt ThinkShop B2B·테크 이탈 ~18% → 성공 82%"
        ),
        grade="B",
        note=(
            "우리의 '결제창 진입'은 약관 동의까지 끝난 뒤라 일반 이커머스 장바구니보다 "
            "훨씬 깊은 지점이다. 그래서 하단이 아니라 B2B 쪽에 가까워야 정상이다."
        ),
    ),
    "free_to_paid": Benchmark(
        key="free_to_paid",
        label="가입 → 유료 전환 (프리미엄 모델)",
        floor=0.005, median=0.040, great=0.100,
        source=(
            "Growth Unhinged × ChartMogul × ProductLed, 셀프서브 200개 제품, 2026-01 "
            "(프리미엄 good 3–5% / great 8–12%) · Lenny's × OpenView 1,000+ 제품 2023 (동일 밴드)"
        ),
        grade="A",
        note=(
            "전 모델 통합 중앙값은 8% 지만 분포가 쌍봉이다. 우리처럼 카드 없이 "
            "가입시키는 프리미엄은 한 자릿수 초반이 정상 범위다."
        ),
    ),
}

# 조사 결과 **공개된 신뢰할 만한 벤치마크가 존재하지 않는** 구간.
# 여기에 숫자를 지어넣지 않는 것이 이 모듈의 핵심 약속이다.
NO_BENCHMARK_REASON: Dict[str, str] = {
    "pricing_to_checkout": (
        "요금제 조회 → 결제 시작 벤치마크는 공개된 것이 없다. OpenView·ChartMogul·"
        "Paddle·Amplitude 어디에도 없고, 떠도는 '3~5%' 는 출처가 콘텐츠 마케팅으로 "
        "돌아간다. 자체 추세로만 판단한다."
    ),
    "form_funnel": (
        "가입 폼 내부 구간(도달→입력→제출)은 제품마다 폼이 달라 비교 기준이 없다. "
        "대신 자체 추세와 실패 사유 분포로 진단한다."
    ),
    "reach": (
        "방문 → 특정 페이지 도달 비율은 사이트 구조에 따라 달라 외부 비교가 무의미하다."
    ),
    "limit_funnel": (
        "무료 한도 도달 비율은 한도를 몇으로 잡았느냐가 그대로 반영되는 값이라 "
        "외부 비교 대상이 없다. 한도를 조인 날과 푼 날의 자체 추세로만 읽는다."
    ),
}


# =============================================================================
# 2. 통계
# =============================================================================

def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return log(p / (1 - p))


def wilson(k: int, n: int, z: float = 1.96) -> Tuple[float, float]:
    """
    윌슨 점수 구간(기본 95%).

    왈드 구간을 쓰지 않는 이유: 0·1 근처와 작은 n 에서 무너지는데, 퍼널 꼬리가
    정확히 그 자리다. 20명 중 2명이면 관측은 10% 지만 진짜 값이 2% 일 수도 있다.
    """
    if n <= 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = (z * sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d
    return (max(0.0, c - h), min(1.0, c + h))


def stage_score(p: float, b: Benchmark) -> float:
    """
    비율 → 0~100.

    로그오즈 공간에서 floor(0점) · median(50점) · great(90점) 을 잇는다.
    great 위로는 100 을 향해 천천히 붙되 넘지 않는다 — 벤치마크를 넘었다고
    무한정 점수가 오르면 그 뒤로 점수가 개선을 안내하지 못한다.
    """
    x, xf, xm, xg = _logit(p), _logit(b.floor), _logit(b.median), _logit(b.great)
    if x <= xf:
        return 0.0
    if x <= xm:
        return 50.0 * (x - xf) / max(xm - xf, 1e-9)
    if x <= xg:
        return 50.0 + 40.0 * (x - xm) / max(xg - xm, 1e-9)
    return min(100.0, 90.0 + 10.0 * (x - xg) / max(xg - xm, 1e-9))


def grade_of(score: Optional[float]) -> str:
    if score is None:
        return "측정불가"
    if score >= 90:
        return "최상위"
    if score >= 70:
        return "우수"
    if score >= 50:
        return "중앙값"
    if score >= 30:
        return "미흡"
    return "심각"


# 표본 게이트.
#  UNSCORED    : 전환 10건 미만 또는 분모 50 미만 → 점수 자리를 비운다
#  PROVISIONAL : 전환 100건 미만 → 윌슨 하한으로 보수적 채점 + 50점 쪽으로 수축
#  CONFIDENT   : 전환 100건 이상 → 점추정 그대로
# 100 은 CRO 관행에서 비율을 믿기 시작하는 지점이다.
MIN_CONVERSIONS = 10
MIN_DENOM = 50
CONFIDENT_CONVERSIONS = 100
SHRINK_PRIOR = 200   # 수축 강도. 분모가 이만큼이면 관측을 절반쯤 믿는다


# =============================================================================
# 3. 실데이터 수집
# =============================================================================
# 세 저장소에서 긁는다. 하나가 죽어도 나머지는 살아야 한다 —
# 문제를 보려고 만든 화면이 통째로 500 을 내면 본말전도다.

def _signups_in_window(days: int) -> int:
    """기간 내 가입 수. 이벤트가 아니라 users 테이블이 진실이다."""
    try:
        from database.user_db import get_user_db

        cutoff = (datetime.now(KST) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        with get_user_db().get_connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) c FROM users WHERE date(created_at) >= ?", (cutoff,)
            ).fetchone()
            return row["c"] or 0
    except Exception as e:
        logger.warning(f"[growth] 가입 수 집계 실패: {e}")
        return 0


def _signup_daily(days: int) -> Dict[str, int]:
    try:
        from database.user_db import get_user_db

        cutoff = (datetime.now(KST) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        with get_user_db().get_connection() as conn:
            rows = conn.execute(
                "SELECT date(created_at) d, COUNT(*) c FROM users "
                "WHERE date(created_at) >= ? GROUP BY d",
                (cutoff,),
            ).fetchall()
            return {r["d"]: r["c"] for r in rows}
    except Exception as e:
        logger.warning(f"[growth] 일별 가입 집계 실패: {e}")
        return {}


def _payments_in_window(days: int) -> Dict[str, Any]:
    """기간 내 결제. 성공뿐 아니라 실패·대기 건수도 본다."""
    out = {"completed": 0, "payers": 0, "revenue": 0, "failed": 0, "pending": 0}
    try:
        from database.subscription_db import execute_query

        cutoff = (datetime.now(KST) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
        rows = execute_query(
            "SELECT status, COUNT(*) c, COUNT(DISTINCT user_id) u, COALESCE(SUM(amount),0) amt "
            "FROM payments WHERE created_at >= ? GROUP BY status",
            (cutoff,),
        ) or []
        for r in rows:
            st = (r.get("status") or "").lower()
            n = int(r.get("c") or 0)
            if st == "completed":
                out["completed"] = n
                out["payers"] = int(r.get("u") or 0)
                out["revenue"] = int(r.get("amt") or 0)
            elif st in ("failed", "cancelled", "canceled", "aborted"):
                out["failed"] += n
            elif st in ("pending", "ready"):
                # pending 이 쌓였다는 건 '결제창까지 갔다가 안 돌아온 사람'이다.
                out["pending"] += n
    except Exception as e:
        logger.warning(f"[growth] 결제 집계 실패: {e}")
    return out


def _arpu_monthly() -> int:
    """기회 금액 환산 단가. 실패하면 0 을 돌려 금액 추정을 아예 포기한다."""
    try:
        from database.subscription_db import PLAN_LIMITS, PlanType

        return int(PLAN_LIMITS[PlanType.BASIC]["price_monthly"])
    except Exception:
        return 0


# =============================================================================
# 4. 토스 실패 코드 → 처방이 갈리는 묶음
# =============================================================================
# 이 분류가 결제 진단의 전부다. **'사용자가 그냥 닫았다'(이탈) 와 '카드가
# 거절됐다'(비자발) 는 처방이 정반대다.** 전자는 가격·설득·결제수단 문제라 화면을
# 고쳐야 하고, 후자는 재시도·다른 수단 안내로 회수하는 문제다.
# (출처: docs.tosspayments.com/reference/error-codes, /sdk/v2/error-codes)

TOSS_BUCKETS: Dict[str, Tuple[str, str, str]] = {
    # 토스 코드 → (묶음, 사람이 읽는 이름, 처방 방향)
    "PAY_PROCESS_CANCELED": ("user_abort", "사용자가 결제창을 닫음", "설득·가격·결제수단 문제"),
    "PAY_PROCESS_ABORTED": ("process_abort", "승인 실패로 결제 중단", "설득·가격·결제수단 문제"),
    "REJECT_CARD_COMPANY": ("card_reject", "카드사 거절", "재시도·다른 수단 안내"),
    "REJECT_CARD_PAYMENT": ("card_reject", "카드 결제 거절", "재시도·다른 수단 안내"),
    "INVALID_REJECT_CARD": ("card_reject", "카드사 거절", "재시도·다른 수단 안내"),
    "INVALID_PASSWORD": ("auth_fail", "결제 비밀번호 불일치", "재시도 안내"),
    "EXCEED_MAX_AUTH_COUNT": ("auth_fail", "인증 횟수 초과", "재시도 안내"),
    "INVALID_STOPPED_CARD": ("card_state", "정지된 카드", "다른 카드 안내"),
    "INVALID_CARD_LOST_OR_STOLEN": ("card_state", "분실·도난 카드", "다른 카드 안내"),
    "INVALID_CARD_EXPIRATION": ("card_state", "유효기간 오류", "다른 카드 안내"),
    "EXCEED_MAX_DAILY_PAYMENT_COUNT": ("limit", "일 결제 횟수 초과", "시간차 재시도"),
    "EXCEED_MAX_PAYMENT_AMOUNT": ("limit", "결제 한도 초과", "시간차 재시도"),
    "EXCEED_MAX_ONE_DAY_AMOUNT": ("limit", "일 한도 초과", "시간차 재시도"),
    "EXCEED_OPEN_BANKING_ONE_TIME_LIMIT": ("limit", "오픈뱅킹 1회 한도", "시간차 재시도"),
    "REJECT_ACCOUNT_PAYMENT": ("balance", "잔액 부족", "시간차 재시도"),
    "INVALID_BILL_KEY_REQUEST": ("billing", "빌링키 요청 오류", "연동 점검"),
    "NOT_MATCHES_CUSTOMER_KEY": ("billing", "customerKey 불일치", "연동 점검"),
    "INVALID_CARD_INFO_RE_REGISTER": ("billing", "카드 재등록 필요", "재등록 안내"),
    "NOT_SUPPORTED_BILLING_MERCHANT": ("billing", "자동결제 미지원 가맹점", "연동 점검"),
    "REQUIRED_BILLING_TERMS": ("billing", "자동결제 약관 미동의", "연동 점검"),
    "FAILED_CARD_COMPANY": ("infra", "카드사 점검·장애", "시간차 재시도"),
    "SUSPECTED_PHISHING_PAYMENT": ("infra", "이상거래 의심", "고객 문의 대응"),
    "UNKNOWN_PAYMENT_ERROR": ("infra", "알 수 없는 오류", "로그 확인"),
    "COMMON_ERROR": ("infra", "공통 오류", "로그 확인"),
    "DUPLICATED_ORDER_ID": ("our_bug", "주문번호 중복 — 우리 코드 문제", "즉시 수정"),
}

# 화면을 고쳐야 하는 이탈 vs 회수로 푸는 비자발 실패
ABORT_BUCKETS = {"user_abort", "process_abort", "consent"}
INVOLUNTARY_BUCKETS = {"card_reject", "auth_fail", "card_state", "limit", "balance"}
OUR_FAULT_BUCKETS = {"our_bug", "billing", "infra"}


def classify_toss(code: str) -> Tuple[str, str, str]:
    """토스 코드(또는 우리가 붙인 사유 코드)를 묶음으로 접는다."""
    c = (code or "").strip().upper()
    if c in TOSS_BUCKETS:
        return TOSS_BUCKETS[c]
    # 서버에서 "billing_key:CODE" / "first_charge:CODE" 형태로 남긴 것
    if ":" in c:
        inner = c.split(":", 1)[1]
        if inner in TOSS_BUCKETS:
            return TOSS_BUCKETS[inner]
        return ("infra", f"토스 응답 {inner}", "로그 확인")
    if c == "TERMS_NOT_AGREED":
        return ("consent", "약관 동의 없이 결제 시도", "동의 UI 재설계")
    if c == "SDK_OR_OPEN_FAILED":
        return ("our_bug", "결제창이 아예 안 뜸 — 우리 문제", "즉시 수정")
    if c in ("TOSS_UNREACHABLE", "NETWORK_ERROR", "SERVER_ERROR", "PREPARE_FAILED", "REGISTER_REJECTED"):
        return ("infra", "우리 서버·네트워크 오류", "즉시 수정")
    if c.startswith("HTTP_"):
        return ("infra", f"서버 응답 {c[5:]}", "로그 확인")
    if c in ("UNKNOWN", "(사유 미기록)"):
        return ("unknown", "사유 미기록", "수집 보강")
    return ("other", code or "기타", "로그 확인")


# =============================================================================
# 5. 퍼널 정의
# =============================================================================
# 각 구간은 (분모, 분자) 한 쌍이다. 분모를 무엇으로 잡느냐가 진단의 전부라
# question 에 "이 구간이 대답하는 질문"을 박아둔다.
#
# ⚠️ 방문자 식별자는 개인정보 보호를 위해 **날짜마다 바뀐다**. 그래서 여기 비율은
# 엄밀히는 '사람' 이 아니라 '방문자-일' 기준이다. 가입·결제는 대부분 한 세션에서
# 끝나므로 구간 비율로는 충분하지만, 며칠 고민하다 결제한 사람은 분자에 잡히고
# 분모에는 그날 방문으로만 잡힌다 — 후반 구간이 아주 약간 낙관적으로 나온다.


@dataclass
class Stage:
    key: str
    label: str
    question: str
    denom_key: str
    numer_key: str
    benchmark: Optional[str]        # BENCHMARKS 키. None 이면 점수 없이 비율만
    no_benchmark_reason: str = ""   # None 일 때 그 이유 (화면에 그대로 노출)
    group: str = "signup"           # signup | payment


FUNNEL: List[Stage] = [
    Stage(
        key="visit_to_register_view",
        label="방문 → 가입 페이지 도달",
        question="가입 화면까지 오기는 하는가? (안 오면 범인은 가입 폼이 아니라 홈·랜딩이다)",
        denom_key="visitors", numer_key="register_views",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["reach"], group="signup",
    ),
    Stage(
        key="register_view_to_form_start",
        label="가입 페이지 → 입력 시작",
        question="폼을 보고 손을 대기는 하는가? (안 대면 가입할 이유가 설득되지 않은 것)",
        denom_key="register_views", numer_key="signup_form_start",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["form_funnel"], group="signup",
    ),
    Stage(
        key="form_start_to_submit",
        label="입력 시작 → 제출",
        question="쓰다가 포기하는가? (포기하면 필드 수·비밀번호 규칙을 의심한다)",
        denom_key="signup_form_start", numer_key="signup_submit",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["form_funnel"], group="signup",
    ),
    Stage(
        key="submit_to_signup",
        label="제출 → 가입 완료",
        question="제출했는데 튕기는가? (튕기면 실패 사유 분포가 곧 답이다)",
        denom_key="signup_submit", numer_key="signups",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["form_funnel"], group="signup",
    ),
    Stage(
        key="visit_to_signup",
        label="방문 → 가입 (종합)",
        question="결국 방문자 100명 중 몇 명이 계정을 만드는가?",
        denom_key="visitors", numer_key="signups",
        benchmark="visit_to_signup", group="signup",
    ),
    Stage(
        key="signup_to_activation",
        label="가입 → 첫 분석 실행 (활성화)",
        question="가입만 하고 값을 한 번도 못 본 사람이 얼마나 되는가?",
        denom_key="signups", numer_key="activation_first_run",
        benchmark="signup_to_activation", group="signup",
    ),
    # 아래 두 구간이 "왜 결제가 없는가"의 앞쪽 절반이다.
    #
    # 2026-09-16 실측: 서버에 한도가 없어 비회원이 무제한으로 쓰고 있었고
    # (guest_usage 0행 vs /analyze 페이지뷰 1,513건), 그래서 요금제를 볼 이유
    # 자체가 생기지 않았다 — 이틀간 pricing_plan_click 0건. 한도를 서버로
    # 옮긴 뒤 이 두 칸이 채워지기 시작해야 정상이다.
    Stage(
        key="visit_to_limit",
        label="방문 → 무료 한도 도달",
        question="쓰다가 벽에 부딪히기는 하는가? (안 부딪히면 돈 낼 이유가 생기지 않는다)",
        denom_key="visitors", numer_key="limit_hit",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["limit_funnel"], group="payment",
    ),
    Stage(
        key="limit_to_pricing",
        label="한도 도달 → 요금제 도달",
        question="벽에 부딪힌 사람이 요금제를 보러 가는가? (안 가면 안내 문구·버튼 문제)",
        denom_key="limit_hit", numer_key="pricing_views",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["limit_funnel"], group="payment",
    ),
    Stage(
        key="visit_to_pricing",
        label="방문 → 요금제 페이지",
        question="돈 낼 생각을 하는 사람이 애초에 몇이나 되는가?",
        denom_key="visitors", numer_key="pricing_views",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["reach"], group="payment",
    ),
    Stage(
        key="pricing_to_checkout",
        label="요금제 → 결제 시작",
        question="요금을 보고 결제로 넘어가는가? (안 넘어가면 가격·플랜 구성 문제)",
        denom_key="pricing_views", numer_key="checkout_start",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["pricing_to_checkout"],
        group="payment",
    ),
    Stage(
        key="checkout_to_widget",
        label="결제 시작 → 결제창 진입",
        question="동의·결제준비 단계에서 새는가?",
        denom_key="checkout_start", numer_key="payment_widget_open",
        benchmark=None, no_benchmark_reason=NO_BENCHMARK_REASON["form_funnel"], group="payment",
    ),
    Stage(
        key="widget_to_payment",
        label="결제창 → 결제 성공",
        question="카드 넣는 화면까지 가서 왜 떨어지는가?",
        denom_key="payment_widget_open", numer_key="payments_completed",
        benchmark="checkout_success", group="payment",
    ),
    Stage(
        key="signup_to_paid",
        label="가입 → 유료 전환 (종합)",
        question="가입자 100명 중 몇 명이 돈을 내는가?",
        denom_key="signups", numer_key="payers",
        benchmark="free_to_paid", group="payment",
    ),
]

# 이 구간 뒤에 남은 전환율의 곱 — 기회 금액을 계산할 때 쓴다.
# (방문→가입 구간을 고치면 그 뒤 가입→유료까지 통과해야 돈이 되므로)
DOWNSTREAM_OF = {
    "visit_to_signup": ["signup_to_paid"],
    "signup_to_activation": ["signup_to_paid"],
    "widget_to_payment": [],
    "signup_to_paid": [],
}


# =============================================================================
# 6. 구간 계산
# =============================================================================

def _collect(days: int) -> Dict[str, Any]:
    """분모·분자로 쓸 원자료를 한 번에 모은다."""
    from database import site_analytics_db as adb

    ev_names = [
        "signup_form_start", "signup_submit", "signup_fail",
        "login_submit", "login_fail",
        "activation_first_run",
        "limit_hit", "limit_cta_click",
        "pricing_plan_click", "checkout_blocked_anonymous", "checkout_consent_open",
        "checkout_start", "payment_widget_open", "payment_widget_error",
        "payment_return_fail", "payment_register_fail", "payment_success",
    ]
    ev = adb.count_event_visitors(days, ev_names)
    pay = _payments_in_window(days)

    c: Dict[str, Any] = {
        "visitors": adb.count_visitors(days),
        "register_views": adb.count_visitors(days, "/register"),
        "login_views": adb.count_visitors(days, "/login"),
        "pricing_views": adb.count_visitors(days, "/pricing"),
        "payment_views": adb.count_visitors(days, "/payment"),
        "signups": _signups_in_window(days),
        "payers": pay["payers"],
        "payments_completed": pay["completed"],
        "payments_failed": pay["failed"],
        "payments_pending": pay["pending"],
        "revenue": pay["revenue"],
    }
    c.update(ev)
    return c


def _stage_row(stage: Stage, c: Dict[str, Any]) -> Dict[str, Any]:
    denom = int(c.get(stage.denom_key) or 0)
    numer = int(c.get(stage.numer_key) or 0)
    b = BENCHMARKS.get(stage.benchmark) if stage.benchmark else None

    row: Dict[str, Any] = {
        "key": stage.key,
        "label": stage.label,
        "question": stage.question,
        "group": stage.group,
        "denom": denom, "denom_key": stage.denom_key,
        "numer": numer, "numer_key": stage.numer_key,
        "rate": None, "ci": None,
        "score": None, "grade": "측정불가",
        "confidence": "unscored",
        "benchmark": None,
        "gap_to_median": None,
        "recoverable": None,      # 중앙값까지 올리면 더 건지는 사람 수
        "note": "",
    }

    if denom <= 0:
        row["note"] = "이 구간을 통과한 사람이 아직 없거나 수집이 시작되지 않았다."
        return row

    if numer > denom:
        # 분자가 분모보다 크면 측정 축이 어긋난 것이다. 숨기지 말고 그대로 쓴다.
        row["confidence"] = "inconsistent"
        row["note"] = (
            "분자가 분모보다 크다 — 이벤트 수집 시작 이전 데이터가 섞였거나 "
            "서버에서만 기록된 건이 있다. 이 구간 비율은 아직 믿지 말 것."
        )
        return row

    rate = numer / denom
    lo, hi = wilson(numer, denom)
    row["rate"] = rate
    row["ci"] = [lo, hi]

    if b:
        row["benchmark"] = {
            "label": b.label, "floor": b.floor, "median": b.median, "great": b.great,
            "source": b.source, "grade": b.grade, "note": b.note,
        }
        row["gap_to_median"] = rate - b.median
        row["recoverable"] = max(0, int(round(denom * b.median)) - numer)
    else:
        row["note"] = stage.no_benchmark_reason

    # --- 표본 게이트 ---
    if numer < MIN_CONVERSIONS or denom < MIN_DENOM:
        row["confidence"] = "unscored"
        row["note"] = (
            f"전환 {numer}건 / 분모 {denom}명 — 점수를 내기엔 표본이 작다 "
            f"(기준: 전환 {MIN_CONVERSIONS}건 이상, 분모 {MIN_DENOM}명 이상). "
            f"{row['note']}"
        ).strip()
        return row

    if not b:
        row["confidence"] = "no_benchmark"
        return row

    if numer < CONFIDENT_CONVERSIONS:
        # 잠정: 낙관을 걷어낸 하한으로 채점하고, 50점 쪽으로 수축시켜 요동을 줄인다
        raw = stage_score(lo, b)
        w = denom / (denom + SHRINK_PRIOR)
        row["score"] = round(w * raw + (1 - w) * 50.0, 1)
        row["confidence"] = "provisional"
        row["note"] = (
            f"전환 {numer}건 — 잠정 점수다. 윌슨 하한({lo * 100:.1f}%)으로 채점하고 "
            f"중앙값 쪽으로 {(1 - w) * 100:.0f}% 수축시켰다."
        )
    else:
        row["score"] = round(stage_score(rate, b), 1)
        row["confidence"] = "confident"

    row["grade"] = grade_of(row["score"])

    # 신뢰구간이 중앙값을 품고 있으면 우열을 단정할 수 없다 — 그렇게 쓴다.
    if lo <= b.median <= hi:
        row["note"] = (
            (row["note"] + " ") if row["note"] else ""
        ) + "신뢰구간이 세계 중앙값을 걸치고 있어 우열을 단정할 수 없다."
    return row


def _rollup(rows: List[Dict[str, Any]], arpu: int) -> Dict[str, Any]:
    """
    총점과 '병목'.

    구간 점수를 그냥 평균 내면 틀린다. 10,000명이 지나가는 구간의 20점 차이가
    40명 지나가는 구간의 50점 차이보다 훨씬 큰 돈이기 때문이다. 그래서
    **기회 금액**(중앙값까지 회복했을 때 늘어나는 월 매출)으로 가중한다.

    그리고 총점과 별개로 **병목 하나**를 따로 뽑는다. 실무에서 쓸모 있는 건
    평균이 아니라 "어디부터 손대야 하는가" 라서.
    """
    by_key = {r["key"]: r for r in rows}

    def downstream(key: str) -> float:
        conv = 1.0
        for k in DOWNSTREAM_OF.get(key, []):
            r = by_key.get(k)
            if r and r.get("rate") is not None:
                conv *= r["rate"]
        return conv

    scored = [r for r in rows if r["score"] is not None]
    for r in scored:
        gap = max(0.0, -(r["gap_to_median"] or 0.0))
        r["opportunity_users"] = int(round(r["denom"] * gap * downstream(r["key"])))
        r["opportunity_krw"] = int(r["opportunity_users"] * arpu) if arpu else 0

    total_opp = sum(max(r["opportunity_krw"], 0) for r in scored)
    # 가중치 = 기본 1 + 기회 금액 비중 × 3.
    #
    # 순수 기회가중으로 하면 중앙값 아래인 구간이 하나일 때 총점이 그 구간 점수로
    # 붕괴한다(다른 구간 가중치가 전부 0 이 되므로). 그러면 총점이 '건강도'가 아니라
    # '최악 구간'의 다른 이름이 되고, 병목은 이미 따로 뽑고 있으니 중복이다.
    # 기본 1 을 깔아 모든 구간이 총점에 남되, 돈이 새는 구간이 최대 4배까지 더 무겁게.
    for r in scored:
        share = (r["opportunity_krw"] / total_opp) if total_opp > 0 else 0.0
        r["weight"] = round(1.0 + 3.0 * share, 2)

    if scored:
        wsum = sum(r["weight"] for r in scored)
        overall = sum(r["score"] * r["weight"] for r in scored) / wsum
    else:
        overall = None

    def group_score(g: str) -> Optional[float]:
        picked = [r for r in scored if r["group"] == g]
        if not picked:
            return None
        return round(sum(r["score"] for r in picked) / len(picked), 1)

    # 병목: 표본이 충분한 구간 중 최저점
    solid = [r for r in scored if r["confidence"] == "confident"] or scored
    bottleneck = min(solid, key=lambda r: r["score"]) if solid else None

    return {
        "score": round(overall, 1) if overall is not None else None,
        "grade": grade_of(round(overall, 1) if overall is not None else None),
        "signup_score": group_score("signup"),
        "payment_score": group_score("payment"),
        "scored_stages": len(scored),
        "total_stages": len(rows),
        "opportunity_krw_monthly": total_opp,
        "bottleneck": (
            {
                "key": bottleneck["key"],
                "label": bottleneck["label"],
                "score": bottleneck["score"],
                "rate": bottleneck["rate"],
                "opportunity_krw": bottleneck.get("opportunity_krw", 0),
            }
            if bottleneck else None
        ),
        "method": (
            "점수가 나온 구간의 가중평균. 가중치는 기본 1 에 기회 금액"
            "(중앙값 회복 시 늘어날 월 매출) 비중을 최대 3 만큼 더한 값이라, "
            "돈이 새는 구간이 최대 4배까지 무겁다. 표본이 부족한 구간은 총점에 넣지 않는다."
        ),
    }


# =============================================================================
# 7. 제품 구조 사실 (코드에서 직접 확인한 것)
# =============================================================================
# ⚠️ 이 값들은 실제 코드 상태다. 코드를 바꿨으면 여기도 바꿔야 한다.
#    file 을 같이 적어둔 이유: "어디를 고치라는 건지" 를 말해주지 못하는 진단은
#    쓸모가 없고, 값이 낡았는지 확인하려면 그 파일을 열어보면 되기 때문이다.
PRODUCT_FACTS: Dict[str, Dict[str, Any]] = {
    "signup_fields": {
        "value": "4개 (이름·이메일·비밀번호·비밀번호 확인)",
        "file": "frontend/app/register/page.tsx",
        "verdict": "양호",
        "why": "Baymard 기준 체크아웃 폼 평균이 11.3개, 최적이 8개 안팎이다. 가입 폼 4개는 이미 짧다.",
    },
    "social_login": {
        "value": "없음 (이메일·비밀번호 단일)",
        "file": "frontend/app/register/page.tsx",
        "verdict": "개선 여지",
        "why": "국내 실측 사례(라프텔, 2025-06)에서 카카오·네이버 로그인 도입 후 가입 전환 +16.9pt, 신규가입의 95.5%가 소셜을 선택했다. 단 같은 사례에서 유료 전환율은 유의미하게 바뀌지 않았다.",
    },
    "email_verification_wall": {
        "value": "없음 (가입 즉시 토큰 발급)",
        "file": "flyio-backend/routers/auth.py",
        "verdict": "양호",
        "why": "인증 메일 벽은 가입 완료율을 깎는 대표적 원인이고, 우리는 그 벽이 없다. 유지할 것.",
    },
    "password_rules": {
        "value": "화면 8자+영문+숫자 / 서버 6자",
        "file": "frontend/app/register/page.tsx · flyio-backend/routers/auth.py",
        "verdict": "개선 여지",
        "why": "화면이 서버보다 엄격해, 서버가 받아줄 비밀번호를 화면이 되돌려보낸다. NIST SP 800-63B Rev.4(2025-07 확정)는 조합 규칙(영문+숫자 강제)을 **쓰지 말라**고 명시한다 — 길이와 유출목록 대조로 대체하는 게 표준이다.",
    },
    "payment_methods": {
        "value": "카드 단일 — requestBillingAuth('카드')",
        "file": "frontend/app/payment/page.tsx",
        "verdict": "문제",
        "why": "한국은행 집계상 간편지급 일평균 1조 1,052억원(2025, +14.6%)이고 그중 네이버페이·카카오페이 등 전자금융업자 비중이 54.9%다. Baymard 이탈 사유에서 '결제수단이 부족해서'가 9%. 카드만 받는 건 시장의 절반을 등지는 설정이다.",
    },
    "one_time_purchase": {
        "value": "없음 (빌링키 정기결제만)",
        "file": "frontend/app/payment/page.tsx",
        "verdict": "개선 여지",
        "why": "한 달만 써보고 판단할 선택지가 없다. 자동갱신 거부감이 그대로 이탈로 간다.",
    },
    "trial_naming": {
        "value": "'7일 무료 체험'이라 부르지만 즉시 결제 후 환불 보장",
        "file": "frontend/app/pricing/_PricingClient.tsx",
        "verdict": "문제",
        "why": "'무료'라 읽고 들어와 결제창을 만나면 기대가 깨진다. 동의 모달에서 결제 금액을 다시 고지하고는 있으나, 버튼 문구와 실제 동작이 다르면 그 자리가 이탈 지점이 된다.",
    },
    "pricing_requires_login": {
        "value": "비로그인으로 요금제 버튼을 누르면 로그인으로 튕김",
        "file": "frontend/app/pricing/_PricingClient.tsx",
        "verdict": "문제",
        "why": "Baymard 이탈 사유에서 '계정을 만들라고 해서'가 18%. 요금을 보고 마음먹은 바로 그 순간에 벽을 세우는 자리다.",
    },
    "vat_disclosure": {
        "value": "요금제 화면에 부가세 표기 없음",
        "file": "frontend/app/pricing/_PricingClient.tsx",
        "verdict": "문제",
        "why": "Baymard 이탈 사유 1위가 '결제 단계에서 예상 못 한 추가 비용'(40%)이다. 게다가 B2C 대상이면 「가격표시제 실시요령」(산업부고시 2025-51호)상 부가세 포함 총액 표시가 원칙이다.",
    },
    "withdrawal_consent": {
        "value": "이용약관+환불정책을 체크박스 하나로 묶어 동의",
        "file": "frontend/app/payment/page.tsx · frontend/app/pricing/_PricingClient.tsx",
        "verdict": "법적 점검 필요",
        "why": "전자상거래법 제17조 제3항은 '콘텐츠 제공이 개시되면 청약철회가 제한된다'는 사실을 소비자가 쉽게 알 수 있는 곳에 표시하고 **별도 동의**를 받지 않으면 그 제한 자체를 무효로 본다. 묶음 동의는 그 요건을 충족하지 못할 수 있다.",
    },
    "free_plan_limits": {
        "value": "키워드 3회/일, 블로그 분석 1회/일, 결과 5개",
        "file": "flyio-backend/database/subscription_db.py",
        "verdict": "의도된 설계",
        "why": "가치를 보여주기 전에 막으면 활성화가 죽고, 너무 넉넉하면 결제할 이유가 사라진다. 활성화 점수와 유료전환 점수를 같이 보고 판단할 값이다.",
    },
}



# =============================================================================
# 8. 처방 엔진
# =============================================================================
# 규칙 하나 = 조건 + 우리 증거 + 세계 근거(출처 포함) + 고칠 파일.
#
# 지키는 것:
#  - 데이터 없이 단정하지 않는다. 관측이 없으면 confidence 를 '가설'로 낮춘다.
#  - 처방은 파일 경로까지 준다. "UX 를 개선하세요" 는 처방이 아니다.
#  - 효과는 벤치마크 중앙값까지 회복했을 때의 산술값으로만 말한다. 지어내지 않는다.


@dataclass
class Finding:
    id: str
    severity: str        # critical | high | medium | low | good
    group: str           # signup | payment | data | legal
    title: str
    evidence: str        # 우리 데이터가 말하는 것
    world: str           # 세계 근거 (출처 포함)
    fix: str             # 무엇을 어디서
    files: List[str] = field(default_factory=list)
    impact: str = ""
    confidence: str = "관측"   # 관측 | 가설


SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "good": 4}


def _pct(x: Optional[float]) -> str:
    return "—" if x is None else f"{x * 100:.1f}%"


def _won(n: int) -> str:
    return f"{n:,}원"


def bucketize(reasons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """실패 사유 원본을 처방이 갈리는 묶음으로 접는다."""
    agg: Dict[str, Dict[str, Any]] = {}
    for r in reasons:
        bucket, label, fix = classify_toss(r.get("reason") or "")
        e = agg.setdefault(
            bucket, {"bucket": bucket, "label": label, "fix": fix, "n": 0, "codes": []}
        )
        e["n"] += int(r.get("n") or 0)
        e["codes"].append({"code": r.get("reason"), "n": r.get("n"), "label": label})
    out = sorted(agg.values(), key=lambda x: -x["n"])
    total = sum(x["n"] for x in out) or 1
    for x in out:
        x["share"] = x["n"] / total
    return out


def build_findings(
    rows: List[Dict[str, Any]],
    c: Dict[str, Any],
    signup_reasons: List[Dict[str, Any]],
    pay_buckets: List[Dict[str, Any]],
    device: Dict[str, Any],
    arpu: int,
    days: int,
) -> List[Finding]:
    by = {r["key"]: r for r in rows}
    f: List[Finding] = []
    per_month = 30.0 / max(days, 1)

    def scored(key: str) -> Optional[Dict[str, Any]]:
        r = by.get(key)
        return r if r and r.get("score") is not None else None

    # ---------- 0. 수집 상태부터 ----------
    # 데이터가 없는데 처방을 늘어놓는 게 가장 나쁜 실패다. 그걸 맨 위에 둔다.
    tracked = sum(
        int(c.get(k) or 0)
        for k in ("signup_form_start", "signup_submit", "checkout_start", "payment_widget_open")
    )
    if tracked == 0:
        f.append(Finding(
            id="no_events",
            severity="critical", group="data",
            title="퍼널 이벤트가 하나도 안 쌓였다 — 아직 아무것도 진단할 수 없다",
            evidence=(
                f"최근 {days}일 방문자 {c.get('visitors', 0):,}명, 가입 {c.get('signups', 0):,}명은 "
                "잡히는데 폼 입력·결제 시작 이벤트는 0건이다."
            ),
            world=(
                "PostHog·Amplitude·Mixpanel 모두 같은 말을 한다: 가입 흐름의 각 단계를 별도 "
                "이벤트로 남기지 않으면 퍼널을 그릴 수 없다. 페이지뷰만으로는 "
                "'가입 페이지까지 왔는데 왜 안 했는지'를 영원히 알 수 없다."
            ),
            fix=(
                "이번 변경으로 이벤트 수집을 붙였다. 프런트를 배포하고 실제 사용자가 "
                "가입·결제 화면을 지나가야 숫자가 쌓이기 시작한다. 그전까지 이 화면의 "
                "빈 칸은 '문제 없음'이 아니라 '아직 모름'이다."
            ),
            files=["frontend/lib/analytics/track.ts", "flyio-backend/routers/site_analytics.py"],
            confidence="관측",
        ))

    # ---------- 1. 방문 → 가입 ----------
    r = scored("visit_to_signup")
    if r and r["score"] < 50:
        gain = int(r["recoverable"] * per_month)
        paid_rate = (by.get("signup_to_paid") or {}).get("rate") or 0
        f.append(Finding(
            id="visit_to_signup_low",
            severity="critical" if r["score"] < 30 else "high",
            group="signup",
            title=f"방문자 대비 가입률이 세계 중앙값 아래다 ({_pct(r['rate'])} vs 9.0%)",
            evidence=(
                f"최근 {days}일 방문자 {r['denom']:,}명 중 가입 {r['numer']:,}명. "
                f"95% 신뢰구간 {_pct(r['ci'][0])}~{_pct(r['ci'][1])}. "
                f"중앙값까지만 올려도 이 기간에 {r['recoverable']:,}명을 더 받는다."
            ),
            world=BENCHMARKS["visit_to_signup"].source,
            fix=(
                "가입 폼은 이미 4칸으로 짧아 여기서 더 깎을 여지가 없다. 레버가 남은 곳은 "
                "(1) 카카오·네이버 로그인 추가, (2) 가입 전에 가치를 한 번 보여주기"
                "(게스트 분석 1회 후 '기록하려면 가입'), (3) 랜딩 문구를 쉬운 말로."
            ),
            files=["frontend/app/register/page.tsx", "frontend/app/landing/page.tsx"],
            impact=(
                f"월 환산 약 +{gain:,}명 가입"
                + (
                    f", 유료전환 {_pct(paid_rate)} 적용 시 월 +{_won(int(gain * paid_rate * arpu))}"
                    if paid_rate and arpu else ""
                )
            ),
            confidence="관측",
        ))
    elif r:
        f.append(Finding(
            id="visit_to_signup_ok", severity="good", group="signup",
            title=f"방문자 대비 가입률은 세계 중앙값 이상이다 ({_pct(r['rate'])})",
            evidence=f"방문 {r['denom']:,}명 → 가입 {r['numer']:,}명, 점수 {r['score']}점.",
            world=BENCHMARKS["visit_to_signup"].source,
            fix="여기는 건드리지 말고 다른 구간에 힘을 쓴다.",
            confidence="관측",
        ))

    # ---------- 2. 가입 폼 내부에서 새는 자리 ----------
    rv = by.get("register_view_to_form_start")
    if rv and rv.get("rate") is not None and rv["denom"] >= MIN_DENOM and rv["rate"] < 0.4:
        f.append(Finding(
            id="form_untouched",
            severity="high", group="signup",
            title=f"가입 페이지에 와서 입력칸에 손도 안 대고 나간다 (입력 시작 {_pct(rv['rate'])})",
            evidence=f"가입 페이지 도달 {rv['denom']:,}명 중 입력 시작 {rv['numer']:,}명.",
            world=(
                "폼이 아니라 '왜 가입해야 하는지'가 설득되지 않았을 때 나타나는 모양이다. "
                "Unbounce 41,000페이지·4.64억 방문 분석: 쉬운 말로 쓴 페이지가 11.1%, "
                "전문용어 페이지가 5.3% 전환. 3음절 이상 단어 비중은 전환과 -24.3% 상관."
            ),
            fix=(
                "가입 화면 상단에서 '지금 가입하면 뭐가 남는지'를 한 줄로 보여주고, "
                "가능하면 가입 전에 결과를 한 번 맛보게 한다."
            ),
            files=["frontend/app/register/page.tsx"],
            confidence="관측",
        ))

    fs = by.get("form_start_to_submit")
    if fs and fs.get("rate") is not None and fs["denom"] >= MIN_DENOM and fs["rate"] < 0.6:
        f.append(Finding(
            id="form_abandoned",
            severity="high", group="signup",
            title=f"쓰기 시작했는데 제출까지 못 간다 ({_pct(fs['rate'])})",
            evidence=f"입력 시작 {fs['denom']:,}명 중 제출 {fs['numer']:,}명.",
            world=(
                "Baymard 4,400+ 세션: '폼이 길고 복잡해서'가 이탈 사유의 17%. "
                "NIST SP 800-63B Rev.4(2025-07 확정)는 영문+숫자 같은 조합 규칙을 "
                "쓰지 말라고 명시한다."
            ),
            fix=(
                "비밀번호 확인 칸을 없애고(보기 토글로 대체) 화면 규칙을 서버와 맞춘다. "
                "지금은 화면이 8자+영문+숫자를 요구하는데 서버는 6자면 받는다 — "
                "서버가 받아줄 비밀번호를 화면이 되돌려보내고 있다."
            ),
            files=["frontend/app/register/page.tsx", "flyio-backend/routers/auth.py"],
            confidence="관측",
        ))

    # ---------- 3. 가입 실패 사유 ----------
    if signup_reasons:
        top = signup_reasons[0]
        total = sum(int(x["n"] or 0) for x in signup_reasons) or 1
        share = int(top["n"] or 0) / total
        code = (top.get("reason") or "").lower()
        if code == "email_taken" and share >= 0.3:
            f.append(Finding(
                id="signup_email_taken",
                severity="high", group="signup",
                title=f"가입 실패의 {share * 100:.0f}%가 '이미 가입된 이메일'이다",
                evidence=(
                    f"{days}일간 가입 실패 {total:,}건 중 {top['n']:,}건. "
                    f"같은 기간 로그인 실패 {c.get('login_fail', 0):,}명."
                ),
                world=(
                    "이건 '가입을 안 하는' 문제가 아니라 '이미 가입했는데 못 들어오는' "
                    "문제다. 둘은 처방이 정반대라 섞으면 엉뚱한 곳을 고치게 된다."
                ),
                fix=(
                    "이미 가입된 이메일이면 에러 토스트 대신 로그인 화면으로 이메일을 채워 "
                    "넘기고 비밀번호 재설정 링크를 같이 보여준다."
                ),
                files=["frontend/app/register/page.tsx", "flyio-backend/routers/auth.py"],
                confidence="관측",
            ))
        elif code in ("password_rules", "password_mismatch") and share >= 0.25:
            f.append(Finding(
                id="signup_password_friction",
                severity="high", group="signup",
                title=f"가입 실패의 {share * 100:.0f}%가 비밀번호 규칙에서 막힌다",
                evidence=f"{days}일간 가입 실패 {total:,}건 중 {top['n']:,}건 ({code}).",
                world=(
                    "NIST SP 800-63B Rev.4(2025-07 확정)는 조합 규칙 강제를 하지 말라고 "
                    "명시한다 — 길이와 유출목록 대조로 대체하는 것이 현재 표준이다."
                ),
                fix="화면 규칙을 서버(6자)와 맞추고 비밀번호 확인 칸을 제거한다.",
                files=["frontend/app/register/page.tsx"],
                confidence="관측",
            ))

    # ---------- 4. 활성화 ----------
    r = scored("signup_to_activation")
    if r and r["score"] < 50:
        f.append(Finding(
            id="activation_low",
            severity="critical" if r["score"] < 30 else "high",
            group="signup",
            title=f"가입만 하고 한 번도 안 써본 사람이 대부분이다 (활성화 {_pct(r['rate'])})",
            evidence=(
                f"{days}일간 가입 {r['denom']:,}명 중 첫 분석 실행 {r['numer']:,}명. "
                f"중앙값(30%)까지면 {r['recoverable']:,}명 더."
            ),
            world=(
                BENCHMARKS["signup_to_activation"].source
                + " · Amplitude 2,600+개사 2025: D7 상위권 제품의 69%가 3개월 잔존도 "
                "상위권이다. 반면 '획득'과 잔존 사이에는 의미 있는 상관이 없다 — "
                "유입을 늘려도 첫 경험이 비면 아무것도 남지 않는다."
            ),
            fix=(
                "가입 직후 화면을 '빈 대시보드'가 아니라 '분석할 블로그 주소 한 칸'으로 "
                "바꾸고, 가입 전에 입력했던 값이 있으면 그대로 이어받아 자동 실행한다."
            ),
            files=["frontend/app/dashboard/page.tsx", "frontend/components/WelcomeOnboarding.tsx"],
            impact="활성화는 유료전환의 앞단이라, 여기가 막히면 아래 결제 지표는 고쳐도 안 움직인다.",
            confidence="관측",
        ))

    # ---------- 5. 비로그인 결제 차단 ----------
    blocked = int(c.get("checkout_blocked_anonymous") or 0)
    clicks = int(c.get("pricing_plan_click") or 0)
    if blocked > 0 and clicks > 0:
        share = blocked / clicks
        f.append(Finding(
            id="pricing_login_wall",
            severity="high" if share >= 0.3 else "medium",
            group="payment",
            title=f"요금제 버튼을 누른 사람의 {share * 100:.0f}%가 로그인 벽에 튕긴다",
            evidence=f"{days}일간 플랜 클릭 {clicks:,}명 중 비로그인 차단 {blocked:,}명.",
            world=(
                "Baymard 이탈 사유 조사: '사이트가 계정 생성을 요구해서'가 18%. "
                "요금을 보고 마음먹은 바로 그 순간에 벽을 세우는 자리다."
            ),
            fix=(
                "로그인으로 보내되 **돌아올 자리를 기억**한다 — /login?next=/pricing&plan=pro "
                "로 넘기고 로그인 후 동의 모달을 바로 열어준다. 지금은 로그인 후 대시보드로 "
                "보내버려 결제 의사가 그 자리에서 증발한다."
            ),
            files=["frontend/app/pricing/_PricingClient.tsx", "frontend/app/login/page.tsx"],
            confidence="관측",
        ))

    # ---------- 6. 결제창 → 성공 ----------
    r = scored("widget_to_payment")
    if r and r["score"] < 50:
        f.append(Finding(
            id="checkout_low",
            severity="critical" if r["score"] < 30 else "high",
            group="payment",
            title=f"카드 넣는 화면까지 가서 떨어진다 (성공률 {_pct(r['rate'])})",
            evidence=(
                f"{days}일간 결제창 진입 {r['denom']:,}명 중 성공 {r['numer']:,}명. "
                f"중앙값(55%)까지면 {r['recoverable']:,}명 더."
            ),
            world=BENCHMARKS["checkout_success"].source,
            fix="아래 '실패 사유 묶음'을 먼저 보라 — 이탈인지 카드 거절인지에 따라 처방이 정반대다.",
            files=["frontend/app/payment/page.tsx"],
            impact=(f"회복 시 월 약 {_won(int(r['recoverable'] * per_month * arpu))}" if arpu else ""),
            confidence="관측",
        ))

    # ---------- 7. 실패 사유 묶음별 처방 ----------
    if pay_buckets:
        total = sum(b["n"] for b in pay_buckets) or 1
        abort = sum(b["n"] for b in pay_buckets if b["bucket"] in ABORT_BUCKETS)
        invol = sum(b["n"] for b in pay_buckets if b["bucket"] in INVOLUNTARY_BUCKETS)
        ours = sum(b["n"] for b in pay_buckets if b["bucket"] in OUR_FAULT_BUCKETS)
        unknown = sum(b["n"] for b in pay_buckets if b["bucket"] == "unknown")

        if ours > 0:
            f.append(Finding(
                id="payment_our_fault",
                severity="critical", group="payment",
                title=f"결제 실패 {ours:,}건이 우리 쪽 문제다 (전체의 {ours / total * 100:.0f}%)",
                evidence="묶음: " + ", ".join(
                    f"{b['label']} {b['n']}건"
                    for b in pay_buckets if b["bucket"] in OUR_FAULT_BUCKETS
                ),
                world=(
                    "토스 에러코드 분류상 빌링키·연동·서버 오류는 사용자가 어떻게 해도 "
                    "통과할 수 없는 실패다. 이건 전환율 개선이 아니라 버그 수정이다."
                ),
                fix="fly logs 에서 해당 코드로 검색해 원인을 잡는다. 이 건수는 그대로 잃은 매출이다.",
                files=["flyio-backend/routers/payment.py"],
                impact=(f"약 {_won(int(ours * arpu))} 상당" if arpu else ""),
                confidence="관측",
            ))
        if abort >= invol and abort > 0:
            f.append(Finding(
                id="payment_abort_dominant",
                severity="high", group="payment",
                title=f"결제 실패의 {abort / total * 100:.0f}%가 '사용자가 그냥 닫았다'이다",
                evidence=f"이탈 {abort:,}건 vs 카드·한도 등 비자발 실패 {invol:,}건.",
                world=(
                    "토스 PAY_PROCESS_CANCELED 계열은 카드 문제가 아니라 마음이 바뀐 것이다. "
                    "Baymard 이탈 사유: '예상 못 한 추가 비용' 40%, '카드정보를 맡기기 "
                    "불안해서' 19%, '결제수단이 부족해서' 9%. 한국은행 집계상 간편지급이 "
                    "일평균 1조 1,052억원(2025)이고 그중 전자금융업자(네이버·카카오페이 등) "
                    "비중이 54.9%다."
                ),
                fix=(
                    "① 결제창에 카카오페이·네이버페이를 추가한다(지금은 카드 단일). "
                    "② 요금제 화면에 부가세 포함 총액을 명시한다. "
                    "③ 결제 직전 화면에서 '7일 내 전액 환불'을 다시 한 번 크게 보여준다."
                ),
                files=["frontend/app/payment/page.tsx", "frontend/app/pricing/_PricingClient.tsx"],
                confidence="관측",
            ))
        elif invol > 0:
            f.append(Finding(
                id="payment_involuntary_dominant",
                severity="high", group="payment",
                title=f"결제 실패의 {invol / total * 100:.0f}%가 카드사 거절·한도 등 비자발 실패다",
                evidence=", ".join(
                    f"{b['label']} {b['n']}건"
                    for b in pay_buckets if b["bucket"] in INVOLUNTARY_BUCKETS
                ),
                world=(
                    "Recurly 집계: 실패 결제의 기본 회수율이 약 53%, 재시도 전략을 손보면 "
                    "약 71%까지 오르고 회수의 90%가 실패 후 10일 안에 일어난다. "
                    "Checkout.com: 거절을 겪은 고객의 35%가 그 가맹점을 떠난다."
                ),
                fix=(
                    "실패 즉시 '다른 카드로 시도' 버튼과 다른 결제수단을 같은 화면에 띄우고, "
                    "빌링 갱신 실패는 10일에 걸친 재시도 스케줄로 돌린다."
                ),
                files=["frontend/app/payment/page.tsx", "flyio-backend/routers/payment.py"],
                confidence="관측",
            ))
        if unknown > total * 0.3:
            f.append(Finding(
                id="payment_reason_missing",
                severity="medium", group="data",
                title=f"결제 실패 {unknown:,}건의 사유가 기록되지 않았다",
                evidence=f"전체 실패 {total:,}건 중 {unknown / total * 100:.0f}%가 사유 미기록.",
                world="사유 없는 실패는 진단할 수 없다. 토스는 failUrl 과 API 응답 양쪽에 code 를 준다.",
                fix="사유 미기록 경로를 추적해 code 를 남긴다.",
                files=["flyio-backend/routers/payment.py", "frontend/app/payment/page.tsx"],
                confidence="관측",
            ))

    # ---------- 8. 가입 → 유료 ----------
    r = scored("signup_to_paid")
    if r and r["score"] < 50:
        f.append(Finding(
            id="free_to_paid_low",
            severity="high", group="payment",
            title=f"가입자 대비 유료 전환이 낮다 ({_pct(r['rate'])} vs 중앙값 4.0%)",
            evidence=(
                f"{days}일간 가입 {r['denom']:,}명 중 결제 {r['numer']:,}명. "
                f"중앙값까지면 {r['recoverable']:,}명 더."
            ),
            world=BENCHMARKS["free_to_paid"].source,
            fix=(
                "무료 제한에 걸린 순간(키워드 3회/일, 분석 1회/일 소진)이 유일한 결제 설득 "
                "지점이다. 그 자리에서 요금제로 보내는 동선이 있는지 확인하고, 없으면 만든다."
            ),
            files=[
                "flyio-backend/database/subscription_db.py",
                "frontend/app/pricing/_PricingClient.tsx",
            ],
            impact=(f"회복 시 월 약 {_won(int(r['recoverable'] * per_month * arpu))}" if arpu else ""),
            confidence="관측",
        ))

    # ---------- 9. 모바일 ----------
    mob = device.get("mobile_share_visitors")
    m_pay = device.get("payment_success", {}).get("mobile", 0)
    d_pay = device.get("payment_success", {}).get("desktop", 0)
    m_open = device.get("payment_widget_open", {}).get("mobile", 0)
    d_open = device.get("payment_widget_open", {}).get("desktop", 0)
    if m_open >= 20 and d_open >= 20:
        m_rate = m_pay / m_open
        d_rate = d_pay / d_open
        if d_rate - m_rate > 0.1:
            f.append(Finding(
                id="mobile_checkout_gap",
                severity="high", group="payment",
                title=f"모바일 결제 성공률이 데스크톱보다 {(d_rate - m_rate) * 100:.0f}pt 낮다",
                evidence=(
                    f"모바일 {m_pay}/{m_open} = {_pct(m_rate)}, "
                    f"데스크톱 {d_pay}/{d_open} = {_pct(d_rate)}."
                ),
                world=(
                    "통계청 2025-08: 온라인쇼핑 거래액의 79.4%가 모바일이다. "
                    "Unbounce: 모바일이 트래픽의 83%인데 전환은 데스크톱보다 약 8% 낮다. "
                    "모바일 결제가 깨져 있으면 합산 지표는 그 사실을 숨긴다."
                ),
                fix="모바일 기기로 결제창 호출부터 복귀까지 직접 한 번 통과해보고 그 경로를 고친다.",
                files=["frontend/app/payment/page.tsx"],
                confidence="관측",
            ))
    elif mob is not None and mob > 0.5:
        f.append(Finding(
            id="mobile_majority",
            severity="low", group="data",
            title=f"방문의 {mob * 100:.0f}%가 모바일인데 결제 표본이 아직 기기별로 갈리지 않는다",
            evidence=f"모바일 결제창 진입 {m_open}명, 데스크톱 {d_open}명.",
            world="통계청 2025-08: 온라인쇼핑 거래액의 79.4%가 모바일.",
            fix="표본이 쌓이면 이 자리에서 기기별 결제 성공률 격차를 자동으로 잡아낸다.",
            confidence="가설",
        ))

    # ---------- 10. 구조적 처방 (데이터와 무관하게 항상 검토 대상) ----------
    f.append(Finding(
        id="payment_methods_card_only",
        severity="high", group="payment",
        title="결제수단이 카드 하나뿐이다 — 간편결제가 없다",
        evidence=PRODUCT_FACTS["payment_methods"]["value"],
        world=PRODUCT_FACTS["payment_methods"]["why"],
        fix=(
            "requestBillingAuth 를 결제위젯/다중 수단으로 바꾸고 카카오페이·네이버페이를 "
            "추가한다. 정기결제는 수단별 지원 범위가 다르니 계약부터 확인할 것."
        ),
        files=["frontend/app/payment/page.tsx"],
        confidence="가설",
    ))
    f.append(Finding(
        id="social_login_missing",
        severity="medium", group="signup",
        title="카카오·네이버 로그인이 없다",
        evidence=PRODUCT_FACTS["social_login"]["value"],
        world=PRODUCT_FACTS["social_login"]["why"],
        fix="카카오 로그인 하나만 먼저 붙여 확인한다. 유료 전환까지 오를 거란 기대는 하지 말 것.",
        files=["frontend/app/register/page.tsx", "flyio-backend/routers/auth.py"],
        confidence="가설",
    ))
    f.append(Finding(
        id="vat_not_shown",
        severity="medium", group="legal",
        title="요금제 화면에 부가세 표기가 없다",
        evidence=PRODUCT_FACTS["vat_disclosure"]["value"],
        world=PRODUCT_FACTS["vat_disclosure"]["why"],
        fix="플랜 가격 옆에 '부가세 포함' 또는 '부가세 별도(+10%)'를 명시한다. 한 줄이면 끝난다.",
        files=["frontend/app/pricing/_PricingClient.tsx"],
        confidence="가설",
    ))
    f.append(Finding(
        id="withdrawal_consent_bundled",
        severity="medium", group="legal",
        title="청약철회 제한 고지가 이용약관 동의에 묶여 있다",
        evidence=PRODUCT_FACTS["withdrawal_consent"]["value"],
        world=PRODUCT_FACTS["withdrawal_consent"]["why"],
        fix=(
            "결제 버튼 바로 위에 '콘텐츠 제공이 시작되면 청약철회가 제한됩니다'를 "
            "**별도 체크박스**로 분리하고, 동의 기록을 서버에 남긴다."
        ),
        files=["frontend/app/payment/page.tsx", "frontend/app/pricing/_PricingClient.tsx"],
        confidence="가설",
    ))
    f.append(Finding(
        id="trial_naming_mismatch",
        severity="medium", group="payment",
        title="'7일 무료 체험'이라 부르는데 즉시 결제된다",
        evidence=PRODUCT_FACTS["trial_naming"]["value"],
        world=PRODUCT_FACTS["trial_naming"]["why"],
        fix=(
            "버튼 문구를 '7일 환불 보장으로 시작하기'처럼 실제 동작과 맞춘다. '무료'를 빼면 "
            "클릭은 줄지만 결제창에서의 이탈이 준다 — 어느 쪽이 큰지는 이 화면의 "
            "요금제→결제시작, 결제창→성공 두 구간을 같이 보고 판단한다."
        ),
        files=["frontend/app/pricing/_PricingClient.tsx"],
        confidence="가설",
    ))

    f.sort(key=lambda x: SEVERITY_ORDER.get(x.severity, 9))
    return f


# =============================================================================
# 9. 진단 실행
# =============================================================================

def _device_block(days: int) -> Dict[str, Any]:
    """
    기기별 쪼개기.

    합산 지표는 모바일이 깨진 사실을 숨긴다. 통계청 2025-08 기준 온라인쇼핑
    거래액의 79.4%가 모바일이라, 우리 트래픽에서도 모바일이 다수면 합산 숫자는
    사실상 모바일 숫자인데 결제만 데스크톱이 떠받치고 있을 수 있다.
    """
    from database import site_analytics_db as adb

    names = ["signup_submit", "checkout_start", "payment_widget_open", "payment_success"]
    split = adb.device_split(days, names)
    pv = adb.pageview_device_split(days)
    total = (pv.get("mobile", 0) + pv.get("desktop", 0)) or 0
    out: Dict[str, Any] = dict(split)
    out["visitors"] = pv
    out["mobile_share_visitors"] = (pv.get("mobile", 0) / total) if total else None
    return out


def diagnose(days: int = 30) -> Dict[str, Any]:
    """관리자 화면이 부르는 단 하나의 함수."""
    from database import site_analytics_db as adb

    c = _collect(days)
    arpu = _arpu_monthly()
    rows = [_stage_row(s, c) for s in FUNNEL]
    overall = _rollup(rows, arpu)

    signup_reasons = adb.failure_reasons(days, "signup_fail")
    login_reasons = adb.failure_reasons(days, "login_fail")

    # 결제 실패는 세 경로에서 들어온다 — 토스가 돌려보낸 것, 서버가 거절한 것,
    # 결제창이 아예 안 뜬 것. 셋을 합쳐야 '왜 결제가 안 되는지'가 한 화면에 모인다.
    pay_reason_rows = (
        adb.failure_reasons(days, "payment_return_fail")
        + adb.failure_reasons(days, "payment_register_fail")
        + adb.failure_reasons(days, "payment_widget_error")
    )
    pay_buckets = bucketize(pay_reason_rows)

    device = _device_block(days)
    findings = build_findings(rows, c, signup_reasons, pay_buckets, device, arpu, days)

    events_since = adb.events_collected_since()
    daily = adb.event_daily(days, ["signup_submit", "checkout_start", "payment_success"])
    signup_by_day = _signup_daily(days)
    for d in daily:
        d["signups"] = signup_by_day.get(d["day"], 0)

    return {
        "period_days": days,
        "generated_at": datetime.now(KST).isoformat(),
        "overall": overall,
        "counts": c,
        "stages": rows,
        "findings": [
            {
                "id": x.id, "severity": x.severity, "group": x.group, "title": x.title,
                "evidence": x.evidence, "world": x.world, "fix": x.fix,
                "files": x.files, "impact": x.impact, "confidence": x.confidence,
            }
            for x in findings
        ],
        "evidence": {
            "signup_fail_reasons": signup_reasons,
            "login_fail_reasons": login_reasons,
            "payment_fail_buckets": pay_buckets,
            "payment_fail_raw": sorted(pay_reason_rows, key=lambda r: -(r.get("n") or 0))[:20],
            "device": device,
        },
        "daily": daily,
        "arpu_monthly": arpu,
        "data_health": {
            "events_since": events_since,
            "event_collection_started": bool(events_since),
            # 이벤트 수집을 시작한 날보다 기간이 길면 앞쪽 날짜는 구조적으로 0 이다.
            # 그걸 '전환이 없었다'로 읽으면 안 되므로 명시한다.
            "window_covered_by_events": (
                events_since is not None
                and events_since <= (datetime.now(KST) - timedelta(days=days - 1)).strftime("%Y-%m-%d")
            ),
            "caveats": [
                "방문자 식별자는 개인정보 보호상 날짜마다 바뀐다. 구간 비율은 '사람'이 "
                "아니라 '방문자-일' 기준이며, 며칠 고민 후 결제한 사람은 후반 구간을 "
                "아주 약간 낙관적으로 만든다.",
                "가입 수는 users 테이블, 결제 수는 payments 테이블이 출처다. 이벤트보다 "
                "정확하지만 수집 시작 이전 기록까지 포함되므로 분자가 분모를 넘을 수 있다 — "
                "그런 구간은 '측정 불가'로 표시한다.",
                f"전환 {MIN_CONVERSIONS}건 미만 또는 분모 {MIN_DENOM}명 미만 구간은 "
                "점수를 내지 않고 총점에서도 뺀다.",
            ],
        },
    }
