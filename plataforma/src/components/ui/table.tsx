import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    /* Con fondo y sombra de tarjeta (2026-10-09): sin ellos las filas se
       pintaban directo sobre el fondo de página y la tabla era solo un
       contorno fino, sin cuerpo. */
    <div className="w-full overflow-x-auto rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm">
      <table data-slot="table" className={cn('w-full border-collapse text-[13px]', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-adm-bg text-adm-text-3', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-t border-adm-border transition-colors hover:bg-adm-card-hover', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-adm-text-3',
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-4 py-3 text-adm-text align-middle', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
