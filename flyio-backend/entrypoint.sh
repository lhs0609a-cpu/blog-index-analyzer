#!/bin/bash
set -e

echo "Starting Blog Index Analyzer API..."

# Initialize database if needed
python -c "from database.learning_db import init_learning_tables; init_learning_tables()" 2>/dev/null || echo "Database init skipped"

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}
