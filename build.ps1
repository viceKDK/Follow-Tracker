$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

python -m PyInstaller --noconfirm comparar_ig.spec

$packageDir = Join-Path $projectRoot "dist"
$extensionZip = Join-Path $packageDir "follow-tracker-extension.zip"
if (Test-Path -LiteralPath $extensionZip) {
    Remove-Item -LiteralPath $extensionZip
}
$extensionFiles = @(
    "manifest.json",
    "core.js",
    "content.js",
    "background.js",
    "popup.html",
    "popup.css",
    "popup.js"
) | ForEach-Object { Join-Path $projectRoot "extension\$_" }
Compress-Archive -Path $extensionFiles -DestinationPath $extensionZip

Write-Host "Artefactos generados en $packageDir"
