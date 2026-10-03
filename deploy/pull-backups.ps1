# Copies the VPS database backups to this PC so a server/disk failure can't
# take out both the data and its backups. Read-only on the server: it only
# downloads files from /var/backups/higoverse.
#
# Scheduled daily by the "Higoverse backup pull" Windows task. Keeps
# $KeepDays days locally; the newest copy of each database is never pruned.
# These files contain real customer data — keep the folder private and never
# put it inside the git repository.

$ErrorActionPreference = "Stop"
$Server   = "root@102.202.208.190"
$Remote   = "/var/backups/higoverse"
$Local    = "D:\Higoverse\Backups\vps"
$KeepDays = 30
$Log      = Join-Path $Local "pull.log"

New-Item -ItemType Directory -Force -Path $Local | Out-Null

function Write-Log($msg) {
  "$(Get-Date -Format s)  $msg" | Add-Content -Path $Log
}

try {
  $names = & ssh -o BatchMode=yes -o ConnectTimeout=20 $Server "ls -1 $Remote/*.dump" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "listing failed: $names" }

  $fetched = 0
  foreach ($path in $names) {
    $file = Split-Path $path -Leaf
    $dest = Join-Path $Local $file
    if (Test-Path $dest) { continue }          # already have this one
    $tmp = "$dest.partial"
    & scp -q -p -o BatchMode=yes "${Server}:$path" $tmp
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) {
      Remove-Item $tmp -ErrorAction SilentlyContinue
      throw "download failed: $file"
    }
    Move-Item $tmp $dest
    $fetched++
  }

  # Prune old local copies, always keeping the newest per database.
  foreach ($db in "authdb", "shopdb") {
    $all = Get-ChildItem $Local -Filter "$db-*.dump" | Sort-Object LastWriteTime -Descending
    $all | Select-Object -Skip 1 | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item
  }
  Write-Log "ok: $fetched new file(s); $((Get-ChildItem $Local -Filter *.dump).Count) kept"
} catch {
  Write-Log "ERROR: $_"
  exit 1
}
