# Upload learning API files to Fly.io

Write-Host "========================================"
Write-Host "Uploading Learning API to Fly.io"
Write-Host "========================================"

$deployPath = "G:\내 드라이브\developer\blog-index-analyzer\deploy"

# Upload routers/learning.py
Write-Host "`n[1/3] Uploading routers/learning.py..."
Get-Content "$deployPath\routers\learning.py" -Raw | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/routers/learning.py"

# Upload database/learning_db.py
Write-Host "`n[2/3] Uploading database/learning_db.py..."
Get-Content "$deployPath\database\learning_db.py" -Raw | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/database/learning_db.py"

# Upload services/learning_engine.py
Write-Host "`n[3/3] Uploading services/learning_engine.py..."
Get-Content "$deployPath\services\learning_engine.py" -Raw | flyctl ssh console -a naverpay-delivery-tracker -C "cat > /app/services/learning_engine.py"

Write-Host "`n========================================"
Write-Host "Upload Complete!"
Write-Host "========================================"
