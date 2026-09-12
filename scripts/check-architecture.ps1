# Architecture boundary check.
#
# Detects, at any stage of the build:
#   - frontend code reaching into SQLite, filesystem, processes, shell, or secrets
#   - real provider endpoints inside tests/ or examples/
#   - hardcoded secret literals in tracked files
#
# Conditional by design: checks activate when the corresponding directories
# appear, so the check never fails vacuously on a docs-only repository and
# never blocks scaffolding work in other workgroups.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/check-architecture.ps1           # scan the repository
#   powershell -ExecutionPolicy Bypass -File scripts/check-architecture.ps1 -SelfTest # verify detectors against tests/architecture/cases

param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$frontendRules = @(
    @{ Code = 'frontend-sqlite';     Pattern = '@tauri-apps/plugin-sql|better-sqlite3|sql\.js' },
    @{ Code = 'frontend-filesystem'; Pattern = '@tauri-apps/(api/)?fs|@tauri-apps/plugin-fs|node:fs|[''"]fs[''"]' },
    @{ Code = 'frontend-process';    Pattern = '@tauri-apps/(api/)?process|@tauri-apps/plugin-process|node:child_process|[''"]child_process[''"]' },
    @{ Code = 'frontend-shell';      Pattern = '@tauri-apps/(api/)?shell|@tauri-apps/plugin-shell' },
    @{ Code = 'frontend-secret';     Pattern = 'import\.meta\.env\.[A-Za-z_]*(KEY|SECRET|TOKEN|PASSWORD)' }
)
$secretRules = @(
    @{ Code = 'secret-openai-style'; Pattern = 'sk-[A-Za-z0-9]{20,}' },
    @{ Code = 'secret-github-token'; Pattern = 'gh[pos]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}' },
    @{ Code = 'secret-aws-key';      Pattern = 'AKIA[0-9A-Z]{16}' },
    @{ Code = 'secret-slack-token';  Pattern = 'xox[baprs]-[A-Za-z0-9-]{10,}' },
    @{ Code = 'secret-private-key';  Pattern = '-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY' }
)
$providerEndpointRules = @(
    @{ Code = 'real-provider-endpoint'; Pattern = 'api\.openai\.com|api\.anthropic\.com|api\.deepseek\.com|open\.bigmodel\.cn|generativelanguage\.googleapis\.com|dashscope\.aliyuncs\.com|api\.mistral\.ai|openrouter\.ai|api\.groq\.com' }
)

# tests/architecture/cases holds inert detector test data with fake secrets;
# it is excluded from repository scans and only read in -SelfTest mode.
$casesRelative = 'tests/architecture/cases'

function Find-Violations([string]$path, [object[]]$rules) {
    $found = @()
    if (-not (Test-Path $path)) { return $found }
    $lines = $null
    try {
        $lines = [System.IO.File]::ReadAllLines($path)
    }
    catch {
        return $found
    }
    for ($index = 0; $index -lt $lines.Length; $index++) {
        foreach ($rule in $rules) {
            if ($lines[$index] -match $rule.Pattern) {
                $found += [pscustomobject]@{ File = $path; Line = $index + 1; Rule = $rule.Code }
            }
        }
    }
    return $found
}

if ($SelfTest) {
    $casesDir = Join-Path $repoRoot ($casesRelative -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path $casesDir)) {
        [Console]::Error.WriteLine('Architecture self-test failed: cases directory is missing.')
        exit 1
    }
    $allRules = $frontendRules + $secretRules + $providerEndpointRules
    $failures = New-Object System.Collections.Generic.List[string]
    $caseCount = 0
    foreach ($caseFile in (Get-ChildItem -Path $casesDir -File | Sort-Object Name)) {
        if ($caseFile.Name -notmatch '^(.+)--(detect|clean)\.[A-Za-z0-9.]+$') { continue }
        $caseCount += 1
        $rule = $Matches[1]
        $expectation = $Matches[2]
        $violations = Find-Violations $caseFile.FullName $allRules
        $detected = @($violations | ForEach-Object { $_.Rule } | Sort-Object -Unique)
        if ($expectation -eq 'detect') {
            if ($detected -notcontains $rule) {
                $failures.Add(('case "{0}" expected rule {1} to fire, but it did not' -f $caseFile.Name, $rule)) | Out-Null
            }
        }
        else {
            if ($detected.Count -gt 0) {
                $failures.Add(('case "{0}" expected no detection, but got: {1}' -f $caseFile.Name, ($detected -join ', '))) | Out-Null
            }
        }
    }
    if ($failures.Count -gt 0) {
        [Console]::Error.WriteLine('Architecture self-test failed:')
        foreach ($failure in $failures) { [Console]::Error.WriteLine('  ' + $failure) }
        exit 1
    }
    Write-Output ('Architecture self-test passed: {0} case(s) behave as declared.' -f $caseCount)
    exit 0
}

$violations = New-Object System.Collections.Generic.List[object]

# --- 1. Frontend resource boundary (conditional) ------------------------
$frontendSrc = Join-Path $repoRoot 'apps/desktop/src'
if (Test-Path $frontendSrc) {
    $frontendFiles = @(Get-ChildItem -Path $frontendSrc -Recurse -File -Include *.ts, *.tsx, *.js, *.jsx)
    foreach ($file in $frontendFiles) {
        foreach ($violation in (Find-Violations $file.FullName $frontendRules)) {
            $violations.Add($violation) | Out-Null
        }
    }
}

# --- 2. Real provider endpoints in tests and examples -------------------
foreach ($rootName in @('tests', 'examples')) {
    $dir = Join-Path $repoRoot $rootName
    if (-not (Test-Path $dir)) { continue }
    $scanFiles = @(Get-ChildItem -Path $dir -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' -and $_.FullName -notmatch '[\\/]cases[\\/]' -and $_.FullName -notmatch '[\\/]rust-loader[\\/]target[\\/]' })
    foreach ($file in $scanFiles) {
        foreach ($violation in (Find-Violations $file.FullName $providerEndpointRules)) {
            $violations.Add($violation) | Out-Null
        }
    }
}

# --- 3. Secret literals in tracked files --------------------------------
Push-Location $repoRoot
try {
    $tracked = @(git ls-files)
    foreach ($relative in $tracked) {
        if ($relative -like 'tests/architecture/cases/*') { continue }
        $absolute = Join-Path $repoRoot ($relative -replace '/', [System.IO.Path]::DirectorySeparatorChar)
        foreach ($violation in (Find-Violations $absolute $secretRules)) {
            $violations.Add($violation) | Out-Null
        }
    }
}
finally {
    Pop-Location
}

if ($violations.Count -gt 0) {
    [Console]::Error.WriteLine(('Architecture check failed with {0} violation(s):' -f $violations.Count))
    foreach ($violation in $violations) {
        [Console]::Error.WriteLine(('  {0}:{1} [{2}]' -f $violation.File, $violation.Line, $violation.Rule))
    }
    [Console]::Error.WriteLine('Frontend must use the typed service boundary; tests and fixtures must stay offline; secrets never enter Git.')
    exit 1
}
Write-Output 'Architecture check passed: no boundary violations found.'
