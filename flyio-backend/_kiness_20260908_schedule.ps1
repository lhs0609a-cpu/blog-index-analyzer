$ErrorActionPreference = 'Stop'
$taskDirectory = 'D:\developer\blog-index-analyzer\flyio-backend'
$taskScript = Join-Path $taskDirectory '_kiness_20260908_monitor.js'
$taskNode = (Get-Command node).Source
$taskName = 'Kiness_PC5_441986_20260908'
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskArguments = '"' + $taskScript + '" --apply'
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.Actions.Arguments -ne $taskArguments) {
    throw 'Task name is already used by a different action.'
}
$taskAction = New-ScheduledTaskAction -Execute $taskNode -Argument $taskArguments -WorkingDirectory $taskDirectory
$taskTriggers = @('09:00', '13:00', '17:00', '21:00') | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTriggers -Principal $taskPrincipal -Settings $taskSettings -Description '키네스 441986 지역 성장클리닉 PC5 예상입찰 재조회. 총검색예산 198000원 가드. 로그인된 PC에서 실행.' -Force | Out-Null
$registeredTask = Get-ScheduledTask -TaskName $taskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
@{
    name = $registeredTask.TaskName
    state = [string]$registeredTask.State
    nextRun = $taskInfo.NextRunTime.ToString('o')
    timesKST = @('09:00', '13:00', '17:00', '21:00')
    execution = $taskNode
    arguments = $taskArguments
    limitation = 'Current user must be logged in and this PC must be awake; battery power follows Windows task defaults.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDirectory '_kiness_20260908_schedule.json') -Encoding utf8
Write-Output "Scheduled task ready: $($registeredTask.TaskName); next run $($taskInfo.NextRunTime)"
