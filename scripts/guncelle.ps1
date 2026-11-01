# Telefondaki uygulamaya yeni sürüm gönderir (APK'yı yeniden kurmadan). Kullanım: powershell -ExecutionPolicy Bypass -File scripts\guncelle.ps1 "ne degisti"
# Not: mesajda noktalı virgül/tırnak kullanma; npx + cmd üzerinden takılıyordu, bu yüzden eas doğrudan ve CI=1 ile çalışır.
param([string]$Mesaj = "guncelleme")
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "apps\mobile")
$env:EXPO_PUBLIC_API_URL = "https://tarim-pusula-api.onrender.com"
$env:CI = "1"
$Mesaj = $Mesaj -replace '[;"]', ' '
eas update --channel preview --environment preview --message $Mesaj
