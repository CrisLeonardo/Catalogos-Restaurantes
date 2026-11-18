import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/icons';
import { SavedBanner } from '@/components/super/ui';
import { getRestaurantFullById, getRestaurantUsers, getRestaurantDeepMetrics } from '@/lib/db/super-admin';
import { getBillingConfig, getInvoices, isOnTrial, trialDaysLeft, isOverdue, planLabel } from '@/lib/db/billing';
import { getClientHealth } from '@/lib/db/client-health';
import { estadosDeLaCola, eventosDelRestaurante } from '@/lib/db/super-cola';
import { armarCola, type Asunto } from '@/lib/super/cola';
import { estadoDePc } from '@/lib/estado-pc';
import { waDigits } from '@/lib/reminder';
import { fmtMoney } from '@/lib/money';
import { AbiertosDeLaFicha, NotasDeSoporte } from '@/components/super/cola-trabajo';
import s from '@/components/super/cola.module.css';

export const dynamic = 'force-dynamic';

/** La hora de esta petición (fuera del cuerpo: `react-hooks/purity`). */
function elMomento(): number {
  return Date.now();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getRestaurantFullById(id);
  return { title: `${row?.name ?? 'Restaurante'} — Super Admin` };
}

/* ============================================================
   RESUMEN DE LA FICHA — el contexto de soporte (ficha 4.9, S05)
   ------------------------------------------------------------
   Maqueta aprobada el 2026-11-18. Antes: seis cifras (cinco y una sola
   abajo, N09) y una gráfica. Para saber quién es el dueño, cuándo entró,
   si su PC está conectada o qué se habló con él había que recorrer siete
   pestañas, y lo último no estaba en ningún lado.

   Ahora: lo abierto de ESTE restaurante (la misma cola del inicio), el
   dueño con su WhatsApp, el último acceso, la operación, la PC y el
   cobro en filas, las notas de soporte con autor y una historia que junta
   alta, pagos y lo hecho en la cola (migración 187). La gráfica y las
   cifras de tráfico siguen en Métricas (botón de la cabecera).
   ============================================================ */

const DIA = 86_400_000;

function cuando(iso: string | null | undefined, ahora: number): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  const hoy = new Date(ahora).toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
  const ese = t.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
  const hora = t.toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Guatemala' });
  if (ese === hoy) return `hoy, ${hora}`;
  if (ahora - t.getTime() < 2 * DIA) return `ayer, ${hora}`;
  return t.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' });
}

function fecha(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
    .toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' });
}

export default async function FichaResumenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;

  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const [billing, invoices, users, metrics, salud, cola, historia] = await Promise.all([
    getBillingConfig(id),
    getInvoices(id),
    getRestaurantUsers(id),
    getRestaurantDeepMetrics(id),
    getClientHealth(),
    estadosDeLaCola(),
    eventosDelRestaurante(id),
  ]);
  const ahora = elMomento();
  const currency = billing?.currency ?? 'GTQ';

  const pending = invoices.filter((i) => i.status === 'PENDING');
  const pendingTotal = pending.reduce((acc, i) => acc + i.amount, 0);
  const vencidas = pending.filter((i) => isOverdue(i));
  const vencidoDesde = vencidas.map((i) => i.due_date as string).sort()[0] ?? null;
  const pagadas = invoices
    .filter((i) => i.status === 'PAID' && i.paid_at)
    .sort((a, b) => (b.paid_at as string).localeCompare(a.paid_at as string));
  const onTrial = isOnTrial(billing);
  const feeConfigured = !!billing && billing.monthly_fee > 0;

  const miSalud = salud.restaurantes.find((r) => r.restaurantId === id);
  const { grupos } = armarCola({
    restaurantes: miSalud ? [miSalud] : [],
    cuentas: [],
    cobros: [{
      restaurantId: id, nombre: row.name, activo: row.status === 'active', planNombre: planLabel(row.plan_actual),
      pendiente: pendingTotal, vencido: vencidas.length > 0, vencidoDesde, sinTarifa: !feeConfigured,
      pruebaDias: onTrial ? trialDaysLeft(billing) : null, pendienteTexto: fmtMoney(pendingTotal, currency),
    }],
    guardados: cola.guardados,
    ahora,
  });
  const abiertos: Asunto[] = grupos.flatMap((g) => g.asuntos);

  const dueno = users.find((u) => u.memberRole === 'OWNER' || u.role === 'RESTAURANT_OWNER');
  const telefono = (row as { whatsapp_number?: string | null }).whatsapp_number ?? null;
  const wa = waDigits(telefono);
  const ultimoAcceso = users.map((u) => u.lastSignInAt).filter((x): x is string => !!x).sort().pop() ?? null;
  const pc = estadoDePc(
    miSalud && (miSalud.pcActiva !== null || miSalud.pcVistoEn)
      ? { existe: true, activa: miSalud.pcActiva, ultimaSenal: miSalud.pcVistoEn }
      : null,
    ahora,
    miSalud?.zonaHoraria ?? 'America/Guatemala',
  );

  const notas = historia.eventos.filter((e) => e.tipo === 'nota');
  const linea = [
    ...historia.eventos.filter((e) => e.tipo !== 'nota').map((e) => ({
      en: e.creadoEn,
      texto: e.tipo === 'pospuso' ? `Pospuesto: ${e.texto ?? ''}` : e.tipo === 'resolvio' ? `Resuelto${e.texto ? `: ${e.texto}` : ''}` : 'Volvió a la cola',
    })),
    ...pagadas.slice(0, 6).map((i) => ({ en: i.paid_at as string, texto: `Pago ${fmtMoney(i.paid_amount ?? i.amount, currency)} aprobado` })),
    { en: row.created_at, texto: `Alta · plan ${planLabel(row.plan_actual)}` },
  ].sort((a, b) => b.en.localeCompare(a.en)).slice(0, 8);

  const contacto = { whatsapp: wa, dueno: dueno ? `${dueno.full_name ?? dueno.email ?? 'Sin nombre'}${telefono ? ` · ${telefono}` : ''}` : null };

  return (
    <div className={s.ficha}>
      {isNew && (
        <SavedBanner message="Restaurante creado. Configura el plan, el tema y crea el acceso del dueño en las pestañas de arriba." />
      )}

      <p className={s.dinero}>
        {feeConfigured ? <>Plan {planLabel(row.plan_actual)} · <b>{fmtMoney(billing!.monthly_fee, currency)}</b> al mes</> : <>Plan {planLabel(row.plan_actual)} · sin mensualidad configurada</>}
        {onTrial && ` · en prueba, ${trialDaysLeft(billing)} días`}
        {' '}· cliente desde el {fecha(row.created_at)}
      </p>

      {salud.estado === 'error' && (
        <p className={s.aviso} role="alert"><b>No se pudo revisar su PC ni sus pedidos.</b> Lo abierto puede estar incompleto.</p>
      )}

      <div className={s.dosColumnas}>
        <div>
          <AbiertosDeLaFicha asuntos={abiertos} contacto={contacto} ahora={ahora} guardaEstados={cola.estado === 'ok'} />

          <div className={s.tarjeta}>
            <ul className={s.contexto}>
              <li>
                <span className={s.etiqueta}>Dueño</span>
                <span style={{ minWidth: 0 }}>
                  <b>{dueno ? (dueno.full_name ?? dueno.email ?? 'Sin nombre') : 'Sin dueño con acceso'}</b>
                  <small>{[dueno?.full_name ? dueno.email : null, telefono].filter(Boolean).join(' · ') || 'Sin teléfono de WhatsApp en Información'}</small>
                </span>
                {wa ? (
                  <a className={`${s.ir} ${s.wa}`} href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`Escribirle por WhatsApp a ${row.name}`}>
                    <Icon name="whatsapp" size={18} />
                  </a>
                ) : <span />}
              </li>
              <li>
                <span className={s.etiqueta}>Último acceso</span>
                <span>
                  <b data-tono={users.length === 0 ? 'warn' : undefined}>
                    {users.length === 0 ? 'Nadie tiene acceso' : cuando(ultimoAcceso, ahora) ?? 'Nunca ha entrado'}
                  </b>
                  <small>{users.length === 1 ? '1 persona con acceso' : `${users.length} personas con acceso`}</small>
                </span>
                <Link className={s.ir} href={`/super/restaurantes/${id}/accesos`} aria-label="Ver los accesos"><Icon name="chevronRight" size={16} /></Link>
              </li>
              <li>
                <span className={s.etiqueta}>Operación</span>
                <span>
                  <b>{metrics.orders30 === 1 ? '1 pedido' : `${metrics.orders30.toLocaleString('es-GT')} pedidos`} en 30 días</b>
                  <small>
                    {[
                      miSalud?.ultimoPedidoEn ? `último: ${cuando(miSalud.ultimoPedidoEn, ahora)}` : 'sin pedidos todavía',
                      metrics.revenue30 > 0 ? `venta ${fmtMoney(metrics.revenue30, currency)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <Link className={s.ir} href={`/super/metricas/${id}`} aria-label="Ver sus métricas"><Icon name="chevronRight" size={16} /></Link>
              </li>
              <li>
                <span className={s.etiqueta}>PC principal</span>
                <span>
                  <b data-tono={pc.tono === 'danger' ? 'danger' : pc.tono === 'warn' ? 'warn' : undefined}>{pc.texto}</b>
                  {miSalud && miSalud.impresionesFallidas24h > 0 && <small>{miSalud.impresionesFallidas24h} impresiones fallidas en 24 h</small>}
                </span>
                <span />
              </li>
              <li>
                <span className={s.etiqueta}>Cobro</span>
                <span>
                  <b data-tono={vencidas.length > 0 ? 'warn' : undefined}>
                    {pendingTotal > 0 ? `${fmtMoney(pendingTotal, currency)} ${vencidas.length > 0 ? 'vencido' : 'pendiente'}` : 'Al día'}
                  </b>
                  <small>{pagadas[0] ? `último pago: ${fecha(pagadas[0].paid_at as string)}` : 'todavía sin pagos registrados'}</small>
                </span>
                <Link className={s.ir} href={`/super/restaurantes/${id}/cobro`} aria-label="Ver el cobro"><Icon name="chevronRight" size={16} /></Link>
              </li>
            </ul>
          </div>
        </div>

        <div>
          <NotasDeSoporte restaurantId={id} notas={notas} guardaEstados={historia.estado === 'ok'} />

          <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="ficha-historia">
            <h2 className={s.titulo} id="ficha-historia">Historia</h2>
            <ul className={s.linea}>
              {linea.map((l, i) => (
                <li key={`${l.en}-${i}`}><span>{cuando(l.en, ahora)}</span>{l.texto}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
