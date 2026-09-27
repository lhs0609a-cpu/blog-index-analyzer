#!/bin/sh
# 라운드3 축별 마이닝. 싼 정찰(루트단독) → 표면채굴(초성/음절) 순.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
L=_haeul_w3_mine.log
echo "=== W3 START $(date) ===" >> $L
for RS in acu herb km rx wm sx; do
  PHASE=bare  ROOTSET=$RS python _haeul_w3_mine.py >> $L 2>&1
  PHASE=bing1 ROOTSET=$RS python _haeul_w3_mine.py >> $L 2>&1
done
for RS in acu herb km rx wm; do
  PHASE=cho ROOTSET=$RS python _haeul_w3_mine.py >> $L 2>&1
done
# 제약은 제품명이 많아 음절 접두까지 판다(성분/제품 변형이 많은 층)
PHASE=syl ROOTSET=rx  python _haeul_w3_mine.py >> $L 2>&1
# 코어(기존 두통 실볼륨) — 이미 라운드2에서 많이 팠으므로 루트단독만
PHASE=bare  ROOTSET=core python _haeul_w3_mine.py >> $L 2>&1
PHASE=bing1 ROOTSET=core python _haeul_w3_mine.py >> $L 2>&1
# depth-2: 이번 라운드 후보를 루트로 재투입
PHASE=bare  ROOTSET=cand python _haeul_w3_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=cand LIMIT=8000 python _haeul_w3_mine.py >> $L 2>&1
echo "=== W3 DONE $(date) ===" >> $L
