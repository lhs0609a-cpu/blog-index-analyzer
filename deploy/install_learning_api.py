#!/usr/bin/env python3
"""
Installer script for Learning API on Fly.io
Run this on the Fly.io server to install learning API files
"""
import os
import sys

def main():
    print("========================================")
    print("Learning API Installer")
    print("========================================")

    # Check if we're on Fly.io
    app_path = "/app"
    if not os.path.exists(app_path):
        print(f"Error: {app_path} not found. Are you running this on Fly.io?")
        sys.exit(1)

    # Create directories if needed
    os.makedirs(f"{app_path}/routers", exist_ok=True)
    os.makedirs(f"{app_path}/database", exist_ok=True)
    os.makedirs(f"{app_path}/services", exist_ok=True)

    print("\n[1/5] Downloading files from GitHub...")

    base_url = "https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy"

    files = [
        ("routers/learning.py", f"{app_path}/routers/learning.py"),
        ("database/learning_db.py", f"{app_path}/database/learning_db.py"),
        ("services/learning_engine.py", f"{app_path}/services/learning_engine.py"),
    ]

    import urllib.request

    for remote_path, local_path in files:
        url = f"{base_url}/{remote_path}"
        print(f"   Downloading {remote_path}...")
        try:
            urllib.request.urlretrieve(url, local_path)
            print(f"   ✓ Saved to {local_path}")
        except Exception as e:
            print(f"   ✗ Failed: {e}")
            sys.exit(1)

    print("\n[2/5] Installing dependencies...")
    os.system("pip install numpy>=1.24.0 scipy>=1.11.0")

    print("\n[3/5] Initializing database...")
    try:
        from database.learning_db import init_learning_tables
        init_learning_tables()
        print("   ✓ Database initialized")
    except Exception as e:
        print(f"   ✗ Failed: {e}")

    print("\n[4/5] Checking main.py...")
    main_py_path = f"{app_path}/main.py"
    with open(main_py_path, 'r') as f:
        content = f.read()

    if 'from routers import learning' in content:
        print("   ✓ Learning router already imported")
    else:
        print("   ⚠ Warning: Learning router not imported in main.py")
        print("   Please add these lines to main.py:")
        print("   from routers import learning")
        print('   app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])')

    print("\n[5/5] Installation complete!")
    print("\nNext steps:")
    print("1. Update main.py to include learning router (if not already done)")
    print("2. Restart the app: supervisorctl restart all")
    print("3. Test: curl https://naverpay-delivery-tracker.fly.dev/api/learning/status")
    print("\n========================================")

if __name__ == "__main__":
    main()
