# Tarım Pusula — gece boyu otomatik çalıştırıcı (Windows PowerShell)
# Kullanım:  powershell -ExecutionPolicy Bypass -File scripts\overnight.ps1
param(
  [string]$Repo = (Split-Path -Parent $PSScriptRoot),
  [double]$WaitHours = 2.5,
  [int]$MaxFails = 3
)
Set-Location $Repo
New-Item -ItemType Directory -Force .overnight | Out-Null
$log = Join-Path $Repo ".overnight\log.txt"
function Log($m) { $l = "$(Get-Date -Format s)  $m"; Write-Host $l; Add-Content -Path $log -Value $l }

# Bilgisayar uyumasın
Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][W.P]::SetThreadExecutionState(0x80000003)
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 0 | Out-Null

git checkout -B dev 2>&1 | Out-Null

$limitPattern = '(?i)usage limit|rate.?limit|limit reached|overloaded|credit balance|quota|too many requests|\b429\b|\b529\b|resets? (at|in)|try again later|ECONNRESET|ETIMEDOUT|network'

foreach ($i in 0..14) {
  $t = "G$i"
  $done = ".overnight\$t.done"
  if (Test-Path $done) { continue }
  $fails = 0
  $lastErr = ""
  while (-not (Test-Path $done)) {
    Log "BASLA $t (basarisiz deneme: $fails)"
    $prompt = @"
Sen Tarım Pusula projesinde otonom çalışıyorsun. Kimse sana cevap vermeyecek; soru sorma.
1) CLAUDE.md, docs/PLAN.md, docs/UX_KURALLARI.md, .overnight/NOTES.md (varsa) ve docs/tasks/$t.md dosyalarını oku.
2) $t görevini TAM uygula (kod + test). Önceki görevlerin üzerine kur, onları bozma.
3) Kök `pnpm run verify` komutunu çalıştır; hatasızsa bitir. Hata varsa düzelt.
4) Kararları docs/KARARLAR.md'ye, devir notunu .overnight/NOTES.md'ye yaz.
5) Bitirdiğinde 5 satırı geçmeyen bir özet yaz.
$lastErr
"@
    $out = (& claude -p $prompt --dangerously-skip-permissions 2>&1 | Out-String)
    $code = $LASTEXITCODE
    Add-Content ".overnight\$t.out.txt" ("`n=== " + (Get-Date -Format s) + " ===`n" + $out)

    if (($out -match $limitPattern -and $out.Length -lt 3000) -or ($code -ne 0 -and $out.Length -lt 400)) {
      Log "$t : limit/baglanti sorunu. $WaitHours saat bekleniyor."
      Start-Sleep -Seconds ([int]($WaitHours * 3600))
      continue
    }

    $ok = $false
    if (Test-Path "package.json") {
      $v = (& pnpm run verify 2>&1 | Out-String)
      if ($LASTEXITCODE -eq 0) { $ok = $true } else { $lastErr = "ÖNCEKİ DENEMEDE `pnpm run verify` ŞU HATAYLA BAŞARISIZ OLDU, ÖNCE BUNU DÜZELT:`n" + $v.Substring([Math]::Max(0, $v.Length - 3000)) }
    }
    if ($ok) {
      Set-Content $done (Get-Date -Format s)
      git add -A | Out-Null
      git commit -m "${t}: otomatik çalıştırma sonucu (verify yeşil)" 2>&1 | Out-Null
      git push -u origin dev 2>&1 | Out-Null
      Log "$t TAMAM"
      break
    }
    $fails++
    if ($fails -ge $MaxFails) {
      Set-Content ".overnight\$t.blocked" $lastErr
      git add -A | Out-Null
      git commit -m "${t}: YARIM (verify kırmızı, sonraki göreve geçildi)" 2>&1 | Out-Null
      git push -u origin dev 2>&1 | Out-Null
      Log "$t ENGELLENDI, sonraki goreve geciliyor"
      break
    }
  }
}
Log "TUM GOREVLER ISLENDI"
[void][W.P]::SetThreadExecutionState(0x80000000)
