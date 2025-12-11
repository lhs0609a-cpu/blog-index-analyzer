"""
Upload learning API files to Fly.io using SSH
"""
import subprocess
import base64
import os

FLYCTL = "flyctl"
APP_NAME = "naverpay-delivery-tracker"

def run_ssh_command(command):
    """Run a command on Fly.io via SSH"""
    full_cmd = f'{FLYCTL} ssh console -a {APP_NAME} -C "{command}"'
    print(f"Running: {command[:50]}...")
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0 and "Error: The handle is invalid" not in result.stderr:
        print(f"Error: {result.stderr}")
    return result.stdout

def upload_file_base64(local_path, remote_path):
    """Upload a file to Fly.io using base64 encoding"""
    with open(local_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Encode to base64
    b64_content = base64.b64encode(content.encode('utf-8')).decode('ascii')

    # Upload via SSH - decode base64 and write to file
    command = f"echo '{b64_content}' | base64 -d > {remote_path}"
    run_ssh_command(command)
    print(f"Uploaded: {remote_path}")

def main():
    base_path = r"G:\내 드라이브\developer\blog-index-analyzer"

    files_to_upload = [
        (f"{base_path}/flyio-backend/routers/learning.py", "/app/routers/learning.py"),
        (f"{base_path}/flyio-backend/database/learning_db.py", "/app/database/learning_db.py"),
        (f"{base_path}/flyio-backend/services/learning_engine.py", "/app/services/learning_engine.py"),
    ]

    # Create services directory
    run_ssh_command("mkdir -p /app/services")
    run_ssh_command("touch /app/services/__init__.py")

    for local_path, remote_path in files_to_upload:
        print(f"\nUploading {os.path.basename(local_path)}...")
        upload_file_base64(local_path, remote_path)

    print("\n✅ All files uploaded!")
    print("\nNow updating main.py to include learning router...")

if __name__ == "__main__":
    main()
