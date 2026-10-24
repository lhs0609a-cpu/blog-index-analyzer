$ErrorActionPreference = 'Stop'
$kinessNow = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, [TimeZoneInfo]::FindSystemTimeZoneById('Korea Standard Time'))
if ($kinessNow.ToString('yyyy-MM-dd') -ne '2026-09-09') { exit 0 }
Set-Location -LiteralPath 'D:\developer\blog-index-analyzer\flyio-backend'
$kinessLog = Join-Path 'reports\kiness_delivery_boost_20260909' ('watch_' + $kinessNow.ToString('yyyyMMdd_HHmmss') + '.log')
& 'C:\Program Files\nodejs\node.exe' 'D:\developer\blog-index-analyzer\flyio-backend\_kiness_20260908_monitor.js' '--apply' *> $kinessLog
exit $LASTEXITCODE
