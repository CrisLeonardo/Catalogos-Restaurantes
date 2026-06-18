# Firma LeoginAgent.exe con tu certificado de firma de código (Authenticode).
# Resuelve el aviso de SmartScreen. Requiere un certificado (.pfx) — se compra
# a una CA (DigiCert, Sectigo, etc.), ~$100-400/año. Hasta tenerlo, el exe
# funciona igual; Windows solo advierte la primera vez.
#
#   .\sign.ps1 -PfxPath "C:\ruta\leogin.pfx" -Password "****"
#
# Necesita signtool.exe (viene con el Windows SDK).

param(
    [Parameter(Mandatory = $true)][string]$PfxPath,
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$Exe = (Join-Path $PSScriptRoot '..\LeoginAgent.exe'),
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Exe)) { throw "No se encontró el ejecutable: $Exe" }

$signtool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
if (-not $signtool) {
    # Busca en las rutas típicas del Windows SDK.
    $signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $signtool) { throw 'No se encontró signtool.exe. Instala el Windows SDK.' }

& $signtool sign /f $PfxPath /p $Password /fd SHA256 /tr $TimestampUrl /td SHA256 $Exe
if ($LASTEXITCODE -ne 0) { throw "signtool fallo (codigo $LASTEXITCODE)." }

Write-Host "Firmado: $Exe" -ForegroundColor Green
