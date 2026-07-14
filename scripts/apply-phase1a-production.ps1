[CmdletBinding()]
param(
  [string]$ProjectRef = "mbgublyqnyghmvqfooao",
  [string]$TypedConfirmation,
  [switch]$DryRunOnly
)

$ErrorActionPreference = "Stop"
$expectedProjectRef = "mbgublyqnyghmvqfooao"
$expectedMigration = "20260713230000_daily_operations_phase1a_corrective.sql"
$requiredConfirmation = "APPLY_PHASE1A_TO_PRODUCTION"

if ($ProjectRef -ne $expectedProjectRef) {
  throw "Refusing to run: ProjectRef must be $expectedProjectRef."
}

if ($TypedConfirmation -cne $requiredConfirmation) {
  throw "Refusing to run: pass -TypedConfirmation $requiredConfirmation exactly."
}

Get-Command supabase -ErrorAction Stop | Out-Null

$linkedRefPath = Join-Path $PSScriptRoot "..\supabase\.temp\project-ref"
if (-not (Test-Path -LiteralPath $linkedRefPath)) {
  throw "Refusing to run: no linked Supabase project ref was found at $linkedRefPath."
}

$linkedRef = (Get-Content -LiteralPath $linkedRefPath -Raw).Trim()
if ($linkedRef -ne $expectedProjectRef) {
  throw "Refusing to run: this checkout is linked to $linkedRef, not $expectedProjectRef."
}

$projects = @(& supabase projects list --output json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or -not ($projects | Where-Object { $_.id -eq $expectedProjectRef })) {
  throw "Refusing to run: the authenticated Supabase CLI account cannot confirm $expectedProjectRef."
}

# The dry run must show exactly the one approved pending migration. Any old
# 20260407 history discrepancy, extra migration, or unparseable output stops
# here; this script never rewrites migration history and never uses --include-all.
$dryRun = (& supabase db push --linked --dry-run 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
  throw "Supabase dry run failed. No migration was applied. Output:`n$dryRun"
}

$migrationIds = @([regex]::Matches($dryRun, '(?<!\d)(20\d{12})(?!\d)') |
  ForEach-Object { $_.Groups[1].Value } |
  Select-Object -Unique)
if ($migrationIds.Count -ne 1 -or $migrationIds[0] -ne "20260713230000" -or $dryRun -notmatch [regex]::Escape($expectedMigration)) {
  throw "Refusing to run: dry run did not identify exactly $expectedMigration. Output:`n$dryRun"
}
if ($dryRun -match "20260407") {
  throw "Refusing to run: dry run referenced historical 20260407 migration state. Do not repair history automatically."
}

Write-Host "Verified approved production target and one pending Phase 1A migration."
if ($DryRunOnly) {
  Write-Host "DryRunOnly was specified. No migration was applied."
  exit 0
}

& supabase db push --linked
if ($LASTEXITCODE -ne 0) {
  throw "Phase 1A database migration command failed. Stop and follow the runbook recovery section."
}

Write-Host "Phase 1A migration command completed. Run the after-evidence capture before deploying application code."
