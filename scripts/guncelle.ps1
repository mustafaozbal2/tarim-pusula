# Telefondaki uygulamaya yeni sürüm gönderir (APK'yı yeniden kurmadan). Kullanım: powershell -ExecutionPolicy Bypass -File scripts\guncelle.ps1 "ne degisti"
param([string]$Mesaj = "guncelleme")
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "apps\mobile")
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.21:8210"
npx eas-cli update --channel preview --message $Mesaj --non-interactive
