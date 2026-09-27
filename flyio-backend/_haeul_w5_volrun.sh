#!/bin/sh
# 질환 파생어 실볼륨 검증. ⚠️ 등록 마라톤과 keywordstool 쿼터 공유 → GAP≥1.5 준수.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
SP="C:/Users/lhs06/AppData/Local/Temp/claude/G---------developer-blog-index-analyzer/9dd2526b-bdeb-48f9-b55d-0f0d61674b86/scratchpad"
CANDFILE="$SP/_haeul_w5_cand.json" OUT=_haeul_w5_deriv_live.json GAP=1.8 WORKERS=2 \
  python _haeul_w2_vol.py >> _haeul_w5_vol.log 2>&1
echo "=== W5 VOL DONE $(date) ===" >> _haeul_w5_vol.log
