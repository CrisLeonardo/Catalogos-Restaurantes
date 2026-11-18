import Link from 'next/link';
import { PageHeader } from '@/components/super/ui';
import { getAllRestaurants } from '@/lib/db/super-admin';
import { getBillingDashboard, isOnTrial, trialDaysLeft, planLabel } from '@/lib/db/billing';
import { fmtMoney } from '@/lib/money';
import { getClientHealth } from '@/lib/db/client-health';
import { estadosDeLaCola } from '@/lib/db/super-cola';
import { armarCola, type CobroDeRestaurante } from '@/lib/super/cola';
import { waDigits } from '@/lib/reminder';
import SuperPushToggle from '@/components/super/super-push-toggle';
import ColaDeTrabajo, { type Contactos } from '@/components/super/cola-trabajo';
import s from '@/components/super/cola.module.css';

export const metadata = { title: 'Inicio — Super Admin' };
export const dynamic = 'force-dynamic';

/** La hora de esta petición (fuera del cuerpo: `react-hooks/purity`). */
function elMomento(): number {
  return Date.now();
}

/* ============================================================
   INICIO DEL SUPERADMIN — la cola de hoy (ficha 4.9, línea N)
   ------------------------------------------------------------
   Maqueta aprobada el 2026-11-18
   (docs/diseno/MAQUETA_SUPERADMIN_NADA_SATURADO_2026-11-18.html).

   Antes: seis cifras (cinco arriba y una sola abajo en la PC, N09), una
   lista de avisos sin estado (uno por síntoma, idénticos al día
   siguiente aunque ya hubieras llamado), la gráfica de la plataforma,
   recién llegados, más activos y la distribución por plan.

   Ahora: el dinero en una línea y la cola por tipo (servicio afectado,
   cobranza, activación, seguimiento), un asunto por restaurante y tipo,
   que se pospone o resuelve con historia (migración 187). La gráfica,
   la distribución y la tabla por actividad viven en Métricas; los
   recién creados, en Restaurantes (ordenada por recientes), donde
   también está «Nuevo restaurante».

   Una lectura caída nunca dice «todo al día» (auditoría 2026-11-03):
   ni la salud de los clientes (N12) ni, ahora, el cobro.
   ============================================================ */

export default async function SuperHomePage() {
  const [billing, salud, restaurants, cola] = await Promise.all([
    getBillingDashboard(),
    getClientHealth(),
    getAllRestaurants(),
    estadosDeLaCola(),
  ]);
  const { rows, stats } = billing;
  const ahora = elMomento();

  const cobros: CobroDeRestaurante[] = rows.map((r) => ({
    restaurantId: r.restaurantId,
    nombre: r.name,
    activo: r.status === 'active',
    planNombre: planLabel(r.plan),
    pendiente: r.pendingTotal,
    vencido: r.hasOverdue,
    vencidoDesde: r.overdueSince,
    sinTarifa: !(r.config && r.config.monthly_fee > 0),
    pruebaDias: isOnTrial(r.config) ? trialDaysLeft(r.config) : null,
    pendienteTexto: fmtMoney(r.pendingTotal, r.config?.currency ?? stats.currency),
  }));

  const { grupos, pospuestos, total } = armarCola({
    restaurantes: salud.restaurantes, cuentas: salud.cuentas, cobros, guardados: cola.guardados, ahora,
  });

  const contactos: Contactos = {};
  for (const r of restaurants) {
    contactos[r.id] = { whatsapp: waDigits((r as { whatsapp_number?: string | null }).whatsapp_number ?? null), dueno: null };
  }

  const activos = rows.filter((r) => r.status === 'active').length;
  const vencido = rows.filter((r) => r.hasOverdue).reduce((sum, r) => sum + r.pendingTotal, 0);
  const proxima = pospuestos[0]?.hasta;

  return (
    <div className={`${s.inicio} anim-fade-up`}>
      <PageHeader subtitle="Lo que hay que atender hoy." />

      {billing.estado === 'error' ? (
        <p className={s.aviso} role="alert">
          <b>No se pudo leer el cobro.</b> Las mensualidades, lo cobrado y lo vencido pueden no estar completos, y faltar asuntos de cobranza.{' '}
          <Link href="/super">Reintentar</Link>
        </p>
      ) : (
        <p className={s.dinero}>
          <Link href="/super/finanzas">
            Este mes: <b>{fmtMoney(stats.mrr, stats.currency)}</b> en mensualidades · <b>{fmtMoney(stats.collectedThisMonth, stats.currency)}</b> cobrado
            {vencido > 0 && <> · <span className={s.mal}>{fmtMoney(vencido, stats.currency)} vencido</span></>}
          </Link>
          {' '}· {activos} {activos === 1 ? 'restaurante activo' : 'restaurantes activos'}
        </p>
      )}

      {salud.estado === 'error' && (
        <p className={s.aviso} role="alert">
          <b>No se pudo revisar la salud de los clientes.</b> PCs caídas, restaurantes sin vender o altas a medias pueden faltar en esta cola.{' '}
          <Link href="/super">Reintentar</Link>
        </p>
      )}
      {salud.estado === 'falta-migracion' && (
        <p className={s.aviso} data-tono="info">Los asuntos de servicio, activación y seguimiento aparecen al aplicar la migración 138.</p>
      )}
      {cola.estado === 'falta-migracion' && (
        <p className={s.aviso} data-tono="info">Falta aplicar la migración 187: la cola se ve, pero todavía no se puede posponer, resolver ni anotar.</p>
      )}
      {cola.estado === 'error' && (
        <p className={s.aviso} role="alert">
          <b>No se pudo leer qué asuntos ya resolviste o pospusiste.</b> Pueden aparecer otra vez.
        </p>
      )}

      {total === 0 && billing.estado !== 'error' && salud.estado !== 'error' ? (
        <div className={`${s.tarjeta} ${s.vacio}`}>
          <b>Nada pendiente hoy.</b>
          <span>
            Sin servicio caído, cobros vencidos ni altas atascadas.
            {proxima && ` ${pospuestos.length === 1 ? '1 asunto pospuesto vuelve' : `${pospuestos.length} asuntos pospuestos vuelven`} desde el ${new Date(proxima).toLocaleDateString('es-GT', { day: 'numeric', month: 'short' })}.`}
          </span>
        </div>
      ) : null}

      <ColaDeTrabajo
        grupos={grupos}
        pospuestos={pospuestos}
        contactos={contactos}
        ahora={ahora}
        guardaEstados={cola.estado === 'ok'}
      />

      <SuperPushToggle />
    </div>
  );
}
