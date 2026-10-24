$ErrorActionPreference = 'Stop'
$kinessWorkspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $kinessWorkspace
$kinessLog = Join-Path $PSScriptRoot 'reports/kiness_20260914/followup.log'
"Follow-up started: $(Get-Date -Format o)" | Out-File -LiteralPath $kinessLog -Encoding utf8
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'reports/kiness_20260914/all_regions/applied.json')) {
    & node (Join-Path $PSScriptRoot '_kiness_20260914_all_regions.js') verify 2>&1 | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
} else {
    & node (Join-Path $PSScriptRoot '_kiness_20260914_apply.js') --verify-only 2>&1 | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
}
if ($LASTEXITCODE -ne 0) { throw 'Keyword status verification failed; see followup.log' }
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'reports/kiness_20260914/all_regions/verified_rows.json')) {
    & python (Join-Path $PSScriptRoot '_kiness_20260914_full_census.py') 2>&1 | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
} else {
    & python (Join-Path $PSScriptRoot '_kiness_20260914_serp.py') followup 2>&1 | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
}
if ($LASTEXITCODE -ne 0) { throw 'Search observation failed; see followup.log' }
& python (Join-Path $PSScriptRoot '_kiness_20260914_report.py') 2>&1 | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Report generation failed; see followup.log' }
"Follow-up completed: $(Get-Date -Format o)" | Out-File -LiteralPath $kinessLog -Append -Encoding utf8
