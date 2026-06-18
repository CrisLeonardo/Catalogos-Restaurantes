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

# ── Lanzador oculto (sin ventana de consola) ────────────────────
$exePath = Join-Path $dest 'LeoginAgent.exe'
$vbs = Join-Path $dest 'launch-hidden.vbs'
@"
Set s = CreateObject("WScript.Shell")
s.Run """$exePath""", 0, False
"@ | Set-Content -Path $vbs -Encoding ascii

# ── Tarea Programada: arranca al iniciar sesión + reintento periódico ──────
$taskName = 'LeoginAgenteImpresion'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument """$vbs""" -WorkingDirectory $dest
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

Write-Host ""
Write-Host "OK. El agente quedo instalado y en ejecucion." -ForegroundColor Green
Write-Host "Se iniciara solo cada vez que enciendas esta PC."
