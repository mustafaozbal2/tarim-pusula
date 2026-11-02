# Tek komutla yayın: dev dalını gönderir, canlı sunucuyu (Render) kurar, mobil kod değiştiyse
# telefonlara güncelleme (EAS Update) gönderir. GitHub Actions çalışmadığında da aynı işi yapar.
# Kullanım: powershell -ExecutionPolicy Bypass -File scripts\yayinla.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
git fetch -q origin dev
$before = (git rev-parse origin/dev).Trim()
git push -q origin dev
$head = (git rev-parse HEAD).Trim()
& (Join-Path $PSScriptRoot "canli-guncelle.ps1")
$mobil = git diff --name-only $before $head | Where-Object { $_ -match '^(apps/mobile|packages)/' }
if ($mobil) {
  $msg = (git log -1 --pretty=%s).Trim()
  & (Join-Path $PSScriptRoot "guncelle.ps1") $msg
} else {
  Write-Output "Mobil kod degismedi; telefon guncellemesi gerekmiyor."
}
