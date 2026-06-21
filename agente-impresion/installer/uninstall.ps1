# Desinstala el Agente de impresión Leogin: detiene la tarea, la quita,
# mata el proceso y borra la carpeta de instalación.

$ErrorActionPreference = 'SilentlyContinue'

$taskName = 'LeoginAgenteImpresion'
Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false

Get-Process LeoginAgent | Stop-Process -Force

# Entrada de autoarranque en la carpeta Inicio del usuario (autoinstalación).
$startupVbs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\LeoginAgente.vbs'
Remove-Item -Force $startupVbs

$dest = Join-Path $env:LOCALAPPDATA 'Leogin\Agente'
Remove-Item -Recurse -Force $dest

Write-Host "Agente desinstalado." -ForegroundColor Green
