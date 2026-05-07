# Cross-shell dev launcher for Windows.
#
# `pnpm dev` (turbo run dev --parallel) is unreliable on some Windows setups
# — pnpm's cmd.exe script-shell wrapper drops to an interactive prompt
# instead of executing the dev script. Symptom: the Windows banner appears,
# then a `C:\PROJECTS\...>` prompt, and the dev servers never start.
#
# This launcher bypasses pnpm's script wrapper entirely: it locates the tsx
# and vite CLIs inside pnpm's content-addressable store and spawns each
# in its own PowerShell window via `node <cli> ...`.
#
# Usage:
#   .\scripts\dev.ps1
#
# Two new PowerShell windows open — one for the API (port 3000), one for the
# web app (port 1420). Close them to stop the servers.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$root = (Get-Location).Path

$tsxDir  = Get-ChildItem "$root\node_modules\.pnpm" -Filter 'tsx@*' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
$viteDir = Get-ChildItem "$root\node_modules\.pnpm" -Filter 'vite@*' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $tsxDir)  { throw "tsx not found under node_modules\.pnpm — run 'pnpm install' first" }
if (-not $viteDir) { throw "vite not found under node_modules\.pnpm — run 'pnpm install' first" }

$tsxCli  = Join-Path $tsxDir.FullName  'node_modules\tsx\dist\cli.mjs'
$viteCli = Join-Path $viteDir.FullName 'node_modules\vite\bin\vite.js'

if (-not (Test-Path $tsxCli))  { throw "tsx CLI missing at $tsxCli" }
if (-not (Test-Path $viteCli)) { throw "vite CLI missing at $viteCli" }

$apiCommand = "`$Host.UI.RawUI.WindowTitle = 'streetlifting · api'; Set-Location '$root\apps\api'; & node '$tsxCli' watch src/index.ts"
$webCommand = "`$Host.UI.RawUI.WindowTitle = 'streetlifting · web'; Set-Location '$root\apps\web'; & node '$viteCli'"

Write-Host 'Starting Streetlifting App dev servers ...' -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $apiCommand
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList '-NoExit', '-NoProfile', '-Command', $webCommand

Write-Host ''
Write-Host '  API : http://localhost:3000/health' -ForegroundColor Cyan
Write-Host '  Web : http://localhost:1420'        -ForegroundColor Cyan
Write-Host ''
Write-Host 'Close the two spawned PowerShell windows to stop.' -ForegroundColor Yellow
