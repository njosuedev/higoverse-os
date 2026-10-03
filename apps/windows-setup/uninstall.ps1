# Higoverse for Windows - remove
# Deletes the Desktop and Start menu shortcuts and the saved icon.
# Your Higoverse account and data are not affected (they live on higoverse.com).

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Higoverse.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Higoverse.lnk'),
  (Join-Path $env:LOCALAPPDATA 'Higoverse')
)
foreach ($t in $targets) {
  if (Test-Path $t) { Remove-Item -Recurse -Force $t }
}
Write-Host 'Higoverse shortcuts removed.' -ForegroundColor Green
