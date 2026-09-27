#!/bin/sh
# 실볼륨 검증 래퍼.
# ⚠️ harness 가 백그라운드 bash 작업을 주기적으로 kill 한다. `bash -c "python ..."` 처럼
#    직접 자식으로 띄우면 같이 죽지만, `sh 스크립트` 를 한 겹 두면 살아남는다(실측 2회).
#    검증은 재개 가능(볼륨캐시에 있는 건 건너뜀)하지만 재시작 오버헤드가 아까우므로 감싼다.
cd "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend" || exit 1
GAP=${GAP:-0.5} WORKERS=${WORKERS:-3} python _haeul_w2_vol.py >> _haeul_w2_vol.log 2>&1
echo "=== VOL DONE $(date) ===" >> _haeul_w2_vol.log
