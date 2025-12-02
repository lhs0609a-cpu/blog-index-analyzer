#!/usr/bin/env python3
"""
Fly.io deployment script
"""
import subprocess
import sys
import os
from pathlib import Path

def main():
    # flyctl path
    home = Path.home()
    flyctl = home / ".fly" / "bin" / "flyctl.exe"

    if not flyctl.exists():
        print(f"[ERROR] flyctl not found at {flyctl}")
        sys.exit(1)

    print(f"[OK] Found flyctl at {flyctl}")

    # Change to backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    print(f"[OK] Changed to {backend_dir}")

    # Run fly deploy
    print("\n[DEPLOY] Deploying to Fly.io...")
    try:
        result = subprocess.run(
            [str(flyctl), "deploy"],
            check=True,
            capture_output=False,
            text=True
        )
        print("\n[SUCCESS] Deployment successful!")
        return 0
    except subprocess.CalledProcessError as e:
        print(f"\n[ERROR] Deployment failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
