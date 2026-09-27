#!/bin/sh
# 라운드2 마이닝 2차 — 1차(_haeul_w2_run.sh) 완료 후 실행.
# 1차 실측을 반영한 것: ① MAXGRADE=4 로 R5(질환백과)가 루트를 뒤덮는 걸 막고
#                      ② 한 번도 안 판 A축(지역×진료어)을 연다
#                      ③ 모바일 ac 는 뺐다 — PC 와 제안 트리가 **완전 동일**함을 실측(신규 0).
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
L=_haeul_w2_mine.log
echo "=== RUN2 START $(date) ===" >> $L

# A축 — 지역×진료어 조합을 루트로. 이 계정에서 한 번도 안 판 표면이다.
PHASE=bare  ROOTSET=regclinic          python _haeul_w2_mine.py >> $L 2>&1
PHASE=bing1 ROOTSET=regclinic          python _haeul_w2_mine.py >> $L 2>&1
PHASE=cho   ROOTSET=regclinic LIMIT=6000 python _haeul_w2_mine.py >> $L 2>&1

# 신규 어휘 음절 접두(초성이 살아있었으므로 음절도 판다)
PHASE=syl   ROOTSET=ext                python _haeul_w2_mine.py >> $L 2>&1

# 후보 재투입 — MAXGRADE=4 라 두통축 후보만 루트가 된다
PHASE=cho   ROOTSET=cand LIMIT=6000    python _haeul_w2_mine.py >> $L 2>&1

echo "=== RUN2 DONE $(date) ===" >> $L
