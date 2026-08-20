# -*- coding: utf-8 -*-
"""
모바일 서식 강제 — 설계서 §7-4.

네이버 블로그 트래픽은 대부분 모바일이다. PC 에서 멀쩡한 문단이 모바일에서는
8~10줄 벽이 된다. 그래서 이건 "예쁘게 다듬기" 가 아니라 발행 전 통과해야 하는 게이트다.

규칙
  R1 한 문장 = 한 줄
  R2 한 줄 목표 25자, 최대 35자
  R3 35자 초과 줄은 분할 (쉼표 → 접속사 → 어절 경계 순)
  R4 문단은 최대 3줄, 넘으면 빈 줄
  R5 빈 줄은 1줄만
  R6 소제목 앞뒤로 빈 줄
  R7 도입부는 3줄 이내로 끊고 빈 줄 (R4 로 자연히 충족)
  R8 목록은 항목마다 개행, 항목 사이 빈 줄 없음
  R9 이미지 앞뒤로 빈 줄

★멱등성이 핵심이다. reflow(reflow(x)) == reflow(x) 가 성립하지 않으면
  재생성 루프를 돌 때마다 서식이 흔들린다. tests/test_autopost_reflow.py 가 이걸 검증한다.

멱등성을 보장하는 방법:
  · 본문은 "빈 줄로 끊긴 덩어리" 단위로 다시 합쳤다가 문장으로 재분할한다.
    출력의 한 문단은 최대 3줄이고, 그 3줄을 다시 합쳐 쪼개면 같은 3줄이 나온다.
  · 분할 지점 선택은 결정적이다(같은 입력 → 같은 분할).
  · 소제목·목록·인용·이미지 줄은 절대 건드리지 않는다.
"""
import re
from typing import List

TARGET_LINE = 25      # R2 목표
MAX_LINE = 35         # R2 상한
MAX_PARA_LINES = 3    # R4
# 문장 하나가 이 줄 수까지는 쪼개지 않고 통째로 한 문단에 둔다 (_pack_paragraphs 주석 참조)
SENTENCE_PARA_LIMIT = 4

# ── 줄 종류 판정 ─────────────────────────────────────────────
RE_HEADING_MD = re.compile(r'^\s*#{1,6}\s+\S')
RE_HEADING_BOLD = re.compile(r'^\s*\*\*[^*]+\*\*\s*$')
RE_HEADING_BRACKET = re.compile(r'^\s*[\[【]([^\]】]+)[\]】]\s*$')
RE_LIST = re.compile(r'^\s*(?:[-*•·▪]|\d+[.)])\s+\S')
RE_QUOTE = re.compile(r'^\s*>\s?')
RE_IMAGE = re.compile(r'^\s*\[이미지[^\]]*\]\s*$')

# R3 분할에 쓰는 접속 표현. 이 표현 "앞" 에서 끊는다.
CONNECTIVES = [
    '그리고', '하지만', '그래서', '그러나', '그런데', '따라서', '또한',
    '특히', '즉', '반면', '게다가', '다만', '왜냐하면',
]
# '때문에' 는 앞 절 끝에 붙으므로 뒤에서 끊는다.
CONNECTIVES_AFTER = ['때문에', '덕분에']

# 문장 종결: 마침표/물음표/느낌표/줄임표 뒤. 소수점·영문 약어는 뒤에 공백이 없으면 통과.
RE_SENTENCE = re.compile(r'(?<=[.!?…])(?=\s|$)')


def _is_image(line: str) -> bool:
    return bool(RE_IMAGE.match(line))


def _is_heading(line: str) -> bool:
    if _is_image(line):
        return False
    return bool(
        RE_HEADING_MD.match(line)
        or RE_HEADING_BOLD.match(line)
        or RE_HEADING_BRACKET.match(line)
    )


def _is_list(line: str) -> bool:
    return bool(RE_LIST.match(line))


def _is_quote(line: str) -> bool:
    return bool(RE_QUOTE.match(line))


def _is_special(line: str) -> bool:
    """건드리지 않는 줄 — 소제목·목록·인용·이미지"""
    return _is_heading(line) or _is_list(line) or _is_quote(line) or _is_image(line)


# ── R3: 긴 줄 분할 ───────────────────────────────────────────
def _best_break(text: str, candidates: List[int]) -> int:
    """TARGET_LINE 에 가장 가까우면서 양쪽 모두 살아남는 분할점. 없으면 -1."""
    best, best_cost = -1, None
    for pos in candidates:
        left, right = text[:pos].strip(), text[pos:].strip()
        if not left or not right:
            continue
        # 왼쪽이 상한을 넘으면 의미가 없다(어차피 또 쪼개야 함)
        cost = abs(len(left) - TARGET_LINE)
        if len(left) > MAX_LINE:
            cost += 1000
        if best_cost is None or cost < best_cost:
            best, best_cost = pos, cost
    return best


def _split_long(text: str, depth: int = 0) -> List[str]:
    """35자 초과 줄을 쉼표 → 접속사 → 어절 경계 순으로 쪼갠다."""
    text = text.strip()
    if len(text) <= MAX_LINE or depth > 6:
        return [text] if text else []

    # 1순위: 쉼표 (쉼표는 왼쪽에 남긴다)
    cands = [m.end() for m in re.finditer(r'[,，]\s*', text)]
    pos = _best_break(text, cands)

    # 2순위: 접속사 앞
    if pos < 0:
        cands = []
        for word in CONNECTIVES:
            for m in re.finditer(r'(?<=\s)' + re.escape(word), text):
                cands.append(m.start())
        pos = _best_break(text, cands)

    # 3순위: '때문에' 류 뒤
    if pos < 0:
        cands = []
        for word in CONNECTIVES_AFTER:
            for m in re.finditer(re.escape(word) + r'(?=\s)', text):
                cands.append(m.end())
        pos = _best_break(text, cands)

    # 4순위: 어절(공백) 경계
    if pos < 0:
        cands = [m.start() for m in re.finditer(r'\s', text)]
        pos = _best_break(text, cands)

    # 끊을 곳이 없다 — 공백 없는 긴 토큰. 그대로 둔다(강제로 자르면 단어가 깨진다)
    if pos < 0:
        return [text]

    left, right = text[:pos].strip(), text[pos:].strip()
    return _split_long(left, depth + 1) + _split_long(right, depth + 1)


def _to_sentence_lines(paragraph_text: str) -> List[List[str]]:
    """
    본문 덩어리 → 문장별 줄 묶음. [[문장1의 줄들], [문장2의 줄들], ...]

    문장 단위로 유지하는 이유: R4(문단 3줄)를 적용할 때 줄 수만 세어 자르면
    문장 한가운데에 빈 줄이 들어간다("…피하시는 것이 / (빈 줄) / 좋고…").
    모바일에서 그건 벽보다 더 안 읽힌다.
    """
    parts = [p.strip() for p in RE_SENTENCE.split(paragraph_text) if p.strip()]
    result: List[List[str]] = []
    for sentence in parts:
        lines = [l for l in _split_long(sentence) if l]
        if lines:
            result.append(lines)
    return result


def _pack_paragraphs(sentences: List[List[str]]) -> List[List[str]]:
    """
    문장 묶음을 문단(최대 3줄)으로 채운다. 문단 경계는 항상 문장 경계다.

    ★R4 를 한 줄 양보하는 경우: 문장 하나가 4줄일 때는 쪼개지 않고 4줄 문단으로 둔다.
      R4(3줄)와 문장 무결성이 충돌하면 문장을 지키는 쪽이 읽힌다 —
      문장 한가운데 빈 줄이 들어가면 벽보다 더 안 읽힌다.
      가독성 게이트(§7-3 wall_of_text)는 5줄부터 잡으므로 4줄은 여전히 통과한다.
      5줄 이상이면 그때는 어쩔 수 없이 문장 안에서 끊는다.
    """
    paragraphs: List[List[str]] = []
    current: List[str] = []

    for lines in sentences:
        if len(lines) > SENTENCE_PARA_LIMIT:
            # 문장 하나가 문단 한도를 넘는다 — 단독 문단으로 두고 내부에서만 끊는다
            if current:
                paragraphs.append(current)
                current = []
            for i in range(0, len(lines), MAX_PARA_LINES):
                paragraphs.append(lines[i:i + MAX_PARA_LINES])
            continue

        if len(current) + len(lines) > MAX_PARA_LINES:
            # ★current 가 비어 있을 때 그대로 append 하면 빈 문단이 끼어
            #   빈 줄이 2연속으로 나온다(R5 위반). 4줄짜리 문장이 문단 첫머리에
            #   올 때 실제로 발생했다.
            if current:
                paragraphs.append(current)
            current = []
        current.extend(lines)

    if current:
        paragraphs.append(current)
    return paragraphs


# ── 본체 ────────────────────────────────────────────────────
def reflow_for_mobile(body: str) -> str:
    """
    R1~R9 를 강제한다. 멱등이므로 이미 서식이 맞는 글에 다시 돌려도 결과가 같다.
    소제목·목록·인용·이미지 줄은 원문 그대로 보존한다.
    """
    if not body:
        return ''

    raw_lines = body.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    # 1) 블록으로 묶는다. 연속된 본문 줄은 한 덩어리로 다시 합친다(멱등성의 근거).
    blocks: List[dict] = []
    buffer: List[str] = []

    def flush_text():
        if buffer:
            blocks.append({'kind': 'text', 'text': ' '.join(buffer)})
            buffer.clear()

    for line in raw_lines:
        stripped = line.strip()
        if not stripped:
            flush_text()
            continue
        if _is_special(stripped):
            flush_text()
            kind = ('image' if _is_image(stripped)
                    else 'list' if _is_list(stripped)
                    else 'quote' if _is_quote(stripped)
                    else 'heading')
            blocks.append({'kind': kind, 'text': stripped})
        else:
            buffer.append(stripped)
    flush_text()

    # 2) 블록을 줄 묶음으로 전개
    out: List[List[str]] = []   # 각 원소 = 빈 줄 없이 붙는 줄 묶음
    prev_kind = None
    for block in blocks:
        kind = block['kind']
        if kind == 'text':
            # R4: 최대 3줄. 단 끊는 자리는 문장 경계여야 한다.
            for paragraph in _pack_paragraphs(_to_sentence_lines(block['text'])):
                out.append(paragraph)
        elif kind == 'list':
            # R8: 항목끼리는 빈 줄 없이 붙인다
            if prev_kind == 'list' and out:
                out[-1].append(block['text'])
            else:
                out.append([block['text']])
        else:
            # heading(R6) · image(R9) · quote — 각각 독립 묶음이라 앞뒤로 빈 줄이 생긴다
            out.append([block['text']])
        prev_kind = kind

    # 3) 묶음 사이에 빈 줄 하나 (R5 — 연속 빈 줄이 생길 수 없는 구조)
    result: List[str] = []
    for i, group in enumerate(out):
        if i:
            result.append('')
        result.extend(group)

    return '\n'.join(result).strip()


def check_mobile_format(body: str) -> dict:
    """
    발행 전 게이트용 진단. reflow 를 거치면 전부 통과해야 정상이다.
    (§7-3 가독성 게이트가 이 값들을 쓴다)
    """
    lines = body.split('\n')
    content = [l for l in lines if l.strip()]
    paragraphs, current = [], []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            paragraphs.append(current)
            current = []
    if current:
        paragraphs.append(current)

    long_lines = [l for l in content if len(l.strip()) > MAX_LINE and not _is_special(l.strip())]
    para_sizes = [len(p) for p in paragraphs] or [0]

    return {
        'line_count': len(content),
        'avg_line_chars': round(sum(len(l.strip()) for l in content) / max(1, len(content)), 1),
        'long_line_ratio': round(len(long_lines) / max(1, len(content)), 3),
        'max_para_lines': max(para_sizes),
        'wall_of_text': any(size >= 5 for size in para_sizes),
        'blank_line_ratio': round(
            sum(1 for l in lines if not l.strip()) / max(1, len(lines)), 3
        ),
        'has_double_blank': '\n\n\n' in body,
    }
