# Telefondaki uygulamaya yeni sürüm gönderir (APK'yı yeniden kurmadan). Kullanım: powershell -ExecutionPolicy Bypass -File scripts\guncelle.ps1 "ne degisti"
param([string]$Mesaj = "guncelleme")
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "apps\mobile")
$env:EXPO_PUBLIC_API_URL = "https://tarim-pusula-api.onrender.com"
npx eas-cli update --channel preview --environment preview --message $Mesaj --non-interactive
