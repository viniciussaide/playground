# Installs a local Playground build (see BUILD.md). When this shell runs inside the installed
# app, installing now would close the app and end the session running this script, so the
# install is armed instead: a process outside the app's tree waits for every playground
# process to exit, installs silently, logs the installed version and starts the app again.
#
# Usage, from the repo root:
#   powershell -NoProfile -File .specs\codebase\install-local-build.ps1 -Setup dist\playground-1.1.7-setup.exe
# -DryRun prints the decision and, inside the app, the waiter's command line, and changes nothing.

param(
    [Parameter(Mandatory = $true)][string]$Setup,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$programs = Join-Path $env:LOCALAPPDATA 'Programs'
$exe = Join-Path $programs 'playground\playground.exe'
$log = Join-Path $programs 'playground-install.log'
$setupPath = (Resolve-Path $Setup).Path

# True when an ancestor of this shell is the installed playground.exe. The walk is bounded
# because a parent id can be reused by an unrelated process.
function Test-InsideInstalledApp {
    $id = $PID
    for ($depth = 0; $id -and $depth -lt 64; $depth++) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
        if (-not $proc) { return $false }
        if ($proc.ExecutablePath -eq $exe) { return $true }
        $id = $proc.ParentProcessId
    }
    return $false
}

function Get-InstalledVersion {
    if (Test-Path $exe) { (Get-Item $exe).VersionInfo.FileVersion } else { '(not installed)' }
}

"Installed: $(Get-InstalledVersion)"
"Setup:     $setupPath"

if (Test-InsideInstalledApp) {
    # Win32_Process.Create starts the waiter under WmiPrvSE, in this user's session and outside
    # the app's process tree, so it survives the app closing. A plain Start-Process would sit
    # under the app's PTY host and could go down with it.
    $q = { param($s) "'" + ($s -replace "'", "''") + "'" }
    $steps = @(
        'Wait-Process -Name playground'
        'Start-Sleep 2'
        "Start-Process -FilePath $(& $q $setupPath) -ArgumentList '/S' -Wait"
        "(Get-Item $(& $q $exe)).VersionInfo.FileVersion | Set-Content -Encoding ascii $(& $q $log)"
        "Start-Process -FilePath $(& $q $exe)"
    )
    $command = 'powershell -NoProfile -WindowStyle Hidden -Command "' + ($steps -join '; ') + '"'
    if ($DryRun) {
        'Inside the installed app: would arm this waiter:'
        $command
        exit 0
    }
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $command }
    if ($result.ReturnValue -ne 0) { throw "Win32_Process.Create failed with $($result.ReturnValue)" }
    "This shell runs inside the installed app: install armed (waiter pid $($result.ProcessId))."
    "Close Playground; it installs and reopens by itself. The installed version goes to $log."
    exit 0
}

if (Get-Process playground -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }) {
    'The installed app is running outside this shell. Close it and run this script again.'
    exit 1
}

if ($DryRun) {
    'Outside the installed app and it is not running: would install now.'
    exit 0
}

Start-Process -FilePath $setupPath -ArgumentList '/S' -Wait
"Installed: $(Get-InstalledVersion)"
