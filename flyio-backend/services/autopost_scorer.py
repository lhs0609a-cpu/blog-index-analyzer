# -*- coding: utf-8 -*-
"""
원고 규격 채점기 — 설계서 §7-3.

수확한 원고를 top_posts 가 상위글에서 뽑는 것과 **같은 지표**로 잰다.
그래야 "상위글은 이런데 네 글은 이렇다" 는 비교가 성립한다.

게이트
  ┌ 규격 필수 3종  content_length · keyword_density · title_length 전부 범위 내
  │                  → guide.status == 'data_driven' 일 때만 적용
  ├ 가독성 필수    wall_of_text == False AND long_line_ratio <= 0.15
  │                  → ★항상 적용. 상위글 통계가 아니라 우리가 정한 편집 원칙이라
  │                    writing-guide 데이터가 없어도 지킨다.
  └ 총점          >= 70 → data_driven 일 때만

미달이면 needs_regen. 재생성은 최대 2회(=최대 3번 생성)까지만 한다 —
무한 재생성은 Gemini 무료 한도를 태운다(§15-4).
"""
from typing import Dict, List, Optional

from services.autopost_reflow import check_mobile_format

REGEN_LIMIT = 2          # §7-3
PASS_SCORE = 70          # §15-6 임의값 — rank_history 축적 후 재보정 대상
LONG_LINE_MAX = 0.15     # §7-3 가독성 게이트

IMAGE_MARKER = '[이미지]'


# ── 지표 계산 ────────────────────────────────────────────────
def strip_markers(body: str) -> str:
    """글자 수를 셀 때 [이미지] 표시와 마크다운 기호는 빼야 상위글과 같은 기준이 된다."""
    text = body.replace(IMAGE_MARKER, '')
    lines = []
    for line in text.split('\n'):
        s = line.strip()
        if s.startswith('#'):
            s = s.lstrip('#').strip()
        elif s.startswith('>'):
            s = s.lstrip('>').strip()
        elif s[:2] in ('- ', '* ', '• '):
            s = s[2:].strip()
        lines.append(s)
    return ''.join(lines)


def count_headings(body: str) -> int:
    n = 0
    for line in body.split('\n'):
        s = line.strip()
        if s.startswith('#') or (s.startswith('**') and s.endswith('**') and len(s) > 4):
            n += 1
    return n


def position_bucket(title: str, keyword: str) -> Optional[str]:
    """제목 안에서 키워드가 앞/중간/뒤 어디에 있는지"""
    if not keyword or keyword not in title:
        return None
    idx = title.index(keyword) / max(1, len(title))
    if idx < 0.34:
        return 'front'
    if idx < 0.67:
        return 'middle'
    return 'end'


def measure(title: str, body: str, keyword: str) -> Dict:
    """채점 이전의 순수 측정값. 게이트 판정과 분리해 둔다."""
    clean = strip_markers(body)
    kw_count = body.count(keyword) if keyword else 0
    fmt = check_mobile_format(body)

    return {
        # writing-guide 대조 항목
        'title_length': len(title),
        'title_has_keyword': bool(keyword) and keyword in title,
        'title_kw_position': position_bucket(title, keyword),
        'content_length': len(clean),
        'heading_count': count_headings(body),
        'keyword_count': kw_count,
        'keyword_density': round(kw_count / max(1.0, len(clean) / 1000), 2),
        'image_slots': body.count(IMAGE_MARKER),
        # 모바일 가독성 항목 (§7-4)
        'avg_line_chars': fmt['avg_line_chars'],
        'long_line_ratio': fmt['long_line_ratio'],
        'max_para_lines': fmt['max_para_lines'],
        'wall_of_text': fmt['wall_of_text'],
        'blank_line_ratio': fmt['blank_line_ratio'],
    }


# ── 규격 대조 ────────────────────────────────────────────────
def _rng(guide: Dict, *path) -> Optional[Dict]:
    """guide['rules'][...] 안전 조회"""
    node = (guide or {}).get('rules') or {}
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
        if node is None:
            return None
    return node if isinstance(node, dict) else None


def _check_range(label: str, value, spec: Optional[Dict], unit: str = '') -> Optional[Dict]:
    """min/max 범위 대조. spec 이 없으면 검사하지 않는다(None 반환)."""
    if not spec or 'min' not in spec or 'max' not in spec:
        return None
    lo, hi = spec['min'], spec['max']
    ok = lo <= value <= hi
    return {
        'name': label,
        'value': value,
        'min': lo,
        'max': hi,
        'unit': unit,
        'ok': ok,
    }


def score(title: str, body: str, keyword: str, guide: Optional[Dict] = None) -> Dict:
    """
    원고를 채점한다.

    반환:
      metrics       측정값 전체
      checks        항목별 범위 대조 결과
      readability   가독성 게이트 결과 (항상)
      spec_gate     규격 게이트 결과 (data_driven 일 때만, 아니면 None)
      total_score   0~100
      passed        발행 가능 여부
      reasons       미달 사유 (사람이 읽는 문장)
    """
    guide = guide or {}
    data_driven = guide.get('status') == 'data_driven'
    m = measure(title, body, keyword)

    # 1) 규격 대조 — guide 가 있을 때만 의미가 있다
    checks: List[Dict] = []
    if data_driven:
        for c in (
            _check_range('제목 길이', m['title_length'], _rng(guide, 'title', 'length'), '자'),
            _check_range('본문 길이', m['content_length'], _rng(guide, 'content', 'length'), '자'),
            _check_range('소제목 수', m['heading_count'],
                         _rng(guide, 'content', 'structure', 'heading_count'), '개'),
            _check_range('키워드 밀도', m['keyword_density'],
                         _rng(guide, 'content', 'structure', 'keyword_density'), '회/1000자'),
            _check_range('키워드 등장', m['keyword_count'],
                         _rng(guide, 'content', 'structure', 'keyword_count'), '회'),
            _check_range('이미지 수', m['image_slots'], _rng(guide, 'media', 'images'), '장'),
        ):
            if c:
                checks.append(c)

    # 2) 가독성 게이트 — 항상
    readability = {
        'wall_of_text': m['wall_of_text'],
        'long_line_ratio': m['long_line_ratio'],
        'ok': (not m['wall_of_text']) and m['long_line_ratio'] <= LONG_LINE_MAX,
    }

    # 3) 규격 필수 3종
    required_names = {'본문 길이', '키워드 밀도', '제목 길이'}
    required = [c for c in checks if c['name'] in required_names]
    spec_gate = None
    if data_driven:
        spec_gate = {
            'ok': all(c['ok'] for c in required) if required else True,
            'items': required,
        }

    # 4) 총점 — 규격 항목 통과율 70% + 가독성 30%
    if checks:
        spec_ratio = sum(1 for c in checks if c['ok']) / len(checks)
    else:
        spec_ratio = 1.0
    read_ratio = 1.0
    if m['wall_of_text']:
        read_ratio -= 0.6
    if m['long_line_ratio'] > LONG_LINE_MAX:
        read_ratio -= 0.4
    read_ratio = max(0.0, read_ratio)
    total = round(spec_ratio * 70 + read_ratio * 30)

    # 5) 판정
    reasons: List[str] = []
    if not readability['ok']:
        if m['wall_of_text']:
            reasons.append(
                f"문단 하나가 {m['max_para_lines']}줄입니다. 모바일에서 벽처럼 보입니다. "
                f"문단을 3줄 이내로 끊어주세요."
            )
        if m['long_line_ratio'] > LONG_LINE_MAX:
            reasons.append(
                f"35자를 넘는 줄이 {round(m['long_line_ratio'] * 100)}%입니다. "
                f"15% 이하가 되도록 한 문장을 한 줄로 짧게 끊어주세요."
            )
    if spec_gate and not spec_gate['ok']:
        for c in required:
            if not c['ok']:
                reasons.append(_phrase(c))
    if data_driven and total < PASS_SCORE:
        reasons.append(f"규격 총점이 {total}점입니다. {PASS_SCORE}점 이상이 필요합니다.")

    passed = readability['ok'] and (spec_gate is None or spec_gate['ok']) and (
        not data_driven or total >= PASS_SCORE
    )

    return {
        'metrics': m,
        'checks': checks,
        'readability': readability,
        'spec_gate': spec_gate,
        'total_score': total,
        'passed': passed,
        'reasons': reasons,
        'guide_status': guide.get('status', 'none'),
    }


def _has_final_consonant(word: str) -> bool:
    """한글 마지막 글자에 받침이 있는지"""
    if not word:
        return False
    ch = word[-1]
    if not ('가' <= ch <= '힣'):
        return False
    return (ord(ch) - 0xAC00) % 28 != 0


def _iga(word: str) -> str:
    """주격 조사 이/가. 이 문장은 사용자에게 그대로 보이고 재프롬프트로도 들어간다."""
    return '이' if _has_final_consonant(word) else '가'


def _phrase(check: Dict) -> str:
    """범위 미달 항목 → 사람이 읽는 지적 문장"""
    name, v, lo, hi, unit = (
        check['name'], check['value'], check['min'], check['max'], check['unit']
    )
    head = f"{name}{_iga(name)} {v}{unit}입니다."
    if v < lo:
        return f"{head} {lo}~{hi}{unit}가 필요합니다."
    return f"{head} {lo}~{hi}{unit}로 줄여주세요."


# ── 재프롬프트 ───────────────────────────────────────────────
def build_regen_prompt(base_prompt: str, result: Dict) -> str:
    """
    미달 항목을 자연어 지시로 바꿔 원 프롬프트 뒤에 덧붙인다(§7-3).
    지적을 나열만 하고 "위 지적만 반영" 을 명시해야 딴 데를 고치지 않는다.
    """
    if result.get('passed') or not result.get('reasons'):
        return base_prompt

    lines = '\n'.join(f'- {r}' for r in result['reasons'])
    return (
        f"{base_prompt}\n\n"
        f"직전 원고의 문제:\n{lines}\n"
        f"위 지적만 반영해 전체를 다시 써주세요."
    )


def should_regenerate(result: Dict, regen_count: int) -> bool:
    """
    재생성할지 결정한다. 상한을 넘으면 멈추고 사용자에게 미달 항목을 그대로 보여준다 —
    무한 재생성은 Gemini 한도를 태운다(§15-4).
    """
    return (not result.get('passed')) and regen_count < REGEN_LIMIT
