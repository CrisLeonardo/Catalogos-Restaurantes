import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { List, ListRow, ListText } from '@/components/ui/list';
import { getSalesReport } from '@/lib/db/reports';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import { diaDeNegocio, sumarDias } from '@/lib/caja/dia';

const PERIODOS = { hoy: 'Hoy', semana: 'Semana', mes: 'Mes' } as const;
type Periodo = keyof typeof PERIODOS;

export function periodoDeVentas(value: string | string[] | undefined): Periodo {
  return value === 'semana' || value === 'mes' ? value : 'hoy';
}

export async function ResumenVentas({ restaurantId, timezone, periodo, href, dinero }: {
  restaurantId: string;
  timezone: string;
  periodo: Periodo;
  href: (path: string) => string;
  dinero: (amount: number) => string;
}) {
  const corte = await corteDelRestaurante(restaurantId);
  const hoy = diaDeNegocio(new Date(), timezone, corte);
  const diaSemana = new Date(hoy + 'T12:00:00Z').getUTCDay();
  const inicio = periodo === 'mes' ? hoy.slice(0, 8) + '01'
    : periodo === 'semana' ? sumarDias(hoy, -((diaSemana + 6) % 7)) : hoy;
  const report = await getSalesReport(restaurantId, inicio, hoy, timezone, corte);

  return (
    <Section id="ventas" title="Resumen de ventas" className="scroll-mt-24">
      <Card className="flex flex-col gap-4 p-4">
        <nav aria-label="Período de ventas" className="grid grid-cols-3 gap-2">
          {Object.entries(PERIODOS).map(([valor, label]) => (
            <Link
              key={valor}
              href={href('/admin?ventas=' + valor + '#ventas')}
              aria-current={valor === periodo ? 'page' : undefined}
              className={`flex min-h-11 items-center justify-center rounded-adm-lg border px-2 text-[14px] font-semibold no-underline
                focus-visible:outline-2 focus-visible:outline-adm-accent-ink ${valor === periodo
                  ? 'border-adm-accent-ink text-adm-accent-ink' : 'border-adm-border text-adm-text-3'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {report.estado === 'error' ? (
          <p role="status" className="text-[14px] text-adm-text-3">No se pudo cargar el resumen de ventas. Actualiza la página.</p>
        ) : report.orders === 0 ? (
          <p className="text-[14px] text-adm-text-3">Aún no hay pedidos para este período.</p>
        ) : (
          <>
            <div aria-live="polite">
              <p className="text-[24px] font-bold tabular-nums text-adm-text">{dinero(report.revenue)}</p>
              <p className="text-[14px] text-adm-text-3">
                {report.orders === 1 ? '1 pedido' : `${report.orders} pedidos`}
              </p>
            </div>
            {report.topByQuantity.length > 0 && (
              <div>
                <h4 className="mb-2 text-[14px] font-semibold text-adm-text">Platillos más pedidos</h4>
                <List role="list" className="rounded-none border-0 bg-transparent shadow-none">
                  {report.topByQuantity.map(({ name, qty }) => (
                    <ListRow key={name} role="listitem" className="px-0">
                      <ListText title={name} />
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-adm-text">{qty}</span>
                    </ListRow>
                  ))}
                </List>
              </div>
            )}
          </>
        )}
      </Card>
    </Section>
  );
}
