# Measures the native client and the web UI on one Windows machine, against one host and one store.
#
#   1. Seed a store and serve it:      tsx apps/iced-client/measure/seed.mts <dir>, then the host with --db
#   2. Save a workspace that opens s-long (workspace.save { view: 'focus', focusedSessionId: 's-long' })
#      so the web UI opens the same session the native client is told to open
#   3. Serve the web UI against that host (VITE_HOST_URL, VITE_HOST_TOKEN)
#   4. powershell -File measure-windows.ps1 -Exe <centralu-iced.exe> -HostUrl ws://127.0.0.1:5199 -Token <t>
#
# Both run as ordinary windows of the same size for the same time. Memory is the sum over every process
# the client started: Chrome's browser, GPU, network and renderer processes; the native client's one.
# Only processes this script started are measured and stopped: Chrome's are found as the tree under the browser
# process it launched, on a profile folder of its own.
param(
    [Parameter(Mandatory)] [string] $Exe,
    [Parameter(Mandatory)] [string] $HostUrl,
    [Parameter(Mandatory)] [string] $Token,
    [string] $WebUrl = 'http://127.0.0.1:5174/',
    [string] $Session = 's-long',
    [int] $Settle = 20,
    [int] $Samples = 5,
    # iced's renderer: wgpu (the GPU, the default) or tiny-skia (the CPU)
    [string] $Backend = ''
)

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

function Sample([scriptblock] $Pids) {
    $rows = for ($i = 0; $i -lt $Samples; $i++) {
        Start-Sleep -Seconds 2
        $ps = Get-Process -Id (& $Pids) -ErrorAction SilentlyContinue
        [pscustomobject]@{
            WorkingSetMB = [math]::Round(($ps | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
            PrivateMB    = [math]::Round(($ps | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB, 1)
            Processes    = @($ps).Count
        }
    }
    # the median sample
    [pscustomobject]@{
        WorkingSetMB = ($rows.WorkingSetMB | Sort-Object)[[int]($Samples / 2)]
        PrivateMB    = ($rows.PrivateMB | Sort-Object)[[int]($Samples / 2)]
        Processes    = ($rows.Processes | Sort-Object)[-1]
    }
}

# --- native ---
$env:CC_HOST_URL = $HostUrl
$env:CC_HOST_TOKEN = $Token
$env:CC_NATIVE_OPEN = $Session
if ($Backend) { $env:ICED_BACKEND = $Backend }
$native = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds $Settle
$nativeResult = Sample { $native.Id }
Stop-Process -Id $native.Id -Force -ErrorAction SilentlyContinue
Remove-Item Env:CC_HOST_TOKEN, Env:CC_NATIVE_OPEN, Env:ICED_BACKEND -ErrorAction SilentlyContinue

# --- web, in a Chrome app window on a profile of its own ---
$profileDir = Join-Path $env:TEMP ("cc-measure-" + [guid]::NewGuid().ToString('N'))
$web = Start-Process -FilePath $chrome -PassThru -ArgumentList @(
    "--user-data-dir=$profileDir", '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--window-size=1280,820', "--app=$WebUrl"
)
# The browser process and everything under it; another Chrome the person has open is never touched
$mine = {
    $all = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"
    $tree = @($web.Id)
    do {
        $more = @($all | Where-Object { $tree -contains $_.ParentProcessId -and $tree -notcontains $_.ProcessId } | ForEach-Object { $_.ProcessId })
        $tree += $more
    } while ($more.Count -gt 0)
    $tree
}
Start-Sleep -Seconds $Settle
$webResult = Sample $mine
@(& $mine) | Where-Object { $_ } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue

[pscustomobject]@{ native = $nativeResult; web = $webResult } | ConvertTo-Json -Depth 3
