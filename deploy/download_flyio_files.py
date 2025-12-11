#!/usr/bin/env python3
"""
Download필요한 파일들을 Fly.io에서 가져오는 스크립트
"""
import subprocess
import os

FLYIO_APP = "naverpay-delivery-tracker"
OUTPUT_DIR = r"G:\내 드라이브\developer\blog-index-analyzer\flyio-backend"
FLYCTL = r"C:\Users\이아로\.fly\bin\flyctl.exe"

os.makedirs(OUTPUT_DIR, exist_ok=True)

files_to_download = [
    "/app/main.py",
    "/app/requirements.txt",
    "/app/Dockerfile",
    "/app/fly.toml",
    "/app/config.py",
]

for remote_file in files_to_download:
    filename = os.path.basename(remote_file)
    local_path = os.path.join(OUTPUT_DIR, filename)

    print(f"Downloading {remote_file}...")

    cmd = [FLYCTL, "ssh", "console", "-a", FLYIO_APP, "-C", f"cat {remote_file}"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if result.returncode == 0:
            # 출력에서 불필요한 부분 제거
            content = result.stdout

            # Connecting to... 메시지 제거
            lines = content.split('\n')
            clean_lines = [line for line in lines if not line.startswith('Connecting to')]
            content = '\n'.join(clean_lines)

            with open(local_path, 'w', encoding='utf-8') as f:
                f.write(content)

            print(f"  ✓ Saved to {filename}")
        else:
            print(f"  ✗ Failed: {result.stderr}")

    except Exception as e:
        print(f"  ✗ Error: {e}")

print("\n완료!")
