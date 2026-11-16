import { debeRecordarCandado } from '@/lib/device-lock-reminder';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminContext } from '@/lib/db/admin';
import { getRestaurantBySlug } from '@/lib/db/restaurants';
import { getOrderStats } from '@/lib/db/orders';
import { getHoyWidgets } from '@/lib/db/hoy';
import { getBillingConfig, getInvoices, isOnTrial, isOverdue, trialDaysLeft } from '@/lib/db/billing';
import { ultimoComprobante } from '@/lib/db/comprobantes';
import { getVisitStats } from '@/lib/actions/metrics';
import { subdomainUrl } from '@/lib/tenant';
import { PLANS, withPlanFloor, PLAN_ORDER, type PlanCode } from '@/lib/plans';
import { estadoDelTope } from '@/lib/tope-pedidos';
import { pedidosDelMes } from '@/lib/db/tope-pedidos';
import { isModuleActive } from '@/lib/modules';
import { Icon } from '@/components/icons';
import { can } from '@/lib/permissions';
import { formatPrice } from '@/lib/theme/resolve';
import { List, ListLink, ListText } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { OnlineWidget, RatingsWidget, StockWidget } from '@/components/admin/hoy-widgets';
import { SalesTrendWidget, TopTodayWidget } from '@/components/admin/sales-widgets';
import HitoTarjeta from '@/components/admin/momentos/hito-tarjeta';
import FiestaPrimerPedido from '@/components/admin/momentos/fiesta-primer-pedido';
import { TuDiaTira } from '@/components/admin/momentos/tu-dia';
import CompartirPlato from '@/components/admin/momentos/compartir-plato';
import { Atender } from '@/components/admin/hoy/atender';
import { DineroHoy, type Celda } from '@/components/admin/hoy/dinero-hoy';
import { ServicioHoy } from '@/components/admin/hoy/servicio-hoy';
import { PrimerPedido } from '@/components/admin/hoy/primer-pedido';
import { getCajaState } from '@/lib/actions/finanzas';
import { getPedidosVivos, getAvanceGuia, getCierresDelDia, getSemana } from '@/lib/db/hoy-etapa';
import {
  etapaDeHoy, excepcionesDeServicio, ordenarExcepciones, pasosPrimerPedido,
  type Excepcion, type PasoPrimerPedido,
} from '@/lib/hoy-etapa';
import type { MarcaRestaurante, PlatoParaCompartir } from '@/lib/compartir/plato';
import { getHitos, getTuDia } from '@/lib/db/momentos';
import { leerSaludDelLocal } from '@/lib/db/estado-pc';
import { estadoDeImpresora, estadoDePc, type DiagnosticoImpresora, type DiagnosticoPc } from '@/lib/estado-pc';
import type { ResolvedTheme } from '@/lib/theme/resolve';
import type { Restaurant } from '@/types';
import { panelBase } from '@/lib/panel-links-server';
import { panelHref } from '@/lib/panel-links';
import { fmtMoney } from '@/lib/money';
import { ritmoDelDia } from '@/lib/ritmo-del-dia';

export const metadata = { title: 'Hoy – Panel admin' };

/* ============================================================
   /admin — "Hoy", por etapa (fichas 2.1 y 2.2, 2026-11-15)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_HOY_POR_ETAPA_2026-11-15.html

   Hoy responde qué necesita atención, cuánto se cobró y cómo va el
   servicio, y elige sola su versión (reglas en lib/hoy-etapa.ts):

     · nuevo     → «Llega a tu primer pedido», sin cifras en cero.
     · operando  → Atender (hasta tres filas), el dinero —«Cobrado»,
                   el libro de Caja, no lo pedido— y el servicio. En
                   la PC, la tendencia va en una segunda columna.
     · cerrado   → la caja se cerró hoy y no queda nada vivo: lo
                   cobrado, el cuadre y lo comprobable de la semana.

   Nada se anuncia cuando va bien: un bloque sin nada que decir no se
   pinta. La oferta de subir de plan se fue a Negocio › Resumen.
   ============================================================ */

/** Un aviso de la cuenta (pago, PC, tope…), ya resuelto. */
type AvisoCuenta = Excepcion;

export default async function AdminHomePage() {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = await panelBase();
  const href = (ruta: string) => panelHref(base, ruta);
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  const { profile } = ctx;

  const slug = (await headers()).get('x-tenant-slug');

  let restaurant: Restaurant | null = ctx.restaurant ?? null;
  let resolved: ResolvedTheme | null = null;
  if (slug) {
    const data = await getRestaurantBySlug(slug);
    if (data) { restaurant = data.restaurant; resolved = data.resolved; }
  }

  /* Módulos activos, con el MISMO criterio que el menú lateral: el plan manda
     sobre la bandera del jsonb (withPlanFloor) y un módulo activable necesita
     además que el restaurante lo tenga encendido (isModuleActive). */
  const planActual = (restaurant?.plan_actual as string | null) ?? null;
  const mod = withPlanFloor(
    ((PLAN_ORDER as string[]).includes(planActual ?? '') ? planActual : 'BASICO') as PlanCode,
    (restaurant?.modules as Record<string, boolean> | null) ?? {},
  );
  const modSettings = restaurant?.module_settings ?? null;
  const ordersEnabled = mod.orders === true;
  const timezone = restaurant?.timezone ?? 'America/Guatemala';
  const restaurantId = restaurant?.id ?? profile.restaurant_id ?? null;
  const allow = (key: string) => can(profile.role, profile.permissions, key);
  const needsGuideCheck =
    profile.role === 'RESTAURANT_OWNER' && restaurant?.onboarding_done === false && !!restaurantId;

  /* Todo lo que no depende de otra lectura sale junto. La caja solo para
     quien tiene alguna tarea de Caja; getCajaState vuelve a comprobarlo. */
  const [stats, vivos, tuDia, hitos, visitStats, caja, avance] = await Promise.all([
    ordersEnabled && restaurantId ? getOrderStats(restaurantId, timezone) : null,
    ordersEnabled && restaurantId && allow('pedidos') ? getPedidosVivos(restaurantId) : null,
    ordersEnabled && restaurantId ? getTuDia(restaurantId, timezone) : null,
    restaurantId ? getHitos(restaurantId) : null,
    restaurantId ? getVisitStats(restaurantId, timezone) : null,
    ordersEnabled && restaurantId && allow('caja') ? getCajaState(restaurantId) : null,
    needsGuideCheck && restaurantId ? getAvanceGuia(restaurantId) : null,
  ]);
  const cajaVisible = !!caja && !caja.ciego && !caja.needsMigration;
  const cierres = cajaVisible && restaurantId ? await getCierresDelDia(restaurantId, caja.date) : null;

  /* Primeros pasos por resultado (2.2). La guía se va sola al cumplirse los
     tres pasos, o cuando el dueño toca «Omitir». */
  const pasos: PasoPrimerPedido[] = avance
    ? pasosPrimerPedido({
        platillos: avance.platillos,
        visitas: visitStats?.last30 ?? 0,
        personasDistintas: visitStats?.unique30 ?? 0,
        conPedidos: ordersEnabled,
        pedidoRecorrido: avance.pedidoRecorrido,
      })
    : [];
  const guiaPendiente = pasos.some((p) => !p.hecho);

  const etapa = etapaDeHoy({
    guiaPendiente,
    cerroHoy: (cierres?.cierres ?? 0) > 0,
    turnoAbierto: !!caja?.shift,
    cobradoDesdeCierre: caja?.summary.totalSales ?? 0,
    pedidosVivos: vivos?.length ?? 0,
  });

  /* ── Los widgets ────────────────────────────────────────────
     Cada uno se pide solo si su módulo está activo Y quien mira tiene
     permiso para esa sección. Un null es un bloque que no se pinta. */
  const widgets = restaurantId
    ? await getHoyWidgets(
        restaurantId,
        timezone,
        {
          orders: ordersEnabled && !!stats,
          dineIn: (resolved?.config.orderTypes.includes('dine_in') ?? false) && allow('mesas'),
          waitlist: isModuleActive(mod, modSettings, 'lista_espera') && allow('lista_espera'),
          reservations: isModuleActive(mod, modSettings, 'reservaciones') && allow('reservaciones'),
          inventory: mod.inventario === true && allow('inventario'),
          surveys: isModuleActive(mod, modSettings, 'encuestas') && allow('encuestas'),
        },
        {
          tableCount: resolved?.config.dineInTableCount ?? 0,
          // La conversión del menú se mide con los pedidos de la carta.
          todayOrders: stats?.todayOnline ?? 0,
          visits: visitStats,
        },
      )
    : null;
  const semana = etapa === 'cerrado' && restaurantId ? await getSemana(restaurantId) : null;

  // ── Prueba gratis ───────────────────────────────────────────
  const billing = restaurantId ? await getBillingConfig(restaurantId) : null;
  const onTrial = isOnTrial(billing);
  const trialLeft = onTrial ? trialDaysLeft(billing) : 0;

  // ── Cobro pendiente de la mensualidad (Paga tu plan) ────────
  const cobro = billing && restaurantId && allow('suscripcion')
    ? await (async () => {
        const [invoices, comprobante] = await Promise.all([getInvoices(restaurantId, 24), ultimoComprobante(restaurantId)]);
        const pendientes = invoices.filter((i) => i.status === 'PENDING');
        if (pendientes.length === 0) return null;
        return {
          total: pendientes.reduce((s, i) => s + i.amount, 0),
          currency: billing.currency,
          vencido: pendientes.some((i) => isOverdue(i)),
          enRevision: comprobante.datos?.status === 'SUBMITTED',
        };
      })()
    : null;

  // ── Tope de pedidos de En línea (solo aviso, nunca corta un pedido) ──
  const plan = (restaurant?.plan_actual ?? null) as PlanCode | null;
  const tope = plan && PLANS[plan].monthlyOrderCap && restaurantId && allow('suscripcion')
    ? estadoDelTope(plan, await pedidosDelMes(restaurantId, timezone))
    : null;

  // ── Aviso de visitas del plan gratuito (solo aviso, nunca bloquea el menú) ──
  const visitWarningLimit = restaurant?.plan_actual ? PLANS[restaurant.plan_actual].monthlyVisitWarning : undefined;
  const visitWarning = !!visitStats && !!visitWarningLimit && visitStats.last30 >= visitWarningLimit;

  // ── Salud de la PC principal ────────────────────────────────
  // 'offline' = estaba encendida y dejó de reportar >10 min. Durante la guía
  // no se pide elegirla: la impresora aparece cuando entra el primer pedido.
  /* Un solo reloj para la PC (ficha 2.6, `lib/estado-pc.ts`): Hoy avisa
     cuando lleva más de 10 min «Desconectada», igual que Ajustes, Mi PC y
     el superadmin. Y una impresora que no imprime cuenta igual. */
  let pcCaida: DiagnosticoPc | null = null;
  let cocinaFalla: DiagnosticoImpresora | null = null;
  let cajaFalla: DiagnosticoImpresora | null = null;
  let pcState: 'missing' | 'off' | null = null;
  if (ordersEnabled && restaurantId && allow('impresion')) {
    const salud = await leerSaludDelLocal(restaurantId);
    // Frescura evaluada al momento del request a propósito (server component).
    // eslint-disable-next-line react-hooks/purity
    const pc = estadoDePc(salud.pc, Date.now(), timezone);
    if (pc.alarma) pcCaida = pc;
    else if (pc.estado === 'conectada') {
      const cocina = estadoDeImpresora(salud.cocina, 'comanda', timezone);
      const caja = estadoDeImpresora(salud.caja, 'recibo', timezone);
      if (cocina.estado === 'fallando') cocinaFalla = cocina;
      if (caja.estado === 'fallando') cajaFalla = caja;
    }
    const decide = profile.role === 'RESTAURANT_OWNER' || profile.role === 'SUPER_ADMIN';
    if (decide && etapa !== 'nuevo') {
      if (!salud.pc.existe) pcState = 'missing';
      else if (salud.pc.activa === false) pcState = 'off';
    }
  }

  /* Platillos a la vista sin foto (MEN-12): va a «Mejora tu carta», al final. */
  let sinFoto = 0;
  if (restaurantId && allow('catalogo') && etapa !== 'nuevo') {
    const { count } = await createServiceClient()
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .or('image_url.is.null,image_url.eq.');
    sinFoto = count ?? 0;
  }

  /* ACC-06: pasada una semana se le recuerda al DUEÑO que ya puede encender
     el candado de aparatos (lib/device-lock-reminder.ts). */
  let recordarCandado = 0;
  if (restaurantId && profile.role === 'RESTAURANT_OWNER' && etapa !== 'nuevo'
      && (restaurant as { pin_requires_trusted_device?: boolean } | null)?.pin_requires_trusted_device !== true) {
    const { data: primero, count } = await createServiceClient()
      .from('restaurant_devices')
      .select('created_at', { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: true })
      .limit(1);
    if (debeRecordarCandado({
      candadoEncendido: false,
      aparatos: count ?? 0,
      primerAparatoEn: (primero?.[0]?.created_at as string | undefined) ?? null,
    })) recordarCandado = count ?? 0;
  }

  const fmt = (n: number) => (resolved ? formatPrice(n, resolved.config) : fmtMoney(n));
  const brandName = restaurant?.name ?? 'tu restaurante';

  // El menú público vive en el subdominio SIN "-admin" (ver proxy.ts §3).
  const menuUrl = slug ? subdomainUrl(slug) : '/';

  /* «Comparte tu plato del día» (PLAN_MOMENTOS_PICO P7). */
  let platoEstrella: PlatoParaCompartir | null = null;
  const estrella = stats?.topToday[0] ?? null;
  if (estrella && restaurantId && allow('catalogo')) {
    const { data: prod } = await createServiceClient()
      .from('products')
      .select('image_url, price')
      .eq('restaurant_id', restaurantId)
      .eq('name', estrella.name)
      .limit(1)
      .maybeSingle();
    platoEstrella = {
      nombre: estrella.name,
      precio: prod?.price != null ? fmt(Number(prod.price)) : null,
      imagen: (prod?.image_url as string | null | undefined) ?? null,
    };
  }
  const marca: MarcaRestaurante | null = resolved
    ? {
        nombre: brandName,
        fondo: resolved.config.colorBg,
        texto: resolved.config.colorText,
        acento: resolved.config.colorAccent,
        sobreAcento: resolved.config.onAccent,
        logo: resolved.config.logoUrl ?? null,
        menu: menuUrl.replace(/^https?:\/\//, ''),
      }
    : null;

  // Fecha y horas en la zona del restaurante, no en la del servidor.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  let today: string;
  let weekday = 'hoy';
  try {
    today = new Intl.DateTimeFormat('es-GT', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone,
    }).format(new Date(now));
    today = today.charAt(0).toUpperCase() + today.slice(1);
    weekday = new Intl.DateTimeFormat('es-GT', { weekday: 'long', timeZone: timezone }).format(new Date(now));
  } catch {
    today = brandName;
  }
  const hora = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('es-GT', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso));
    } catch { return ''; }
  };

  // ── Avisos de la cuenta: misma forma que las excepciones del servicio ──
  const avisos: AvisoCuenta[] = [];
  if (pcCaida) {
    avisos.push({
      key: 'pc', ruta: '/admin/mi-pc', nivel: 'urgente', accion: 'Revisar',
      titulo: `La PC del local: ${pcCaida.texto.charAt(0).toLowerCase()}${pcCaida.texto.slice(1)}`,
      detalle: 'Revisa que esté encendida y con internet; mientras tanto no se imprimen comandas solas.',
    });
  }
  for (const [key, falla, papel] of [['imp-cocina', cocinaFalla, 'cocina'], ['imp-caja', cajaFalla, 'caja']] as const) {
    if (!falla) continue;
    avisos.push({
      key, ruta: '/admin/mi-pc', nivel: 'urgente', accion: 'Reintentar',
      titulo: `La impresora de ${papel}: ${falla.texto}`,
      detalle: '¿Sin papel o apagada? Revísala y vuelve a mandarlos desde La PC del local.',
    });
  }
  if (cobro && !cobro.enRevision) {
    avisos.push({
      key: 'cobro', ruta: '/admin/suscripcion', nivel: cobro.vencido ? 'urgente' : 'aviso', accion: 'Pagar',
      titulo: cobro.vencido
        ? `Tu pago de ${fmtMoney(cobro.total, cobro.currency)} está vencido`
        : `Tienes ${fmtMoney(cobro.total, cobro.currency)} por pagar`,
      detalle: 'Sube el comprobante de tu transferencia. Te toma un minuto.',
    });
  }
  if (onTrial && trialLeft <= 3) {
    avisos.push({
      key: 'trial', ruta: '/admin/suscripcion', nivel: 'urgente', accion: 'Ver planes',
      titulo: `Tu prueba termina en ${trialLeft} día${trialLeft !== 1 ? 's' : ''}`,
      detalle: 'Contáctanos para continuar sin interrupciones.',
    });
  }
  /* Caja sin apertura con dinero ya cobrado (M§4.3): se puede cerrar sin
     haber abierto, así que es un aviso suave y va al final. */
  if (cajaVisible && caja && !caja.shift && caja.summary.totalSales > 0 && etapa === 'operando') {
    avisos.push({
      key: 'caja-sin-abrir', ruta: '/admin/caja', nivel: 'info', accion: 'Abrir caja',
      titulo: 'La caja no se abrió',
      detalle: `Ya hay ${fmt(caja.summary.totalSales)} cobrados sin turno`,
    });
  }
  if (pcState) {
    avisos.push({
      key: 'pc-principal', ruta: '/admin/mi-pc', nivel: 'info', accion: pcState === 'missing' ? 'Elegirla' : 'Encenderla',
      titulo: pcState === 'missing' ? 'Aún no eliges la PC del local' : 'La PC del local está apagada',
      detalle: pcState === 'missing'
        ? 'Con ella las comandas se imprimen solas y un corte de internet no detiene el servicio.'
        : 'Mientras siga apagada no se imprimen comandas solas ni hay respaldo si se cae el internet.',
    });
  }
  if (tope && tope.nivel !== 'ok') {
    avisos.push({
      key: 'tope-pedidos', ruta: '/admin/suscripcion', nivel: tope.nivel === 'pasado' ? 'urgente' : 'aviso', accion: 'Ver planes',
      titulo: tope.nivel === 'pasado'
        ? `¡${tope.usados.toLocaleString('es-GT')} pedidos este mes! Pasaste los ${tope.tope} de En línea`
        : `Llevas ${tope.usados.toLocaleString('es-GT')} de ${tope.tope} pedidos este mes`,
      detalle: tope.nivel === 'pasado'
        ? 'Tu menú sigue vendiendo: no se corta ningún pedido. Desde el próximo mes tu negocio necesita Estándar.'
        : 'Si pasas el tope tu menú sigue vendiendo, y el próximo mes te pediremos pasar a Estándar.',
    });
  }
  if (visitWarning && visitStats) {
    avisos.push({
      key: 'visitas', ruta: '/admin/suscripcion', nivel: 'aviso', accion: 'Ver planes',
      titulo: `Tu menú va muy bien: ${visitStats.last30.toLocaleString('es-GT')} visitas este mes`,
      detalle: 'Pasaste el uso típico del plan gratuito. Sube de plan para pedidos en línea y avisos en tiempo real.',
    });
  }
  if (onTrial && trialLeft > 3) {
    avisos.push({
      key: 'trial', ruta: '/admin/suscripcion', nivel: 'info', accion: 'Ver planes',
      titulo: trialLeft === 1 ? 'Te queda 1 día de prueba' : `Te quedan ${trialLeft} días de prueba`,
      detalle: 'Tu menú ya está en vivo. Aprovéchalo al máximo.',
    });
  }
  if (recordarCandado > 0) {
    avisos.push({
      key: 'candado-aparatos', ruta: '/admin/personal', nivel: 'aviso', accion: 'Encender',
      titulo: 'Ya puedes cerrar el PIN a tu local',
      detalle: `Reconocimos ${recordarCandado === 1 ? '1 aparato' : `${recordarCandado} aparatos`} de tu local. Enciende «El PIN solo funciona en estos aparatos».`,
    });
  }

  const atender = ordenarExcepciones([
    ...(vivos ? excepcionesDeServicio(vivos, now, hora, fmt) : []),
    ...avisos,
  ]);

  /* «Mejora tu carta»: lo que vende más pero no es del día (lema, fotos). */
  const mejoras: { key: string; ruta: string; titulo: string; detalle: string; accion: string }[] = [];
  if (resolved && !resolved.config.tagline && !resolved.content.portada.subtitle && allow('perfil') && etapa !== 'nuevo') {
    mejoras.push({
      key: 'lema', ruta: '/admin/perfil', accion: 'Escribir lema',
      titulo: 'Tu menú no tiene lema',
      detalle: 'Una frase bajo tu nombre en la portada, como «Café de especialidad en la zona 10».',
    });
  }
  if (sinFoto > 0) {
    mejoras.push({
      key: 'sin-foto', ruta: '/admin/menu?filtro=sin-foto', accion: 'Agregar fotos',
      titulo: sinFoto === 1 ? '1 platillo sin foto' : `${sinFoto} platillos sin foto`,
      detalle: 'Con foto se piden más: en un menú digital la gente elige con los ojos.',
    });
  }

  /* Con qué comparar lo pedido hoy (HOY-03, EV-15): lo que un día igual
     llevaba a esta hora. Antes de la primera venta no se compara. */
  const ritmo = stats ? ritmoDelDia(stats.todaySales, widgets?.pace ?? null) : null;
  let ventasVs: React.ReactNode = null;
  if (ritmo?.tipo === 'comparado') {
    const delta = ritmo.delta;
    const dia = `un ${weekday} normal`;
    ventasVs = delta === 0
      ? <>igual que {dia}</>
      : (
        <>
          <span style={{ color: delta > 0 ? 'var(--c-ok)' : 'var(--c-warn)', fontWeight: 600 }}>
            {delta > 0 ? '↑' : '↓'} {Math.abs(delta)} %
          </span>{' '}
          vs. {dia}
        </>
      );
  }
  const lineaPedidos = stats && stats.todayOrders > 0
    ? <>{stats.todayOrders} {stats.todayOrders === 1 ? 'pedido' : 'pedidos'} · ticket {fmt(stats.todayTicket)}{ventasVs ? <> · {ventasVs}</> : null}</>
    : null;

  /* ── El dinero ── */
  let dinero: React.ReactNode = null;
  if (etapa === 'cerrado' && cierres) {
    const dif = cierres.diferencia;
    const cuadre = dif === 0 ? 'sin diferencia' : dif < 0 ? `faltan ${fmt(Math.abs(dif))}` : `sobran ${fmt(dif)}`;
    const celdas: Celda[] = [
      { etiqueta: 'Cuadre de caja', valor: fmt(Math.abs(dif)), nota: [cierres.ultimo?.cajero, cuadre].filter(Boolean).join(' · ') },
    ];
    if (stats && stats.todayOrders > 0) {
      celdas.push({ etiqueta: 'Pedidos', valor: String(stats.todayOrders), nota: `ticket ${fmt(stats.todayTicket)}` });
    }
    dinero = (
      <DineroHoy
        etiqueta={`Cobrado el ${weekday}`}
        valor={fmt(cierres.cobrado)}
        celdas={celdas}
        pie={ventasVs}
        enlace={{ href: href('/admin/caja'), label: 'Ver los cierres' }}
      />
    );
  } else if (cajaVisible && caja) {
    const cobradoHoy = Math.round(((cierres?.cobrado ?? 0) + caja.summary.totalSales) * 100) / 100;
    const abiertas = caja.pending.mesas.length + caja.pending.domicilios.length + caja.pending.paraLlevar.length;
    if (cobradoHoy > 0 || caja.pending.total > 0 || (stats?.todayOrders ?? 0) > 0) {
      const celdas: Celda[] = [
        {
          etiqueta: 'Por cobrar', valor: fmt(caja.pending.total),
          nota: abiertas > 0 ? `${abiertas} ${abiertas === 1 ? 'cuenta abierta' : 'cuentas abiertas'}` : null,
        },
        caja.shift
          ? {
              etiqueta: 'Caja', texto: true,
              valor: caja.shift.openedByName ? `Abierta · ${caja.shift.openedByName}` : 'Abierta',
              nota: caja.shift.openedAt ? `desde las ${hora(caja.shift.openedAt)}` : null,
            }
          : {
              etiqueta: 'Caja', texto: true,
              valor: (cierres?.cierres ?? 0) > 0 ? 'Sin turno abierto' : 'Sin abrir',
              nota: cierres?.ultimo ? `último cierre ${hora(cierres.ultimo.at)}` : null,
            },
      ];
      dinero = (
        <DineroHoy
          etiqueta="Cobrado hoy"
          valor={fmt(cobradoHoy)}
          celdas={celdas}
          pie={lineaPedidos}
          enlace={allow('metricas') ? { href: href('/admin/metricas'), label: 'Ver el mes' } : null}
        />
      );
    }
  } else if (stats && stats.todayOrders > 0) {
    /* Sin acceso a Caja: lo pedido, dicho como lo que es. */
    dinero = (
      <DineroHoy
        etiqueta="Pedido hoy"
        valor={fmt(stats.todaySales)}
        celdas={[
          { etiqueta: 'Pedidos', valor: String(stats.todayOrders) },
          { etiqueta: 'Ticket promedio', valor: fmt(stats.todayTicket) },
        ]}
        pie={ventasVs}
        enlace={allow('metricas') ? { href: href('/admin/metricas'), label: 'Ver el mes' } : null}
      />
    );
  }

  const encabezado = etapa === 'nuevo' ? null : (
    <div className="flex items-center gap-3">
      <h2 className="min-w-0 flex-1 text-[14px] font-medium text-adm-text-3">
        {today}
        {etapa === 'cerrado' && cierres?.ultimo ? ` · cerraste a las ${hora(cierres.ultimo.at)}` : ''}
      </h2>
      <a href={menuUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[13px] font-semibold text-adm-accent-ink no-underline">
        <Icon name="eye" size={15} />
        Ver mi menú
      </a>
    </div>
  );

  const servicio = etapa === 'operando' && vivos ? (
    <ServicioHoy
      pedidos={vivos}
      casa={widgets?.house ?? null}
      ahora={now}
      dinero={fmt}
      href={href}
      verMesas={allow('mesas')}
    />
  ) : null;

  const tendencia = stats && ((stats.series.length > 0 && stats.totalLast14 > 0) || stats.topToday.length > 0) ? (
    <>
      {stats.series.length > 0 && stats.totalLast14 > 0 && (
        <SalesTrendWidget
          series={stats.series}
          totalLast14={stats.totalLast14}
          todaySales={stats.todaySales}
          pace={widgets?.pace ?? null}
          money={fmt}
        />
      )}
      {stats.topToday.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <TopTodayWidget items={stats.topToday} />
          <TuDiaTira
            estrella={stats.topToday[0] ?? null}
            horaPico={tuDia?.horaPico ?? null}
            record={tuDia?.record ?? null}
            compartir={platoEstrella && marca ? <CompartirPlato marca={marca} plato={platoEstrella} /> : undefined}
          />
        </div>
      )}
    </>
  ) : null;

  const mejoraCarta = mejoras.length > 0 ? (
    <Section title="Mejora tu carta">
      <List>
        {mejoras.map((m) => (
          <ListLink key={m.key} href={href(m.ruta)}>
            <ListText title={m.titulo} desc={m.detalle} />
            <span className="shrink-0 text-[13px] font-semibold text-adm-accent-ink">{m.accion}</span>
          </ListLink>
        ))}
      </List>
    </Section>
  ) : null;

  return (
    <div className="anim-fade-up adm-w-overview flex flex-col gap-6" data-etapa={etapa}>
      {encabezado}

      {/* El pedido número 1 del restaurante es una fiesta (P3). */}
      {ordersEnabled && restaurantId && (
        <FiestaPrimerPedido restaurantId={restaurantId} restaurantName={brandName} />
      )}

      {etapa === 'nuevo' && restaurantId ? (
        <>
          <Atender lista={atender} href={href} />
          <PrimerPedido
            restaurantId={restaurantId}
            pasos={pasos}
            menuUrl={menuUrl}
            platilloHref={href('/admin/menu/productos/new')}
            qrHref={href('/admin/qr')}
          />
          {dinero}
          {widgets?.online && <OnlineWidget data={widgets.online} showOrders={ordersEnabled} />}
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {etapa === 'cerrado' ? (
              <>
                {dinero}
                <Atender lista={atender} href={href} />
              </>
            ) : (
              <>
                <Atender lista={atender} href={href} />
                {dinero}
              </>
            )}
            {servicio}
            {/* Se está acabando: lo único de aquí que cuesta dinero si no se ve. */}
            {widgets?.stock && <StockWidget data={widgets.stock} canSeeInventory={allow('inventario')} />}
            {etapa === 'cerrado' && semana && semana.pedidos > 0 && (
              <Section title="Esta semana">
                <List>
                  <ListLink href={href('/admin/metricas')}>
                    <ListText
                      title={`${semana.pedidos} ${semana.pedidos === 1 ? 'pedido atendido' : 'pedidos atendidos'}${
                        semana.cierres > 0 ? ` · ${semana.cierres} ${semana.cierres === 1 ? 'cierre completo' : 'cierres completos'}` : ''}`}
                      desc={semana.cocinaMin != null ? `Tiempo medio en cocina: ${semana.cocinaMin} min` : undefined}
                    />
                    <Icon name="chevronRight" size={15} className="shrink-0 text-adm-text-4" />
                  </ListLink>
                </List>
              </Section>
            )}
            <div className="hidden lg:block">{mejoraCarta}</div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {/* Un hito alcanzado: 100 pedidos, el primer mes, un año (P6). */}
            {hitos?.hito && restaurantId && (ordersEnabled || !hitos.hito.clave.startsWith('pedidos')) && (
              <HitoTarjeta restaurantId={restaurantId} hito={hitos.hito} />
            )}
            {tendencia}
            {widgets?.online && <OnlineWidget data={widgets.online} showOrders={ordersEnabled} />}
            {/* Lo que dicen tus clientes: semanal, no diario; por eso, al final. */}
            {widgets?.ratings && (
              <RatingsWidget data={widgets.ratings} now={now} canSeeSurveys={allow('encuestas')} />
            )}
            <div className="lg:hidden">{mejoraCarta}</div>
          </div>
        </div>
      )}
    </div>
  );
}
