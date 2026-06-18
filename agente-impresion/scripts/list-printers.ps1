# Lista las impresoras instaladas en Windows como JSON.
# Incluye USB, Bluetooth emparejadas y de red con driver instalado.
# Las impresoras de red por IP pura (puerto 9100 sin driver) se configuran aparte.

$ErrorActionPreference = 'Stop'

$printers = Get-Printer | Select-Object `
    Name,
    DriverName,
    PortName,
    Shared,
    @{ Name = 'Type'; Expression = { [string]$_.Type } },
    @{ Name = 'PrinterStatus'; Expression = { [string]$_.PrinterStatus } }

# ConvertTo-Json colapsa un solo objeto; forzamos arreglo para parseo uniforme.
ConvertTo-Json -InputObject @($printers) -Compress
