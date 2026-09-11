$trackedPrivate = @(git ls-files private)
$allowed = 'private/conversations/.gitkeep'
$unexpected = @($trackedPrivate | Where-Object { $_ -and $_ -ne $allowed })
if ($unexpected.Count -gt 0) {
  Write-Error ("Private files are tracked: " + ($unexpected -join ', '))
  exit 1
}
Write-Output 'Public boundary check passed: no private execution or conversation files are tracked.'
