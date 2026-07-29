# Instalador del Agente de impresión Leogin.
# Copia el ejecutable a una carpeta estable, escribe la config, y registra una
# Tarea Programada que lo arranca (oculto) al iniciar sesión en Windows.
#
#   .\install.ps1 -ApiUrl "https://tudominio.com" -Token "abc123..."
#
# Si omites -ApiUrl/-Token, pega tu config.local.json (del panel) junto al exe.

param(
    [string]$ApiUrl,
    [string]$Token
)

$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$srcExe = Join-Path $here '..\LeoginAgent.exe'
$srcScripts = Join-Path $here '..\scripts'
if (-not (Test-Path $srcExe)) {
    throw "No se encontró LeoginAgent.exe. Ejecuta el instalador desde la carpeta 'dist'."
}

$dest = Join-Path $env:LOCALAPPDATA 'Leogin\Agente'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Instalando en $dest ..."
Copy-Item $srcExe $dest -Force
Copy-Item $srcScripts (Join-Path $dest 'scripts') -Recurse -Force

# ── Configuración ───────────────────────────────────────────────
$cfgPath = Join-Path $dest 'config.local.json'
if ($ApiUrl -and $Token) {
    @{ apiUrl = $ApiUrl; token = $Token } | ConvertTo-Json | Set-Content -Path $cfgPath -Encoding utf8
    Write-Host "config.local.json escrito."
}
elseif (Test-Path (Join-Path $here '..\config.local.json')) {
    Copy-Item (Join-Path $here '..\config.local.json') $cfgPath -Force
    Write-Host "config.local.json copiado."
}
elseif (-not (Test-Path $cfgPath)) {
    Write-Warning "Sin configuración. Pega tu config.local.json en: $dest"
    Write-Warning "(Lo obtienes en el panel: Perfil -> Agente Leogin -> Generar token.)"
}

# ── Autoarranque directo al exe ─────────────────────────────────
# Ya no se escribe ningún VBScript. LeoginAgent.exe se compila como binario de
# ventana (build-exe.mjs cambia el subsistema en la cabecera PE), así que
# arranca sin consola por sí solo. El esquema anterior —un .vbs con
# WScript.Shell.Run(..., 0) lanzado por wscript.exe— es el patrón que Windows
# Defender marca como Behavior:Win32/Execution.A!ml.
$exePath = Join-Path $dest 'LeoginAgent.exe'

# Restos del esquema viejo: si esta PC venía de una versión anterior, hay que
# borrarlos o el archivo que dispara al antivirus se queda ahí.
Remove-Item (Join-Path $dest 'launch-hidden.vbs') -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\LeoginAgente.vbs') -Force -ErrorAction SilentlyContinue

# ── Tarea Programada: arranca al iniciar sesión + reintento periódico ──────
$taskName = 'LeoginAgenteImpresion'
$action = New-ScheduledTaskAction -Execute $exePath -WorkingDirectory $dest
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Reintento cada 3 min: si el agente se cayó, vuelve a arrancar. El candado de
# instancia única del agente evita que se dupliquen procesos.
try {
    $rep = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 3)).Repetition
    $trigger.Repetition = $rep
}
catch {
    Write-Warning "No se pudo configurar el reintento periodico: $($_.Exception.Message)"
}

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Agente de impresion Leogin' -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

# ── Firewall: puertos del hub local (47100 HTTP + 47443 HTTPS) ─────────────
# Sin esta regla, Windows bloquea las conexiones entrantes desde la LAN y el
# respaldo offline (POST /orders del hub) solo funciona en esta misma PC.
$ruleName = 'Leogin Hub (LAN)'
$null = netsh advfirewall firewall delete rule name="Leogin Hub (LAN 47100)"  # nombre viejo (v0.2.x)
$null = netsh advfirewall firewall delete rule name="$ruleName"
$null = netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=47100,47443
if ($LASTEXITCODE -eq 0) {
    Write-Host "Regla de firewall creada (puertos 47100 y 47443 abiertos a la LAN)."
}
else {
    Write-Warning "No se pudo crear la regla de firewall (¿PowerShell sin permisos de Administrador?)."
    Write-Warning "El respaldo LAN sin internet no funcionara desde otros dispositivos hasta crearla."
}

Write-Host ""
Write-Host "OK. El agente quedo instalado y en ejecucion." -ForegroundColor Green
Write-Host "Se iniciara solo cada vez que enciendas esta PC."
