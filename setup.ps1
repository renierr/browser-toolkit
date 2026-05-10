param(
  [Parameter(Position = 0)]
  [ValidateSet('bootstrap', 'doctor', 'install', 'build', 'run', 'install-service', 'uninstall-service', 'help')]
  [string]$Command = 'help',

  [string]$Dir = "$env:USERPROFILE\browser-toolkit",
  [string]$Repo = 'https://github.com/renierr/browser-toolkit',
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
  param([string]$Message)
  Write-Host "[setup] $Message"
}

function Fail {
  param([string]$Message)
  throw "[setup] ERROR: $Message"
}

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Show-Help {
  @"
browser-toolkit setup (Windows)

Usage:
  .\setup.ps1 <command> [-Dir <path>] [-Repo <url>] [-Port <number>]

Commands:
  bootstrap         Clone (if missing), install deps, build frontend
  doctor            Check required tools (git, bun)
  install           Install deps in repo root and backend
  build             Build frontend dist/
  run               Run backend server (serves dist/)
  install-service   Not implemented on Windows. Prints manual instructions.
  uninstall-service Not implemented on Windows.
  help              Show this help

Examples:
  .\setup.ps1 bootstrap -Dir "$env:USERPROFILE\browser-toolkit"
  .\setup.ps1 run -Dir "$env:USERPROFILE\browser-toolkit" -Port 3000
"@ | Write-Host
}

function Assert-RepoDir {
  if (-not (Test-Path -Path $Dir -PathType Container)) {
    Fail "Repo directory not found: $Dir"
  }
  if (-not (Test-Path -Path (Join-Path $Dir 'package.json') -PathType Leaf)) {
    Fail "Missing package.json in: $Dir"
  }
  if (-not (Test-Path -Path (Join-Path $Dir 'backend') -PathType Container)) {
    Fail "Missing backend/ in: $Dir"
  }
}

function Invoke-InDir {
  param(
    [string]$WorkingDirectory,
    [string[]]$Args
  )

  Push-Location $WorkingDirectory
  try {
    & $Args[0] @($Args[1..($Args.Length - 1)])
    if ($LASTEXITCODE -ne 0) {
      Fail "Command failed in ${WorkingDirectory}: $($Args -join ' ')"
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-Doctor {
  Write-Log 'Checking required tools'
  if (-not (Test-Command git)) {
    Fail 'Missing command: git (install from https://git-scm.com/downloads)'
  }
  if (-not (Test-Command bun)) {
    Fail 'Missing command: bun (install from https://bun.sh/)'
  }
  Write-Log 'OK: git and bun found'
}

function Invoke-CloneIfNeeded {
  $parent = Split-Path -Parent $Dir
  if ($parent -and -not (Test-Path -Path $parent -PathType Container)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }

  if ((Test-Path -Path (Join-Path $Dir '.git') -PathType Container) -and
      (Test-Path -Path (Join-Path $Dir 'package.json') -PathType Leaf) -and
      (Test-Path -Path (Join-Path $Dir 'backend') -PathType Container)) {
    Write-Log "Repo already present at $Dir"
    return
  }

  if (Test-Path -Path $Dir) {
    Fail "Target exists but is not a valid clone: $Dir"
  }

  Write-Log "Cloning repository: $Repo"
  & git clone $Repo $Dir
  if ($LASTEXITCODE -ne 0) {
    Fail 'git clone failed'
  }
}

function Invoke-Install {
  Assert-RepoDir
  Write-Log 'Installing root dependencies'
  Invoke-InDir -WorkingDirectory $Dir -Args @('bun', 'install')

  Write-Log 'Installing backend dependencies'
  Invoke-InDir -WorkingDirectory (Join-Path $Dir 'backend') -Args @('bun', 'install')
}

function Invoke-Build {
  Assert-RepoDir
  Write-Log 'Building frontend dist/'
  Invoke-InDir -WorkingDirectory $Dir -Args @('bun', 'run', 'build')
}

function Invoke-Run {
  Assert-RepoDir
  Write-Log "Starting backend at PORT=$Port"
  Push-Location (Join-Path $Dir 'backend')
  try {
    $env:PORT = [string]$Port
    & bun run start
    if ($LASTEXITCODE -ne 0) {
      Fail 'Backend start failed'
    }
  }
  finally {
    Pop-Location
  }
}

function Show-WindowsServiceInstructions {
  Write-Host ''
  Write-Log 'Windows service setup omitted.'
  Write-Host 'Manual start options:'
  Write-Host "1) Foreground:"
  Write-Host "   cd `"$Dir\backend`""
  Write-Host '   bun run start'
  Write-Host ''
  Write-Host '2) Background process (no service):'
  Write-Host "   Start-Process powershell -ArgumentList '-NoExit','-Command','cd `"$Dir\backend`"; bun run start'"
  Write-Host ''
  Write-Host '3) Auto-start via Task Scheduler (manual):'
  Write-Host '   Program: powershell.exe'
  Write-Host "   Arguments: -NoProfile -WindowStyle Hidden -Command `"cd '$Dir\backend'; bun run start`""
}

function Invoke-Bootstrap {
  Invoke-Doctor
  Invoke-CloneIfNeeded
  Invoke-Install
  Invoke-Build
  Write-Log 'Bootstrap done'
  Write-Log "Run now: .\setup.ps1 run -Dir `"$Dir`""
}

switch ($Command) {
  'bootstrap' { Invoke-Bootstrap }
  'doctor' { Invoke-Doctor }
  'install' { Invoke-Install }
  'build' { Invoke-Build }
  'run' { Invoke-Run }
  'install-service' { Show-WindowsServiceInstructions }
  'uninstall-service' { Write-Log 'No Windows service installed by this script.' }
  'help' { Show-Help }
  default { Show-Help }
}
