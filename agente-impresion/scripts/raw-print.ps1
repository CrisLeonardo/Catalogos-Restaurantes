param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

# Envía bytes RAW (ESC/POS) a una impresora instalada en Windows usando la API
# del spooler (winspool.drv). El datatype "RAW" evita que el driver procese los
# bytes, así llegan tal cual a la impresora térmica. Cubre USB, Bluetooth
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
