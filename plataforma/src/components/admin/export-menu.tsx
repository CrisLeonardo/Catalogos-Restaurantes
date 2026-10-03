'use client';

import { Icon } from '@/components/icons';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/* ============================================================
   «EXPORTAR» — un botón con menú (auditoría 2026-10-02, MEN-11)
   ------------------------------------------------------------
   Platillos y Clientes tenían «Excel» y «PDF» en una fila propia
   encima de la lista: una fila entera para dos acciones que se usan
   de vez en cuando. Ahora es un solo «Exportar» en la fila de
   herramientas, junto a la acción principal.
   ============================================================ */
export default function ExportMenu({
  onExcel,
  onPdf,
  busy,
}: {
  onExcel: () => void;
  onPdf: () => void;
  /** Cuál se está generando, para decirlo en el botón. */
  busy: null | 'excel' | 'pdf';
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'secondary' }), 'shrink-0 rounded-adm-full')}
        disabled={busy !== null}
        aria-label="Exportar"
      >
        <Icon name="download" size={15} />
        {busy ? 'Generando…' : 'Exportar'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onExcel} className="min-h-11">
          <Icon name="download" size={15} /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPdf} className="min-h-11">
          <Icon name="download" size={15} /> PDF para imprimir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
