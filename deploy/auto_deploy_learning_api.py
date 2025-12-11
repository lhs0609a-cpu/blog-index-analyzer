#!/usr/bin/env python3
"""
Automatic deployment script for Learning API to Fly.io
"""
import subprocess
import time

FLYCTL = r"C:\Users\이아로\.fly\bin\flyctl.exe"
APP_NAME = "naverpay-delivery-tracker"

def run_ssh_command(command):
    """Run a command on Fly.io via SSH"""
    full_cmd = [FLYCTL, "ssh", "console", "-a", APP_NAME, "-C", command]
    print(f"Running: {command}")
    result = subprocess.run(full_cmd, capture_output=True, text=True, timeout=60)
    print(result.stdout)
    if result.stderr:
        print(f"Error: {result.stderr}")
    return result.returncode == 0

def main():
    print("=" * 60)
    print("Deploying Learning API to Fly.io")
    print("=" * 60)

    # Step 1: Download installer script
    print("\n[1/5] Downloading installer script...")
    cmd = (
        "python3 -c \\"
        "import urllib.request; "
        "urllib.request.urlretrieve("
        "'https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/install_learning_api.py', "
        "'/app/install_learning_api.py')\\"
    )
    if not run_ssh_command(cmd):
        print("Failed to download installer")
        return False

    # Step 2: Run installer
    print("\n[2/5] Running installer...")
    if not run_ssh_command("cd /app && python3 install_learning_api.py"):
        print("Failed to run installer")
        return False

    # Step 3: Check main.py
    print("\n[3/5] Checking if learning router is in main.py...")
    check_cmd = "grep -q 'from routers import learning' /app/main.py && echo 'Already imported' || echo 'Not imported'"
    run_ssh_command(check_cmd)

    # Step 4: Update main.py if needed
    print("\n[4/5] Updating main.py...")
    update_cmd = '''python3 << 'EOF'
import re

# Read main.py
with open('/app/main.py', 'r') as f:
    content = f.read()

modified = False

# Add import if not present
if 'from routers import learning' not in content:
    # Find the line with "from routers import"
    if 'from routers import' in content:
        content = re.sub(
            r'(from routers import[^\\n]+)',
            lambda m: m.group(1).rstrip() + ', learning',
            content
        )
        modified = True
        print("✓ Added learning import")
    else:
        print("✗ Could not find routers import line")

# Add router registration if not present
if 'learning.router' not in content:
    # Find the last include_router line
    pattern = r'(app\\.include_router\\([^)]+\\))'
    matches = list(re.finditer(pattern, content))
    if matches:
        last_match = matches[-1]
        insert_pos = last_match.end()
        new_line = '\\napp.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])'
        content = content[:insert_pos] + new_line + content[insert_pos:]
        modified = True
        print("✓ Added learning router registration")
    else:
        print("✗ Could not find router registration lines")

if modified:
    with open('/app/main.py', 'w') as f:
        f.write(content)
    print("✓ main.py updated successfully")
else:
    print("✓ main.py already up to date")
EOF'''

    run_ssh_command(update_cmd)

    # Step 5: Restart app
    print("\n[5/5] Restarting app...")
    if not run_ssh_command("supervisorctl restart all"):
        print("Warning: Could not restart app automatically")
        print("You may need to restart manually")

    print("\n" + "=" * 60)
    print("Deployment Complete!")
    print("=" * 60)

    # Wait a bit for app to restart
    print("\nWaiting 10 seconds for app to restart...")
    time.sleep(10)

    # Test the endpoint
    print("\nTesting API endpoint...")
    try:
        import urllib.request
        response = urllib.request.urlopen("https://naverpay-delivery-tracker.fly.dev/api/learning/status")
        print(f"✓ API Status: {response.status}")
        print(f"✓ Response: {response.read().decode()[:200]}...")
    except Exception as e:
        print(f"✗ API Test failed: {e}")
        print("Please check https://naverpay-delivery-tracker.fly.dev/api/learning/status manually")

    return True

if __name__ == "__main__":
    try:
        success = main()
        if success:
            print("\n✓ All steps completed successfully!")
        else:
            print("\n✗ Deployment failed. Please check the errors above.")
    except Exception as e:
        print(f"\n✗ Deployment failed with error: {e}")
        import traceback
        traceback.print_exc()
