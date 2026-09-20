$trackedPrivate = @(git -C "$PSScriptRoot/.." ls-files -- private)
if ($LASTEXITCODE -ne 0) {
  Write-Error 'Unable to inspect tracked private files.'
  exit 1
}
if ($trackedPrivate.Count -gt 0) {
  Write-Error ("Private files are tracked: " + ($trackedPrivate -join ', '))
  exit 1
}
Write-Output 'Public boundary check passed: no private execution or conversation files are tracked.'
