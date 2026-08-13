# -*- coding: utf-8 -*-
"""
키워드 판정층 P0 — 설계서 docs/AUTO_KEYWORD_ENGINE_SPEC.md §4-1.

이 모듈이 푸는 문제
    한국어는 띄어쓰기가 없어 부분일치가 원리적으로 안전하지 않다.
    프로덕션에서 실제로 이런 오판이 났다:
        코트러블      ← '코트'(의류) 로 잡혀 삭제 후보. 실제는 "코 트러블"(피부)
        치킨여드름    ← '치킨'
        골드PTT피부과 ← '골드'
        컨투어핏주사  ← '투어'(여행).  컨[투어]핏
        도곡성장      ← '곡성'(지역).  도[곡성]장 — 160개를 삼켰다
        파종기        ← '종기'
        어린선물섭취  ← '선물'. 실제는 "어린선"(피부병) + 물섭취
        경면주사팔찌  ← '팔찌'. 경면주사는 한약재
    사전을 키우는 방식으로는 못 따라잡는다. 한 세션에서만 4라운드 연속으로
    새 함정이 나왔다.

핵심 설계 두 가지

1) 위치 강도 — 한국어 복합명사는 **머리어가 뒤에 온다**.
   `하체비만청바지` 의 머리어는 청바지, `코트러블` 의 머리어는 트러블이다.
   그래서 문자열 끝(또는 공백·조사 직전)에 붙은 토큰만 STRONG 으로 본다.

2) 방향별 비대칭 — 틀렸을 때의 손해가 반대다.
       등록 판정: 잘못 넣으면 계정이 오염된다  → ON 을 STRONG 으로 요구
       삭제 판정: 잘못 지우면 되돌릴 수 없다   → OFF 를 STRONG 으로 요구
   양쪽 다 "의심스러우면 UNKNOWN". UNKNOWN 은 숨기지 않고 그대로 내보내
   SERP 판정층(설계서 §4-2)이 확정한다.
   ★"미분류 0%" 는 가짜 지표다 — 판정불가를 fallback 으로 삼키면 정확도를 과장하게 된다.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, List, Optional, Sequence, Set


class Verdict(str, Enum):
    ON = "on"            # 이 업장 것이 확실
    OFF = "off"          # 이 업장 것이 아님이 확실
    UNKNOWN = "unknown"  # 문자열만으로는 판정 불가 → SERP 층으로


class Mode(str, Enum):
    REGISTER = "register"  # 신규 등록/발굴 게이트 — 오염을 막는 쪽으로 보수적
    DELETE = "delete"      # 삭제 게이트 — 보존하는 쪽으로 보수적


# 토큰 뒤에 이것들이 오면 토큰이 끝난 것으로 본다(조사·접미).
# 완전하지 않다. 여기 없는 조사는 WEAK 로 떨어져 UNKNOWN 이 될 뿐이라 안전 방향이다.
_PARTICLES = (
    "의", "에", "은", "는", "이", "가", "을", "를", "과", "와", "도", "만",
    "용", "점", "원", "값", "비", "료", "권", "형", "별", "및",
    # 의학 접미 — 두피'염', 우울'증', 생리'통' 처럼 토큰 바로 뒤에 붙는다
    "염", "증", "통", "약", "과",
)

# ★한국어는 질환명이 **앞**, 일반명사가 **뒤**에 온다(여드름+흉터, 완선+치료).
#   그래서 "머리어는 뒤" 규칙만 쓰면 정작 도메인 신호를 버리게 된다.
#   구분 기준은 위치가 아니라 **뒤에 남은 게 아는 낱말인가**이다.
#       여드름흉터 → 뒤가 '흉터'(아는 낱말)  → 여드름은 온전한 낱말 = STRONG
#       코트러블   → 뒤가 '러블'(모르는 조각) → 코트는 더 긴 낱말의 앞부분 = WEAK
_GENERIC_HEADS = (
    "치료", "원인", "증상", "병원", "의원", "한의원", "클리닉", "비용", "가격",
    "후기", "추천", "방법", "종류", "효과", "부작용", "예방", "관리", "진단",
    "검사", "수술", "시술", "약", "연고", "샴푸", "제거", "흉터", "자국", "흔적",
    "완치", "재발", "초기", "말기", "환자", "전문", "잘하는곳", "명의", "상담",
    "예약", "가는곳", "어디", "이유", "차이", "비교",
)

_HANGUL_START = "가"
_HANGUL_END = "힣"


def _is_hangul(ch: str) -> bool:
    return _HANGUL_START <= ch <= _HANGUL_END


@dataclass
class Match:
    token: str
    start: int
    strong: bool


@dataclass
class Judgement:
    verdict: Verdict
    reason: str
    on_hits: List[Match] = field(default_factory=list)
    off_hits: List[Match] = field(default_factory=list)

    @property
    def needs_serp(self) -> bool:
        return self.verdict is Verdict.UNKNOWN


def find_matches(
    text: str,
    tokens: Iterable[str],
    vocab: Optional[Set[str]] = None,
) -> List[Match]:
    """
    토큰별 등장 위치와 강도.

    STRONG = 토큰이 **온전한 낱말 하나**로 끊긴다:
      · 문자열의 맨 끝이거나
      · 뒤가 한글이 아니거나(공백·영문·숫자·기호)
      · 뒤가 조사·의학접미(염·증·통…)이거나
      · **뒤에 남은 부분이 아는 낱말로 시작한다** (여드름|흉터, 완선|치료)

    WEAK = 뒤에 모르는 한글 조각이 이어진다 → 더 긴 낱말의 앞부분일 수 있다
           (코트|러블, 곡성 in 도곡성장)

    vocab 에는 anchors + traps + _GENERIC_HEADS 를 넘긴다.
    """
    out: List[Match] = []
    if not text:
        return out
    body = text.strip()
    known = set(vocab or ()) | set(_GENERIC_HEADS)

    for token in tokens:
        tok = (token or "").strip()
        if len(tok) < 2:      # 1글자 토큰은 오매칭이 너무 심하다
            continue
        start = 0
        while True:
            idx = body.find(tok, start)
            if idx < 0:
                break
            end = idx + len(tok)
            if end >= len(body):
                strong = True
            else:
                nxt = body[end]
                rest = body[end:]
                if not _is_hangul(nxt):
                    strong = True                      # 공백·숫자·영문·기호
                elif any(
                    rest.startswith(p) and (
                        len(rest) == len(p) or not _is_hangul(rest[len(p):len(p) + 1])
                    )
                    for p in _PARTICLES
                ):
                    strong = True
                else:
                    # 뒤에 남은 게 아는 낱말로 시작하면 이 토큰은 온전히 끊긴 것이다
                    strong = any(rest.startswith(w) for w in known if len(w) >= 2)
            out.append(Match(token=tok, start=idx, strong=strong))
            start = idx + 1
    return out


def judge(
    keyword: str,
    anchors: Sequence[str],
    traps: Sequence[str] = (),
    *,
    mode: Mode = Mode.REGISTER,
) -> Judgement:
    """
    키워드 하나를 판정한다.

    anchors — 이 업장 것임을 뜻하는 토큰 (피부, 여드름, 한의원 …)
    traps   — 이 업장 것이 아님을 뜻하는 토큰 (청바지, 항공권, 목걸이 …)
    """
    kw = (keyword or "").strip()
    if not kw:
        return Judgement(Verdict.OFF, "빈 문자열")

    vocab: Set[str] = set(anchors) | set(traps)
    on_hits = find_matches(kw, anchors, vocab)
    off_hits = find_matches(kw, traps, vocab)
    on_strong = [m for m in on_hits if m.strong]
    off_strong = [m for m in off_hits if m.strong]

    def _tok(ms: List[Match]) -> str:
        return ", ".join(sorted({m.token for m in ms}))

    if mode is Mode.REGISTER:
        # 넣는 판정 — 확실할 때만 넣는다.
        if off_hits:
            # 함정은 약해도 일단 막는다. 억울하면 SERP 가 풀어준다.
            if on_strong and not off_strong:
                return Judgement(
                    Verdict.UNKNOWN,
                    f"머리어는 업장 것({_tok(on_strong)})인데 함정어도 걸림({_tok(off_hits)})",
                    on_hits, off_hits,
                )
            return Judgement(Verdict.OFF, f"함정어 {_tok(off_hits)}", on_hits, off_hits)
        if on_strong:
            return Judgement(Verdict.ON, f"머리어 {_tok(on_strong)}", on_hits, off_hits)
        if on_hits:
            return Judgement(
                Verdict.UNKNOWN,
                f"업장 토큰이 낱말 앞부분에만 걸림({_tok(on_hits)}) — 더 긴 낱말일 수 있음",
                on_hits, off_hits,
            )
        return Judgement(Verdict.UNKNOWN, "업장 토큰 없음", on_hits, off_hits)

    # Mode.DELETE — 지우는 판정. 보존이 기본값이다.
    if on_hits:
        return Judgement(
            Verdict.ON,
            f"업장 토큰 {_tok(on_hits)} 포함 — 보존",
            on_hits, off_hits,
        )
    if off_strong:
        return Judgement(Verdict.OFF, f"머리어가 함정어 {_tok(off_strong)}", on_hits, off_hits)
    if off_hits:
        return Judgement(
            Verdict.UNKNOWN,
            f"함정어가 낱말 중간에만 걸림({_tok(off_hits)}) — 오삭제 위험",
            on_hits, off_hits,
        )
    return Judgement(Verdict.UNKNOWN, "판정 근거 없음", on_hits, off_hits)


def judge_batch(
    keywords: Iterable[str],
    anchors: Sequence[str],
    traps: Sequence[str] = (),
    *,
    mode: Mode = Mode.REGISTER,
) -> dict:
    """여러 개를 판정하고 분류해서 돌려준다. UNKNOWN 을 반드시 그대로 노출한다."""
    on: List[str] = []
    off: List[str] = []
    unknown: List[str] = []
    details = {}
    for kw in keywords:
        j = judge(kw, anchors, traps, mode=mode)
        details[kw] = j
        (on if j.verdict is Verdict.ON else off if j.verdict is Verdict.OFF else unknown).append(kw)
    total = max(1, len(details))
    return {
        "on": on,
        "off": off,
        "unknown": unknown,
        "details": details,
        "decided_rate": round((len(on) + len(off)) / total, 3),
        "serp_queue": unknown,   # 설계서 §4-2 로 넘길 대상
    }
