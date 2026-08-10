"""
키워드 ↔ 업장 연관도 (0~100)
============================

"이 키워드가 우리 회사와 관련이 있는가"를 점수로 답한다.

출처
----
`routers/naver_ad.py::_compute_relevance_score` 와 **동일 알고리즘**이다.
그쪽은 광고 키워드 등록 게이트로 6개 광고주 계정에서 실전 검증됐다.
여정 맵 파이프라인이 그 함수를 쓰려면 12,000줄짜리 라우터를 import 해야 해서
순수 로직만 여기로 뽑았다.

⚠ 지금은 두 곳에 같은 코드가 있다. 배포 여유가 생기면
   `routers/naver_ad.py` 가 이 모듈을 import 하도록 바꿔 중복을 없앨 것.
   (naver_ad.py 는 현재 워킹트리에 미커밋 변경이 있어 지금 건드리지 않는다)

점수가 뜻하는 것 — 그리고 뜻하지 않는 것
----------------------------------------
이 점수는 **도메인 연관도**다. **구매 의도가 아니다.** 둘은 다른 축이고 둘 다 필요하다.

    여드름연고    → 연관도 100 (우리 도메인 맞다)  ·  하지만 약국 수요일 수 있다
    포텐자후기    → 연관도 100                    ·  그리고 병원 방문 직전이다

연관도는 "우리 얘기인가"를 재고, 여정 단계는 "얼마나 살 준비가 됐나"를 잰다.
연관도만으로 키워드를 고르면 약국 검색자에게 병원 글을 쓰게 된다.

⚠ 이 점수는 **느슨하다**. 2글자 원자가 5점씩 쌓여서 무관한 키워드가 문턱을 넘는다.
   해울 계정에서 실제로 이 경로로 오염이 통과한 전례가 있다
   (explode 는 앵커로 엄격, register 는 이 점수로 느슨 → 우회로가 뚫림).
   그래서 **하드 게이트는 anchor 로, 이 점수는 정렬·표시용으로** 쓰는 게 맞다.
"""

from typing import List, Sequence, Tuple

MAX_3PLUS = 80      # 3글자 이상 원자 매칭 상한
MAX_2GRAM = 30      # 2글자 원자 매칭 상한 (약한 신호)
MAX_POOL = 15       # 간접 풀 토큰 상한
CAP = 95            # 100 은 seed 전체 매칭 전용


def relevance_score(kw: str, user_seeds: Sequence[str],
                    pool_tokens: Sequence[str] = ()) -> int:
    """키워드의 업장 도메인 연관성 (0~100).

    100 : kw 가 seed 전체를 품음   (`강남오피스텔매매` ← seed `오피스텔매매`)
     95 : seed 가 kw 전체를 품음   (kw 가 더 짧음)
    0-95: 원자 매칭 가중 합
          · 3글자 이상 원자 20pt × N (max 80) — 강한 도메인 신호
          · 2글자 원자      5pt × N (max 30) — 약한 신호(브로드)
          · 풀 토큰         3pt × N (max 15) — 간접 어시스트
    """
    if not kw:
        return 0

    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        if s in kw:
            return 100
        if kw in s:
            return 95

    atoms_3plus, atoms_2 = set(), set()
    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        if len(s) >= 4:
            atoms_3plus.add(s)
        for n in (2, 3):
            for i in range(len(s) - n + 1):
                a = s[i:i + n]
                (atoms_2 if len(a) == 2 else atoms_3plus).add(a)

    n_3 = sum(1 for a in atoms_3plus if a in kw)
    n_2 = sum(1 for a in atoms_2 if a in kw)
    n_pool = sum(1 for t in pool_tokens if t in kw)

    score = min(MAX_3PLUS, n_3 * 20) + min(MAX_2GRAM, n_2 * 5) + min(MAX_POOL, n_pool * 3)
    return min(CAP, score)


def explain(kw: str, user_seeds: Sequence[str]) -> Tuple[int, List[str]]:
    """점수와 함께 '무엇 때문에 그 점수인지'를 돌려준다.

    화면에 점수만 띄우면 원장님은 못 믿는다. 근거가 같이 나가야 한다.
    """
    sc = relevance_score(kw, user_seeds)
    hits: List[str] = []
    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        if s in kw or kw in s:
            return sc, [s]
    seen = set()
    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        cands = ([s] if len(s) >= 4 else []) + [
            s[i:i + n] for n in (3, 2) for i in range(len(s) - n + 1)
        ]
        for a in cands:
            if len(a) >= 3 and a in kw and a not in seen:
                seen.add(a)
                hits.append(a)
    return sc, hits[:4]
