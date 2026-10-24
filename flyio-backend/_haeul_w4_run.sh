#!/bin/sh
# 라운드4 채굴 체인 — 한의원 진료영역 전체 (2026-08-07).
#
# 시험 실측: clinic 루트 261개 단독 질의로 **2.45 신규/q** (두통 코어 0.03/q, 라운드3
# 최고였던 제약 4.81/q 다음). 진료영역 루트가 이 계정에서 통째로 미개척이었다는 뜻이다.
#
# 순서는 수율순: 신선한 루트의 표면(자모·음절)부터 긁고, 그 다음 실볼륨 도메인 키워드를
# 루트로 재투입(live), 마지막에 이번 수확을 루트로 되먹임(cand depth-2).
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
L="C:/Users/lhs06/AppData/Local/blank_haeul/w4_mine.log"

step () {   # step <PHASE> <ROOTSET> [LIVE_N]
  echo "=== $1/$2 $(date) ===" >> "$L"
  PHASE=$1 ROOTSET=$2 LIVE_N=${3:-4000} python _haeul_w4_mine.py >> "$L" 2>&1
}

step cho  clinic
step syl  clinic
step bing clinic
step bare live 4000
step cho  live 2000
step bare cand
step cho  cand
echo "=== W4 MINE DONE $(date) ===" >> "$L"
