# Canlı sunucuyu (Render: API + web sitesi) dev dalının son commit'iyle yeniden kurar.
# Render GitHub'dan kendiliğinden kurmadığı için gerekir. Anahtar .env'deki RENDER_API_KEY'den okunur.
# Kullanım: önce `git push origin dev`, sonra: powershell -ExecutionPolicy Bypass -File scripts\canli-guncelle.ps1
$root = Split-Path -Parent $PSScriptRoot
$line = Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^RENDER_API_KEY=' } | Select-Object -First 1
if (-not $line) { Write-Error "RENDER_API_KEY .env dosyasinda yok"; exit 1 }
$key = $line.Substring("RENDER_API_KEY=".Length).Trim()
$headers = @{ Authorization = "Bearer $key"; "Content-Type" = "application/json" }
$services = @{ "API" = "srv-dbfib88473hc73daa610"; "Web" = "srv-dbfig7avcj2c7389lasg" }
foreach ($name in $services.Keys) {
  $r = Invoke-RestMethod -Method Post -Uri "https://api.render.com/v1/services/$($services[$name])/deploys" -Headers $headers -Body '{"clearCache":"do_not_clear"}'
  Write-Output "$name kurulumu basladi: $($r.id) ($($r.status))"
}
Write-Output "Birkac dakika sonra: https://tarim-pusula.onrender.com"
