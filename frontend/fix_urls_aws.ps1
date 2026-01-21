$files = Get-ChildItem -Path "." -Recurse -Include "*.tsx","*.ts"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -match "naverpay-delivery-tracker\.fly\.dev") {
        $newContent = $content -replace "https://naverpay-delivery-tracker\.fly\.dev", "https://api.blrank.co.kr"
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Updated: $($file.Name)"
    }
}
