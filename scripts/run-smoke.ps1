$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$smokeConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'work/smoke-current.json') -Raw | ConvertFrom-Json
$smokeProfile = [IO.Path]::GetFullPath($smokeConfig.profile)
$smokeWorkspace = [IO.Path]::GetFullPath((Join-Path $taskRoot 'work')) + [IO.Path]::DirectorySeparatorChar
if (-not $smokeProfile.StartsWith($smokeWorkspace, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test profile must be inside workspace/work.' }
$smokeProcess = Start-Process -FilePath 'C:\Program Files\Zotero\zotero.exe' -ArgumentList @('-no-remote', '-ZoteroDebugText', '-profile', ('"' + $smokeProfile + '"')) -Environment @{MOZ_DISABLE_SAFE_MODE_KEY='1'} -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $smokeConfig.run 'stdout.log') -RedirectStandardError (Join-Path $smokeConfig.run 'stderr.log')
$smokeProcess.Id | Set-Content -LiteralPath (Join-Path $smokeConfig.run 'pid.txt')
Write-Output ('Isolated Zotero process: ' + $smokeProcess.Id)
Write-Output ('Result: ' + $smokeConfig.result)
