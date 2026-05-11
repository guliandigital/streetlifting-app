[CmdletBinding()]
param(
  [string]$SshTarget = $(if ($env:STREETLIFTING_DEPLOY_SSH_TARGET) { $env:STREETLIFTING_DEPLOY_SSH_TARGET } else { 'streetlifting-prod' }),
  [int]$Port = $(if ($env:STREETLIFTING_DEPLOY_PORT) { [int]$env:STREETLIFTING_DEPLOY_PORT } else { 22 }),
  [string]$Branch = $(if ($env:STREETLIFTING_DEPLOY_BRANCH) { $env:STREETLIFTING_DEPLOY_BRANCH } else { (git rev-parse --abbrev-ref HEAD).Trim() }),
  [string]$RepoUrl = $(if ($env:STREETLIFTING_DEPLOY_REPO_URL) { $env:STREETLIFTING_DEPLOY_REPO_URL } else { 'https://github.com/guliandigital/streetlifting-app.git' }),
  [string]$AppDir = $(if ($env:STREETLIFTING_DEPLOY_APP_DIR) { $env:STREETLIFTING_DEPLOY_APP_DIR } else { '/opt/streetlifting-app' }),
  [string]$WebRoot = $(if ($env:STREETLIFTING_DEPLOY_WEB_ROOT) { $env:STREETLIFTING_DEPLOY_WEB_ROOT } else { '/var/www/streetlifting.app' }),
  [string]$ApiService = $(if ($env:STREETLIFTING_DEPLOY_API_SERVICE) { $env:STREETLIFTING_DEPLOY_API_SERVICE } else { 'streetlifting-api' }),
  [switch]$SkipLocalChecks,
  [switch]$SkipMigrations
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$remoteScript = '/tmp/streetlifting-remote-deploy.sh'

function Quote-Bash([string]$Value) {
  if ($Value.Contains("'")) {
    throw "Single quotes are not supported in deployment parameter values: $Value"
  }
  return "'$Value'"
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

Set-Location $repoRoot

$trackedChanges = ((git status --porcelain --untracked-files=no) | Out-String).Trim()
if ($trackedChanges) {
  throw "Tracked files have uncommitted changes. Commit or stash before production deploy."
}

if (-not $env:DATABASE_URL -and (Test-Path "$repoRoot/apps/api/.env")) {
  foreach ($line in Get-Content "$repoRoot/apps/api/.env") {
    if ($line -match '^\s*DATABASE_URL=(.+)$') {
      $env:DATABASE_URL = $Matches[1].Trim().Trim('"')
      break
    }
  }
}

if (-not $SkipLocalChecks) {
  Invoke-Checked 'pnpm' @('install', '--frozen-lockfile')
  Invoke-Checked 'pnpm' @('release:check')
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw 'OpenSSH ssh was not found in PATH.'
}
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
  throw 'OpenSSH scp was not found in PATH.'
}

Invoke-Checked 'ssh' @('-p', "$Port", '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', $SshTarget, 'echo ssh-ok')

Invoke-Checked 'scp' @('-P', "$Port", "$repoRoot/deploy/remote-deploy.sh", "${SshTarget}:${remoteScript}")

$remoteEnv = @(
  'STREETLIFTING_BRANCH=' + (Quote-Bash $Branch),
  'STREETLIFTING_REPO_URL=' + (Quote-Bash $RepoUrl),
  'STREETLIFTING_APP_DIR=' + (Quote-Bash $AppDir),
  'STREETLIFTING_WEB_ROOT=' + (Quote-Bash $WebRoot),
  'STREETLIFTING_API_SERVICE=' + (Quote-Bash $ApiService),
  'STREETLIFTING_SKIP_MIGRATIONS=' + (Quote-Bash $(if ($SkipMigrations) { '1' } else { '0' }))
) -join ' '

$command = "chmod +x $remoteScript && $remoteEnv bash $remoteScript && rm -f $remoteScript"
Invoke-Checked 'ssh' @('-p', "$Port", $SshTarget, $command)

Invoke-Checked 'curl' @('-fsS', 'https://streetlifting.app/api/health')
Write-Host "OK: deployed branch $Branch via $SshTarget"
