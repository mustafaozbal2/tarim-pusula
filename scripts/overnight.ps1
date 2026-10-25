# Tarım Pusula — gece boyu otomatik çalıştırıcı (Windows PowerShell)
# Kullanım:  powershell -ExecutionPolicy Bypass -File scripts\overnight.ps1 -Tasks G19,G20,G21
# Limit dolunca: mesajdaki YENİLENME SAATİNİ okuyup tam o ana kadar bekler (bulamazsa -WaitHours).
# Bekleme sonrası aynı görevi baştan değil, git'teki mevcut durumdan devam ettirir (daha az token).
param(
  [string]$Repo = (Split-Path -Parent $PSScriptRoot),
  [double]$WaitHours = 2.5,
  [int]$MaxFails = 3,
  [string[]]$Tasks = @("G19","G20","G21")
)
Set-Location $Repo
$Tasks = @($Tasks | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$unmerged = git diff --name-only --diff-filter=U
if ($unmerged) { Write-Host "DURDU: cozulmemis birlesme cakismasi var: $unmerged"; exit 1 }
New-Item -ItemType Directory -Force .overnight | Out-Null
$log = Join-Path $Repo ".overnight\log.txt"
function Log($m) { $l = "$(Get-Date -Format s)  $m"; Write-Host $l; Add-Content -Path $log -Value $l }

# Bilgisayar uyumasın
Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
[void][W.P]::SetThreadExecutionState([uint32]2147483651)
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change monitor-timeout-ac 0 | Out-Null

git checkout -B dev 2>&1 | Out-Null

$limitPattern = '(?i)usage limit|rate.?limit|limit reached|hit your limit|overloaded|credit balance|quota|too many requests|\b429\b|\b529\b|resets? (at|in|\d)|try again later|ECONNRESET|ETIMEDOUT|network'

# Çıktıdaki yenilenme anını bulur; kaç saniye beklenecegini döndürür (bulunamazsa $null)
function Get-ResetWaitSeconds([string]$text) {
  $now = Get-Date
  # 1) "...limit reached|1761400800" (epoch saniye)
  if ($text -match '\|\s*(\d{10})\b') {
    $t = [DateTimeOffset]::FromUnixTimeSeconds([int64]$Matches[1]).LocalDateTime
    return [int](($t - $now).TotalSeconds)
  }
  # 2) "resets 9pm" / "resets 9:30 pm" / "resets at 21:00"
  if ($text -match '(?i)resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?') {
    $h = [int]$Matches[1]; $m = 0
    if ($Matches[2]) { $m = [int]$Matches[2] }
    $ap = $Matches[3].ToLower()
    if ($ap -eq 'pm' -and $h -lt 12) { $h += 12 }
    if ($ap -eq 'am' -and $h -eq 12) { $h = 0 }
    if ($h -le 23 -and $m -le 59) {
      $t = Get-Date -Hour $h -Minute $m -Second 0
      if ($t -le $now) { $t = $t.AddDays(1) }
      return [int](($t - $now).TotalSeconds)
    }
  }
  # 3) "resets in 2h 15m" / "in 45 minutes"
  if ($text -match '(?i)in\s+(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?') {
    $hh = 0; $mm = 0
    if ($Matches[1]) { $hh = [int]$Matches[1] }
    if ($Matches[2]) { $mm = [int]$Matches[2] }
    if (($hh + $mm) -gt 0) { return ($hh * 3600 + $mm * 60) }
  }
  return $null
}

function Wait-ForReset([string]$text, [string]$taskName) {
  $sec = Get-ResetWaitSeconds $text
  $src = "mesajdaki yenilenme saati"
  if ($null -eq $sec) { $sec = [int]($WaitHours * 3600); $src = "yenilenme saati okunamadi, varsayilan $WaitHours saat" }
  $sec = $sec + 180                      # 3 dk pay
  if ($sec -lt 300) { $sec = 300 }       # en az 5 dk (ard arda deneme olmasın)
  if ($sec -gt 8 * 3600) { $sec = 8 * 3600 }
  $until = (Get-Date).AddSeconds($sec)
  Log "$taskName : limit/baglanti sorunu ($src). $($until.ToString('HH:mm')) saatine kadar bekleniyor, token harcanmayacak."
  Start-Sleep -Seconds $sec
}

foreach ($t in $Tasks) {
  $done = ".overnight\$t.done"
  if (Test-Path $done) { continue }
  $fails = 0
  $lastErr = ""
  $resume = ""
  while (-not (Test-Path $done)) {
    Log "BASLA $t (basarisiz deneme: $fails)"
    $prompt = @"
Sen Tarım Pusula projesinde otonom çalışıyorsun. Kimse cevap vermeyecek; soru sorma. Kısa ve verimli çalış: yalnız görevle ilgili dosyaları oku, büyük çıktıları ekrana dökme, aynı dosyayı tekrar tekrar okuma.
1) CLAUDE.md ve docs/tasks/$t.md dosyalarını oku. Görevin atıf yaptığı diğer dosyalara (ör. docs/ANASAYFA_SPEC.md, docs/PLAN.md) yalnız gerektiğinde bak. .overnight/NOTES.md'nin sadece son bölümünü oku.
2) $t görevini TAM uygula (önce test, sonra kod). Önceki görevleri bozma.
3) Kök `pnpm run verify` çalıştır; hata varsa düzelt.
4) Kararları docs/KARARLAR.md'ye, devir notunu .overnight/NOTES.md'ye yaz.
5) Bitirince 5 satırı geçmeyen özet yaz.
$resume
$lastErr
"@
    $out = (& claude -p $prompt --model sonnet --dangerously-skip-permissions 2>&1 | Out-String)
    $code = $LASTEXITCODE
    Add-Content ".overnight\$t.out.txt" ("`n=== " + (Get-Date -Format s) + " ===`n" + $out)

    if (($out -match $limitPattern -and $out.Length -lt 3000) -or ($code -ne 0 -and $out.Length -lt 400)) {
      # Yarım kalan işi kaybetme: git'e ara kayıt al (push yok)
      git add -A | Out-Null
      git commit -m "${t}: ara kayit (limit nedeniyle durdu)" 2>&1 | Out-Null
      $resume = "NOT: Bu görev daha önce limit yüzünden yarım kaldı. Baştan başlama: `git log -5 --stat` ve `git status` ile mevcut durumu gör, docs/tasks/$t.md kabul ölçütleriyle karşılaştır, yalnız EKSİK kalanları tamamla."
      Wait-ForReset $out $t
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
[void][W.P]::SetThreadExecutionState([uint32]2147483648)
