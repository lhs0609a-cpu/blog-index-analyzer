#!/bin/bash
set -e

echo "========================================="
echo "Installing Learning API..."
echo "========================================="

# Download learning API files from GitHub
echo "[1/3] Downloading routers/learning.py..."
wget -q -O /app/routers/learning.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/routers/learning.py

echo "[2/3] Downloading database/learning_db.py..."
wget -q -O /app/database/learning_db.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/database/learning_db.py

echo "[3/3] Downloading services/learning_engine.py..."
wget -q -O /app/services/learning_engine.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/services/learning_engine.py

echo "[4/5] Updating main.py..."
python3 << 'EOF'
# Read main.py
with open('/app/main.py', 'r') as f:
    lines = f.readlines()

# Add learning import
import_added = False
router_added = False

for i, line in enumerate(lines):
    # Add learning import after routers import
    if 'from routers import auth, blogs, comprehensive_analysis, system' in line and not import_added:
        if 'learning' not in line:
            lines.insert(i+1, 'import routers.learning as learning\n')
            import_added = True

    # Add learning router after system router
    if 'app.include_router(system.router' in line and not router_added:
        if i+1 < len(lines) and 'learning.router' not in lines[i+1]:
            lines.insert(i+1, 'app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])\n')
            router_added = True

# Write back
with open('/app/main.py', 'w') as f:
    f.writelines(lines)

print("✓ main.py updated")
EOF

echo "[5/5] Initializing learning database..."
python3 -c "from database.learning_db import init_learning_tables; init_learning_tables(); print('✓ Database initialized')"

echo "========================================="
echo "Learning API installed successfully!"
echo "========================================="

# Start the application
echo "Starting application..."
exec python -m uvicorn main:app --host 0.0.0.0 --port 8001
