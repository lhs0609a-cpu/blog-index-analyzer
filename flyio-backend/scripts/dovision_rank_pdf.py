# -*- coding: utf-8 -*-
"""간절함 순위표를 PDF 로. 한글은 맑은 고딕 임베드."""
import collections, json, os, sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dovision_keyword_rank.pdf")
pdfmetrics.registerFont(TTFont("KR", r"C:\Windows\Fonts\malgun.ttf"))
pdfmetrics.registerFont(TTFont("KRB", r"C:\Windows\Fonts\malgunbd.ttf"))

INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#6b6b6b")
LINE = colors.HexColor("#d8d8d8")
BAND = colors.HexColor("#f4f4f2")
ACCENT = colors.HexColor("#8a5a2b")

ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Title"], fontName="KRB", fontSize=20, leading=26,
                    textColor=INK, spaceAfter=4)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontName="KR", fontSize=9.5, leading=15,
                     textColor=MUTED, alignment=TA_CENTER, spaceAfter=14)
H2 = ParagraphStyle("H2", parent=ss["Heading2"], fontName="KRB", fontSize=13, leading=18,
                    textColor=INK, spaceBefore=10, spaceAfter=2)
NOTE = ParagraphStyle("NOTE", parent=ss["Normal"], fontName="KR", fontSize=8.5, leading=13,
                      textColor=MUTED, spaceAfter=6)
CELL = ParagraphStyle("CELL", parent=ss["Normal"], fontName="KR", fontSize=8, leading=11,
                      textColor=INK)

TIER_NOTE = {
    "S · 즉시 상담 가능": "학원을 사고팔거나 가맹 본사에 직접 접촉하는 단계. 지금 전화가 올 수 있는 사람들.",
    "A · 실행 직전": "인허가 신고·정보공개서 열람·설명회. 브랜드만 정하면 계약하는 단계.",
    "B · 업종 고르는 중": "공부방·교습소·학원을 차리기로 정하고 무엇으로 할지 고르는 단계.",
    "C · 정보 수집": "비용·수익을 계산하거나 현직 원장이 홍보·운영을 찾는 단계.",
    "D · 후보 풀": "지도사 자격·교사 모집. 가맹주가 아니라 '가르치는 일'을 원하는 후보.",
    "E · 주변부": "부업·재택 등 광의 페르소나. 전환은 멀지만 접점은 된다.",
}


def money(v):
    return f"{v:,}" if v else "-"


def build():
    rows = json.load(open(os.path.join(HERE, "_dovision_rank.json"), encoding="utf-8"))
    live = [r for r in rows if r["score"] > 0]
    total_all = len(rows)

    doc = SimpleDocTemplate(OUT, pagesize=A4,
                            leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=15 * mm, bottomMargin=14 * mm,
                            title="두비전 키워드 간절함 순위", author="DOVISION")
    story = []
    story.append(Paragraph("두비전 창업 관심도 순위표", H1))
    story.append(Paragraph(
        f"네이버 등록 키워드 {total_all:,}개 전수 · 창업 의도 보유 {len(live):,}개 · "
        f"기준일 2026-09-04", SUB))

    # 요약표
    agg = collections.OrderedDict()
    for r in live:
        a = agg.setdefault(r["tier"], [0, 0])
        a[0] += 1
        a[1] += (r["monthly"] or 0)
    head = [[Paragraph("<b>등급</b>", CELL), Paragraph("<b>키워드</b>", CELL),
             Paragraph("<b>월 검색량 합</b>", CELL), Paragraph("<b>성격</b>", CELL)]]
    for t in sorted(agg):
        n, v = agg[t]
        head.append([Paragraph(t, CELL), Paragraph(f"{n:,}", CELL),
                     Paragraph(f"{v:,}", CELL), Paragraph(TIER_NOTE.get(t, ""), CELL)])
    t0 = Table(head, colWidths=[38 * mm, 18 * mm, 24 * mm, 102 * mm], repeatRows=1)
    t0.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BAND),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
        ("GRID", (0, 0), (-1, -1), 0.25, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t0)
    story.append(Paragraph(
        "간절함 점수 = 검색어에 담긴 '지금 두비전에 연락할 확률'. 가맹 접촉·인허가 신고·학원 매매가 "
        "가장 높고, 취업 의도와 정보 탐색은 감점. 무관 업종(치킨·카페 등)과 광고주가 도메인 밖으로 "
        "결정한 과목(영어·예체능·중고등 입시)은 순위에서 제외.", NOTE))
    story.append(PageBreak())

    # 등급별 상세
    by = collections.OrderedDict()
    for r in live:
        by.setdefault(r["tier"], []).append(r)

    for tier in sorted(by):
        lst = by[tier]
        story.append(Paragraph(f"{tier}  —  {len(lst):,}개", H2))
        if TIER_NOTE.get(tier):
            story.append(Paragraph(TIER_NOTE[tier], NOTE))
        data = [[Paragraph("<b>#</b>", CELL), Paragraph("<b>점수</b>", CELL),
                 Paragraph("<b>키워드</b>", CELL), Paragraph("<b>월검색</b>", CELL),
                 Paragraph("<b>입찰가</b>", CELL), Paragraph("<b>목표순위</b>", CELL),
                 Paragraph("<b>캠페인</b>", CELL)]]
        for i, r in enumerate(lst, 1):
            camp = (r["campaign"] or "").replace("[두비전] ", "").replace("[두비전]", "")
            camp = camp.replace("_001", "").replace("창업·수익 - ", "")
            data.append([
                Paragraph(str(i), CELL), Paragraph(str(r["score"]), CELL),
                Paragraph(r["keyword"], CELL), Paragraph(money(r["monthly"]), CELL),
                Paragraph(money(r["bid"]), CELL),
                Paragraph(str(r["target_pos"] or "-"), CELL),
                Paragraph(camp, CELL)])
        t = Table(data, colWidths=[11 * mm, 12 * mm, 52 * mm, 18 * mm, 18 * mm,
                                   16 * mm, 55 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BAND),
            ("LINEBELOW", (0, 0), (-1, 0), 0.7, INK),
            ("GRID", (0, 0), (-1, -1), 0.2, LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbfbfa")]),
        ]))
        story.append(t)
        story.append(PageBreak())

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("KR", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(14 * mm, 8 * mm, "두비전(DOVISION) · CID 4403292 · 네이버 검색광고")
        canvas.drawRightString(A4[0] - 14 * mm, 8 * mm, f"{doc_.page}")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.3)
        canvas.line(14 * mm, 11 * mm, A4[0] - 14 * mm, 11 * mm)
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print("PDF:", OUT, f"({os.path.getsize(OUT)/1024:.0f} KB)")


if __name__ == "__main__":
    build()
