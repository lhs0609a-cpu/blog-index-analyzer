#!/bin/sh
# 라운드2 마이닝 순차 드라이버 (2026-08-04)
# ⚠️ 싼 정찰(루트단독) → 비싼 표면채굴(자모접두) 순서. 각 페이즈가 수율을 찍으므로
#    로그를 보고 다음 페이즈 가치를 판단할 것. cand 파일은 페이즈마다 원자적으로 누적된다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
L=_haeul_w2_mine.log
echo "=== START $(date) ===" >> $L

# 1) 큐레이션 신규어휘(1,166) — 가장 신선한 루트. Bing 먼저.
PHASE=bing1 ROOTSET=ext            python _haeul_w2_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=ext            python _haeul_w2_mine.py >> $L 2>&1
PHASE=mo    ROOTSET=ext            python _haeul_w2_mine.py >> $L 2>&1

# 2) 기존 실볼륨 루트 37k — 루트단독 2채널(싼 전수 정찰)
PHASE=bing1 ROOTSET=live           python _haeul_w2_mine.py >> $L 2>&1
PHASE=bare  ROOTSET=live           python _haeul_w2_mine.py >> $L 2>&1

# 3) 표면채굴 — 볼륨 상위 루트에만 자모 접두를 붙인다(수율은 머리어에 붙는다)
PHASE=cho   ROOTSET=live LIMIT=12000 python _haeul_w2_mine.py >> $L 2>&1
PHASE=syl   ROOTSET=live LIMIT=6000  python _haeul_w2_mine.py >> $L 2>&1
PHASE=mo    ROOTSET=live LIMIT=12000 python _haeul_w2_mine.py >> $L 2>&1

# 4) 1차 후보 재투입(depth-2)
PHASE=bing1 ROOTSET=cand           python _haeul_w2_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=cand LIMIT=8000 python _haeul_w2_mine.py >> $L 2>&1

echo "=== DONE $(date) ===" >> $L
