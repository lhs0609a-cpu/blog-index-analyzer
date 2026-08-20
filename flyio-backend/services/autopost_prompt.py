# -*- coding: utf-8 -*-
"""
프롬프트 조립 — 설계서 §7-1. **이 상품의 차별점.**

키워드 → detect_category() → writing-guide(category) → 실측 수치를 자연어 제약으로 변환.

다른 도구는 "블로그 글 써줘" 로 끝나지만, 우리는 그 키워드의 상위 노출 문서들에서
실제로 측정한 제목 길이·본문 길이·소제목 수·키워드 밀도·이미지 수를 프롬프트에 박는다.
그리고 수확한 원고를 같은 지표로 다시 잰다(autopost_scorer).

★모바일 서식(§7-4)도 여기서 함께 박는다. 후처리로만 고치려 하면 접속사로 길게 이어붙인
  문장이 들어와 기계적으로 자를 곳이 없다. 생성 단계에서 짧게 쓰게 해야 한다.

★guide.status == 'insufficient_data' 면 수치를 "참고"로만 넣는다.
  근거 없는 기준으로 사용자 원고를 반려하면 안 된다(§7-1).
"""
from typing import Dict, List, Optional

from services.autopost_reflow import MAX_LINE, MAX_PARA_LINES, TARGET_LINE

POSITION_KO = {
    'front': '제목 앞부분',
    'middle': '제목 중간',
    'end': '제목 뒷부분',
}

# §7-4 R1~R9 를 생성 단계에 그대로 전달한다
MOBILE_FORMAT_RULES = f"""[서식 — 가장 중요합니다]
이 글은 대부분 휴대폰으로 읽힙니다. 아래를 반드시 지켜주세요.
- 한 문장이 끝나면 무조건 줄을 바꿉니다. 한 줄에 두 문장을 넣지 마세요.
- 한 줄은 {TARGET_LINE}자 내외로 씁니다. 어떤 줄도 {MAX_LINE}자를 넘기지 마세요.
- 문장을 접속사로 길게 이어붙이지 마세요. 짧게 끊어 여러 문장으로 씁니다.
- {MAX_PARA_LINES}줄을 쓰면 빈 줄을 하나 넣습니다. 빈 줄은 한 줄만 넣습니다.
- 소제목 앞뒤에는 빈 줄을 넣습니다."""


def _rule(guide: Dict, *path) -> Optional[Dict]:
    node = (guide or {}).get('rules') or {}
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
        if node is None:
            return None
    return node if isinstance(node, dict) else None


def build_spec_lines(guide: Optional[Dict]) -> List[str]:
    """writing-guide 수치 → 자연어 제약 문장"""
    guide = guide or {}
    lines: List[str] = []

    title_len = _rule(guide, 'title', 'length')
    if title_len:
        lines.append(f"- 제목은 {title_len['min']}~{title_len['max']}자로 씁니다.")

    placement = _rule(guide, 'title', 'keyword_placement')
    if placement and placement.get('include_keyword'):
        where = POSITION_KO.get(placement.get('best_position'), '제목 앞부분')
        lines.append(f"- 주제 키워드를 {where}에 넣습니다.")

    content_len = _rule(guide, 'content', 'length')
    if content_len:
        lines.append(f"- 본문은 {content_len['min']}~{content_len['max']}자로 씁니다.")

    heading = _rule(guide, 'content', 'structure', 'heading_count')
    if heading:
        lines.append(f"- 소제목을 {heading['min']}개 이상 {heading['max']}개 이하로 나눕니다.")

    density = _rule(guide, 'content', 'structure', 'keyword_density')
    if density:
        lines.append(
            f"- 주제 키워드는 1,000자당 {density['min']}~{density['max']}회 정도로 씁니다. "
            f"억지로 반복하지 마세요."
        )

    images = _rule(guide, 'media', 'images')
    if images:
        lines.append(
            f"- 사진이 들어갈 자리에 [이미지] 라고만 적어주세요. "
            f"{images['min']}~{images['max']}군데가 적당합니다."
        )

    return lines


def build_prompt(keyword: str,
                 sub_keywords: Optional[List[str]] = None,
                 guide: Optional[Dict] = None,
                 category: str = '',
                 audience: str = '') -> str:
    """
    최종 프롬프트를 조립한다. 이 문자열이 그대로 Gemini 입력창에 들어간다.
    """
    guide = guide or {}
    sub_keywords = [k for k in (sub_keywords or []) if k and k != keyword]
    data_driven = guide.get('status') == 'data_driven'

    parts: List[str] = []

    parts.append(
        "네이버 블로그에 올릴 글을 한 편 써주세요.\n"
        "실제로 경험하고 확인한 사람이 쓴 것처럼, 구체적인 상황과 수치를 담아 써주세요."
    )

    topic = [f"주제 키워드: {keyword}"]
    if sub_keywords:
        topic.append("함께 다룰 키워드: " + ', '.join(sub_keywords))
    if category:
        topic.append(f"분야: {category}")
    if audience:
        topic.append(f"읽는 사람: {audience}")
    parts.append('[주제]\n' + '\n'.join(topic))

    spec_lines = build_spec_lines(guide)
    if spec_lines:
        if data_driven:
            sample = guide.get('sample_count', 0)
            head = (
                f"[분량과 구성]\n"
                f"이 주제로 실제 상위 노출된 글 {sample}개를 분석한 결과입니다. "
                f"아래 범위를 지켜주세요."
            )
        else:
            # ★근거가 약한 기본값이다. "지켜라" 가 아니라 "참고하라" 로 낮춘다.
            head = (
                "[분량과 구성 — 참고]\n"
                "아직 이 분야의 상위 글 데이터가 부족해 일반적인 기준입니다. "
                "참고만 하고 내용에 맞게 조정해도 됩니다."
            )
        parts.append(head + '\n' + '\n'.join(spec_lines))

    parts.append(MOBILE_FORMAT_RULES)

    # 네이버가 명시한 제재 대상(스팸 안내) — 생성 단계에서 막는다
    parts.append(
        "[하지 말아야 할 것]\n"
        "- 실제 명칭 대신 검색량이 많은 다른 단어로 바꿔 쓰지 마세요. 제재 대상입니다.\n"
        "- 확인하지 않은 사실을 단정하지 마세요.\n"
        "- 효과나 결과를 보장하는 표현을 쓰지 마세요.\n"
        "- 같은 문장을 반복하거나 분량을 채우려고 늘려 쓰지 마세요."
    )

    parts.append(
        "[출력 형식]\n"
        "첫 줄에 '제목: ' 으로 시작하는 제목만 씁니다.\n"
        "그 다음 줄부터 본문을 씁니다.\n"
        "설명이나 인사말은 붙이지 말고 제목과 본문만 출력해주세요."
    )

    return '\n\n'.join(parts)


def parse_output(text: str) -> Dict[str, str]:
    """
    Gemini 수확 텍스트 → {title, body}.
    '제목:' 형식을 못 지킨 경우엔 첫 줄을 제목으로 본다(생성이 형식을 자주 흘린다).
    """
    if not text:
        return {'title': '', 'body': ''}

    lines = text.replace('\r\n', '\n').split('\n')
    title = ''
    body_start = 0

    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if s.startswith('제목:') or s.startswith('제목 :'):
            title = s.split(':', 1)[1].strip()
            body_start = i + 1
        else:
            # 마크다운 제목(# 제목) 또는 그냥 첫 줄
            title = s.lstrip('#').strip().strip('*')
            body_start = i + 1
        break

    body = '\n'.join(lines[body_start:]).strip()
    return {'title': title, 'body': body}
