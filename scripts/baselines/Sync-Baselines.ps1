<#
.SYNOPSIS
  Shallow-clone legacy GitHub repos into .baselines/ for offline tree comparison.

.DESCRIPTION
  Canonical dev fork: trackIT v2 (this repository). Baselines are read-only;
  they are not merged into history. Re-run after you delete .baselines/ to refresh.

.PARAMETER Force
  Re-clone even if the target folder already exists.

.EXAMPLE
  .\scripts\baselines\Sync-Baselines.ps1
  npm run baselines:sync
#>
[CmdletBinding()]
param(
  [switch] $Force
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BaselinesDir = Join-Path $RepoRoot '.baselines'

$definitions = @(
  @{ Id = 'trackIT';       Url = 'https://github.com/tinrooster/trackIT.git' },
  @{ Id = 'trackITv1';    Url = 'https://github.com/tinrooster/trackITv1.git' },
  @{ Id = 'TrackIT_d';    Url = 'https://github.com/tinrooster/TrackIT_d.git' },
  @{ Id = 'inventorytrack'; Url = 'https://github.com/tinrooster/inventorytrack.git' }
)

if (-not (Test-Path $BaselinesDir)) {
  New-Item -ItemType Directory -Path $BaselinesDir | Out-Null
}

foreach ($def in $definitions) {
  $target = Join-Path $BaselinesDir $def.Id
  if ((Test-Path $target) -and -not $Force) {
    Write-Host "[skip] $($def.Id) already exists: $target (use -Force to re-clone)"
    continue
  }
  if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Write-Host "[clone] $($def.Url) -> $target"
  git clone --depth 1 $def.Url $target
}

Write-Host "Done. Baselines under: $BaselinesDir"
