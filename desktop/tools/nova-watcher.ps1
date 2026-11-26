# Nova USB auto-launch watcher (per-PC, installed with the user's consent).
# Runs quietly in the background, watches for a removable drive that contains a portable
# Nova, and launches it once per insertion. It NEVER runs code off the USB automatically
# beyond starting Nova.exe that the owner put there - it is a convenience for your own PCs,
# not an autorun. Stop it any time with "Remove auto-launch (this PC).bat".

$ErrorActionPreference = 'SilentlyContinue'

# single instance
$mutex = New-Object System.Threading.Mutex($false, 'Global\NovaUSBWatcher')
if (-not $mutex.WaitOne(0)) { exit }
try { Set-Content -Path (Join-Path $env:TEMP 'nova-watch.pid') -Value $PID -Force } catch {}

$seen = @{}   # volume key -> $true while a launched drive stays plugged in

function Find-NovaExe([string]$root) {
  foreach ($rel in @('Nova\Nova.exe', 'Nova.exe', 'Nova\resources\app\..\Nova.exe')) {
    $exe = Join-Path $root $rel
    $dir = Split-Path $exe
    if ((Test-Path $exe) -and ((Test-Path (Join-Path $dir 'nova-portable.txt')) -or (Test-Path (Join-Path $dir 'data')))) {
      return $exe
    }
  }
  return $null
}

while ($true) {
  try {
    $present = @{}
    $drives = Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2' -ErrorAction SilentlyContinue
    foreach ($d in $drives) {
      $root = $d.DeviceID + '\'
      $key  = if ($d.VolumeSerialNumber) { $d.VolumeSerialNumber } else { $d.DeviceID }
      $present[$key] = $true
      if ($seen[$key]) { continue }                 # already handled this insertion
      $exe = Find-NovaExe $root
      if ($exe) {
        $seen[$key] = $true
        # don't start a second copy if Nova is already running
        if (-not (Get-Process -Name 'Nova' -ErrorAction SilentlyContinue)) {
          Start-Sleep -Seconds 1
          try { Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) } catch {}
        }
      }
    }
    # forget drives that were unplugged, so re-inserting launches again
    foreach ($k in @($seen.Keys)) { if (-not $present[$k]) { $seen.Remove($k) } }
  } catch {}
  Start-Sleep -Seconds 3
}
