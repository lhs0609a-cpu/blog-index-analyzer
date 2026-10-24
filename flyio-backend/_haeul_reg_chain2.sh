#!/bin/sh
# 등록 마라톤 체인 v2 — tier1(재개) → 질환축 → 한의학 → 두통무관
#
# ⚠️ **PowerShell Start-Process 의 RedirectStandardOutput 을 쓰지 말 것.**
#    드라이버가 `sys.stdout = TextIOWrapper(..., line_buffering=True)` 로 감싸는데
#    그 조합이 Windows 에서 간헐적으로 `OSError: [Errno 22] Invalid argument` 를 낸다 —
#    2026-08-05 실측: tier1 이 배치 32/86 에서 죽었고 **3시간 뒤에야 발견**했다
#    (체인은 오지 않을 완료 마커를 계속 기다리고 있었다).
#    → sh 안에서 `>> 파일 2>&1` 셸 리다이렉션으로 받는다. 마이닝에서 검증된 방식.
#
# ⚠️ DRY_STOP=999 필수 — 축이 섞인 시드파일이라 앞축이 마르면 뒤축을 통째로 날린다.
# ⚠️ 커서 상태파일이 진행 위치를 들고 있어 재실행하면 이어간다(tier1 은 4800부터).
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
SP="C:/Users/lhs06/AppData/Local/Temp/claude/G---------developer-blog-index-analyzer/9dd2526b-bdeb-48f9-b55d-0f0d61674b86/scratchpad"
export DRY_STOP=999
export DRY_MIN=5
export PYTHONUNBUFFERED=1
L=_haeul_reg_chain.log

run () {   # run <seedfile> <statefile> <label> <logfile>
  echo "=== CHAIN START $3 $(date) ===" >> $L
  python _haeul_started_driver.py "$1" "$2" "$3" >> "$4" 2>&1
  echo "=== CHAIN END   $3 rc=$? $(date) ===" >> $L
}

run _haeul_reg_tier1.json        "$SP/_reg_tier1_state.json" tier1   _haeul_reg_tier1.log
run _haeul_w5_disease_kw.json    "$SP/_reg_dis_state.json"   disease _haeul_reg_disease.log
run _haeul_reg_km.json           "$SP/_reg_km_state.json"    km      _haeul_reg_km.log
run _haeul_reg_tier3_offaxis.json "$SP/_reg_t3_state.json"   offaxis _haeul_reg_tier3.log
echo "=== CHAIN ALL DONE $(date) ===" >> $L
