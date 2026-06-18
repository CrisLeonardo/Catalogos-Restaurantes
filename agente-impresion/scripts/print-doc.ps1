param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [string]$FilePath,
    [switch]$Validate
)

# Imprime un archivo de texto como documento normal en la impresora indicada,
# usando una fuente MONOESPACIADA (Consolas) para que las columnas del ticket
# queden alineadas. Para validar el flujo en papel físico en impresoras NO
# térmicas (ej. una inyección). Con -Validate solo comprueba la impresora.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName
if (-not $doc.PrinterSettings.IsValid) { throw "Impresora no valida: $PrinterName" }
if ($Validate) { Write-Output 'VALID'; return }

if (-not $FilePath) { throw 'Falta -FilePath.' }

$script:lines = [System.IO.File]::ReadAllLines($FilePath)
$script:idx = 0
$script:font = New-Object System.Drawing.Font('Consolas', 9)
$doc.DocumentName = 'Leogin Ticket'

$doc.add_PrintPage({
        param($s, $e)
        $g = $e.Graphics
        $lh = [int][math]::Ceiling($script:font.GetHeight($g))
        $x = $e.MarginBounds.Left
        $y = $e.MarginBounds.Top
        while ($script:idx -lt $script:lines.Length) {
            $g.DrawString($script:lines[$script:idx], $script:font, [System.Drawing.Brushes]::Black, $x, $y)
            $y += $lh
            $script:idx++
            if (($y + $lh) -gt $e.MarginBounds.Bottom) { $e.HasMorePages = $true; return }
        }
        $e.HasMorePages = $false
    })

$doc.Print()
Write-Output 'OK'
