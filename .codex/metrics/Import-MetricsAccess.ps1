param()
$ErrorActionPreference = 'Stop'
$taskMetricsRoot = Join-Path $env:LOCALAPPDATA 'PTownPoker\metrics'
$taskProjectRef = 'xvhmbuppghwmwpwrkzao'
$taskEndpoint = "https://$taskProjectRef.supabase.co/customer/v1/privileged/metrics"
New-Item -ItemType Directory -Path $taskMetricsRoot -Force | Out-Null
$taskSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $taskMetricsRoot /inheritance:r /grant:r "*$($taskSid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local credential directory.' }
$taskApiKey = (Get-Clipboard -Raw).Trim()
if ($taskApiKey -notmatch '^sb_secret_[A-Za-z0-9_-]+$') { throw 'Clipboard does not contain a Supabase secret key. Nothing was stored.' }
Add-Type -AssemblyName System.Net.Http
$taskHandler = [System.Net.Http.HttpClientHandler]::new()
$taskHandler.AllowAutoRedirect = $false
$taskHandler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$taskClient = [System.Net.Http.HttpClient]::new($taskHandler)
$taskClient.Timeout = [TimeSpan]::FromSeconds(20)
$taskEncoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('username:' + $taskApiKey))
$taskClient.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Basic', $taskEncoded)
try {
  $taskResponse = $taskClient.GetAsync($taskEndpoint).GetAwaiter().GetResult()
  if (-not $taskResponse.IsSuccessStatusCode) { throw "Metrics access failed with HTTP $([int]$taskResponse.StatusCode). Nothing was stored." }
  $taskText = $taskResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if ($taskText -notmatch '(?m)^node_memory_MemTotal_bytes(?:\{|\s)') { throw 'Response lacks the required host-memory metric. Nothing was stored.' }
  $taskSecureKey = ConvertTo-SecureString $taskApiKey -AsPlainText -Force
  $taskCipher = ConvertFrom-SecureString $taskSecureKey
  [IO.File]::WriteAllText((Join-Path $taskMetricsRoot 'access.dpapi'), $taskCipher)
  [IO.File]::WriteAllText((Join-Path $taskMetricsRoot 'initial.prom'), $taskText)
  $taskNames = [regex]::Matches($taskText, '(?m)^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{|\s)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  [pscustomobject]@{
    Project = $taskProjectRef
    HttpStatus = [int]$taskResponse.StatusCode
    DecodedBytes = [Text.Encoding]::UTF8.GetByteCount($taskText)
    MetricFamilies = $taskNames.Count
    MemoryAndConnections = @($taskNames | Where-Object { $_ -match 'memory|memstats|swap|pg_stat_activity|numbackends|process_|pg_stat_database|pg_stat_statements|pgrst' })
    CredentialStorage = 'Windows DPAPI for current user, user/SYSTEM directory ACL'
  } | ConvertTo-Json -Depth 4
} catch {
  if ($_.Exception.Message -like 'Metrics access failed*' -or $_.Exception.Message -like 'Response lacks*') { throw $_.Exception.Message }
  throw 'Metrics credential import failed. No response body or credential is printed.'
} finally {
  Set-Clipboard -Value 'P-Town Poker metrics access configured.'
  $taskApiKey = $null
  $taskEncoded = $null
  $taskClient.Dispose()
}
