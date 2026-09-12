param(
  [ValidateSet('Start','Stop','Status')][string]$Action = 'Status',
  [string]$Until = ''
)
$ErrorActionPreference = 'Stop'
$taskMetricsRoot = Join-Path $env:LOCALAPPDATA 'PTownPoker\metrics'
$taskNodePath = 'C:\Program Files\nodejs\node.exe'
$taskCollectorPath = Join-Path $PSScriptRoot 'collector.cjs'
$taskLockPath = Join-Path $taskMetricsRoot 'collector.lock'
$taskStatusPath = Join-Path $taskMetricsRoot 'status.json'

function Get-CollectorProcess {
  if (-not (Test-Path -LiteralPath $taskLockPath)) { return $null }
  $taskLock = Get-Content -LiteralPath $taskLockPath -Raw | ConvertFrom-Json
  $taskCandidate = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$taskLock.pid)" -ErrorAction SilentlyContinue
  if ($taskCandidate -and $taskCandidate.Name -eq 'node.exe' -and $taskCandidate.CommandLine.Contains($taskCollectorPath)) { return $taskCandidate }
  # Only remove this collector's stale lock, never terminate a reused PID.
  Remove-Item -LiteralPath $taskLockPath
  return $null
}

switch ($Action) {
  'Start' {
    if (Get-CollectorProcess) { Write-Output 'P-Town Poker metrics capture is already running.'; break }
    if (-not (Test-Path -LiteralPath (Join-Path $taskMetricsRoot 'access.dpapi'))) { throw 'Metrics access has not been configured.' }
    if (-not $Until) { $Until = [DateTime]::UtcNow.AddHours(24).ToString('o') }
    $taskDeadline = [DateTimeOffset]::Parse($Until).UtcDateTime
    if ($taskDeadline -le [DateTime]::UtcNow -or $taskDeadline -gt [DateTime]::UtcNow.AddDays(7)) { throw 'Capture deadline must be within the next seven days.' }
    $Until = $taskDeadline.ToString('o')
    $taskArguments = '"' + $taskCollectorPath + '" run "' + $Until + '"'
    $taskProcess = Start-Process -FilePath $taskNodePath -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskMetricsRoot 'collector.stdout.log') -RedirectStandardError (Join-Path $taskMetricsRoot 'collector.stderr.log')
    Write-Output "Capture launched (PID $($taskProcess.Id)); ends $($taskDeadline.ToLocalTime().ToString('f'))."
  }
  'Stop' {
    if (Get-CollectorProcess) { & $taskNodePath $taskCollectorPath stop }
    else { Write-Output 'P-Town Poker metrics capture is not running.' }
  }
  'Status' {
    $taskLive = Get-CollectorProcess
    if (-not (Test-Path -LiteralPath $taskStatusPath)) { Write-Output 'Capture has not started.'; break }
    $taskStatus = Get-Content -LiteralPath $taskStatusPath -Raw | ConvertFrom-Json
    $taskLines = @(
      'P-Town Poker server metrics',
      '',
      ('Running: ' + [bool]$taskLive),
      ('Recorded samples: ' + $taskStatus.successfulSamples),
      ('Failed reads: ' + $taskStatus.failedSamples),
      ('Last successful read (UTC): ' + $taskStatus.lastSuccessAt),
      ('Scheduled stop (local time): ' + ([DateTimeOffset]::Parse($taskStatus.until).LocalDateTime.ToString('f'))),
      ('Transferred: ' + [Math]::Round($taskStatus.wireBytes / 1MB, 2) + ' MiB'),
      ('Stop reason: ' + $taskStatus.stopReason),
      ('Latest error: ' + $taskStatus.lastError.code),
      '',
      'Keep this computer awake and online during play and for 45 minutes afterward.',
      'After a restart, use Start capture again. Each manual start captures for up to 24 hours.',
      '',
      ('Saved data: ' + $taskStatus.captureDirectory)
    )
    $taskLines | Set-Content -LiteralPath (Join-Path $taskMetricsRoot 'status.txt')
    $taskLines
  }
}
