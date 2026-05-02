<#
.SYNOPSIS
  Compare this repo (trackIT v2) to a shallow baseline under .baselines/ or a local legacy folder.

.DESCRIPTION
  Produces a text report: files only on the left (v2), only on the right (baseline),
  and same relative path but different size. Excludes node_modules, build outputs, .git, .baselines.

.PARAMETER Baseline
  One of: trackIT | trackITv1 | TrackIT_d | inventorytrack | local-trackIT

.PARAMETER LegacyLocalPath
  Used when Baseline is 'local-trackIT'. Defaults to env TRACKIT_LEGACY_ROOT, else
  H:\projects\cursor_projects\TEd_trackIT\trackIT if that path exists.

.EXAMPLE
  .\scripts\baselines\Compare-ToBaseline.ps1 -Baseline trackIT
  npm run baselines:compare -- -Baseline trackITv1
#>
[CmdletBinding()]
param(
  [ValidateSet('trackIT', 'trackITv1', 'TrackIT_d', 'inventorytrack', 'local-trackIT')]
  [string] $Baseline = 'trackIT',

  [string] $LegacyLocalPath = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ReportsDir = Join-Path $RepoRoot 'baseline-reports'
if (-not (Test-Path $ReportsDir)) {
  New-Item -ItemType Directory -Path $ReportsDir | Out-Null
}

$shallowTrackIT = Join-Path $RepoRoot '.baselines\trackIT'
$defaultLegacyRoot = 'H:\projects\cursor_projects\TEd_trackIT\trackIT'
if ($Baseline -eq 'trackIT' -and -not (Test-Path $shallowTrackIT)) {
  $hasLocal = ($env:TRACKIT_LEGACY_ROOT -and (Test-Path $env:TRACKIT_LEGACY_ROOT)) -or (Test-Path $defaultLegacyRoot)
  if ($hasLocal) {
    Write-Host "Note: .baselines/trackIT missing; using local legacy tree. Run npm run baselines:sync for GitHub clones."
    $Baseline = 'local-trackIT'
  }
}

function Test-ExcludedFile {
  param([string] $FullPath, [string] $Root)
  $rel = $FullPath.Substring($Root.Length).TrimStart('\')
  $lower = $rel.ToLowerInvariant()
  $needles = @(
    'node_modules\', '.git\', '\.git\',
    'dist\', 'dist-electron\', 'dist-ssr\', 'out\',
    '.baselines\', 'coverage\',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'
  )
  foreach ($n in $needles) {
    if ($lower.Contains($n)) { return $true }
  }
  return $false
}

function Get-Inventory {
  param([string] $Root)
  $map = @{}
  $excludeDirNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($n in @(
      'node_modules', '.pnpm', '.yarn', '.git', 'dist', 'dist-electron', 'dist-ssr', 'out',
      '.baselines', 'coverage', 'build', '.next', 'target', '__pycache__', '.venv', 'venv',
      '.pytest_cache', '.mypy_cache', '.tox', 'htmlcov', 'depeciated_dist-electron'
    )) {
    [void]$excludeDirNames.Add($n)
  }
  $stack = [System.Collections.Stack]::new()
  $stack.Push($Root)
  while ($stack.Count -gt 0) {
    $dir = [string]$stack.Pop()
    foreach ($childDir in [System.IO.Directory]::EnumerateDirectories($dir)) {
      $leaf = [System.IO.Path]::GetFileName($childDir)
      if ($excludeDirNames.Contains($leaf)) { continue }
      $stack.Push($childDir)
    }
    foreach ($filePath in [System.IO.Directory]::EnumerateFiles($dir)) {
      if (Test-ExcludedFile -FullPath $filePath -Root $Root) { continue }
      $fi = [System.IO.FileInfo]::new($filePath)
      $rel = $fi.FullName.Substring($Root.Length).TrimStart('\')
      $key = $rel.ToLowerInvariant()
      $map[$key] = [ordered]@{
        RelativePath = $rel
        Length       = $fi.Length
      }
    }
  }
  return $map
}

$rightRoot = $null
switch ($Baseline) {
  'local-trackIT' {
    if (-not $LegacyLocalPath) {
      $LegacyLocalPath = $env:TRACKIT_LEGACY_ROOT
    }
    if (-not $LegacyLocalPath) {
      $defaultLegacy = 'H:\projects\cursor_projects\TEd_trackIT\trackIT'
      if (Test-Path $defaultLegacy) { $LegacyLocalPath = $defaultLegacy }
    }
    if (-not $LegacyLocalPath -or -not (Test-Path $LegacyLocalPath)) {
      throw "local-trackIT: set -LegacyLocalPath or TRACKIT_LEGACY_ROOT, or ensure default exists."
    }
    $rightRoot = (Resolve-Path $LegacyLocalPath).Path
  }
  default {
    $candidate = Join-Path $RepoRoot ".baselines\$Baseline"
    if (-not (Test-Path $candidate)) {
      throw "Baseline folder not found: $candidate`nRun: npm run baselines:sync"
    }
    $rightRoot = (Resolve-Path $candidate).Path
  }
}

$leftRoot = $RepoRoot
Write-Host "Left (trackIT v2): $leftRoot"
Write-Host "Right ($Baseline): $rightRoot"

$leftMap = Get-Inventory -Root $leftRoot
$rightMap = Get-Inventory -Root $rightRoot

$onlyLeft = @()
$onlyRight = @()
$diffSize = @()

foreach ($k in $leftMap.Keys) {
  if (-not $rightMap.ContainsKey($k)) {
    $onlyLeft += $leftMap[$k].RelativePath
  }
  elseif ($leftMap[$k].Length -ne $rightMap[$k].Length) {
    $diffSize += "$($leftMap[$k].RelativePath) | v2=$($leftMap[$k].Length) baseline=$($rightMap[$k].Length)"
  }
}

foreach ($k in $rightMap.Keys) {
  if (-not $leftMap.ContainsKey($k)) {
    $onlyRight += $rightMap[$k].RelativePath
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $ReportsDir "compare-$Baseline-$stamp.txt"
$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("trackIT v2 baseline comparison")
[void]$sb.AppendLine("Left:  $leftRoot")
[void]$sb.AppendLine("Right: $rightRoot")
[void]$sb.AppendLine("Generated: $(Get-Date -Format o)")
[void]$sb.AppendLine('')
[void]$sb.AppendLine("=== Only in v2 (not in $Baseline); count $($onlyLeft.Count) ===")
$onlyLeft | Sort-Object | ForEach-Object { [void]$sb.AppendLine($_) }
[void]$sb.AppendLine('')
[void]$sb.AppendLine("=== Only in $Baseline (not in v2); count $($onlyRight.Count) ===")
$onlyRight | Sort-Object | ForEach-Object { [void]$sb.AppendLine($_) }
[void]$sb.AppendLine('')
[void]$sb.AppendLine("=== Same path, different size; count $($diffSize.Count) ===")
$diffSize | Sort-Object | ForEach-Object { [void]$sb.AppendLine($_) }

[System.IO.File]::WriteAllText($outFile, $sb.ToString())
Write-Host "Report written: $outFile"
