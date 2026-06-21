// Scripts de PowerShell INCRUSTADOS en el agente. Antes vivían como archivos
// sueltos en la carpeta `scripts/` al lado del exe; ahora viajan dentro del
// binario para que el agente sea un ÚNICO archivo (un solo .exe que se baja y
// se ejecuta, sin carpetas que copiar). En tiempo de ejecución se materializan
// a una carpeta temporal (ver printer/ps.ts) y se ejecutan con -File.
//
// Importante: el contenido es idéntico a los .ps1 de scripts/. Se escriben en
// disco con BOM UTF-8 para que PowerShell 5.1 respete los acentos (ver nota de
// codificación en la memoria del proyecto).

// raw-print.ps1 — bytes RAW (ESC/POS) al spooler vía winspool.drv.
const RAW_PRINT = String.raw`param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

# Envia bytes RAW (ESC/POS) a una impresora instalada en Windows usando la API
# del spooler (winspool.drv). El datatype "RAW" evita que el driver procese los
# bytes, asi llegan tal cual a la impresora termica. Cubre USB, Bluetooth
# emparejada y red-con-driver: cualquier cosa que aparezca en Get-Printer.

$ErrorActionPreference = 'Stop'

$signature = @'
using System;
using System.Runtime.InteropServices;

public static class LeoginRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFO di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    public static void SendBytes(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("No se pudo abrir la impresora '" + printerName + "' (codigo " + Marshal.GetLastWin32Error() + ").");
        try {
            DOCINFO di = new DOCINFO();
            di.pDocName = "Leogin Print Job";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, ref di))
                throw new Exception("StartDocPrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
                int written;
                if (!WritePrinter(hPrinter, bytes, bytes.Length, out written))
                    throw new Exception("WritePrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
                EndPagePrinter(hPrinter);
            } finally {
                EndDocPrinter(hPrinter);
            }
        } finally {
            ClosePrinter(hPrinter);
        }
    }
}
'@

Add-Type -TypeDefinition $signature -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[LeoginRawPrinter]::SendBytes($PrinterName, $bytes)
Write-Output "OK"
`;

// list-printers.ps1 — impresoras instaladas como JSON.
const LIST_PRINTERS = String.raw`# Lista las impresoras instaladas en Windows como JSON.
# Incluye USB, Bluetooth emparejadas y de red con driver instalado.
# Las impresoras de red por IP pura (puerto 9100 sin driver) se configuran aparte.

$ErrorActionPreference = 'Stop'

$printers = Get-Printer | Select-Object ` + "`" + String.raw`
    Name,
    DriverName,
    PortName,
    Shared,
    @{ Name = 'Type'; Expression = { [string]$_.Type } },
    @{ Name = 'PrinterStatus'; Expression = { [string]$_.PrinterStatus } }

# ConvertTo-Json colapsa un solo objeto; forzamos arreglo para parseo uniforme.
ConvertTo-Json -InputObject @($printers) -Compress
`;

// print-doc.ps1 — imprime como documento normal (impresoras NO termicas).
const PRINT_DOC = String.raw`param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [string]$FilePath,
    [switch]$Validate
)

# Imprime un archivo de texto como documento normal en la impresora indicada,
# usando una fuente MONOESPACIADA (Consolas) para que las columnas del ticket
# queden alineadas. Para validar el flujo en papel fisico en impresoras NO
# termicas (ej. una inyeccion). Con -Validate solo comprueba la impresora.

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
`;

/** Nombre de archivo → contenido. Las claves son los nombres que pide ps.ts. */
export const PS_SCRIPTS: Record<string, string> = {
  'raw-print.ps1': RAW_PRINT,
  'list-printers.ps1': LIST_PRINTERS,
  'print-doc.ps1': PRINT_DOC,
};
