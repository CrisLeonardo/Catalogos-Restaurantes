'use client';

/* ============================================================
   MIS RESTAURANTES — entrar y ver cómo van hoy, en una pantalla.
   ------------------------------------------------------------
   Línea N «nada saturado» (maqueta aprobada el 2026-11-18,
   docs/diseno/MAQUETA_MI_CUENTA_NADA_SATURADO_2026-11-18.html).

   Antes la tarjeta de cada restaurante solo decía su nombre y «Dueño», y
   para saber cómo iba había que abrir Resumen: cinco cifras translúcidas,
   tres en Q0.00, el enlace del grupo fijo y la lista otra vez. Ahora cada
   fila dice cómo va hoy y avisa si está pausado o tiene agotados; tocarla
   entra. Lo ocasional (equipo, su carta, el enlace del grupo) va en hojas.
   ============================================================ */

import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { enterRestaurant, createGroupLink, type EntryState } from '@/lib/actions/mi-cuenta';
import { roleLabel, type MembershipCard } from '@/lib/membership-roles';
import { type PlanPricing } from '@/lib/plans';
import { adminUrl } from '@/lib/tenant';
import { fmtMoney } from '@/lib/money';
import LeoginInstallBanner from '@/components/leogin-install-banner';
import s from '@/components/mi-cuenta/mi-cuenta.module.css';

export type HoyDeUnRestaurante = {
  ventas: number; pedidos: number; ventas14: number; agotados: number; pausado: boolean;
};
/** Sucursal que se ve por la organización, sin membresía propia. */
export type RestauranteSinTarjeta = { id: string; name: string; slug: string; href: string };

const pedidos = (n: number) => (n === 1 ? '1 pedido' : `${n.toLocaleString('es-GT')} pedidos`);

export default function MiCuentaClient({
  cards, sinTarjeta, hoy, cartas, pricing, accountName, canCreate, grupo, accessMessage,
}: {
  cards: MembershipCard[];
  sinTarjeta: RestauranteSinTarjeta[];
  hoy: Record<string, HoyDeUnRestaurante>;
  /** Carta pública de cada restaurante, por id. */
  cartas: Record<string, string>;
  pricing: PlanPricing;
  accountName: string;
  canCreate: boolean;
  /** Solo con dos o más restaurantes propios. */
  grupo: { nombre: string; enlace: string | null } | null;
  accessMessage: string | null;
}) {
  const [pin, setPin] = useState<MembershipCard | null>(null);
  const [hoja, setHoja] = useState<MembershipCard | null>(null);
  const [enlace, setEnlace] = useState(false);
  /** Su primer restaurante PROPIO: no es dueño de ninguno todavía. Se mide
      por la propiedad y no por tener cero tarjetas, porque un gerente
      invitado al local de otro ya tiene una tarjeta y sigue yendo por el
      primero suyo — con su prueba gratis, que es de la persona. */
  const esElPrimero = !cards.some((c) => c.role === 'OWNER');
  const total = cards.length + sinTarjeta.length;

  const conDatos = Object.values(hoy);
  const ventas = conDatos.reduce((a, h) => a + h.ventas, 0);
  const pedidosHoy = conDatos.reduce((a, h) => a + h.pedidos, 0);

  /* Sin nombre en el perfil, `accountName` es el correo: se saluda con lo
     de antes de la arroba (auditoría 2026-10-02, MIC-02). */
  const nombre = accountName.split('@')[0].split(' ')[0];

  return (
    <div className={`${s.inicio} anim-fade-up`}>
      <h1 className={s.hola}>Hola, {nombre}</h1>
      {accessMessage && <p className={s.aviso} role="status">{accessMessage}</p>}
      <p className={s.linea}>
        {total === 0
          ? 'Todavía no tienes ningún restaurante. Crea el primero aquí abajo.'
          : conDatos.length === 0
            ? (total === 1 ? 'Este es tu restaurante.' : `Tienes ${total} restaurantes. Elige a cuál quieres entrar.`)
            : ventas > 0
              ? <>Hoy van <b>{fmtMoney(ventas)}</b> en <b>{pedidos(pedidosHoy)}</b>{conDatos.length > 1 ? ` entre tus ${conDatos.length} restaurantes` : ''}.</>
              : 'Hoy todavía no hay ventas.'}
      </p>

      <div className={s.columnas}>
        {total > 0 && (
          <div className={s.tarjeta}>
            <ul className={s.lista} aria-label="Tus restaurantes">
              {cards.map((c) => (
                <li key={c.restaurantId}>
                  <FilaRestaurante card={c} hoy={hoy[c.restaurantId]} onPin={() => setPin(c)} onMas={() => setHoja(c)} />
                </li>
              ))}
              {sinTarjeta.map((r) => (
                <li key={r.id}>
                  <a className={s.entrar} href={r.href}>
                    <Logo name={r.name} />
                    <span style={{ minWidth: 0 }}>
                      <span className={s.nombre}>{r.name}</span>
                      <MetaDeHoy hoy={hoy[r.id]} />
                    </span>
                    <Icon name="arrowUpRight" size={16} className={s.chevron} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(grupo || canCreate) && (
          <div className={s.tarjeta}>
            <ul className={s.lista}>
              {grupo && (
                <li>
                  <button type="button" className={s.accion} onClick={() => setEnlace(true)}>
                    <Icon name="globe" size={18} />
                    <span>Enlace único del grupo</span>
                    <Icon name="chevronRight" size={16} className={s.chevron} />
                  </button>
                </li>
              )}
              {canCreate && (
                <li>
                  <Link href="/mi-cuenta/nuevo" className={s.accion}>
                    <Icon name="plus" size={18} />
                    <span>{esElPrimero ? 'Crear mi restaurante' : 'Crear otro restaurante'}</span>
                    <em>
                      {esElPrimero
                        ? `elige tu plan${pricing.trialDays > 0 ? ` · ${pricing.trialDays} días gratis` : ''}`
                        : 'con su propio plan'}
                    </em>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Desde el origen único, Mi cuenta ES el sitio correcto para
          instalar, tenga uno o diez restaurantes: el ícono cubre este
          dominio entero, paneles incluidos (`/panel/<slug>/…`). Va debajo:
          es una invitación, no lo que el dueño vino a hacer. */}
      <LeoginInstallBanner />

      {hoja && (
        <HojaRestaurante
          card={hoja}
          hoy={hoy[hoja.restaurantId]}
          carta={cartas[hoja.restaurantId]}
          onClose={() => setHoja(null)}
          onPin={() => { const c = hoja; setHoja(null); setPin(c); }}
        />
      )}
      {pin && <HojaPin card={pin} onClose={() => setPin(null)} />}
      {enlace && grupo && <HojaEnlaceGrupo grupo={grupo} onClose={() => setEnlace(false)} />}
    </div>
  );
}

/**
 * Entrar al panel que devolvió la acción, con una navegación de DOCUMENTO.
 *
 * `window.location.assign` y no un `redirect()` del servidor ni
 * `router.push()`: el panel de un restaurante vive en la RAÍZ de
 * `<slug>-admin.<dominio>`, y esa raíz solo es el panel porque el proxy la
 * reescribe a `/admin/`. Cualquier salto que no sea una petición de
 * documento de verdad se salta el proxy — y entonces `/` es la portada
 * comercial de Leogin. Ver la nota larga en `enterRestaurant`
 * (lib/actions/mi-cuenta.ts).
 */
function useEnterPanel(state: EntryState) {
  useEffect(() => {
    if (state && 'url' in state) window.location.assign(state.url);
  }, [state]);
}

function Logo({ name, slug, conLogo }: { name: string; slug?: string; conLogo?: boolean }) {
  if (conLogo && slug) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img className={s.logo} src={`/api/icon/${slug}`} alt="" width={44} height={44} />;
  }
  return <span className={s.logo} aria-hidden>{name.trim().charAt(0).toUpperCase() || '·'}</span>;
}

function MetaDeHoy({ hoy, prefijo }: { hoy?: HoyDeUnRestaurante; prefijo?: string }) {
  return (
    <span className={s.meta}>
      {prefijo && <span>{prefijo}</span>}
      {hoy && (hoy.ventas > 0
        ? <span><b>{fmtMoney(hoy.ventas)}</b> hoy · {pedidos(hoy.pedidos)}</span>
        : <span>Sin ventas hoy</span>)}
      {hoy?.pausado && <span className={s.chip} data-tono="aviso">Pausado</span>}
      {hoy && hoy.agotados > 0 && (
        <span className={s.chip} data-tono="aviso">{hoy.agotados === 1 ? '1 agotado' : `${hoy.agotados} agotados`}</span>
      )}
    </span>
  );
}

/* ── Una fila: tocarla entra; «⋯» abre lo demás ─────────────── */

function FilaRestaurante({
  card, hoy, onPin, onMas,
}: { card: MembershipCard; hoy?: HoyDeUnRestaurante; onPin: () => void; onMas: () => void }) {
  const [state, formAction, isPending] = useActionState<EntryState, FormData>(enterRestaurant, null);
  useEnterPanel(state);
  // La acción ya terminó pero la navegación todavía no ha pintado: sin esto
  // la fila volvía a verse pulsable durante ese hueco, y en un teléfono lento
  // eso son dos entradas y dos líneas en la bitácora de accesos.
  const entrando = !!state && 'url' in state;
  const prefijo = [
    card.role !== 'OWNER' ? roleLabel(card.role) : null,
    card.locked ? 'pide PIN' : null,
  ].filter(Boolean).join(' · ') || undefined;

  const cuerpo = (
    <>
      <Logo name={card.name} slug={card.slug} conLogo={!!card.logoUrl} />
      <span style={{ minWidth: 0 }}>
        <span className={s.nombre}>{card.name}</span>
        <MetaDeHoy hoy={hoy} prefijo={prefijo} />
        {/* Sin datos de hoy (gerente invitado), la pausa viene de la tarjeta. */}
        {!hoy && card.paused && <span className={s.meta}><span className={s.chip} data-tono="aviso">Pausado</span></span>}
      </span>
      <Icon name={card.locked ? 'key' : 'chevronRight'} size={16} className={s.chevron} />
    </>
  );

  return (
    <>
      <div className={s.fila}>
        {card.locked ? (
          <button type="button" className={s.entrar} onClick={onPin} aria-label={`Entrar a ${card.name} con su PIN`}>
            {cuerpo}
          </button>
        ) : (
          <form action={formAction} style={{ minWidth: 0 }}>
            <input type="hidden" name="restaurantId" value={card.restaurantId} />
            <button type="submit" className={s.entrar} disabled={isPending || entrando} aria-label={`Entrar a ${card.name}`}>
              {cuerpo}
            </button>
            {/* Sin JavaScript el formulario no lleva a ninguna parte: la
                acción devuelve la URL en vez de redirigir. */}
            <noscript><a href={adminUrl(card.slug)}>Entrar a {card.name}</a></noscript>
          </form>
        )}
        <button type="button" className={s.mas} onClick={onMas} aria-label={`Más de ${card.name}`}>
          <Icon name="more" size={20} />
        </button>
      </div>
      {state && 'error' in state && <p className={s.error} role="alert">{state.error}</p>}
    </>
  );
}

/* ── «⋯» de un restaurante ───────────────────────────────────── */

function HojaRestaurante({
  card, hoy, carta, onClose, onPin,
}: {
  card: MembershipCard; hoy?: HoyDeUnRestaurante; carta?: string;
  onClose: () => void; onPin: () => void;
}) {
  const [state, formAction, isPending] = useActionState<EntryState, FormData>(enterRestaurant, null);
  useEnterPanel(state);
  const formId = useId();
  const entrando = isPending || (!!state && 'url' in state);

  const resumen = [
    hoy ? (hoy.ventas > 0 ? `${fmtMoney(hoy.ventas)} hoy · ${pedidos(hoy.pedidos)}` : 'Sin ventas hoy') : roleLabel(card.role),
    hoy && hoy.agotados > 0 ? (hoy.agotados === 1 ? '1 agotado' : `${hoy.agotados} agotados`) : null,
    hoy?.pausado || card.paused ? 'pedidos pausados' : null,
    hoy && hoy.ventas14 > 0 ? `${fmtMoney(hoy.ventas14)} en 14 días` : null,
  ].filter(Boolean).join(' · ');

  return (
    <HojaOperativa
      label={card.name}
      resumen={<p className={s.resumen}>{resumen}</p>}
      onClose={onClose}
      footer={card.locked ? (
        <Button type="button" size="action" className="w-full" onClick={onPin}>Entrar a {card.name}</Button>
      ) : (
        <form id={formId} action={formAction} style={{ width: '100%' }}>
          <input type="hidden" name="restaurantId" value={card.restaurantId} />
          <Button type="submit" size="action" className="w-full" disabled={entrando}>
            {entrando ? 'Entrando…' : `Entrar a ${card.name}`}
          </Button>
        </form>
      )}
    >
      <div className={s.hojaCuerpo}>
        <ul className={s.opciones}>
          {/* Equipo y accesos: solo el dueño. Lleva a Personal, donde vive
              invitar y dar de alta; no se repite aquí el formulario. */}
          {card.role === 'OWNER' && (
            <li>
              <a className={s.accion} href={`${adminUrl(card.slug)}/personal`}>
                <Icon name="users" size={18} /><span>Equipo y accesos</span>
                <Icon name="chevronRight" size={16} className={s.chevron} />
              </a>
            </li>
          )}
          {carta && (
            <li>
              <a className={s.accion} href={carta} target="_blank" rel="noopener noreferrer">
                <Icon name="utensils" size={18} /><span>Ver su carta</span>
                <Icon name="arrowUpRight" size={16} className={s.chevron} />
              </a>
            </li>
          )}
        </ul>
        {state && 'error' in state && <p className={s.error} style={{ padding: 0 }} role="alert">{state.error}</p>}
      </div>
    </HojaOperativa>
  );
}

/* ── El PIN de entrada ───────────────────────────────────────── */

function HojaPin({ card, onClose }: { card: MembershipCard; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState<EntryState, FormData>(enterRestaurant, null);
  useEnterPanel(state);
  const formId = useId();
  const entrando = isPending || (!!state && 'url' in state);

  return (
    <HojaOperativa
      label={`Entrar a ${card.name}`}
      onClose={onClose}
      footer={(
        <Button type="submit" form={formId} size="action" className="w-full" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </Button>
      )}
    >
      <form id={formId} action={formAction} className={s.hojaCuerpo}>
        <input type="hidden" name="restaurantId" value={card.restaurantId} />
        <label className={s.resumen} htmlFor={`${formId}-pin`}>Escribe el PIN de este restaurante para entrar.</label>
        <input
          id={`${formId}-pin`}
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          autoFocus
          autoComplete="off"
          placeholder="••••"
          className={`adm-field adm-field-lg ${s.pin}`}
        />
        {state && 'error' in state && <p className={s.error} style={{ padding: 0 }} role="alert">{state.error}</p>}
      </form>
    </HojaOperativa>
  );
}

/* ── El enlace único del grupo ───────────────────────────────── */

function HojaEnlaceGrupo({ grupo, onClose }: { grupo: { nombre: string; enlace: string | null }; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState(false);
  const [creando, startCrear] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const url = grupo.enlace;

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      setError('No se pudo copiar. Mantén presionado el enlace para copiarlo.');
    }
  }

  function crear() {
    setError(null);
    startCrear(async () => {
      const res = await createGroupLink();
      if ('error' in res) setError(res.error);
    });
  }

  return (
    <HojaOperativa
      label="Enlace único del grupo"
      resumen={<p className={s.resumen}>Ponlo en Instagram, WhatsApp o un volante: lleva a cada cliente al restaurante más cercano para pedir.</p>}
      onClose={onClose}
      footer={url ? (
        <Button type="button" size="action" className="w-full" onClick={copiar}>
          {copiado ? <><Icon name="check" size={18} /> Copiado</> : 'Copiar el enlace'}
        </Button>
      ) : (
        <Button type="button" size="action" className="w-full" onClick={crear} disabled={creando}>
          {creando ? 'Creando…' : 'Crear el enlace del grupo'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        {url ? (
          <>
            <p className={s.enlace}>{url.replace(/^https?:\/\//, '')}</p>
            <div className={s.dos}>
              <a className={s.secundario} href={url} target="_blank" rel="noopener noreferrer">
                Abrir <Icon name="arrowUpRight" size={16} />
              </a>
              <button type="button" className={s.secundario} aria-expanded={qr} onClick={() => setQr((v) => !v)}>
                <Icon name="grid" size={16} /> {qr ? 'Ocultar QR' : 'Ver QR'}
              </button>
            </div>
            {qr && (
              <div className={s.qr}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/qr?url=${encodeURIComponent(url)}`} alt={`QR de pedidos de ${grupo.nombre}`} width={200} height={200} />
              </div>
            )}
          </>
        ) : (
          <p className={s.resumen}>Todavía no tienes el enlace del grupo. Créalo una vez y sirve para todos tus restaurantes.</p>
        )}
        {error && <p className={s.error} style={{ padding: 0 }} role="alert">{error}</p>}
      </div>
    </HojaOperativa>
  );
}
