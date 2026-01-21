$files = Get-ChildItem -Path "." -Recurse -Include "*.tsx","*.ts"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Encoding UTF8 -Raw
    if ($content -match "naverpay-delivery-tracker\.fly\.dev") {
        $newContent = $content -replace "naverpay-delivery-tracker\.fly\.dev", "api.blrank.co.kr"
        [System.IO.File]::WriteAllText($file.FullName, $newContent, [System.Text.UTF8Encoding]::new($false))
        Write-Host "Updated: $($file.Name)"
    }
}
Write-Host "Done!"
