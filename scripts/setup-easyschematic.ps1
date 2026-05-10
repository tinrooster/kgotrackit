# Setup EasySchematic local instance
# Run once after cloning the trackIT repo.
# EasySchematic is gitignored — this script clones and installs it.

$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root "easyschematic"

if (Test-Path $target) {
    Write-Host "easyschematic/ already exists — running npm install to update dependencies." -ForegroundColor Cyan
    Set-Location $target
    npm install
} else {
    Write-Host "Cloning EasySchematic..." -ForegroundColor Cyan
    git clone https://github.com/duremovich/EasySchematic.git $target
    Set-Location $target
    npm install
}

Write-Host "Generating device library fallback..." -ForegroundColor Cyan
npm run generate-fallback

Write-Host ""
Write-Host "Done. Run 'npm run dev:all' from the repo root to start both servers." -ForegroundColor Green
