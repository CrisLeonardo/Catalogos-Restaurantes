'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import LeoginLogo from '@/components/leogin-logo';
import { logout } from '@/lib/actions/auth';
import {
  enterRestaurant, createAnotherRestaurant,
  type EntryState, type NewRestaurantState,
} from '@/lib/actions/mi-cuenta';
import { roleLabel, type MembershipCard } from '@/lib/membership-roles';
import { planPriceLabel, type PlanPricing } from '@/lib/plans';
import { adminUrl } from '@/lib/tenant';

function localSlugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

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
  cards, pricing, rootDomain, accountName, accountEmail, canCreate, groupPanel,
}: {
  cards: MembershipCard[];
  pricing: PlanPricing;
  rootDomain: string;
  accountName: string;
  accountEmail: string;
  canCreate: boolean;
  /** Panel consolidado, si esta cuenta administra una cadena. */
  groupPanel: { name: string; url: string; branchCount: number } | null;
}) {
  /** Restaurante cuyo PIN se está pidiendo (null = ninguno). */
  const [asking, setAsking] = useState<MembershipCard | null>(null);
  /** Su primer restaurante PROPIO: no es dueño de ninguno todavía. Se mide
      por la propiedad y no por tener cero tarjetas, porque un gerente
      invitado al local de otro ya tiene una tarjeta y sigue yendo por el
      primero suyo — con su prueba gratis, que es de la persona. */
  const esElPrimero = !cards.some((c) => c.role === 'OWNER');
  const [creating, setCreating] = useState(false);

  return (
    <main style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <header
        className="glass-solid"
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none',
          height: 56, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <LeoginLogo size={24} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: 'var(--u-text-3)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {accountEmail}
        </span>
        <form action={logout}>
          <button
            type="submit"
            className="press"
            style={{
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '6px 12px',
              borderRadius: 99, border: '1px solid var(--u-hair-2)',
              background: 'transparent', color: 'var(--u-text-2)',
            }}
          >
            Salir
          </button>
        </form>
      </header>

      <div
        className="anim-fade-up"
        style={{ flex: 1, width: '100%', maxWidth: 720, margin: '0 auto', padding: '38px 18px 72px' }}
      >
        <div className="t-kicker" style={{ fontSize: 11, marginBottom: 12 }}>Mi cuenta</div>
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

        {/* El panel consolidado va ARRIBA de las sucursales: quien administra
            una cadena entra primero a mirar el conjunto y solo después baja a
            un local concreto. */}
        {groupPanel && (
          <a
            href={groupPanel.url}
            className="press"
            style={{ display: 'block', textDecoration: 'none', marginBottom: 12 }}
          >
            <Glass style={{ padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 13 }}>
              <span
                style={{
                  width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
                  color: 'var(--brand-accent-ink)',
                }}
              >
                <Icon name="grid" size={19} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: 'var(--u-text)' }}>
                  {groupPanel.name}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
                  Panel del grupo · {groupPanel.branchCount} sucursal{groupPanel.branchCount === 1 ? '' : 'es'} juntas
                </span>
              </span>
              <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
            </Glass>
          </a>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.map((c) => (
            <RestaurantRow key={c.restaurantId} card={c} onAskPin={() => setAsking(c)} />
          ))}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="press"
            style={{
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
          </button>
        )}
      </div>

      {asking && <EntryPinDialog card={asking} onClose={() => setAsking(null)} />}
      {creating && (
        <NewRestaurantDialog
          pricing={pricing}
          rootDomain={rootDomain}
          esElPrimero={esElPrimero}
          onClose={() => setCreating(false)}
        />
      )}
    </main>
  );
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
     repetir `/admin`, igual que hace resolveStaffDestination con `/menu`. */
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
      <button type="submit" disabled={isPending} className="press" style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
        <RowBody card={card} pending={isPending} />
      </button>
      {state && 'error' in state && (
        <p style={{ fontSize: 12.5, color: '#f87171', margin: '6px 0 0' }}>{state.error}</p>
      )}
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
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{state.error}</p>
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

/* ── Crear otro restaurante ──────────────────────────────────── */

const PLAN_OPTIONS: { code: 'BASICO' | 'ESTANDAR' | 'PREMIUM'; name: string }[] = [
  { code: 'BASICO', name: 'Básico' },
  { code: 'ESTANDAR', name: 'Estándar' },
  { code: 'PREMIUM', name: 'Premium' },
];

function NewRestaurantDialog({ pricing, rootDomain, esElPrimero, onClose }: {
  pricing: PlanPricing;
  rootDomain: string;
  esElPrimero: boolean;
  onClose: () => void;
}) {
  const [state, formAction, isPending] = useActionState<NewRestaurantState, FormData>(createAnotherRestaurant, null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan] = useState<'BASICO' | 'ESTANDAR' | 'PREMIUM'>('PREMIUM');

  const effectiveSlug = slugEdited ? slug : localSlugify(name);

  return (
    <Backdrop onClose={onClose}>
      <Glass style={{ padding: '26px 24px', width: '100%', maxWidth: 420, maxHeight: '86vh', overflowY: 'auto' }}>
        <p className="t-display" style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {esElPrimero ? 'Crear mi restaurante' : 'Crear otro restaurante'}
        </p>
        <p className="t-mute" style={{ fontSize: 13, margin: '6px 0 18px', lineHeight: 1.5 }}>
          {esElPrimero
            ? `Entrarás con esta misma cuenta. Empiezas con ${pricing.trialDays} días gratis, sin tarjeta.`
            : 'Entrarás con esta misma cuenta. El plan que elijas se suma a tu mensualidad desde hoy: la prueba gratis es solo para tu primer restaurante.'}
        </p>

        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input type="hidden" name="slug" value={effectiveSlug} />
          <input type="hidden" name="plan_code" value={plan} />

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Nombre
            </label>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Ej. Sucursal Zona 10"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Dirección de su menú
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <input
                value={effectiveSlug}
                onChange={(e) => { setSlugEdited(true); setSlug(localSlugify(e.target.value)); }}
                placeholder="sucursal"
                style={{ ...inputStyle, border: 'none', background: 'transparent', flex: 1, minWidth: 0 }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--u-text-4)', padding: '0 12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                .{rootDomain.replace(/:\d+$/, '')}
              </span>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Plan
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PLAN_OPTIONS.map((p) => {
                const on = plan === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPlan(p.code)}
                    className="press"
                    style={{
                      padding: '11px 8px', borderRadius: 11, cursor: 'pointer', textAlign: 'center',
                      border: `1.5px solid ${on ? 'var(--brand-accent)' : 'var(--u-hair-2)'}`,
                      background: on ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'transparent',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{p.name}</span>
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>
                      {planPriceLabel(pricing, p.code)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '8px 0 0', lineHeight: 1.45 }}>
              {plan === 'BASICO'
                ? 'Gratis para siempre. Puedes subir de plan cuando quieras.'
                : esElPrimero
                  ? `Empiezas con ${pricing.trialDays} días gratis; después se suma a tu mensualidad.`
                  : 'Se suma a tu mensualidad desde hoy, sin días de prueba.'}
            </p>
          </div>

          {state && 'error' in state && (
            <div style={{ padding: '10px 13px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 13 }}>
              {state.error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || name.trim().length < 2}
            className="press btn-accent"
            style={{
              width: '100%', padding: '13px', borderRadius: 'var(--radius-full)',
              fontWeight: 600, fontSize: 15, border: 'none',
              cursor: isPending ? 'wait' : 'pointer',
              opacity: isPending || name.trim().length < 2 ? 0.6 : 1,
            }}
          >
            {isPending ? 'Creando…' : 'Crear restaurante'}
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
