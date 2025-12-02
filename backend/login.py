#!/usr/bin/env python3
"""
Fly.io login script
"""
import subprocess
import sys
from pathlib import Path

def main():
    home = Path.home()
    flyctl = home / ".fly" / "bin" / "flyctl.exe"

    if not flyctl.exists():
        print(f"[ERROR] flyctl not found")
        sys.exit(1)

    print("[LOGIN] Opening browser for Fly.io login...")
    try:
        subprocess.run(
            [str(flyctl), "auth", "login"],
            check=True
        )
        print("\n[SUCCESS] Login successful!")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Login failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
