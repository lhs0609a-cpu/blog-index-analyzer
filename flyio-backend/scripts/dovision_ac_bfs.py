# -*- coding: utf-8 -*-
"""두비전 B2B — 네이버 자동완성 BFS.

왜 필요한가: keywordstool 연관키워드와 자동완성은 **다른 채널**이다. 연관키워드는
'같이 검색되는 것'이고 자동완성은 '사람이 실제로 치기 시작한 문장'이다. 1차 딥리서치를
keywordstool 로만 돌린 결과, 자동완성에만 있는 것들을 통째로 놓쳤다 —
  · 아파트공부방창업 / 공부방창업하기
  · 학원창업대출 / 학원창업지원금 / 학원창업정부지원금 / 학원창업절차
  · 교습소창업지원금 / 교습소창업절차 / 교습소학원차이
  · 푸르넷공부방 / 아소비공부방  ← 공부방 프랜차이즈 브랜드 축을 아예 안 세웠었다
  · 방과후지도사하는법 / 방과후지도사취업방법 / 독서지도사국가자격증

자동완성으로 BFS 하고, 나온 문장의 실검색량을 keywordstool 로 다시 재서 0 은 버린다.
출력: _dovision_ac_raw.json {키워드: 월검색량}
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402

RAW = os.path.join(HERE, "_dovision_ac_raw.json")
ROUNDS = int(os.environ.get("ROUNDS", "3"))
MAX_AC = int(os.environ.get("MAX_AC", "1200"))

SEEDS = [
    # 공부방·교습소·학원 창업 (본선)
    "공부방창업", "공부방차리", "공부방프랜차이즈", "공부방가맹", "공부방운영", "공부방홍보",
    "교습소창업", "교습소차리", "교습소등록", "교습소운영", "교습소학원차이",
    "학원창업", "학원개원", "학원인수", "학원양도", "학원경영", "학원원장", "학원컨설팅",
    "교육창업", "교육사업", "교육프랜차이즈", "교육가맹",
    # 공부방·학습지 프랜차이즈 브랜드 (자동완성이 알려준 빠진 축)
    "푸르넷공부방", "아소비공부방", "눈높이공부방", "재능공부방", "대교공부방", "셀파공부방",
    "참좋은공부방", "빨간펜공부방", "생각하는황소", "시매쓰", "소마셈", "와이즈만", "팩토",
    "필즈수학", "cms영재교육", "한우리독서논술", "기탄교육", "오르다", "가베",
    "구몬", "눈높이", "재능교육", "웅진씽크빅", "아이스크림홈런", "밀크티",
    # 가맹 접촉
    "가맹문의", "가맹상담", "가맹조건", "가맹비", "가맹점모집", "창업설명회", "사업설명회",
    "창업박람회", "프랜차이즈창업", "프랜차이즈박람회",
    # 지도사·자격
    "독서지도사", "독서논술지도사", "방과후지도사", "방과후강사", "학습코칭지도사",
    "몬테소리자격증", "가베지도사", "한자지도사", "초등수학지도사", "창의력지도사",
    # 페르소나
    "주부창업", "여성창업", "경단녀", "경력단절여성", "전업주부부업", "40대여성창업",
    "50대창업", "집에서할수있는일", "주부부업",
    # 현직·운영
    "원생모집", "학원홍보", "학원마케팅", "방과후위탁", "위탁교육",
]


def ac(q):
    """네이버 자동완성. 실패는 [] (없음 아님)."""
    u = ("https://ac.search.naver.com/nx/ac?q=" + urllib.parse.quote(q) +
         "&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0"
         "&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100")
    try:
        req = urllib.request.Request(u, headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://search.naver.com/"})
        d = json.load(urllib.request.urlopen(req, timeout=15))
    except Exception:
        return []
    out = []
    for grp in d.get("items") or []:
        for it in grp:
            if it and it[0]:
                out.append(it[0].strip())
    return out


def main():
    seen_q = set()
    found = set()
    frontier = list(SEEDS)
    calls = 0
    t0 = time.time()
    for rnd in range(1, ROUNDS + 1):
        nxt = []
        for q in frontier:
            if calls >= MAX_AC:
                break
            qn = q.replace(" ", "")
            if qn in seen_q:
                continue
            seen_q.add(qn)
            for s in ac(q):
                sn = s.replace(" ", "")
                if sn and sn not in found:
                    found.add(sn)
                    nxt.append(s)
            calls += 1
            time.sleep(0.25)
        print(f"[r{rnd}] 질의 {calls} → 누적 후보 {len(found):,} (+{len(nxt):,}) {time.time()-t0:.0f}s",
              flush=True)
        frontier = nxt
        if calls >= MAX_AC or not frontier:
            break

    # 실검색량 측정 — 자동완성은 '치는 문장'일 뿐 볼륨을 보장하지 않는다.
    cand = sorted(found)
    print(f"\n볼륨 측정 {len(cand):,}개...", flush=True)
    vol = {}
    for i in range(0, len(cand), 5):
        chunk = cand[i:i + 5]
        rows = keywordstool(chunk)
        got = {r["kw"]: r["total"] for r in rows}
        for c in chunk:
            vol[c] = got.get(c, 0)
        if (i // 5) % 40 == 0:
            print(f"  {i}/{len(cand)} 측정중 ({time.time()-t0:.0f}s)", flush=True)
    json.dump(vol, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    live = sorted(((v, k) for k, v in vol.items() if v >= 10), reverse=True)
    print(f"\n자동완성 후보 {len(cand):,} → 실검색량 10 이상 {len(live):,}개")
    print("상위 40: " + ", ".join(f"{k}({v:,})" for v, k in live[:40]))
    print("경로:", RAW)


if __name__ == "__main__":
    main()
