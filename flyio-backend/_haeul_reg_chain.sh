#!/bin/sh
# 등록 마라톤 체인 — tier1(실행중) → KM(한의학) → R5(두통무관)
#
# ⚠️ DRY_STOP=999 필수. 축이 섞인 시드파일이라 앞축이 마르면 자동 dry-stop 이
#    수율 좋은 뒤축을 통째로 날린다(과거 실측).
# ⚠️ 커서 상태파일이 진행 위치를 들고 있으므로 재실행하면 이어간다.
# ⚠️ tier2(R4 지역)는 별도로 안 돌린다 — KM 시드의 지역×한의원 부분과 완전히 같은
#    2,770개라 중복 발사는 워커 슬롯만 태운다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
SP="C:/Users/lhs06/AppData/Local/Temp/claude/G---------developer-blog-index-analyzer/9dd2526b-bdeb-48f9-b55d-0f0d61674b86/scratchpad"
export DRY_STOP=999
export DRY_MIN=5

# tier1 이 끝날 때까지 대기 (드라이버가 마지막에 '=== [tier1] 종료' 를 찍는다)
while ! grep -q "=== \[tier1\] 종료" _haeul_reg_tier1.log 2>/dev/null; do sleep 60; done
echo "=== CHAIN: tier1 완료 확인 $(date) ===" >> _haeul_reg_chain.log

python _haeul_started_driver.py _haeul_reg_km.json "$SP/_reg_km_state.json" km \
  >> _haeul_reg_km.log 2>&1
echo "=== CHAIN: km 완료 $(date) ===" >> _haeul_reg_chain.log

python _haeul_started_driver.py _haeul_reg_tier3_offaxis.json "$SP/_reg_t3_state.json" offaxis \
  >> _haeul_reg_tier3.log 2>&1
echo "=== CHAIN: offaxis 완료 $(date) ===" >> _haeul_reg_chain.log
