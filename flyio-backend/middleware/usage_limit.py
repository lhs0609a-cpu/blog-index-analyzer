"""
일일 사용 한도 게이트.

왜 서버에 있어야 하나 — 2026-09-16 프로덕션 실측:

  guest_usage / user_usage 테이블은 **생성 이래 0행**인데 /analyze 페이지뷰는
  29일간 1,513건이었다. 한도 검사가 프런트에만 있었고(그나마 실패하면 통과),
  이 파일의 의존성은 어느 라우터에도 연결돼 있지 않은 죽은 코드였다.
  결과: 순방문자 1,596명 중 회원으로 식별되는 사람 39명(2.4%),
  /analyze 사용자 924명 중 889명(96%)이 비회원, 결제 시도는 8월 0건 · 9월 1건.

  벽이 없으면 가입할 이유도 결제할 이유도 생기지 않는다. 이 모듈이 그 벽이다.

회원과 비회원은 서로 다른 장부를 쓴다:

  회원   → subscription_db.daily_usage (기능별 카운터)
           화면의 UsageIndicator 가 읽는 바로 그 숫자여야 "3회 중 2회 남음"이
           거짓말이 되지 않는다.
  비회원 → usage_db.guest_usage (guest_key + 기능별 카운터)
           user_id 가 없어 daily_usage 에 넣을 수 없다. 키는 IP 원문이 아니라
           IP+UA 해시다 — 이유는 guest_key() 참고.

차감은 **성공했을 때만** 한다. 하루 1~3회짜리 한도에서 오타 한 번이 기회를
먹으면 사람은 제품이 아니라 자기를 탓하고 떠난다. 그래서 의존성이 자동으로
차감하지 않고, 엔드포인트가 성공 직전에 consume_usage(gate) 를 부른다.
"""
from fastapi import Request, HTTPException, status, Depends
from typing import Optional, Any
import hashlib
import logging
import os

from database.usage_db import get_usage_db
from database.user_db import get_user_db
from routers.auth import get_current_user_optional

logger = logging.getLogger(__name__)

# 이 값은 subscription_db 의 usage_type 과 같은 문자열이어야 한다.
BLOG_ANALYSIS = "blog_analysis"
KEYWORD_SEARCH = "keyword_search"

_FEATURE_LABEL = {
    BLOG_ANALYSIS: "블로그 분석",
    KEYWORD_SEARCH: "키워드 검색",
}


# 비회원 식별자에 섞는 소금. IP 를 그대로 저장하지 않기 위한 것이고,
# 값이 바뀌면 그날 카운터가 초기화될 뿐이라 기동 시 고정값이면 충분하다.
_GUEST_SALT = os.environ.get("ANALYTICS_SALT", "blank-analytics")


def guest_key(request: Request) -> str:
    """
    비회원 한 명을 가리키는 키.

    ⚠️ IP 만 쓰면 안 된다. 국내 모바일은 CGNAT 로 수천 명이 같은 IP 를 쓰므로
    "하루 1회"가 통신사 한 블록 전체에 1회가 된다 — 벽이 아니라 봉쇄가 된다.
    site_analytics 의 visitor_hash 와 같은 방식(IP + UA 해시)으로 충돌을 낮춘다.

    이 벽은 전환을 만드는 **넛지**이지 보안 장치가 아니다. UA 를 바꾸면 초기화되지만
    그건 감수한다 — 잘못 막는 비용이 우회당하는 비용보다 훨씬 크다.
    """
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    return hashlib.sha256(f"{_GUEST_SALT}|{ip}|{ua}".encode()).hexdigest()[:32]


def get_client_ip(request: Request) -> str:
    """
    Fly 프록시 뒤라 request.client.host 는 내부 IP 다. 그대로 쓰면 모든 비회원이
    한 사람으로 묶여 **첫 방문자 한 명이 전체 한도를 태우고 나머지는 전부 차단**된다.
    site_analytics 와 같은 이유로 fly-client-ip 를 먼저 본다.
    """
    return (
        request.headers.get("fly-client-ip")
        or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or request.headers.get("x-real-ip")
        or (request.client.host if request.client else "unknown")
    )


class UsageGate:
    """
    통과한 요청 한 건의 한도 맥락.

    생성 시점에 이미 한도 검사는 끝났다(초과면 여기 오지 않는다).
    남은 일은 성공했을 때 consume() 으로 차감하는 것뿐이다.
    """

    def __init__(
        self,
        feature: str,
        plan: str,
        used: int,
        limit: int,
        user_id: Optional[int],
        ip: str,
    ):
        self.feature = feature
        self.plan = plan
        self.used = used
        self.limit = limit            # -1 = 무제한
        self.user_id = user_id
        self.ip = ip          # 비회원이면 guest_key() 해시 (원문 IP 가 아니다)
        self._consumed = False

    @property
    def unlimited(self) -> bool:
        return self.limit == -1

    def consume(self) -> None:
        """
        성공한 요청 1건을 차감한다. 같은 요청에서 두 번 불러도 한 번만 먹는다.

        ⚠️ 어떤 이유로도 예외를 밖으로 내보내지 않는다. 카운터를 못 적는 것보다
        이미 만들어낸 분석 결과를 500 으로 날리는 쪽이 훨씬 비싸다.
        """
        if self._consumed or self.unlimited:
            return
        self._consumed = True
        try:
            if self.user_id is not None:
                from database.subscription_db import increment_usage
                increment_usage(self.user_id, self.feature)
            else:
                get_usage_db().increment_guest_usage(self.ip, self.feature)
        except Exception as e:
            logger.warning(f"[usage] 차감 실패 feature={self.feature} user={self.user_id}: {e}")


def consume_usage(gate: Any) -> None:
    """
    엔드포인트가 성공했을 때 부른다.

    라우터 함수는 HTTP 말고 **파이썬으로도** 호출된다(blue_ocean 이
    search_keyword_with_tabs 를 그대로 await 한다). 그때는 Depends 기본값이
    그대로 들어오므로 조용히 넘긴다 — 내부 파이프라인이 사용자 한도를 먹으면
    안 되고, 여기서 터지면 더 안 된다.
    """
    if isinstance(gate, UsageGate):
        gate.consume()


def _record_limit_hit(request: Request, gate_feature: str, plan: str, limit: int, user_id) -> None:
    """한도에 부딪힌 순간을 퍼널 이벤트로 남긴다.

    이 구간은 지금까지 통째로 비어 있었다 — UpgradeModal 에는 track() 이
    하나도 없어서 "무료 한도에 부딪힌 사람이 몇 명이고 그중 몇 명이 요금제로
    갔는가"를 물어볼 수단 자체가 없었다. 서버에서 남기면 프런트가 무엇을
    빠뜨리든 분모가 남는다.
    """
    try:
        from database import site_analytics_db as adb

        adb.record_event(
            name="limit_hit",
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            path=str(request.url.path),
            user_id=str(user_id) if user_id is not None else None,
            reason=plan,
            props={"feature": gate_feature, "limit": limit},
        )
    except Exception as e:  # 통계가 기능을 막으면 본말전도다
        logger.warning(f"[usage] limit_hit 기록 실패: {e}")


def _member_gate(request: Request, user: dict, feature: str) -> UsageGate:
    from database.subscription_db import check_usage_limit, count_limit_days

    result = check_usage_limit(user["id"], feature)
    plan = result.get("plan", "free")
    limit = result.get("limit", 0)
    used = result.get("used", 0)

    if not result.get("allowed", True):
        _record_limit_hit(request, feature, plan, limit, user["id"])
        # 최근 일주일 중 며칠이나 막혔는지. 3일 이상이면 화면이 다른 말을 한다 —
        # 매일 벽에 부딪히는 사람에게 첫 방문자와 같은 안내를 하면 아무 일도 안 일어난다.
        recent_block_days = count_limit_days(user["id"], feature, limit, days=7)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "DAILY_LIMIT_EXCEEDED",
                "message": (
                    f"오늘 {_FEATURE_LABEL.get(feature, feature)} 무료 한도({limit}회)를 "
                    f"모두 쓰셨습니다. 요금제를 올리면 바로 이어서 쓸 수 있습니다."
                ),
                "feature": feature,
                "plan": plan,
                "used": used,
                "limit": limit,
                "authenticated": True,
                "recent_block_days": recent_block_days,
            },
        )

    return UsageGate(feature, plan, used, limit, user["id"], get_client_ip(request))


def _guest_gate(request: Request, feature: str) -> UsageGate:
    key = guest_key(request)
    usage_db = get_usage_db()
    usage = usage_db.get_guest_usage(key, feature)
    limit = usage["limit"]

    if usage["count"] >= limit:
        _record_limit_hit(request, feature, "guest", limit, None)
        recent_block_days = usage_db.count_guest_limit_days(key, feature, days=7)

        # 가입해도 한도가 그대로인 기능이 있다(블로그 분석: 비회원 1회 = 무료회원 1회).
        # 거기서 "가입하면 바로 이어서 쓸 수 있습니다" 는 거짓말이고, 그 말을 믿고
        # 가입한 사람은 같은 벽을 다시 만난다.
        from database.subscription_db import PLAN_LIMITS
        free_limit = (PLAN_LIMITS.get("free") or {}).get(f"{feature}_daily")
        can_continue = isinstance(free_limit, int) and (free_limit < 0 or free_limit > limit)
        guest_message = (
            f"비회원은 {_FEATURE_LABEL.get(feature, feature)}을 하루 {limit}회까지 "
            + ("쓸 수 있습니다. 무료 회원가입하면 바로 이어서 쓸 수 있습니다."
               if can_continue else
               "쓸 수 있습니다. 무료 회원가입하면 분석 기록이 저장됩니다.")
        )

        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error_code": "DAILY_LIMIT_EXCEEDED",
                "message": guest_message,
                "feature": feature,
                "plan": "guest",
                "used": usage["count"],
                "limit": limit,
                "authenticated": False,
                "recent_block_days": recent_block_days,
            },
        )

    return UsageGate(feature, "guest", usage["count"], limit, None, key)


def usage_gate(feature: str):
    """
    엔드포인트에 붙이는 의존성 팩토리.

        async def endpoint(..., gate: UsageGate = Depends(usage_gate("blog_analysis"))):
            ...
            consume_usage(gate)   # 성공 직전에만
            return result
    """

    async def dependency(
        request: Request,
        current_user: Optional[dict] = Depends(get_current_user_optional),
    ) -> UsageGate:
        if current_user:
            try:
                effective_plan = get_user_db().get_user_effective_plan(current_user["id"])
            except Exception:
                effective_plan = current_user.get("plan", "free")
            # 관리자는 한도가 없다 — check_usage_limit 가 이미 무제한을 돌려주지만
            # 여기서도 끊어두면 관리자 점검이 통계를 흔들지 않는다.
            if current_user.get("is_admin") or effective_plan == "business":
                return UsageGate(feature, effective_plan, 0, -1, current_user["id"], get_client_ip(request))
            return _member_gate(request, current_user, feature)
        return _guest_gate(request, feature)

    return dependency


blog_analysis_gate = usage_gate(BLOG_ANALYSIS)
keyword_search_gate = usage_gate(KEYWORD_SEARCH)


async def get_usage_info(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    """
    차감 없이 남은 한도만 조회. 요청 전에 미리 보여주는 용도.
    """
    usage_db = get_usage_db()
    user_db = get_user_db()
    client_ip = get_client_ip(request)

    if current_user:
        effective_plan = user_db.get_user_effective_plan(current_user['id'])
        usage = usage_db.get_user_usage(current_user['id'], effective_plan)
        usage['plan'] = effective_plan
    else:
        usage = usage_db.get_guest_usage(guest_key(request))
        usage['plan'] = 'guest'

    return usage
