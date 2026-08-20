# -*- coding: utf-8 -*-
"""
지수 보호 가드 — 설계서 §10. **우리 고유의 안전장치이자 판매 포인트.**

우리는 사용자 블로그의 지수·레벨을 안다. 타 툴은 못 하는 판단이다.

⚠️ 이 파일의 수치는 **실측 근거가 없는 보수적 휴리스틱**이다(§15-6).
   "하루 몇 건까지 안전한가" 를 네이버가 공식화한 적이 없고, 우리도 아직 측정하지 못했다.
   rank_history 가 쌓이면 발행량 대비 순위 변화로 재보정할 것.
   그때까지는 **적게 쓰는 쪽으로** 틀린다.
"""
import random
import re
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

# ── 일일 상한 (§10) ──────────────────────────────────────────
# services/blog_analyzer.py 의 _LEVEL_CUTS 기준 숫자 레벨
#   1        일반
#   2~4      준최1~3
#   5~8      준최4~7
#   9~11     최적1~3
#   12~15    최적1+~최적4+
CAP_GENERAL = 1
CAP_JUNCHOI_LOW = 1     # 준최1~3
CAP_JUNCHOI_HIGH = 2    # 준최4~7
CAP_CHOEJEOK = 3        # 최적 이상

MIN_GAP_MINUTES = 180           # §10 최소 간격 3시간
DUPLICATE_THRESHOLD = 0.6       # §10 토큰 자카드
DUPLICATE_WINDOW_DAYS = 90
SLOT_FLOOR_MINUTES = 10         # §11 10분 단위 내림


def daily_cap_for_level(level: Optional[int], grade: str = '') -> int:
    """
    레벨 → 하루 발행 상한. 레벨을 모르면 가장 보수적인 값(1건).
    """
    if level is None:
        if grade.startswith('최적'):
            return CAP_CHOEJEOK
        if grade.startswith('준최'):
            # 준최4 이상인지 모르면 낮은 쪽으로
            m = re.search(r'준최(\d)', grade)
            if m and int(m.group(1)) >= 4:
                return CAP_JUNCHOI_HIGH
            return CAP_JUNCHOI_LOW
        return CAP_GENERAL

    if level >= 9:
        return CAP_CHOEJEOK
    if level >= 5:
        return CAP_JUNCHOI_HIGH
    if level >= 2:
        return CAP_JUNCHOI_LOW
    return CAP_GENERAL


# ── 중복 주제 (§10) ──────────────────────────────────────────
_TOKEN_RE = re.compile(r'[0-9A-Za-z가-힣]+')
# 제목에 흔해서 변별력이 없는 말. 이걸 빼지 않으면 아무 글이나 비슷해 보인다.
_STOPWORDS = {
    '정리', '총정리', '방법', '추천', '후기', '비교', '가격', '비용', '알아보기',
    '완벽', '한번에', '핵심', '가이드', '전격', '최신', '그리고', '하지만',
}


def tokenize(text: str) -> set:
    """자카드 판정용 토큰. 2글자 미만과 상투어는 버린다."""
    tokens = set()
    for word in _TOKEN_RE.findall(text or ''):
        if len(word) < 2 or word in _STOPWORDS:
            continue
        tokens.add(word)
    return tokens


def jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def find_duplicate_topic(title: str, keyword: str,
                         history: Iterable[Dict],
                         threshold: float = DUPLICATE_THRESHOLD) -> Optional[Dict]:
    """
    최근 이력 중 주제가 겹치는 글을 찾는다. 자기 카니발(같은 키워드끼리 순위 경쟁) 방지.

    history 원소: {'title':..., 'keyword':..., 'published_at':...}
    반환: 겹치는 이력 + similarity, 없으면 None
    """
    mine = tokenize(f'{title} {keyword}')
    best, best_sim = None, 0.0
    for item in history:
        other = tokenize(f"{item.get('title', '')} {item.get('keyword', '')}")
        sim = jaccard(mine, other)
        if sim > best_sim:
            best, best_sim = item, sim
    if best is not None and best_sim >= threshold:
        result = dict(best)
        result['similarity'] = round(best_sim, 3)
        return result
    return None


# ── 발행 가능 판정 ───────────────────────────────────────────
def check_publish_allowed(*,
                          level: Optional[int] = None,
                          grade: str = '',
                          published_today: int = 0,
                          last_published_at: Optional[str] = None,
                          daily_cap_override: Optional[int] = None,
                          min_gap_minutes: int = MIN_GAP_MINUTES,
                          title: str = '',
                          keyword: str = '',
                          history: Optional[List[Dict]] = None,
                          tracked_keywords: Optional[Iterable[str]] = None,
                          image_slots: int = 0,
                          image_min: Optional[int] = None,
                          now: Optional[datetime] = None) -> Dict:
    """
    발행해도 되는지 판정한다.

    반환: {allowed, blocks[], warnings[], daily_cap, remaining_today}
      blocks   — 발행을 막는 사유 (사용자가 강제 해제할 수 있게 코드도 함께 준다)
      warnings — 알리기만 하고 막지는 않는 것 (§10: 이미지 0장은 경고지 차단이 아니다)
    """
    now = now or datetime.utcnow()
    blocks: List[Dict] = []
    warnings: List[Dict] = []

    cap = daily_cap_override if daily_cap_override is not None else daily_cap_for_level(level, grade)

    # 1) 일일 상한
    if published_today >= cap:
        blocks.append({
            'code': 'daily_cap',
            'message': f'오늘 이미 {published_today}건 발행했습니다. '
                       f'현재 레벨의 하루 권장 상한은 {cap}건입니다.',
        })

    # 2) 최소 간격
    if last_published_at:
        try:
            last = datetime.strptime(str(last_published_at)[:19], '%Y-%m-%d %H:%M:%S')
            gap = (now - last).total_seconds() / 60
            if gap < min_gap_minutes:
                blocks.append({
                    'code': 'min_gap',
                    'message': f'마지막 발행 후 {int(gap)}분 지났습니다. '
                               f'{min_gap_minutes}분 이상 간격을 두세요.',
                })
        except (ValueError, TypeError):
            warnings.append({
                'code': 'bad_timestamp',
                'message': f'마지막 발행 시각을 읽을 수 없어 간격 검사를 건너뛰었습니다: {last_published_at}',
            })

    # 3) 중복 주제
    if history:
        dup = find_duplicate_topic(title, keyword, history)
        if dup:
            blocks.append({
                'code': 'duplicate_topic',
                'message': f"최근에 비슷한 주제를 썼습니다 (유사도 {dup['similarity']}): "
                           f"{dup.get('title') or dup.get('keyword')}",
            })

    # 4) 동일 키워드 재발행 — 순위추적 오염 방지
    if tracked_keywords and keyword and keyword in set(tracked_keywords):
        blocks.append({
            'code': 'keyword_tracked',
            'message': f"'{keyword}' 는 이미 순위추적 중인 키워드입니다. "
                       f"같은 키워드로 또 쓰면 어느 글의 순위인지 구분되지 않습니다.",
        })

    # 5) 이미지 — ★차단이 아니라 경고 (§10)
    if image_min is not None and image_slots < image_min:
        warnings.append({
            'code': 'image_low',
            'message': f'이미지 자리가 {image_slots}군데입니다. '
                       f'상위 글 기준 {image_min}군데 이상이 좋습니다.',
        })

    return {
        'allowed': not blocks,
        'blocks': blocks,
        'warnings': warnings,
        'daily_cap': cap,
        'remaining_today': max(0, cap - published_today),
    }


# ── 골든타임 슬롯 (§11) ──────────────────────────────────────
def floor_to_slot(dt: datetime, minutes: int = SLOT_FLOOR_MINUTES) -> datetime:
    """네이버 예약은 10분 단위만 받는다. 올림이 아니라 내림."""
    return dt.replace(minute=(dt.minute // minutes) * minutes, second=0, microsecond=0)


def jitter_slot(dt: datetime, spread_minutes: int = 40,
                rng: Optional[random.Random] = None) -> datetime:
    """
    같은 시각에 반복 발행하는 패턴을 피한다(§10 시각 지터).
    10분 내림을 먼저 하지 않고 지터를 준 뒤 내림해야 슬롯이 고르게 퍼진다.
    """
    r = rng or random
    shifted = dt + timedelta(minutes=r.randint(0, max(0, spread_minutes)))
    return floor_to_slot(shifted)


def plan_slots(count: int, start: datetime, *, daily_cap: int,
               min_gap_minutes: int = MIN_GAP_MINUTES,
               day_start_hour: int = 9, day_end_hour: int = 21,
               rng: Optional[random.Random] = None) -> List[datetime]:
    """
    승인된 원고 N건을 며칠에 걸쳐 배치한다.
    하루 상한과 최소 간격을 지키고, 활동 시간대(기본 09~21시) 안에만 넣는다.

    ⚠️ 시간대 기본값도 근거 없는 휴리스틱이다(§15-6).
    """
    r = rng or random
    slots: List[datetime] = []
    day = start.date()
    placed_today = 0
    cursor = datetime.combine(day, datetime.min.time()).replace(hour=day_start_hour)
    if cursor < start:
        cursor = floor_to_slot(start)

    while len(slots) < count:
        if placed_today >= daily_cap or cursor.hour >= day_end_hour:
            day = day + timedelta(days=1)
            cursor = datetime.combine(day, datetime.min.time()).replace(hour=day_start_hour)
            placed_today = 0
            continue

        slot = jitter_slot(cursor, rng=r)
        if slot.hour >= day_end_hour:
            day = day + timedelta(days=1)
            cursor = datetime.combine(day, datetime.min.time()).replace(hour=day_start_hour)
            placed_today = 0
            continue

        slots.append(slot)
        placed_today += 1
        cursor = slot + timedelta(minutes=min_gap_minutes)

    return slots
