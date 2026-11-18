import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyGroupScope, getGroupReport } from '@/lib/db/group';
import { Icon } from '@/components/icons';
import SelectorPeriodo from '@/components/admin/selector-periodo';
import AvisoLectura from '@/components/admin/aviso-lectura';
import GroupFinanceExport from '@/components/mi-cuenta/group-finance-export';
import { ChartReadout } from '@/components/ui/chart-readout';
import { fmtMoney } from '@/lib/money';
import { coberturaDeCostos } from '@/lib/finanzas-cobertura';
import { rangoEnPalabras } from '@/lib/rango-en-palabras';
import { diaDeNegocio } from '@/lib/caja/dia';
import { corteDelRestaurante } from '@/lib/db/dia-negocio';
import { adminUrl } from '@/lib/tenant';
import n from '@/components/admin/negocio.module.css';
import s from '@/components/mi-cuenta/mi-cuenta.module.css';

export const metadata = { title: 'Finanzas — Leogin' };
export const dynamic = 'force-dynamic';

/* ============================================================
   FINANZAS — lo vendido y ganado del negocio (o de todos juntos).
   ------------------------------------------------------------
   Línea N «nada saturado» (maqueta aprobada el 2026-11-18,
   docs/diseno/MAQUETA_MI_CUENTA_NADA_SATURADO_2026-11-18.html): las
   mismas piezas que Finanzas del panel (selector de periodo de una línea,
   «Descargar» en hoja, «Vendiste Q…» con su gráfica y la ganancia sin
   ceros falsos), y Comparativa adentro como «Por restaurante».

   - «Hoy» es el día de negocio del primer restaurante, no el reloj del
     servidor (en UTC, pasadas las 6 p. m. de Guatemala el rango terminaba
     mañana).
   - Un restaurante cuyo reporte falló se nombra y el total dice «sin
     contar» ese restaurante.
   - Con varios restaurantes y un plan sin Finanzas se ve lo vendido por
     restaurante, pero la ganancia va con candado, como en el panel. Antes
     Comparativa la daba sin plan.
   ============================================================ */

const money = (v: number) => fmtMoney(v);
const pedidos = (k: number) => (k === 1 ? '1 pedido' : `${k.toLocaleString('es-GT')} pedidos`);
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const diaLargo = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};
const diaCorto = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};
function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const juntar = (nombres: string[]) =>
  (nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`);

export default async function FinanzasGrupoPage({
  searchParams,
}: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const scope = await getMyGroupScope();
  if (!scope) redirect('/mi-cuenta');
  const varios = scope.isGroup;

  /* Los reportes financieros vienen con el plan Estándar. Con un solo
     restaurante esta pantalla no puede ser el atajo que los entrega gratis:
     se enseña qué es y con qué plan viene, no los números. */
  if (!scope.hasFinance && !varios) return <FinanzasBloqueadas upgradeUrl={scope.upgradeUrl} />;

  const primero = scope.branches[0];
  const hoy = primero
    ? diaDeNegocio(new Date(), primero.timezone || 'America/Guatemala', await corteDelRestaurante(primero.id))
    : new Date().toISOString().slice(0, 10);
  const sp = await searchParams;
  const to = isYmd(sp.to) && sp.to <= hoy ? sp.to : hoy;
  const from = isYmd(sp.from) && sp.from <= to ? sp.from : shiftYmd(to, -29);
  const rango = rangoEnPalabras(from, to, hoy);

  const report = await getGroupReport(scope.branches, from, to);
  const leidos = report.perBranch.filter((b) => b.leido);

  const selector = (
    <SelectorPeriodo from={from} to={to} hoy={hoy} basePath="/mi-cuenta/finanzas">
      {scope.hasFinance && report.totalOrders > 0 && (
        <GroupFinanceExport from={from} to={to} resumen={`${rango.charAt(0).toUpperCase()}${rango.slice(1)} · ${pedidos(report.totalOrders)}`} />
      )}
    </SelectorPeriodo>
  );

  /* Ninguno se pudo leer: los ceros dirían «no vendiste» (X20). */
  if (report.perBranch.length > 0 && leidos.length === 0) {
    return (
      <div className={`${n.panel} anim-fade-up`}>
        {selector}
        <AvisoLectura estado="error" que="las ventas de estas fechas" noConcluir="No significa que no hayas vendido." sinDatos />
      </div>
    );
  }

  if (report.totalOrders === 0 && report.sinLeer.length === 0) {
    return (
      <div className={`${n.panel} anim-fade-up`}>
        {selector}
        <div className={`${n.tarjeta} ${n.vendido}`}>
          <p className={n.clave}>Sin ventas {rango}</p>
          <p className={n.apoyo}>Elige otras fechas para ver lo que vendiste.</p>
        </div>
      </div>
    );
  }

  const serie = report.combinedSeries;
  const maxRev = Math.max(...serie.map((d) => d.revenue), 1);
  const tip = (d: { date: string; revenue: number }) => `${diaLargo(d.date)} · ${money(d.revenue)}`;
  const ultimoConVenta = [...serie].reverse().find((d) => d.revenue > 0);
  const avgTicket = report.totalOrders > 0 ? report.totalRevenue / report.totalOrders : 0;
  const sinContar = report.sinLeer.length > 0 ? `, sin contar ${juntar(report.sinLeer)}` : '';

  /* Ganancia con las MISMAS cuentas que el panel: solo lo que tiene costo
     cargado; sin costos no es «Q0.00» (auditoría 2026-11-03, X21). */
  const cobertura = coberturaDeCostos({ productRevenue: report.totalProductRevenue, costedRevenue: report.totalCostedRevenue });
  const costosHref = !varios && primero ? `${adminUrl(primero.slug)}/menu` : null;

  return (
    <div className={`${n.panel} anim-fade-up`}>
      {selector}

      <div className={n.finanzas}>
        <div className={n.aVendido}>
          <section className={`${n.tarjeta} ${n.vendido}`} aria-labelledby="mc-vendido">
            <h1 className={n.clave} id="mc-vendido">Vendiste {rango}{sinContar}</h1>
            <p className={n.cifra}>{money(report.totalRevenue)}</p>
            <p className={n.apoyo}>
              {pedidos(report.totalOrders)} · ticket {money(avgTicket)}
              {varios ? ` · ${leidos.length} ${leidos.length === 1 ? 'restaurante' : 'restaurantes'}` : ''}
            </p>
            {serie.length > 1 && (
              <ChartReadout className={n.lectura} defaultTip={ultimoConVenta ? tip(ultimoConVenta) : undefined}>
                <div className={n.barras} role="img" aria-label={`Lo vendido por día ${rango}. Toca una barra para ver ese día.`}>
                  {serie.map((d) => (
                    <div key={d.date} className={n.columna} data-tip={tip(d)}>
                      <span
                        className={n.barra}
                        data-vacia={d.revenue > 0 ? undefined : ''}
                        style={{ height: `${Math.max((d.revenue / maxRev) * 100, d.revenue > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className={n.eje} aria-hidden>
                  <span>{diaCorto(serie[0].date)}</span>
                  <span>{diaCorto(serie[serie.length - 1].date)}</span>
                </div>
              </ChartReadout>
            )}
          </section>
        </div>

        <div className={n.aGanancia}>
          {!scope.hasFinance ? (
            <div className={`${n.tarjeta} ${s.candado}`}>
              <Icon name="key" size={18} />
              <span>Ganancia, margen y descargas vienen con el plan Estándar.</span>
              {scope.upgradeUrl && <a className={n.enlace} href={scope.upgradeUrl}>Ver mi plan</a>}
            </div>
          ) : (
            <div className={`${n.tarjeta} ${n.ganancia}`}>
              {cobertura.tipo === 'sin-costos' || cobertura.tipo === 'sin-ventas' ? (
                <>
                  <div>¿Cuánto ganaste?<span>Pon el costo de tus platillos{varios ? ' en cada restaurante' : ''} y aquí verás la ganancia.</span></div>
                  {costosHref && <a className={n.enlace} href={costosHref}>Poner costos</a>}
                </>
              ) : cobertura.tipo === 'parcial' ? (
                <div>
                  Ganaste unos
                  <b className={n.monto}>{money(report.totalProfit)}</b>
                  <span>Solo cuenta {money(report.totalCostedRevenue)} de lo vendido ({cobertura.pct} %): el resto de los platillos no tiene costo.</span>
                  <span className={n.parcial}>Estimación parcial</span>
                </div>
              ) : (
                <div>
                  Ganaste
                  <b className={n.monto}>{money(report.totalProfit)}</b>
                  <span>Margen {(report.totalMarginPct ?? 0).toFixed(0)} % · costo de lo vendido {money(report.totalCost)} · antes de sueldos y gastos</span>
                </div>
              )}
            </div>
          )}
        </div>

        {varios && (
          <div className={n.aOrigen}>
            <section className={`${n.tarjeta} ${n.bloque}`} aria-labelledby="mc-por-restaurante">
              <h2 className={n.titulo} id="mc-por-restaurante">Por restaurante</h2>
              <ul className={n.reparto}>
                {report.perBranch.map((b) => {
                  if (!b.leido) {
                    return (
                      <li key={b.id}>
                        <b>{b.name}</b>
                        <em className={s.sinLeer}>No se pudo leer</em>
                        <span>Vuelve a intentarlo en un momento</span>
                        <small />
                      </li>
                    );
                  }
                  if (b.orders === 0) {
                    return (
                      <li key={b.id}>
                        <b>{b.name}</b>
                        <em style={{ color: 'var(--u-text-3)', fontWeight: 500 }}>Sin ventas</em>
                        <span>en estas fechas</span>
                        <small />
                      </li>
                    );
                  }
                  const c = coberturaDeCostos(b);
                  const detalle = !scope.hasFinance
                    ? pedidos(b.orders)
                    : c.tipo === 'sin-costos'
                      ? `${pedidos(b.orders)} · sin costos`
                      : `${pedidos(b.orders)} · ganancia ${money(b.profit)}${b.marginPct != null ? ` · margen ${b.marginPct.toFixed(0)} %` : ''}${c.tipo === 'parcial' ? ' · parcial' : ''}`;
                  const parte = report.totalRevenue > 0 ? Math.round((b.revenue / report.totalRevenue) * 100) : 0;
                  return (
                    <li key={b.id}>
                      <b>{b.name}</b>
                      <em>{money(b.revenue)}</em>
                      <span>{detalle}</span>
                      <small>{parte} %</small>
                      <span className={n.medida} aria-hidden><i style={{ width: `${parte}%` }} /></span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Un solo restaurante, sin el plan que las incluye ────────── */

function FinanzasBloqueadas({ upgradeUrl }: { upgradeUrl: string | null }) {
  return (
    <div className={`${n.tarjeta} anim-fade-up`} style={{ padding: '22px 20px', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', margin: 0, color: 'var(--u-text)' }}>Finanzas</h1>
        <p style={{ fontSize: 14, color: 'var(--u-text-2)', lineHeight: 1.5, margin: '8px 0 0' }}>
          Lo vendido, el costo, la ganancia y el margen de tu negocio, con descarga a Excel y PDF.
          Vienen con el plan <strong>Estándar</strong>. Cómo va hoy lo ves igual en Restaurantes, sin cambiar de plan.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {upgradeUrl && <a href={upgradeUrl} className={n.enlace}>Ver mi plan</a>}
        <Link href="/mi-cuenta" className={n.enlace}>Ir a Restaurantes</Link>
      </div>
    </div>
  );
}
