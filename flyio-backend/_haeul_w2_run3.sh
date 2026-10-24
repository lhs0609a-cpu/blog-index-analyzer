#!/bin/sh
# 잔여 마이닝 — run1 의 마지막 2페이즈 + run2 전체.
# (백그라운드 작업이 일괄 kill 돼 재개용으로 합쳤다. cand 파일이 원자적으로 저장돼 있어
#  이미 찾은 후보는 그대로 살아있고, 각 페이즈는 코퍼스+cand 를 제외하므로 중복작업이 없다.)
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
L=_haeul_w2_mine.log
echo "=== RUN3 START $(date) ===" >> $L

PHASE=bing1 ROOTSET=cand                 python _haeul_w2_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=cand LIMIT=8000      python _haeul_w2_mine.py >> $L 2>&1

# A축 — 지역×진료어. 이 계정에서 한 번도 안 판 표면이다.
PHASE=bare  ROOTSET=regclinic            python _haeul_w2_mine.py >> $L 2>&1
PHASE=bing1 ROOTSET=regclinic            python _haeul_w2_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=regclinic LIMIT=6000 python _haeul_w2_mine.py >> $L 2>&1

# 신규 어휘 음절 접두(초성이 살아있었으므로 음절도 판다)
PHASE=syl   ROOTSET=ext                  python _haeul_w2_mine.py >> $L 2>&1

echo "=== RUN3 DONE $(date) ===" >> $L
