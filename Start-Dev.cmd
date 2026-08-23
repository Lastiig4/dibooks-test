param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

if (-not (Test-Path $ZipPath)) {
  throw "Zip niet gevonden: $ZipPath"
}

$PatchRoot = Join-Path $ProjectRoot ".patch"
$PatchName = [System.IO.Path]::GetFileNameWithoutExtension($ZipPath)
$ExtractDir = Join-Path $PatchRoot $PatchName

Write-Host ""
Write-Host "DiBooks patch toepassen" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Zip:     $ZipPath"
Write-Host ""

if (Test-Path $ExtractDir) {
  Remove-Item $ExtractDir -Recurse -Force
}
New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null

Expand-Archive $ZipPath -DestinationPath $ExtractDir -Force

# Sommige zips hebben eerst nog één extra map. Als dat zo is, pak de inhoud van die map.
$items = Get-ChildItem $ExtractDir -Force
if ($items.Count -eq 1 -and $items[0].PSIsContainer) {
  $SourceDir = $items[0].FullName
} else {
  $SourceDir = $ExtractDir
}

Write-Host "Kopieer patch-bestanden..." -ForegroundColor Yellow
Copy-Item (Join-Path $SourceDir "*") $ProjectRoot -Recurse -Force

Write-Host "Ruim tijdelijke patch-map op..." -ForegroundColor Yellow
Remove-Item $PatchRoot -Recurse -Force

Write-Host ""
Write-Host "Patch toegepast." -ForegroundColor Green
Write-Host "Run nu: npm run build" -ForegroundColor Cyan
Write-Host ""

$duplicatePages = Get-ChildItem $ProjectRoot -Recurse -File -Include "page(*).tsx","page(*).ts" -ErrorAction SilentlyContinue
if ($duplicatePages.Count -gt 0) {
  Write-Host "Let op: ik vond mogelijke dubbele page-bestanden:" -ForegroundColor Red
  $duplicatePages | ForEach-Object { Write-Host "- $($_.FullName)" -ForegroundColor Red }
  Write-Host "Deze kun je meestal verwijderen als Windows ze per ongeluk heeft aangemaakt." -ForegroundColor Red
}
