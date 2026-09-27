# -*- coding: utf-8 -*-
"""1차 딥리서치가 놓친 축들을 실측해서 계정에 넣는다.

무엇을 놓쳤나 (2026-09-03 점검):
  ① 자동완성 채널을 아예 안 썼다 — keywordstool 연관키워드는 '같이 검색되는 것'이고
     자동완성은 '사람이 치기 시작한 문장'이다. 다른 채널이라 겹치지 않는다.
  ② 경쟁 브랜드 × B2B — 1차에는 '가맹/창업/선생님' 접미만 붙였고 대부분 0 이라 BFS 가
     그 동네로 못 뻗었다. 실제로 치는 말은 '아소비공부방'·'푸르넷공부방창업'·'대교본사'.
  ③ 학원 경영·원장 축 (학원컨설팅·학원원장카페) — 축 자체를 안 세웠다.
  ④ 방과후·늘봄 위탁 축 (위탁교육·방과후위탁업체) — 축 자체를 안 세웠다.
  ⑤ 자기 브랜드 '두비전' — 가장 간절한데 목록에 없었다.

프랜차이즈 일반 축(창업 13,030 / 프랜차이즈 10,470 등 합 30,400)은 **의도적으로 제외**.
교육 앵커도 페르소나 앵커도 없어 두비전 가맹으로 이어질 확률이 낮고, 클릭 단가는 최고가다.
넣을지는 광고주 판단이 필요해 여기에 넣지 않았다.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402
from dovision_b2b_classify import classify  # noqa: E402
from dovision_b2b_final import EXCLUDE_SUBSTR  # noqa: E402

INSERT_URL = ("https://blog-index-analyzer.fly.dev/api/naver-ad/"
              "keyword-pool/admin/insert-exact?user_id=1")
CID = "4403292"
MIN_VOL = 10

BRANDS = ["푸르넷", "아소비", "셀파", "참좋은", "생각하는황소", "눈높이", "구몬", "재능", "대교",
          "빨간펜", "웅진씽크빅", "씽크빅", "아이스크림홈런", "밀크티", "한솔", "기탄", "시매쓰",
          "소마셈", "와이즈만", "팩토", "필즈", "cms", "한우리", "노벨과개미", "오르다", "가베",
          "프뢰벨", "몬테소리"]
BRAND_SUF = ["공부방", "공부방창업", "공부방가맹", "교습소", "창업", "가맹", "가맹비", "가맹문의",
             "프랜차이즈", "선생님", "교사모집", "지사", "본사", "학습관", "러닝센터",
             "방문교사", "원장", "지사모집", "가맹점", "개설"]

OWN = ["두비전", "두비전교육", "두비전학원", "두비전공부방", "두비전가맹", "두비전창업",
       "두비전사고력", "두비전수학", "두비전본사", "두비전가맹비", "두비전프랜차이즈"]
MGMT = ["학원경영", "학원원장", "학원장", "학원컨설팅", "학원원장카페", "학원세무", "학원회계",
        "학원행정", "학원노무", "교습소원장", "공부방원장", "원장모임", "학원운영노하우",
        "학원경영연구소", "학원매매", "교습소매매", "학원매물", "공부방매물"]
TRUST = ["위탁교육", "방과후위탁", "방과후위탁업체", "방과후업체", "방과후교육업체", "늘봄위탁",
         "늘봄업체", "늘봄프로그램업체", "돌봄위탁", "교육위탁", "수탁교육", "방과후강사파견",
         "방과후프로그램업체", "지역아동센터프로그램"]


def measure(cands):
    """실검색량 측정 — '< 10' 은 0. 자동완성/조합은 볼륨을 보장하지 않는다."""
    got = {}
    uniq = sorted({c.replace(" ", "") for c in cands if c})
    for i in range(0, len(uniq), 5):
        for r in keywordstool(uniq[i:i + 5]):
            got[r["kw"]] = {"total": r["total"], "pc": r["pc"], "mo": r["mo"], "comp": r["comp"]}
        time.sleep(0.05)
    return {k: v for k, v in got.items() if k in set(uniq) and v["total"] >= MIN_VOL}


def push(items):
    body = json.dumps({"customer_id": CID, "items": items, "min_volume": MIN_VOL,
                       "source": "gap_2026-09"}).encode("utf-8")
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
    picked = {}

    # ── ①·⑤ 자동완성 결과 + 자기 브랜드 ──
    ac = json.load(open(os.path.join(HERE, "_dovision_ac_raw.json"), encoding="utf-8"))
    for kw, v in ac.items():
        if v >= MIN_VOL and classify(kw)[0] and not any(x in kw for x in EXCLUDE_SUBSTR):
            picked[kw] = {"total": v, "pc": 0, "mo": 0, "comp": None, "축": "자동완성"}

    # ── ② 경쟁 브랜드 × B2B ──
    brand = measure([b + s for b in BRANDS for s in BRAND_SUF])
    for kw, v in brand.items():
        picked.setdefault(kw, {**v, "축": "경쟁브랜드"})

    # ── ⑤ 자기 브랜드 / ③ 학원경영 / ④ 위탁 ──
    for label, lst in (("자기브랜드", OWN), ("학원경영·원장", MGMT), ("위탁·수탁", TRUST)):
        got = measure(lst)
        for kw, v in got.items():
            picked.setdefault(kw, {**v, "축": label})

    rows = sorted(picked.items(), key=lambda kv: -kv[1]["total"])
    by = {}
    for kw, v in rows:
        by.setdefault(v["축"], []).append((v["total"], kw))
    print(f"채택 {len(rows):,}개 / 월검색합 {sum(v['total'] for _, v in rows):,}\n")
    for ax, lst in sorted(by.items(), key=lambda kv: -sum(x[0] for x in kv[1])):
        print(f"■ {ax}: {len(lst)}개 / {sum(x[0] for x in lst):,}회")
        print("   " + ", ".join(f"{k}({t:,})" for t, k in lst[:12]))

    items = [{"keyword": k, "monthly_total": v["total"], "monthly_pc": v.get("pc") or 0,
              "monthly_mobile": v.get("mo") or 0, "comp_idx": v.get("comp") or None}
             for k, v in rows]
    added = requeued = 0
    for i in range(0, len(items), 40):
        r = push(items[i:i + 40])
        if r:
            added += r.get("added") or 0
            requeued += r.get("requeued") or 0
        time.sleep(1.2)
    print(f"\n업로드 — 신규 {added} / requeue {requeued} / 총 {len(items)}")
    json.dump({k: v for k, v in rows}, open(os.path.join(HERE, "dovision_gap_found.json"), "w",
                                            encoding="utf-8"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
