# Contract drift check: verifies the packages/schemas registry and every
# examples/fixtures envelope. Rule codes match the cross-language loaders in
# tests/fixtures-support/loaders so failures are attributable everywhere.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/check-contracts.ps1

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$schemasDir = Join-Path $repoRoot 'packages/schemas'
$fixturesDir = Join-Path $repoRoot 'examples/fixtures'
$draft = 'https://json-schema.org/draft/2020-12/schema'
$envelopeVersion = '1.0'
$origins = @('synthetic', 'curated-public', 'user-contributed')

$errors = New-Object System.Collections.Generic.List[string]
function Add-Error([string]$file, [string]$message) {
    $script:errors.Add(('' + $file + ': ' + $message)) | Out-Null
}

function Get-JsonObject([string]$path) {
    try {
        return Get-Content -Raw -Path $path | ConvertFrom-Json
    }
    catch {
        Add-Error $path ('not valid JSON: ' + $_.Exception.Message)
        return $null
    }
}

# --- 1. Schema registry -------------------------------------------------
$schemaRegistry = @{}
$schemaFiles = @(Get-ChildItem -Path $schemasDir -Filter '*.json' -File | Sort-Object Name)
foreach ($file in $schemaFiles) {
    $schema = Get-JsonObject $file.FullName
    if ($null -eq $schema) { continue }

    $declaredDraft = $schema.'$schema'
    if (-not $declaredDraft) {
        Add-Error $file.Name 'missing "$schema" draft declaration'
    }
    elseif ($declaredDraft -ne $draft) {
        Add-Error $file.Name ('unsupported schema draft "{0}"; expected {1}' -f $declaredDraft, $draft)
    }

    $id = $schema.'$id'
    if (-not $id) {
        Add-Error $file.Name 'missing "$id"'
        continue
    }
    $idSegment = ($id -split '/')[-1]
    if ($idSegment -ne $file.Name) {
        Add-Error $file.Name ('schema drift: $id segment "{0}" does not match file name "{1}"' -f $idSegment, $file.Name)
    }
    if ($schemaRegistry.ContainsKey($id)) {
        Add-Error $file.Name ('duplicate schema id "{0}" (already declared by {1})' -f $id, $schemaRegistry[$id])
    }
    else {
        $schemaRegistry[$id] = $file.Name
    }
}

# --- 2. Fixture envelopes ----------------------------------------------
function Test-ResolvablePayload([object]$container, [string]$what, [string]$file) {
    $schemaId = $container.schema
    if (-not $schemaId -or $schemaId -isnot [string]) {
        Add-Error $file ($what + '.schema must be a non-empty string [input-shape]')
        return $false
    }
    if (-not $schemaRegistry.ContainsKey($schemaId)) {
        Add-Error $file ('{0}.schema "{1}" is not registered in packages/schemas [schema-unresolved]' -f $what, $schemaId)
        return $false
    }
    $schema = Get-JsonObject (Join-Path $schemasDir $schemaRegistry[$schemaId])
    if ($null -eq $schema) { return $false }
    $payload = $container.payload
    if ($null -eq $payload -or $payload -isnot [pscustomobject]) {
        Add-Error $file ($what + '.payload must be a JSON object [payload-shape]')
        return $false
    }
    foreach ($key in @($schema.required)) {
        if ($null -eq $key) { continue }
        if (-not $payload.PSObject.Properties[$key]) {
            Add-Error $file ('{0}.payload is missing required field "{1}" of {2} [payload-required]' -f $what, $key, $schemaId)
        }
    }
    if ($schema.properties) {
        foreach ($property in $schema.properties.PSObject.Properties) {
            $value = $payload.PSObject.Properties[$property.Name]
            if (-not $value -or -not $property.Value.PSObject.Properties['const']) { continue }
            $constant = $property.Value.'const'
            if ($null -ne $constant -and $value.Value -ne $constant) {
                Add-Error $file ('{0}.payload field "{1}" must equal {2} per {3} [payload-const]' -f $what, $property.Name, $constant, $schemaId)
            }
        }
    }
    return $true
}

$fixtureFiles = @(Get-ChildItem -Path $fixturesDir -Directory | Sort-Object Name | ForEach-Object {
    Join-Path $_.FullName 'fixture.json'
} | Where-Object { Test-Path $_ })
$fixtureCount = 0
foreach ($file in $fixtureFiles) {
    $fixtureCount += 1
    $dirName = Split-Path (Split-Path -Parent $file) -Leaf
    $envelope = Get-JsonObject $file
    if ($null -eq $envelope) { continue }
    if ($envelope -isnot [pscustomobject]) {
        Add-Error $file 'fixture envelope must be a JSON object [shape]'
        continue
    }

    $knownKeys = @('fixture_envelope_version', 'fixture_id', 'kind', 'description', 'input', 'expected_outputs', 'provenance', 'stability')
    foreach ($property in $envelope.PSObject.Properties) {
        if ($knownKeys -notcontains $property.Name) {
            Add-Error $file ('unknown top-level field "{0}" [unknown-field]' -f $property.Name)
        }
    }
    foreach ($key in @('fixture_envelope_version', 'fixture_id', 'kind', 'input', 'provenance')) {
        if (-not $envelope.PSObject.Properties[$key]) {
            Add-Error $file ('missing required field "{0}" [missing-field]' -f $key)
        }
    }

    if ($envelope.fixture_envelope_version -ne $envelopeVersion) {
        Add-Error $file ('fixture_envelope_version must be "{0}" [envelope-version]' -f $envelopeVersion)
    }
    $fixtureId = $envelope.fixture_id
    if ($fixtureId -isnot [string] -or $fixtureId -notmatch '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$') {
        Add-Error $file 'fixture_id is not kebab-case [fixture-id]'
    }
    elseif ($fixtureId -ne $dirName) {
        Add-Error $file ('fixture_id "{0}" must equal its directory name "{1}" [fixture-id]' -f $fixtureId, $dirName)
    }
    $kind = $envelope.kind
    if ($kind -isnot [string] -or $kind -notmatch '^[a-z][a-z0-9-]*$') {
        Add-Error $file 'kind is not a lowercase kebab-case name [kind]'
    }
    if (-not $envelope.PSObject.Properties['input']) { continue }
    $input = $envelope.input
    if ($null -eq $input -or $input -isnot [pscustomobject]) {
        Add-Error $file 'input must be a JSON object [input-shape]'
        continue
    }
    foreach ($property in $input.PSObject.Properties) {
        if (@('schema', 'payload') -notcontains $property.Name) {
            Add-Error $file ('unknown input field "{0}" [input-shape]' -f $property.Name)
        }
    }
    if (-not $input.PSObject.Properties['schema'] -or -not $input.PSObject.Properties['payload']) {
        Add-Error $file 'input must contain schema and payload [input-shape]'
        continue
    }
    if ($kind -is [string] -and $input.schema -is [string]) {
        $baseName = (($input.schema -split '/')[-1] -replace '\.json$', '') -replace '\.v\d+$', ''
        if ($baseName -ne $kind) {
            Add-Error $file ('kind "{0}" does not match input schema base name "{1}" [kind-mismatch]' -f $kind, $baseName)
        }
    }
    $null = Test-ResolvablePayload $input 'input' $file

    if ($envelope.PSObject.Properties['expected_outputs']) {
        $outputs = $envelope.expected_outputs
        if ($outputs -isnot [array]) {
            Add-Error $file 'expected_outputs must be an array [output-shape]'
        }
        else {
            foreach ($output in $outputs) {
                if ($output -isnot [pscustomobject]) {
                    Add-Error $file 'expected_outputs entry must be a JSON object [output-shape]'
                    continue
                }
                foreach ($property in $output.PSObject.Properties) {
                    if (@('name', 'schema', 'payload') -notcontains $property.Name) {
                        Add-Error $file ('unknown expected_outputs field "{0}" [output-shape]' -f $property.Name)
                    }
                }
                if (-not $output.PSObject.Properties['name'] -or -not $output.PSObject.Properties['schema'] -or -not $output.PSObject.Properties['payload']) {
                    Add-Error $file 'expected_outputs entry must contain name, schema, payload [output-shape]'
                    continue
                }
                if ($output.name -isnot [string] -or $output.name -notmatch '^[a-z][a-z0-9-]*$') {
                    Add-Error $file 'expected_outputs name is invalid [output-shape]'
                }
                $null = Test-ResolvablePayload $output ('expected_outputs "{0}"' -f $output.name) $file
            }
        }
    }

    if (-not $envelope.PSObject.Properties['provenance']) { continue }
    $provenance = $envelope.provenance
    if ($null -eq $provenance -or $provenance -isnot [pscustomobject]) {
        Add-Error $file 'provenance must be a JSON object [provenance-shape]'
        continue
    }
    foreach ($property in $provenance.PSObject.Properties) {
        if (@('origin', 'synthetic', 'license', 'notes') -notcontains $property.Name) {
            Add-Error $file ('unknown provenance field "{0}" [provenance-shape]' -f $property.Name)
        }
    }
    if (-not $provenance.PSObject.Properties['origin'] -or -not $provenance.PSObject.Properties['synthetic']) {
        Add-Error $file 'provenance must contain origin and synthetic [provenance-shape]'
        continue
    }
    if ($origins -notcontains $provenance.origin) {
        Add-Error $file ('provenance.origin must be one of {0} [provenance-shape]' -f ($origins -join ', '))
    }
    if ($provenance.synthetic -isnot [bool]) {
        Add-Error $file 'provenance.synthetic must be a boolean [provenance-shape]'
    }

    if ($envelope.PSObject.Properties['stability']) {
        $stability = $envelope.stability
        if ($null -eq $stability -or $stability -isnot [pscustomobject]) {
            Add-Error $file 'stability must be a JSON object [stability-shape]'
            continue
        }
        foreach ($property in $stability.PSObject.Properties) {
            if (@('deterministic', 'ignored_fields') -notcontains $property.Name) {
                Add-Error $file ('unknown stability field "{0}" [stability-shape]' -f $property.Name)
            }
        }
        if ($stability.PSObject.Properties['deterministic'] -and $stability.deterministic -isnot [bool]) {
            Add-Error $file 'stability.deterministic must be a boolean [stability-shape]'
        }
        if ($stability.PSObject.Properties['ignored_fields'] -and $stability.ignored_fields -isnot [array]) {
            Add-Error $file 'stability.ignored_fields must be an array of strings [stability-shape]'
        }
    }
}

if ($errors.Count -gt 0) {
    [Console]::Error.WriteLine(('Contract check failed with {0} error(s):' -f $errors.Count))
    foreach ($message in $errors) { [Console]::Error.WriteLine('  ' + $message) }
    exit 1
}
Write-Output ('Contract check passed: {0} schema(s), {1} fixture(s).' -f $schemaRegistry.Count, $fixtureCount)
