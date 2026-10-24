# -*- coding: utf-8 -*-
"""3차 축 롱테일 BFS + 정밀도 등급 분류.

probe 로 살아있다고 확인된 축만 판다. 볼륨이 크다고 다 넣지 않는다 —
'학점은행제(135,700)'는 대학 학위를 따려는 사람이고, '베이비페어(86,400)'는 학부모이며,
'아프니까사장이다(83,400)'는 업종 불문 자영업자다. 두비전 가맹 상담과는 거리가 멀다.

등급:
  S = 두비전 사업 실행 직전 (학원매매·정보공개서·늘봄강사)
  A = 페르소나 정확 (제2의직업·홈스쿨링·방문교육)
  B = 창업 의지는 확실하나 업종 불문 (예비창업패키지·창업대출) → 별도 캠페인·저예산
  X = 제외 (학점은행제·베이비페어·아프니까사장이다·가맹거래사)
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402

RAW = os.path.join(HERE, "_dovision_axis3_raw.json")
INSERT_URL = ("https://blog-index-analyzer.fly.dev/api/naver-ad/"
              "keyword-pool/admin/insert-exact?user_id=1")
CID = "4403292"
MIN_VOL = 10
ROUNDS = int(os.environ.get("ROUNDS", "2"))

# probe 에서 살아남은 것 중 '팔 가치가 있는' 앵커만
SEEDS = [
    # A 학원 매물·임대 (S)
    "학원매매", "학원매물", "학원임대", "학원권리금", "학원상가", "학원부동산", "교습소매매",
    "학원매매사이트", "학원인수매매", "학원자리", "학원매각",
    # B 프랜차이즈 검증 (S) — 가맹거래사는 자격증 준비생이라 뺀다
    "정보공개서", "가맹사업정보제공시스템", "가맹계약해지", "가맹점주협의회",
    # C 늘봄·방과후 정책 (S)
    "늘봄강사", "늘봄학교강사", "방과후학교", "방과후프로그램", "초등돌봄교실",
    "방과후학교강사", "방과후학교프로그램", "교육청위탁",
    # D 제2의직업 (A)
    "제2의직업", "인생2막", "인생이모작", "전직", "퇴직후창업", "퇴직후자격증", "퇴직후직업",
    "중년창업", "중년일자리", "노후준비", "평생직업", "40대이직", "50대이직",
    # J 교육사업 형태 (A)
    "홈스쿨링", "방문미술", "방문교육", "방문수학", "방문독서", "교구수업", "출강수업",
    # F 온라인 형태 (A)
    "온라인공부방", "온라인클래스", "온라인교육플랫폼", "줌수업",
    # G 교육 전시 (A) — 베이비페어는 학부모 행사라 뺀다
    "유아교육전", "교육박람회", "에듀테크박람회", "학원박람회", "교구박람회",
    # I 정부 창업지원 (B) — 업종 불문. 등급 낮춰 별도 취급.
    "예비창업패키지", "신사업창업사관학교", "여성창업대출", "소상공인창업자금", "창업자금대출",
    "여성기업확인서", "재도전성공패키지",
    # E 자격 경로 (B) — 광의. 지도사 쪽으로 좁혀지는 것만 회수한다.
    "민간자격증", "민간자격등록", "자격증발급", "원격평생교육원",
]

# ── 등급 판정 ──────────────────────────────────────────────────────
S_TOK = ("학원매매", "학원매물", "학원임대", "학원권리금", "학원상가", "학원부동산", "학원자리",
         "학원매각", "학원거래", "교습소매매", "교습소매물", "교습소임대", "공부방매물",
         "학원인수", "학원양도", "정보공개서", "가맹사업정보", "가맹계약", "가맹점주",
         "늘봄", "방과후학교", "방과후프로그램", "초등돌봄", "돌봄교실", "교육청위탁",
         "방과후강사", "방과후교사")
A_TOK = ("제2의직업", "인생2막", "인생이모작", "이모작", "퇴직후", "중년창업", "중년일자리",
         "평생직업", "전직", "40대이직", "50대이직", "홈스쿨", "방문미술", "방문교육",
         "방문수학", "방문독서", "방문수업", "교구수업", "출강", "온라인공부방", "온라인교습소",
         "화상공부방", "유아교육전", "교육박람회", "에듀테크박람회", "학원박람회", "교구박람회",
         "노후준비")
B_TOK = ("예비창업패키지", "초기창업패키지", "창업사관학교", "재도전성공패키지", "창업진흥원",
         "소상공인시장진흥공단", "창업대출", "창업자금", "여성기업", "창업기업확인",
         "민간자격", "자격증발급", "평생교육원", "자격증등록", "온라인자격증")
# 절대 제외 — 볼륨은 크지만 두비전 가맹과 거리가 멀다
X_TOK = ("학점은행", "베이비페어", "아프니까사장", "가맹거래사", "학위", "편입", "대학원",
         "국가공인자격증", "공무원", "요양", "노인", "실버", "치매", "간호", "사회복지",
         "보육교사", "한국어교원", "부동산중개", "공인중개사", "경매", "분양", "아파트",
         "치킨", "카페", "커피", "피자", "무인", "편의점", "빨래방", "미용", "네일", "펫",
         "헬스", "필라테스", "주식", "코인", "보험", "대출상담", "대환", "신용", "파산",
         "회생", "채무", "이력서", "자소서", "면접", "실업급여", "알바")


def grade(kw: str):
    c = kw.replace(" ", "").lower()
    if len(c) >= 20:
        return None
    if any(t in c for t in X_TOK):
        return None
    if any(t in c for t in S_TOK):
        return "S"
    if any(t in c for t in A_TOK):
        return "A"
    if any(t in c for t in B_TOK):
        return "B"
    return None


def push(items):
    body = json.dumps({"customer_id": CID, "items": items, "min_volume": MIN_VOL,
                       "source": "axis3_2026-09"}).encode("utf-8")
    for att in range(4):
        try:
            req = urllib.request.Request(INSERT_URL, data=body, method="POST",
                                         headers={"Content-Type": "application/json; charset=utf-8"})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            print(f"    push 시도{att+1} 실패: {e}", flush=True)
            time.sleep(4 * (att + 1))
    return None


def main():
    pool = {}
    seen = set()
    frontier = list(SEEDS)
    t0 = time.time()
    calls = 0
    for rnd in range(1, ROUNDS + 1):
        nxt = []
        for kw in frontier:
            if kw in seen:
                continue
            seen.add(kw)
            for r in keywordstool([kw]):
                k, v = r["kw"], r["total"]
                if k in pool:
                    continue
                pool[k] = {"total": v, "pc": r["pc"], "mo": r["mo"], "comp": r["comp"]}
                if v >= MIN_VOL and grade(k) and k not in seen:
                    nxt.append(k)
            calls += 1
        keep = sum(1 for k, v in pool.items() if v["total"] >= MIN_VOL and grade(k))
        print(f"[r{rnd}] 질의 {calls} → 원장 {len(pool):,} / 채택 {keep:,} ({time.time()-t0:.0f}s)",
              flush=True)
        frontier = nxt[:400]   # 라운드당 확장 상한
        if not frontier:
            break

    json.dump(pool, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    rows = [(v["total"], k, grade(k), v) for k, v in pool.items()
            if v["total"] >= MIN_VOL and grade(k)]
    rows.sort(reverse=True, key=lambda x: (x[2], x[0]))
    by = {}
    for t, k, g, v in rows:
        by.setdefault(g, []).append((t, k))
    print(f"\n채택 {len(rows):,}개 / 월검색합 {sum(r[0] for r in rows):,}")
    for g in ("S", "A", "B"):
        lst = sorted(by.get(g, []), reverse=True)
        if not lst:
            continue
        print(f"\n■ {g}등급 {len(lst)}개 / {sum(x[0] for x in lst):,}회")
        print("   " + ", ".join(f"{k}({t:,})" for t, k in lst[:25]))

    items = [{"keyword": k, "monthly_total": v["total"], "monthly_pc": v["pc"],
              "monthly_mobile": v["mo"], "comp_idx": v["comp"] or None}
             for t, k, g, v in rows]
    added = requeued = 0
    for i in range(0, len(items), 40):
        r = push(items[i:i + 40])
        if r:
            added += r.get("added") or 0
            requeued += r.get("requeued") or 0
        time.sleep(1.2)
    print(f"\n업로드 — 신규 {added} / requeue {requeued} / 총 {len(items)}")


if __name__ == "__main__":
    main()
