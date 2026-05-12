$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

& node (Join-Path $PSScriptRoot 'dev.mjs') @args
exit $LASTEXITCODE
