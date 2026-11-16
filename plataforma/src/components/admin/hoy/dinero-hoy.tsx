import PanelLink from '@/components/admin/panel-link';

/* El dinero de Hoy (ficha 2.1, M§4.3): «Cobrado» es lo que ya entró —el
   mismo libro de Caja—, no lo pedido. Al lado, lo que falta por cobrar y
   cómo está la caja; debajo, en una línea, pedidos, ticket y el ritmo.
   En la PC las tres cifras van en una fila; en el teléfono, cobrado arriba
   y las otras dos debajo. */

export interface Celda {
  etiqueta: string;
  valor: string;
  nota?: string | null;
  /** Texto en vez de cifra (por ejemplo «Abierta · Ana»): va más chico. */
  texto?: boolean;
}

export function DineroHoy({
  etiqueta, valor, celdas, pie, enlace,
}: {
  etiqueta: string;
  valor: string;
  celdas: Celda[];
  pie?: React.ReactNode;
  enlace?: { href: string; label: string } | null;
}) {
  return (
    <section
      aria-label={etiqueta}
      className="rounded-adm-xl border border-adm-border bg-adm-card px-4 py-4 shadow-adm-sm md:px-5"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-[1.4fr_1fr_1fr] lg:items-end">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <div className="text-[13px] font-medium text-adm-text-3">{etiqueta}</div>
          <div className="text-[32px] font-bold leading-tight tracking-[-0.03em] tabular-nums text-adm-text md:text-[40px]">
            {valor}
          </div>
        </div>
        {celdas.map((c, i) => (
          <div
            key={c.etiqueta}
            className={`min-w-0 border-t border-adm-border pt-3 lg:border-t-0 lg:pt-0 ${i === 0 ? '' : ''}`}
          >
            <div className="text-[13px] text-adm-text-3">{c.etiqueta}</div>
            <div className={`${c.texto ? 'text-[15px]' : 'text-[18px] tabular-nums'} truncate font-semibold text-adm-text`}>
              {c.valor}
            </div>
            {c.nota && <div className="truncate text-[12px] text-adm-text-3">{c.nota}</div>}
          </div>
        ))}
      </div>
      {(pie || enlace) && (
        <div className="mt-3 text-[13px] leading-snug text-adm-text-3">
          {pie}
          {pie && enlace && ' · '}
          {enlace && (
            <PanelLink href={enlace.href} className="font-semibold no-underline text-adm-accent-ink">
              {enlace.label}
            </PanelLink>
          )}
        </div>
      )}
    </section>
  );
}
