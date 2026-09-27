#!/bin/sh
# 등록 마라톤 체인 v3 (2026-08-07) — 남은 뱅크 전량 소진.
#
# v2 는 disease 커서 6,900 에서 죽어 있었다(프로세스 소멸, 로그 0바이트).
# 상태파일은 살아있으므로 이어서 간다.
#
# ⚠️ RUN_WAIT=240 — 포화 구간에선 pool 델타가 0 이라 기본 900s 를 매 배치 통째로 태운다.
#    km(83,218 시드 = 555배치)에서 이 차이가 139시간 vs 37시간이다.
# ⚠️ DRY_STOP=999 — 축이 섞인 시드파일이라 앞축이 마르면 뒤축을 통째로 날린다.
# ⚠️ PowerShell RedirectStandardOutput 금지(Errno 22). sh 리다이렉션으로만 받는다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
SP="C:/Users/lhs06/AppData/Local/Temp/claude/G---------developer-blog-index-analyzer/b2cd4cbc-f69d-4286-aa9c-36d35b0ccdf5/scratchpad"
export DRY_STOP=999
export DRY_MIN=5
export RUN_WAIT=240
export PYTHONUNBUFFERED=1
L=_haeul_reg_chain.log

run () {   # run <seedfile> <statefile> <label> <logfile>
  echo "=== CHAIN3 START $3 $(date) ===" >> $L
  python _haeul_started_driver.py "$1" "$2" "$3" >> "$4" 2>&1
  echo "=== CHAIN3 END   $3 rc=$? $(date) ===" >> $L
}

run _haeul_w5_disease_kw.json     "$SP/_reg_dis_state.json" disease _haeul_reg_disease.log
run _haeul_reg_km.json            "$SP/_reg_km_state.json"  km      _haeul_reg_km.log
run _haeul_reg_tier3_offaxis.json "$SP/_reg_t3_state.json"  offaxis _haeul_reg_tier3.log
echo "=== CHAIN3 ALL DONE $(date) ===" >> $L
