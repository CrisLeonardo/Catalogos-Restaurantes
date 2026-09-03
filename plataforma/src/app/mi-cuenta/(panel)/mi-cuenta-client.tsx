'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { enterRestaurant, type EntryState } from '@/lib/actions/mi-cuenta';
import { roleLabel, type MembershipCard } from '@/lib/membership-roles';
import { type PlanPricing } from '@/lib/plans';
import { adminUrl } from '@/lib/tenant';
import LeoginInstallBanner from '@/components/leogin-install-banner';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  color: 'var(--u-text)',
  fontSize: 16,
  outline: 'none',
};

export default function MiCuentaClient({
  cards, pricing, accountName, canCreate, groupName,
}: {
  cards: MembershipCard[];
  pricing: PlanPricing;
  accountName: string;
  canCreate: boolean;
  /** Nombre del grupo, si esta cuenta tiene dos o más restaurantes propios. */
  groupName: string | null;
}) {
  /** Restaurante cuyo PIN se está pidiendo (null = ninguno). */
  const [asking, setAsking] = useState<MembershipCard | null>(null);
  /** Su primer restaurante PROPIO: no es dueño de ninguno todavía. Se mide
      por la propiedad y no por tener cero tarjetas, porque un gerente
      invitado al local de otro ya tiene una tarjeta y sigue yendo por el
      primero suyo — con su prueba gratis, que es de la persona. */
  const esElPrimero = !cards.some((c) => c.role === 'OWNER');

  return (
    <>
      <div className="anim-fade-up">
        <div className="t-kicker" style={{ fontSize: 11, marginBottom: 12 }}>
          {groupName ?? 'Mi cuenta'}
        </div>
        <h1 className="t-display" style={{ fontSize: 'clamp(26px, 5vw, 36px)', lineHeight: 1.1, margin: 0 }}>
          Hola, {accountName.split(' ')[0]}
        </h1>
        <p className="t-mute" style={{ fontSize: 14.5, marginTop: 8, marginBottom: 26 }}>
          {cards.length === 0
            ? 'Todavía no tienes ningún restaurante. Crea el primero aquí abajo.'
            : cards.length === 1
              ? 'Este es tu restaurante.'
              : `Tienes ${cards.length} restaurantes. Elige a cuál quieres entrar.`}
        </p>

        {/* Desde el origen único, Mi cuenta ES el sitio correcto para
            instalar, tenga uno o diez restaurantes: el ícono cubre este
            dominio entero, paneles incluidos (`/panel/<slug>/…`). Antes había
            que desviar al dueño de UN restaurante a instalar desde el
            subdominio de su panel, porque el scope de una PWA no puede
            abarcar dos orígenes — ese desvío murió con la migración. */}
        <LeoginInstallBanner />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.map((c) => (
            <RestaurantRow key={c.restaurantId} card={c} onAskPin={() => setAsking(c)} />
          ))}
        </div>

        {canCreate && (
          <Link
            href="/mi-cuenta/nuevo"
            className="press"
            style={{
              textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 12,
              padding: '16px 18px', borderRadius: 'var(--radius-lg)',
              border: '1.5px dashed var(--u-hair-2)', background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
                color: 'var(--brand-accent-ink)',
              }}
            >
              <Icon name="plus" size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)' }}>
                {esElPrimero ? 'Crear mi restaurante' : 'Crear otro restaurante'}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 1 }}>
                {esElPrimero
                  ? `Elige tu plan y su nombre · ${pricing.trialDays} días gratis`
                  : 'Su plan se suma a tu mensualidad actual'}
              </span>
            </span>
            <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </Link>
        )}
      </div>

      {asking && <EntryPinDialog card={asking} onClose={() => setAsking(null)} />}
    </>
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
 * comercial de Leogin. Pasaba justo aquí: Mi cuenta también se sirve dentro
 * del subdominio del panel (y en Leogin Desktop es el único sitio donde se
 * sirve), así que el destino tenía el mismo host que la página actual y Next
 * lo resolvía por dentro, sin proxy. Ver la nota larga en
 * `enterRestaurant` (lib/actions/mi-cuenta.ts).
 */
function useEnterPanel(state: EntryState) {
  useEffect(() => {
    if (state && 'url' in state) window.location.assign(state.url);
  }, [state]);
}

/* ── Una tarjeta de restaurante ──────────────────────────────── */

/**
 * Atajo al equipo de ESE restaurante desde su tarjeta.
 *
 * Lleva a la pantalla de Personal, que es donde vive invitar y dar de alta,
 * en vez de repetir aquí el formulario: qué secciones puede tener un gerente
 * depende del plan y de los módulos de cada local, y esa regla duplicada se
 * desincroniza sola. Un enlace no puede desincronizarse.
 *
 * Solo para el dueño: un gerente invitado no crea pares suyos.
 */
function TeamLink({ card }: { card: MembershipCard }) {
  if (card.role !== 'OWNER') return null;
  /* El panel de un restaurante NO vive en el mismo sitio en local que en
     producción (`slug.localhost:3000/admin` vs `slug-admin.dominio`), y aquí
     se armaba a mano siempre con la forma de producción: en local el enlace
     llevaba a un host donde no hay sesión, o sea al login.

     `adminUrl()` es el mismo ayudante que usa el servidor para esto, y ya
     trae la raíz del panel — la página se le pega detrás (`/personal`), sin
     repetir `/admin`, igual que hace resolveStaffDestination. */
  const href = `${adminUrl(card.slug)}/personal`;
  return (
    <a
      href={href}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '6px 11px', borderRadius: 'var(--radius-full)',
        border: '1px solid var(--u-hair-2)', textDecoration: 'none',
        fontSize: 12, color: 'var(--u-text-3)',
      }}
    >
      <Icon name="users" size={13} /> Equipo y accesos
    </a>
  );
}

function RestaurantRow({ card, onAskPin }: { card: MembershipCard; onAskPin: () => void }) {
  const [state, formAction, isPending] = useActionState<EntryState, FormData>(enterRestaurant, null);
  useEnterPanel(state);
  // La acción ya terminó pero la navegación todavía no ha pintado: sin esto la
  // tarjeta volvía a verse pulsable durante ese hueco, y en un teléfono lento
  // eso son dos entradas y dos líneas en la bitácora de accesos.
  const entrando = !!state && 'url' in state;

  // Con candado, el PIN se pide en un diálogo aparte; sin candado, un solo
  // envío entra directo. La diferencia se decide aquí para que el que no
  // tiene candado nunca vea ni un paso de más.
  if (card.locked) {
    return (
      <>
      <button
        type="button"
        onClick={onAskPin}
        className="press"
        style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
      >
        <RowBody card={card} pending={false} />
      </button>
      <TeamLink card={card} />
      </>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="restaurantId" value={card.restaurantId} />
      <button type="submit" disabled={isPending || entrando} className="press" style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <RowBody card={card} pending={isPending || entrando} />
      </button>
      {state && 'error' in state && (
        <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: '6px 0 0' }}>{state.error}</p>
      )}
      {/* Sin JavaScript el formulario de arriba no lleva a ninguna parte: la
          acción devuelve la URL en vez de redirigir (ver useEnterPanel). Un
          enlace normal es la salida, y no cuesta nada tenerla. */}
      <noscript>
        <a href={adminUrl(card.slug)} style={{ fontSize: 12.5 }}>Entrar a {card.name}</a>
      </noscript>
      <TeamLink card={card} />
    </form>
  );
}

function RowBody({ card, pending }: { card: MembershipCard; pending: boolean }) {
  return (
    <Glass
      style={{
        padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 13,
        opacity: pending ? 0.6 : 1,
      }}
    >
      {card.logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/icon/${card.slug}`}
          alt=""
          width={42}
          height={42}
          style={{ borderRadius: 11, objectFit: 'cover', display: 'block', flexShrink: 0 }}
        />
      ) : (
        <span
          style={{
            width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-3)',
          }}
        >
          <Icon name="bag" size={19} />
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {card.name}
          </span>
          {card.paused && (
            <span className="chip" style={{ flexShrink: 0, fontSize: 10 }}>Pausado</span>
          )}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
          {roleLabel(card.role)}
          {card.locked && ' · pide PIN'}
        </span>
      </span>

      <Icon
        name={card.locked ? 'key' : 'chevronRight'}
        size={16}
        style={{ color: 'var(--u-text-4)', flexShrink: 0 }}
      />
    </Glass>
  );
}

/* ── El PIN de entrada ───────────────────────────────────────── */

function EntryPinDialog({ card, onClose }: { card: MembershipCard; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState<EntryState, FormData>(enterRestaurant, null);
  useEnterPanel(state);

  return (
    <Backdrop onClose={onClose}>
      <Glass style={{ padding: '26px 24px', width: '100%', maxWidth: 340 }}>
        <p className="t-display" style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{card.name}</p>
        <p className="t-mute" style={{ fontSize: 13, margin: '6px 0 18px' }}>
          Escribe el PIN de este restaurante para entrar.
        </p>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="hidden" name="restaurantId" value={card.restaurantId} />
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            autoFocus
            autoComplete="off"
            placeholder="••••"
            style={{ ...inputStyle, letterSpacing: '0.5em', textAlign: 'center', fontSize: 22 }}
          />

          {state && 'error' in state && (
            <p style={{ fontSize: 13, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="press btn-accent"
            style={{
              width: '100%', padding: '13px', borderRadius: 'var(--radius-full)',
              fontWeight: 600, fontSize: 15, border: 'none',
              cursor: isPending ? 'wait' : 'pointer', opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Entrando…' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--u-text-3)', fontSize: 12.5, cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </form>
      </Glass>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'grid', placeItems: 'center', padding: 18,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      }}
    >
      {children}
    </div>
  );
}
