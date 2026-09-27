# -*- coding: utf-8 -*-
"""두비전 B2C — 네이버 자동완성 BFS (학부모가 '치기 시작한 문장').

연관키워드와 자동완성은 다른 채널이다. 연관키워드는 '같이 검색되는 것',
자동완성은 '사람이 실제로 치기 시작한 문장'이다. 학부모 고민은 문장으로 들어온다 —
'공부해도성적이안올라요' 같은 말은 keywordstool 연관에 잘 안 뜬다.

2단계: (1) collect — 자동완성만으로 후보 수집(외부 API 부하 없음)
       (2) measure — keywordstool 로 실검색량 측정, 0 은 버린다.
"""
import json, os, sys, time, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CAND = os.path.join(HERE, "_dv_deep_ac_cand.json")
RAW = os.path.join(HERE, "_dv_deep_ac_vol.json")
ROUNDS = int(os.environ.get("ROUNDS", "3"))
MAX_AC = int(os.environ.get("MAX_AC", "2500"))

SEEDS = [
    # 방법 — 두비전이 파는 것
    "암기법", "기억법", "암기잘하는법", "빨리외우는법", "외우는법", "기억력향상",
    "기억력훈련", "영단어암기법", "한국사암기법", "연상암기법", "이미지기억법",
    "마인드맵", "속독", "망각곡선", "장기기억",
    "공부잘하는법", "공부방법", "효율적인공부법", "공부법", "학습법", "시험공부법",
    "중간고사공부법", "내신공부법", "메타인지", "메타인지학습법", "인출연습",
    "노트필기법", "오답노트", "공부계획표", "공부습관", "자기주도학습",
    # 고통 — 학부모가 밤에 치는 말
    "공부해도성적이안올라", "성적이안올라", "성적안오르는이유", "아무리공부해도",
    "돌아서면까먹", "금방까먹", "기억을못해", "머리가나쁜걸까", "우리아이머리",
    "공부못하는아이", "공부안하는아이", "공부싫어하는아이", "공부시키는법",
    "이해력이부족한아이", "문해력부족", "어휘력부족", "책을안읽는아이",
    "산만한아이", "집중을못하는아이", "가만히못있는아이", "집중력떨어지는이유",
    "학습부진아", "기초학력부진", "학습태도",
    # 진단·검사
    "인지능력검사", "학습능력검사", "학습유형검사", "지능검사", "웩슬러지능검사",
    "풀배터리검사", "종합심리검사", "뇌기능검사", "주의력검사", "다중지능검사",
    "난독증", "난독증검사", "학습장애", "경계선지능", "느린학습자", "adhd아이",
    # 해결책 탐색
    "학습클리닉", "학습센터", "학습코칭", "학습컨설팅", "공부방법학원", "학습상담",
    "두뇌훈련", "두뇌개발", "브레인트레이닝", "뇌교육", "인지훈련", "학습치료",
    "집중력학원", "기억력학원", "암기법학원", "속독학원", "자기주도학습학원",
    # 유아·키즈(3~8세)
    "유아두뇌개발", "유아인지발달", "유아집중력", "한글떼기", "예비초등",
    "초등입학준비", "영재교육", "창의사고력", "유아기억력",
    # 경쟁·대체
    "눈높이", "구몬학습", "빨간펜", "웅진씽크빅", "재능교육", "아이스크림홈런",
    "밀크티학습", "엘리하이", "한우리독서논술", "와이즈만", "시매쓰", "소마셈",
    "학습지추천", "공부방추천", "학습지비교",
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


def collect():
    from dovision_deep_classify import classify
    seen_q, found = set(), set()
    frontier, calls, t0 = list(SEEDS), 0, time.time()
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
                    # 온도메인만 다시 질의한다 — 아니면 자동완성이 딴 동네로 새 나간다
                    if classify(sn)[0] is not None:
                        nxt.append(s)
            calls += 1
            time.sleep(0.2)
        print(f"[r{rnd}] 질의 {calls} → 후보 {len(found):,} (다음 프론티어 {len(nxt):,}) "
              f"{time.time()-t0:.0f}s", flush=True)
        json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
        frontier = nxt
        if calls >= MAX_AC or not frontier:
            break
    json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"수집 완료 {len(found):,} → {CAND}")


def measure():
    from dv_kt import keywordstool
    cand = json.load(open(CAND, encoding="utf-8"))
    vol = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
    todo = [c for c in cand if c not in vol]
    print(f"볼륨 측정 {len(todo):,}개 (기존 {len(vol):,})", flush=True)
    for i in range(0, len(todo), 5):
        chunk = todo[i:i + 5]
        try:
            got = {r["kw"]: r["total"] for r in keywordstool(chunk)}
        except Exception:
            got = {}
        for c in chunk:
            vol[c] = got.get(c, 0)
        if (i // 5) % 50 == 0:
            json.dump(vol, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  {i}/{len(todo)}", flush=True)
    json.dump(vol, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    live = sorted(((v, k) for k, v in vol.items() if v >= 10), reverse=True)
    print(f"\n자동완성 후보 {len(vol):,} → 실검색량 10+ {len(live):,}개")
    print("상위 40: " + ", ".join(f"{k}({v:,})" for v, k in live[:40]))


if __name__ == "__main__":
    (measure if "--measure" in sys.argv else collect)()
