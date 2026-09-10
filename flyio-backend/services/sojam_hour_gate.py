"""
소잠한의원 광고 — 시간대 게이트 (worker 전용).

왜 필요한가
-----------
네이버 예산 균등배분은 시간 가중이 없다. 하루 예산을 24시간에 평탄하게 뿌리므로,
검색 수요가 얕은 새벽에도 같은 속도로 돈이 나간다. 실측(2026-08-27~09-01 중
24시간 온전히 돌아간 4일, 진료대상 광고그룹 148개 기준):

    02-06시  노출 4.2%  ← 소진 8.1%  (수요의 1.95배, CPC 4,355원)
    18-21시  노출 21.5% ← 소진 19.9% (수요보다 적게, CPC 2,729원)

즉 가장 안 찾는 시간에 가장 비싸게 사고 있다. 02-06시를 닫으면 균등배분이
그 몫(일 약 10,900원)을 남은 20시간으로 알아서 재분배한다.

왜 광고그룹 시간대 타겟이 아니라 스케줄러인가
---------------------------------------------
네이버 API 로는 TIME_WEEKLY_TARGET 을 만들 수 없다 (2026-09-03 실측).
  - PUT /ncc/adgroups/{id}?fields=targetTime  → 200 을 주고 조용히 무시한다
  - POST /ncc/targets, PUT /ncc/targets       → 405 Method Not Allowed
  - fields=targetTimeWeekly 등 다른 이름      → 3726 Not support modify field
targetTp enum 자체는 존재한다(TIME_WEEKLY_TARGET). 읽기만 되고 쓰기가 없다.
그래서 캠페인 userLock 토글로 같은 효과를 낸다.

설계 원칙 — 상태 수렴(reconcile), 일회성 cron 아님
--------------------------------------------------
"02시에 끄고 06시에 켠다"는 one-shot 방식은 재개가 한 번 실패하면 광고가 하루
종일 꺼진 채 방치된다. 실제로 그런 사고가 있었다(2026-09-02 18:50 중단 후
09-03 09:15 까지 재개 안 됨). 그래서 이 모듈은 매 주기마다 '지금 시각이면
어떤 상태여야 하는가'를 계산해 어긋난 것만 고친다. 한 번 실패해도 다음 주기에
자동 복구된다.

안전장치
--------
- 기본 비활성. SOJAM_HOUR_GATE=1 이어야 돈다. 배포만으로는 아무 일도 없다.
- SOJAM_HOUR_GATE_DRY=1 이면 계산만 하고 쓰지 않는다(로그로 확인).
- SOJAM_HOUR_GATE_EXCLUDE 에 적힌 캠페인은 건드리지 않는다. 사람이 일부러 끈
  캠페인이 여기 없으면 게이트가 되살린다 — 그게 이 방식의 알려진 한계다.
- 브랜드검색(BRAND_SEARCH)은 정액제라 항상 제외한다.
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Set

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))

CUSTOMER_ID = os.environ.get("SOJAM_HOUR_GATE_CID", "1858907")
# "2-6" = 02:00 이상 06:00 미만을 닫는다. 자정을 넘는 구간(예: "22-2")도 지원.
OFF_WINDOW = os.environ.get("SOJAM_HOUR_GATE_OFF_HOURS", "2-6")
DRY_RUN = os.environ.get("SOJAM_HOUR_GATE_DRY", "0") == "1"
EXCLUDE: Set[str] = {
    c.strip() for c in os.environ.get("SOJAM_HOUR_GATE_EXCLUDE", "").split(",") if c.strip()
}
# 네이버 쓰기 사이 간격 — 137개를 한 번에 때리면 breaker 가 열린다
WRITE_SPACING = float(os.environ.get("SOJAM_HOUR_GATE_SPACING", "0.25"))


def _parse_window(spec: str) -> tuple:
    try:
        a, b = spec.split("-")
        return int(a) % 24, int(b) % 24
    except Exception:
        logger.warning(f"[sojam-gate] OFF_HOURS 파싱 실패 '{spec}' — 기본 2-6 사용")
        return 2, 6


def should_be_off(now_kst: datetime) -> bool:
    """지금이 '광고를 닫아 둘 시간'인가."""
    start, end = _parse_window(OFF_WINDOW)
    h = now_kst.hour
    if start == end:
        return False
    if start < end:
        return start <= h < end
    return h >= start or h < end  # 자정을 넘는 구간


def _client_for_account():
    """소잠 계정 자격증명이 실린 네이버 광고 클라이언트."""
    from routers.naver_ad import _resolve_account
    from services.naver_ad_service import NaverAdApiClient

    account = _resolve_account(1, CUSTOMER_ID)
    if not account or not account.get("is_connected"):
        raise RuntimeError(f"광고 계정 미연결 (customer_id={CUSTOMER_ID})")
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]
    return client


async def reconcile_once() -> dict:
    """지금 시각에 맞는 상태로 수렴시킨다. 바뀐 것만 쓴다."""
    now = datetime.now(KST)
    want_off = should_be_off(now)
    client = _client_for_account()

    campaigns = await client._request("GET", "/ncc/campaigns")
    if not isinstance(campaigns, list):
        raise RuntimeError(f"캠페인 조회 실패: {str(campaigns)[:200]}")

    targets = [
        c for c in campaigns
        if not c.get("delFlag")
        and c.get("campaignTp") != "BRAND_SEARCH"
        and c.get("nccCampaignId") not in EXCLUDE
    ]
    # userLock=True 는 '중지', want_off 와 같은 뜻이다. 어긋난 것만 고친다.
    drift = [c for c in targets if bool(c.get("userLock")) != want_off]

    result = {
        "at": now.isoformat(timespec="seconds"),
        "window": OFF_WINDOW,
        "want": "중지" if want_off else "운영",
        "total": len(targets),
        "drift": len(drift),
        "ok": 0,
        "failed": 0,
        "dry_run": DRY_RUN,
    }
    if not drift:
        logger.info(f"[sojam-gate] {result['at']} — {result['want']} 상태 정상 ({len(targets)}개)")
        return result
    if DRY_RUN:
        logger.info(
            f"[sojam-gate] DRY {result['at']} — {len(drift)}개를 {result['want']}(으)로 바꿔야 함: "
            + ", ".join(c.get("name", "")[:20] for c in drift[:5])
        )
        return result

    for c in drift:
        cid = c["nccCampaignId"]
        try:
            await client._request(
                "PUT", f"/ncc/campaigns/{cid}?fields=userLock",
                {"nccCampaignId": cid, "userLock": want_off},
            )
            result["ok"] += 1
        except Exception as e:
            result["failed"] += 1
            logger.warning(f"[sojam-gate] {c.get('name')} 실패: {type(e).__name__} {str(e)[:120]}")
        await asyncio.sleep(WRITE_SPACING)

    logger.info(
        f"[sojam-gate] {result['at']} — {result['want']} 전환 "
        f"성공 {result['ok']} / 실패 {result['failed']} (대상 {len(drift)}/{len(targets)})"
    )
    return result


class SojamHourGateScheduler:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None

    def start(self, interval_seconds: int = 600):
        if os.environ.get("SOJAM_HOUR_GATE", "0") != "1":
            logger.info("[sojam-gate] 비활성 (SOJAM_HOUR_GATE=1 이어야 동작)")
            return
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(interval_seconds))
        logger.info(
            f"[sojam-gate] 시작 — {OFF_WINDOW}시 중지, {interval_seconds}초마다 수렴"
            + (" [DRY-RUN]" if DRY_RUN else "")
        )

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None

    async def _loop(self, interval_seconds: int):
        # 기동 직후에는 다른 스케줄러들과 겹치지 않게 잠깐 비켜선다
        await asyncio.sleep(90)
        while True:
            try:
                await reconcile_once()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"[sojam-gate] 주기 실패: {type(e).__name__} {str(e)[:200]}")
            await asyncio.sleep(interval_seconds)


sojam_hour_gate_scheduler = SojamHourGateScheduler()
