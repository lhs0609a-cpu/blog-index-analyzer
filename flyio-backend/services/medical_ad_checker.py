# -*- coding: utf-8 -*-
"""
의료광고 위험 표현 점검 — 병·의원 블로그 원고용.

왜: 의료광고는 위반 시 대행사가 아니라 **원장**이 처벌받는다(의료법 제56조·제89조).
2024년 3월 정부 모니터링에서 불법 의료광고 366건이 적발됐고 1위 유형이 치료경험담(188건)이었다.
경쟁 서비스(REDRANK)는 이 표현 검수를 유료로 판다.

원칙:
- 규칙 기반이다. 문맥을 이해하지 못하므로 '확정'이 아니라 **의심 표현**으로만 보여준다.
- 법률 자문·사전심의를 대신하지 않는다고 결과에 항상 적는다.
- 같은 문구를 여러 번 세지 않는다(첫 위치만 보여준다).
"""
from __future__ import annotations

import re
from typing import Dict, List

# (분류 키, 이름, 위험도, 근거, 고칠 방향, 패턴들)
_RULES = [
    (
        "testimonial", "치료경험담", "high",
        "의료법 제56조 제2항 제2호 — 환자의 치료경험담 등 소비자를 속이거나 오인하게 할 우려가 있는 광고",
        "환자 후기·체험 서술을 빼고, 진료 과정과 주의사항을 객관적으로 설명하는 글로 바꾸세요.",
        [r"치료\s*후기", r"시술\s*후기", r"수술\s*후기", r"진료\s*후기", r"내돈내산",
         r"효과를?\s*봤", r"다\s*나았", r"완전히\s*나았", r"통증이\s*(?:싹|완전히)?\s*사라",
         r"직접\s*받아\s*(?:봤|보니)", r"받고\s*나서\s*(?:확|많이)\s*좋아"],
    ),
    (
        "before_after", "전후 비교", "high",
        "의료법 제56조 제2항 및 의료광고 심의 기준 — 치료 전후 사진·비교는 오인 우려로 엄격히 제한",
        "전후 비교 사진·문구를 빼거나, 심의 기준에 맞춘 형태인지 심의기관에 확인하세요.",
        [r"전\s*후\s*사진", r"전후\s*비교", r"비포\s*(?:&|앤|and)?\s*애프터", r"\bbefore\s*(?:&|and|/)?\s*after\b"],
    ),
    (
        "superlative", "최상급·과장·보장", "high",
        "의료법 제56조 제2항 제3·8호 — 거짓·과장, 객관적으로 인정되지 않은 내용",
        "'최고·유일·100%·완치·부작용 없음' 같은 단정 대신 근거가 있는 사실만 쓰세요.",
        [r"최고의?", r"최초", r"유일(?:한)?", r"(?:업계|지역|국내)?\s*1위", r"넘버\s*원", r"No\.?\s*1",
         r"독보적", r"100\s*%", r"완치", r"확실한\s*효과", r"부작용(?:이|은)?\s*(?:전혀\s*)?없", r"부작용\s*0",
         r"통증(?:이|은)?\s*(?:전혀\s*)?없", r"무통", r"영구(?:적)?", r"효과\s*보장", r"재발\s*없", r"특효", r"기적"],
    ),
    (
        "comparison", "다른 의료기관과 비교", "medium",
        "의료법 제56조 제2항 제4호 — 다른 의료인·의료기관과 비교하는 광고",
        "다른 병원과 비교하는 표현을 빼고 우리 병원의 진료 내용만 설명하세요.",
        [r"다른\s*병원", r"타\s*병원", r"타\s*의원", r"다른\s*한의원", r"어디보다", r"보다\s*(?:훨씬\s*)?저렴"],
    ),
    (
        "inducement", "할인·이벤트로 환자 유인", "medium",
        "의료법 제27조 제3항(환자 유인) 및 비급여 가격 할인 광고 심의 기준",
        "할인율·선착순·무료 시술 같은 유인 문구는 빼거나 심의를 받으세요.",
        [r"\d+\s*%\s*할인", r"할인\s*이벤트", r"이벤트\s*가", r"무료\s*(?:시술|치료|체험)", r"공짜", r"특가",
         r"선착순", r"1\s*\+\s*1"],
    ),
    (
        "sponsored", "대가성 후기", "high",
        "의료법 제56조(치료경험담) 및 표시광고법 — 대가를 받은 의료 후기는 표기해도 위반 소지가 남습니다",
        "체험단·협찬으로 받은 진료 후기는 게시하지 않는 것이 안전합니다.",
        [r"체험단", r"협찬", r"원고료", r"(?:제공|지원)\s*받아", r"무상으로\s*(?:제공|진행)"],
    ),
]

_COMPILED = [
    (key, name, level, law, advice, [re.compile(p, re.IGNORECASE) for p in pats])
    for key, name, level, law, advice, pats in _RULES
]

# 원고가 의료 글인지 자동으로 가리는 단어 — 켜기/끄기는 호출부가 덮어쓸 수 있다.
_MEDICAL_HINT = re.compile(
    r"병원|의원|한의원|치과|피부과|성형|정형외과|내과|안과|산부인과|비뇨기과|"
    r"시술|진료|치료|한약|침\s*치료|추나|도수치료|임플란트|치아\s*교정|보톡스|필러|리프팅|라식|라섹"
)


def looks_medical(*texts: str) -> bool:
    return any(_MEDICAL_HINT.search(t or "") for t in texts)


def _snippet(text: str, start: int, end: int, pad: int = 25) -> str:
    s = max(0, start - pad)
    e = min(len(text), end + pad)
    return ("…" if s > 0 else "") + text[s:e].replace("\n", " ") + ("…" if e < len(text) else "")


def check_medical_ad(title: str, content: str) -> Dict:
    text = f"{title or ''}\n{content or ''}"
    hits: List[Dict] = []
    for key, name, level, law, advice, pats in _COMPILED:
        seen = set()
        for pat in pats:
            for m in pat.finditer(text):
                phrase = m.group(0).strip()
                if phrase in seen:
                    continue
                seen.add(phrase)
                hits.append({
                    "category": key,
                    "label": name,
                    "level": level,
                    "phrase": phrase,
                    "snippet": _snippet(text, m.start(), m.end()),
                    "law": law,
                    "advice": advice,
                })
                break  # 같은 패턴은 첫 위치만

    highs = sum(1 for h in hits if h["level"] == "high")
    risk = "high" if highs else ("medium" if hits else "none")
    if risk == "high":
        summary = f"위반 소지가 큰 표현 {highs}건을 포함해 {len(hits)}건이 보입니다. 발행 전에 고치세요."
    elif risk == "medium":
        summary = f"확인이 필요한 표현 {len(hits)}건이 보입니다."
    else:
        summary = "규칙에 걸리는 표현은 보이지 않습니다. 그래도 광고성 의료 글은 심의 대상이 될 수 있습니다."

    return {
        "risk": risk,
        "summary": summary,
        "hits": hits,
        "disclaimer": (
            "문맥을 이해하지 못하는 규칙 기반 점검입니다. 의심 표현을 짚을 뿐 위반을 확정하지 않으며, "
            "법률 자문이나 의료광고 사전심의를 대신하지 않습니다."
        ),
    }
