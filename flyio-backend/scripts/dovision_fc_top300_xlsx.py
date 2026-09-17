# -*- coding: utf-8 -*-
import math
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import dovision_fc_top300 as T

OUT = r"D:\developer\blog-index-analyzer\_두비전_가맹창업_관심키워드_TOP300.xlsx"
rows, cut = T.main()

# 물량가중 = 관심도 × log10(검색량) — 실제 문의가 어디서 나오는지
for r in rows:
    r["lead"] = round(r["score"] * math.log10(max(r["vol"], 10)), 1)

HDR = Font(bold=True, color="FFFFFF", size=10)
HFILL = PatternFill("solid", fgColor="2F4F6F")
THIN = Side(style="thin", color="D9D9D9")
BD = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BANDS = {"가맹접촉": "FFD9E1F2", "창업실행": "FFD9E1F2", "인수·매물": "FFE2EFDA",
         "인허가·등록": "FFE2EFDA", "돈계산": "FFFFF2CC", "전환·컨설팅": "FFFCE4D6",
         "원장실무": "FFFCE4D6", "원생모집": "FFFCE4D6"}

COLS = [("순위", 6), ("키워드", 24), ("월검색량", 10), ("관심도", 8), ("업종적합도", 11),
        ("구매단계", 13), ("5위 입찰가", 11), ("1위 입찰가", 11), ("발굴축", 16)]


def sheet(wb, title, data, numbered=True):
    ws = wb.create_sheet(title)
    for i, (h, w) in enumerate(COLS, 1):
        c = ws.cell(1, i, h)
        c.font, c.fill, c.border = HDR, HFILL, BD
        c.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = w
    for n, r in enumerate(data, 1):
        vals = [n, r["keyword"], r["vol"], r["score"], r["fit"], r["stage"],
                r["bid5"], r["bid1"], r["axis"]]
        fill = BANDS.get(r["stage"])
        for i, v in enumerate(vals, 1):
            c = ws.cell(n + 1, i, v)
            c.border = BD
            if i in (1, 3, 4, 7, 8):
                c.alignment = Alignment(horizontal="center")
            if i in (3, 7, 8):
                c.number_format = "#,##0"
            if fill and i == 6:
                c.fill = PatternFill("solid", fgColor=fill)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:I{len(data) + 1}"
    return ws


wb = Workbook()
wb.remove(wb.active)

# 1) 요청하신 것 — 관심도 순 1~300위
sheet(wb, "관심도 TOP300", rows[:300])

# 2) 같은 점수를 물량으로 가중 — 실제 문의가 나올 순서
byl = sorted(rows, key=lambda r: (-r["lead"], -r["vol"]))
ws = sheet(wb, "물량가중 TOP300", byl[:300])

# 3) 판정 통과 전체
sheet(wb, "전체 %d개" % len(rows), rows)

# 4) 제외 — 왜 뺐는지
ws = wb.create_sheet("제외 %d개" % len(cut))
for i, (h, w) in enumerate([("키워드", 26), ("제외 사유", 20)], 1):
    c = ws.cell(1, i, h); c.font, c.fill, c.border = HDR, HFILL, BD
    ws.column_dimensions[get_column_letter(i)].width = w
for n, (k, why) in enumerate(sorted(cut), 1):
    ws.cell(n + 1, 1, k).border = BD
    ws.cell(n + 1, 2, why.replace("cut:", "")).border = BD
ws.freeze_panes = "A2"

# 5) 읽는 법
ws = wb.create_sheet("읽는 법", 0)
ws.column_dimensions["A"].width = 16
ws.column_dimensions["B"].width = 96
guide = [
    ("두비전 가맹창업 관심 키워드", ""),
    ("", ""),
    ("기준", "이 검색어를 친 사람이 초기 1억을 넣고 두비전 본사에 전화할 사람인가."),
    ("관심도", "업종적합도(0~45) + 구매단계(0~45) ± 보정. 100점 만점."),
    ("업종적합도", "핵심업종 45 (공부방·교습소·보습·학습코칭 — 두비전이 파는 그것) / "
                   "교육업종 40 (학원·교습 확정) / 경쟁브랜드 35 / 교육일반 20 / 업종미정 5"),
    ("구매단계", "가맹접촉 45 (가맹문의·상담·설명회) / 창업실행 40 (창업·개원·차리기) / "
                 "인수·매물 38 / 인허가·등록 35 / 돈계산 30 / 브랜드검토 28 / "
                 "전환·컨설팅 26 / 원장실무 25 / 원생모집 22 / 폐업·정리 18 / 박람회 15"),
    ("정렬", "1순위 관심도 내림차순, 동점이면 월검색량 내림차순."),
    ("월검색량", "네이버 PC+모바일 합산 (2026-09-16 측정)."),
    ("입찰가", "같은 날 잰 순위별 추정 입찰가. 현재 계정 입찰은 전 키워드 70원이다."),
    ("", ""),
    ("시트 2", "물량가중 TOP300 — 관심도 × log(검색량). 실제 문의가 나올 순서는 이쪽이다."),
    ("시트 3", "판정을 통과한 %d개 전체." % len(rows)),
    ("시트 4", "제외한 %d개와 사유. 학원비(학부모)·강사채용(구직)·전업종 정책자금 등." % len(cut)),
]
for n, (a, b) in enumerate(guide, 1):
    ca = ws.cell(n, 1, a); ca.font = Font(bold=True, size=11 if n == 1 else 10)
    cb = ws.cell(n, 2, b); cb.alignment = Alignment(wrap_text=True, vertical="top")
    if n == 1:
        ca.font = Font(bold=True, size=14)
wb.save(OUT)
print("saved", OUT)
print("TOP300 검색량 합계:", f"{sum(r['vol'] for r in rows[:300]):,}")
print("5위 70원 이하:", sum(1 for r in rows[:300] if r["bid5"] != "" and r["bid5"] <= 70))
print("5위 1000원 이하:", sum(1 for r in rows[:300] if r["bid5"] != "" and r["bid5"] <= 1000))
