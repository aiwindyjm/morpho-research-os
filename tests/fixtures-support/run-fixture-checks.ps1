# Runs every fixture loader test suite and verifies that Node, Python, and Rust
# produce a byte-identical canonical summary for the golden fixtures.
# Usage: powershell -ExecutionPolicy Bypass -File tests/fixtures-support/run-fixture-checks.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repoRoot
$failures = New-Object System.Collections.Generic.List[string]

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Output "==> $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        $script:failures.Add("$Name exited with code $LASTEXITCODE") | Out-Null
    }
}

try {
    Invoke-Step 'TypeScript loader tests' {
        & node --test 'tests/fixtures-support/loaders/fixture-envelope.test.ts'
    }
    Invoke-Step 'Python loader tests' {
        & python 'tests/fixtures-support/loaders/test_fixture_envelope.py'
    }
    Invoke-Step 'Rust loader tests' {
        & cargo test --quiet --manifest-path 'tests/fixtures-support/loaders/rust-loader/Cargo.toml'
    }

    # Native tools legitimately write warnings/progress to stderr (node's
    # MODULE_TYPELESS_PACKAGE_JSON, cargo's "Compiling..." notes). Under
    # Windows PowerShell 5.1 with $ErrorActionPreference='Stop', redirecting
    # stderr via 2>&1 turns the first warning into a terminating
    # NativeCommandError and aborts the script. Capture outside Stop preference.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $nodeOutput = (& node 'tests/fixtures-support/loaders/summarize.ts' 2>&1) -join "`n"
    $pythonOutput = (& python 'tests/fixtures-support/loaders/fixture_envelope.py' --summary 2>&1) -join "`n"
    $rustOutput = (& cargo run --quiet --manifest-path 'tests/fixtures-support/loaders/rust-loader/Cargo.toml' --bin summarize 2>&1) -join "`n"
    $ErrorActionPreference = $previousPreference

    function Get-Summary([string]$text) {
        foreach ($line in ($text -split "`n")) {
            $trimmed = $line.Trim()
            if ($trimmed.StartsWith('FIXTURE_SUMMARY ')) {
                return $trimmed.Substring('FIXTURE_SUMMARY '.Length)
            }
        }
        return $null
    }

    $nodeSummary = Get-Summary $nodeOutput
    $pythonSummary = Get-Summary $pythonOutput
    $rustSummary = Get-Summary $rustOutput

    if (-not $nodeSummary -or -not $pythonSummary -or -not $rustSummary) {
        $failures.Add('at least one loader did not print a FIXTURE_SUMMARY line') | Out-Null
        Write-Output $nodeOutput
        Write-Output $pythonOutput
        Write-Output $rustOutput
    }
    elseif ($nodeSummary -ceq $pythonSummary -and $pythonSummary -ceq $rustSummary) {
        Write-Output "Fixture summary identical across Node, Python, and Rust:"
        Write-Output "  $nodeSummary"
    }
    else {
        $failures.Add('fixture summaries diverge between languages') | Out-Null
        Write-Output "Node:   $nodeSummary"
        Write-Output "Python: $pythonSummary"
        Write-Output "Rust:   $rustSummary"
    }
}
finally {
    Pop-Location
}

if ($failures.Count -gt 0) {
    Write-Error ('Fixture checks failed: ' + ($failures -join '; '))
    exit 1
}
Write-Output 'All fixture checks passed.'
