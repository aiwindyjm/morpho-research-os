$ErrorActionPreference = 'Stop'

$planPath = Join-Path $PSScriptRoot '..\docs\development\AI_PARALLEL_DEVELOPMENT_PLAN.md'
$statusPath = Join-Path $PSScriptRoot '..\docs\development\TASK_STATUS.md'
$plan = Get-Content -Raw $planPath
$status = Get-Content -Raw $statusPath

$taskPattern = '`([A-Z][A-Z0-9]*-[0-9]{2})`'
$planIds = [regex]::Matches($plan, $taskPattern) | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
$statusIds = [regex]::Matches($status, '\| `([A-Z][A-Z0-9]*-[0-9]{2})` \|') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique

$missing = @($planIds | Where-Object { $_ -notin $statusIds })
$unexpected = @($statusIds | Where-Object { $_ -notin $planIds })
if ($missing.Count -gt 0 -or $unexpected.Count -gt 0) {
    if ($missing.Count -gt 0) { Write-Error "Task status is missing: $($missing -join ', ')" }
    if ($unexpected.Count -gt 0) { Write-Error "Task status has unexpected IDs: $($unexpected -join ', ')" }
    exit 1
}

$valid = @('Planned', 'In Progress', 'Review', 'Merged', 'Blocked', 'Deferred')
$rows = [regex]::Matches($status, '(?m)^\| `([A-Z][A-Z0-9]*-[0-9]{2})` \| `([^`]+)` \|')
foreach ($row in $rows) {
    if ($row.Groups[2].Value -notin $valid) {
        Write-Error "Invalid status for $($row.Groups[1].Value): $($row.Groups[2].Value)"
        exit 1
    }
}

Write-Output "Task status check passed: $($planIds.Count) task IDs are tracked."
