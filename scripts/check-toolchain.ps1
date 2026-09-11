# Verifies that every toolchain which currently has targets in this repository is
# callable with an acceptable minimum version. Toolchains without targets are
# reported as inactive so early-stage checkouts stay green without pretending to pass.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$failures = @()

function Test-Tool {
  param([string]$Name, [string]$Command, [string[]]$MinimumVersion, [string]$Reason, [bool]$Active)
  if (-not $Active) {
    Write-Output ("SKIP {0}: no targets in repository yet ({1})" -f $Name, $Reason)
    return
  }
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $found) {
    $failures += ("{0} is required ({1}) but was not found on PATH" -f $Name, $Command)
    return
  }
  $raw = (& $Command --version 2>$null | Select-Object -First 1)
  $version = (($raw -replace '^v', '') -split '\s+' | Where-Object { $_ -match '^\d+(\.\d+)+$' } | Select-Object -First 1)
  if (-not $version) {
    $failures += ("{0} returned an unparseable version string: '{1}'" -f $Name, $raw)
    return
  }
  $parts = ($version -split '\.') | ForEach-Object { [int]$_ }
  $ok = $true
  for ($i = 0; $i -lt $MinimumVersion.Count -and $i -lt $parts.Count; $i++) {
    if ($parts[$i] -gt [int]$MinimumVersion[$i]) { break }
    if ($parts[$i] -lt [int]$MinimumVersion[$i]) { $ok = $false; break }
  }
  if ($ok) {
    Write-Output ("OK   {0} {1}" -f $Name, $version)
  } else {
    $failures += ("{0} {1} is older than required {2}" -f $Name, $version, ($MinimumVersion -join '.'))
  }
}

$hasPnpmTargets = (Test-Path (Join-Path $root 'pnpm-lock.yaml')) -or @(Get-ChildItem (Join-Path $root 'packages') -Recurse -Filter package.json -ErrorAction SilentlyContinue).Count -gt 0
$hasCargoTargets = Test-Path (Join-Path $root 'Cargo.toml')
$hasUvTargets = Test-Path (Join-Path $root 'pyproject.toml')

Test-Tool -Name 'Node.js' -Command 'node' -MinimumVersion @('20','19') -Reason 'workspace packages exist' -Active $hasPnpmTargets
Test-Tool -Name 'pnpm' -Command 'pnpm' -MinimumVersion @('10') -Reason 'workspace packages exist' -Active $hasPnpmTargets
Test-Tool -Name 'Cargo' -Command 'cargo' -MinimumVersion @('1','80') -Reason 'workspace crates exist' -Active $hasCargoTargets
Test-Tool -Name 'uv' -Command 'uv' -MinimumVersion @('0','7') -Reason 'workspace Python packages exist' -Active $hasUvTargets

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}
Write-Output 'Toolchain check passed.'
