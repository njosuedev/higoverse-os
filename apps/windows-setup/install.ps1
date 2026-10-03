# Higoverse for Windows - setup
# Adds Higoverse to the Desktop and Start menu. It opens https://higoverse.com
# in its own window (Microsoft Edge app mode), like an installed app.
# Nothing else on the computer is changed. Remove it with Uninstall.cmd.

$ErrorActionPreference = 'Stop'
$url  = 'https://higoverse.com/'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Host 'Microsoft Edge was not found. Open https://higoverse.com in your browser instead.' -ForegroundColor Yellow
  exit 1
}

# Keep the icon somewhere permanent (this folder may be deleted later).
$appDir = Join-Path $env:LOCALAPPDATA 'Higoverse'
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item -Force (Join-Path $here 'higoverse.ico') (Join-Path $appDir 'higoverse.ico')

$shell = New-Object -ComObject WScript.Shell
$places = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '')
)
foreach ($dir in $places) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Higoverse.lnk'))
  $lnk.TargetPath       = $edge
  $lnk.Arguments        = "--app=$url"
  $lnk.IconLocation     = (Join-Path $appDir 'higoverse.ico')
  $lnk.Description      = 'Higoverse - business records and sales'
  $lnk.WorkingDirectory = $appDir
  $lnk.Save()
}

Write-Host ''
Write-Host 'Higoverse is installed.' -ForegroundColor Green
Write-Host 'Open it from the Higoverse icon on your Desktop or in the Start menu.'
Write-Host 'Tip: right-click the Start menu entry and choose "Pin to taskbar".'
