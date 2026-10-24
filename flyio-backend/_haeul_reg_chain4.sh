#!/bin/sh
# 등록 마라톤 체인 v4 (2026-08-07) — 밀도순 시드 + **로그를 로컬디스크로**.
#
# ★ v3 까지의 낭비: km 뱅크는 83,218 시드인데 그 중 실볼륨 확인된 건 2,521 개뿐이다
#   (나머지는 미검증 조합). 555 배치를 갈아 2.5천을 얻는 셈이라 순서가 거꾸로였다.
#   반대로 볼륨캐시(122,314) 안에는 **어떤 뱅크에도 안 들어간 실볼륨 54,689** 가 있었고,
#   그 중 현행 앵커·네거티브를 통과하는 13,256 이 v1_ready 다.
#   밀도(시드당 실볼륨): v1_ready 100% > tier3 67% > disease 6% > km 3%
#
# ★★ 로그를 G:(Google Drive) 에 쓰지 말 것. 08-05·08-06·08-07 세 번의 마라톤 급사가
#    전부 `OSError: [Errno 22]` @ print 였다 — Drive File Stream 의 간헐적 쓰기 거부다.
#    드라이버는 이제 say() 로 삼키지만, 애초에 C: 로 쓰면 생기지 않는 문제다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
SP="C:/Users/lhs06/AppData/Local/Temp/claude/G---------developer-blog-index-analyzer/b2cd4cbc-f69d-4286-aa9c-36d35b0ccdf5/scratchpad"
LOG="$SP/logs"
mkdir -p "$LOG"
export DRY_STOP=999
export DRY_MIN=5
export RUN_WAIT=240
export PYTHONUNBUFFERED=1
L="$LOG/chain.log"

run () {   # run <seedfile> <statefile> <label>
  echo "=== CHAIN4 START $3 $(date) ===" >> "$L"
  python _haeul_started_driver.py "$1" "$2" "$3" >> "$LOG/reg_$3.log" 2>&1
  echo "=== CHAIN4 END   $3 rc=$? $(date) ===" >> "$L"
}

run _haeul_v1_ready.json          "$SP/_reg_v1_state.json"  v1ready
run _haeul_reg_tier3_offaxis.json "$SP/_reg_t3_state.json"  offaxis
run _haeul_w5_disease_kw.json     "$SP/_reg_dis_state.json" disease
run _haeul_reg_km.json            "$SP/_reg_km_state.json"  km
echo "=== CHAIN4 ALL DONE $(date) ===" >> "$L"
