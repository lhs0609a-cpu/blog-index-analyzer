#!/bin/bash
# fly 머신 안에서 읽기 전용 조회 페이로드를 실행하고 결과 한 줄을 파일로 받는다.
# base64 는 난독화가 아니라 파이썬 소스의 따옴표를 ssh -C 한 줄에 실어 보내기 위한 전송 인코딩이다.
set -u
SRC="${1:?payload.py}"
OUT="${2:?out.txt}"
B64=$(base64 -w0 "$SRC")
flyctl ssh console -a blog-index-analyzer -C "python -c \"import base64;exec(base64.b64decode('$B64'))\"" > "$OUT" 2>"$OUT.err"
echo "exit=$? bytes=$(wc -c < "$OUT")"
tail -c 400 "$OUT.err"
