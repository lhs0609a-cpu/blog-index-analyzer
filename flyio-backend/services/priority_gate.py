"""사용자 대기형 job 우선순위 게이트 (worker 프로세스 전용)
================================================================

**왜 필요한가 (2026-08-13 실측)**: worker 는 키워드 풀 크론 9계정을 nice 19 로 계속
돌리는데, 같은 프로세스에서 사용자가 화면 앞에서 기다리는 job(키워드 판정)이 뜨면
CPU/이벤트루프를 뺏겨 **`timeout=12.0` 인 httpx 요청이 54~69초** 걸린다. 그 결과
판정의 단계 타임아웃(SERP 210초, 브라우저 75초)이 전부 무의미해지고 판정이 100%
실패했다. 크론은 몇 분 밀려도 아무도 모르지만, 판정은 3분 기다린 사용자가 빈손으로
돌아간다 — 그래서 크론이 양보한다.

사용법:
    with_user_job("kwv:job123")  ... 컨텍스트 매니저로 감싸면 그 동안 active()=True
    if active(): return          ... 무거운 크론 tick 맨 앞에서 한 틱 양보

프로세스 로컬 플래그다(worker 안에서만 의미 있음). app 프로세스에는 크론이 없으므로
공유할 필요가 없고, 파일/DB 를 쓰면 그 자체가 I/O 비용이라 일부러 메모리로 둔다.

**만료가 있는 이유**: job 이 예외로 죽거나 프로세스가 멈춘 채 플래그가 남으면 크론이
영구히 굶는다. 어떤 경우에도 MAX_HOLD 초가 지나면 게이트는 저절로 열린다.
"""

import logging
import os
import time
from contextlib import contextmanager
from typing import Callable, Dict, List

logger = logging.getLogger(__name__)

# 판정 job 최대 수명(stage1 210 + stage2 330)보다 약간 넉넉하게 — 이 시간이 지나면
# 플래그가 남아 있어도 무시한다(크론 영구 기아 방지).
MAX_HOLD = float(os.environ.get("PRIORITY_GATE_MAX_HOLD", "600"))

_holders: Dict[str, float] = {}   # tag -> 시작 시각
_probes: List[Callable[[], bool]] = []   # "아직 안 집었지만 사람이 기다리는 중" 판정기


def register_probe(fn: Callable[[], bool]) -> None:
    """큐에 **대기 중인** 사용자 job 이 있는지 알려주는 콜백을 등록한다.

    홀더만 보면 job 을 집은 뒤부터 보호가 시작된다. 그런데 워치독이 job 을 집는 것 자체가
    크론에 막혀 늦어진다 — 2026-08-13 프로덕션 실측에서 2초 틱 워치독이 **87초** 만에
    집었고, 그게 사용자 대기 213초의 40%였다. 그래서 '적재됐지만 아직 안 집힌' 구간도
    양보 대상으로 본다.
    """
    _probes.append(fn)


def active() -> bool:
    """지금 사용자 대기형 job 이 도는 중(또는 대기 중)인가. 만료된 홀더는 여기서 청소한다."""
    now = time.time()
    for tag, started in list(_holders.items()):
        if now - started > MAX_HOLD:
            logger.warning(f"[gate] holder 만료 강제 해제: {tag} ({round(now - started)}s)")
            _holders.pop(tag, None)
    if _holders:
        return True
    for fn in _probes:
        try:
            if fn():
                return True
        except Exception:
            pass   # 진단용 장치가 크론을 죽이면 안 된다
    return False


def begin(tag: str) -> None:
    _holders[tag] = time.time()


def end(tag: str) -> None:
    _holders.pop(tag, None)


@contextmanager
def with_user_job(tag: str):
    begin(tag)
    try:
        yield
    finally:
        end(tag)


def yielded(name: str) -> bool:
    """크론 tick 맨 앞에서 호출. True 면 이번 tick 을 건너뛰라는 뜻."""
    if not active():
        return False
    logger.warning(f"[{name}] 사용자 대기 job 실행 중 — 이번 tick 양보")
    return True
