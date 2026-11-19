'use client';

/* ============================================================
   EL PEDIDO DE LA MESA · carrito (auditoría «La carta que vende»)
   ------------------------------------------------------------
   Dentro del carrito, con el QR de la mesa y el restaurante con
   `pedidoDeMesa` encendido. Cada quien llena su carrito como siempre y
   toca «Sumar lo mío a la mesa»; la lista compartida dice qué lleva
   cada persona y cuánto, y cualquiera la manda a cocina como UN pedido
   (dos toques: no se manda lo de los demás por error). Se consulta cada
   4 s mientras el carrito está abierto. Pedir solo lo propio sigue
   funcionando igual que siempre, con el botón de abajo.
   ============================================================ */

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { useCart } from '@/lib/cart-context';
import { useThemeConfig } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';
import { getVisitorId } from '@/lib/customer-local';
import { useTenantPrefix } from '@/lib/tenant-client';
import { enviarMesa, estadoMesa, quitarDeMesa, sumarAMesa, type EstadoMesa, type LineaMesa } from '@/lib/actions/mesa-compartida';

const CLAVE_PERSONA = 'mesa-persona';
const CADA_MS = 4000;

export default function MesaCompartida({ restaurantId, mesa }: { restaurantId: string; mesa: number }) {
  const { items, removeItem } = useCart();
  const config = useThemeConfig();
  const [estado, setEstado] = useState<EstadoMesa | null>(null);
  const [persona, setPersona] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, start] = useTransition();
  const visitorId = typeof window !== 'undefined' ? getVisitorId() : null;
  const seguir = useTenantPrefix('/pedido/');

  useEffect(() => { try { setPersona(localStorage.getItem(CLAVE_PERSONA) ?? ''); } catch { /* sin almacenamiento */ } }, []);

  const leer = useCallback(async () => {
    if (!visitorId) return;
    setEstado(await estadoMesa(restaurantId, mesa, visitorId).catch(() => null));
  }, [restaurantId, mesa, visitorId]);

  useEffect(() => {
    void leer();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void leer(); }, CADA_MS);
    return () => clearInterval(t);
  }, [leer]);

  if (!estado || estado.estado === 'apagada' || estado.estado === 'sin-tabla') return null;

  const propios = items.filter((i) => !i.rewardId);

  if (estado.estado === 'enviada') {
    return (
      <section className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-ok)' }}><Icon name="checkCircle" size={18} /> La mesa {mesa} ya se mandó a cocina</strong>
        {estado.token && (
          <Link href={`${seguir}${estado.token}`} style={{ fontWeight: 600, color: 'var(--brand-accent-ink, var(--u-text))' }}>
            {estado.orderNumber ? `${estado.orderNumber} · ` : ''}Seguir el pedido →
          </Link>
        )}
      </section>
    );
  }

  const lineas = estado.estado === 'abierta' ? estado.lineas : [];
  const porPersona = agrupar(lineas);
  const totalMesa = lineas.reduce((s, l) => s + l.precio * l.quantity, 0);

  function sumar() {
    const nombre = persona.trim();
    if (!nombre) { setError('Escribe tu nombre para que la mesa sepa qué es tuyo.'); return; }
    if (!visitorId || propios.length === 0) return;
    setError(null);
    try { localStorage.setItem(CLAVE_PERSONA, nombre); } catch { /* sin almacenamiento */ }
    start(async () => {
      const r = await sumarAMesa({
        restaurantId, mesa, visitorId, persona: nombre,
        items: propios.map((i) => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity, options: i.options })),
      });
      if (!r.ok) { setError(r.error); return; }
      for (const i of propios) removeItem(i.lineId);
      await leer();
    });
  }

  function quitar(l: LineaMesa) {
    if (!visitorId) return;
    start(async () => { await quitarDeMesa({ restaurantId, mesa, visitorId, lineaId: l.id }); await leer(); });
  }

  function enviar() {
    if (estado?.estado !== 'abierta') return;
    if (!confirmar) { setConfirmar(true); return; }
    setError(null);
    start(async () => {
      const r = await enviarMesa({ restaurantId, mesa, cuentaId: estado.cuentaId });
      setConfirmar(false);
      if (!r.ok) { setError(r.error); return; }
      await leer();
    });
  }

  return (
    <section aria-labelledby="mesa-t" className="m-surface" style={{ borderRadius: 'var(--m-r-lg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
      <div>
        <h3 id="mesa-t" style={{ margin: 0, fontSize: 'var(--m-fs-md)', fontWeight: 700 }}>Pedido de la mesa {mesa}</h3>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)' }}>
          Cada quien suma lo suyo desde su teléfono; uno lo manda a cocina.
        </p>
      </div>

      {porPersona.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {porPersona.map(([quien, suyas]) => (
            <li key={quien}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--m-fs-sm)' }}>
                <span>{quien}</span>
                <span className="ct-price">{formatPrice(suyas.reduce((s, l) => s + l.precio * l.quantity, 0), config)}</span>
              </div>
              {suyas.map((l) => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)', minHeight: 32 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {l.quantity}× {l.nombre}{l.opciones.length ? <span style={{ color: 'var(--u-text-3)' }}> · {l.opciones.join(', ')}</span> : null}
                  </span>
                  {l.mia && (
                    <button type="button" onClick={() => quitar(l)} disabled={pendiente} aria-label={`Quitar ${l.nombre}`}
                      className="press" style={{ minWidth: 44, minHeight: 44, border: 'none', background: 'none', color: 'var(--u-text-3)', cursor: 'pointer' }}>
                      <Icon name="x" size={15} />
                    </button>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      {propios.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)' }}>
            Tu nombre en la mesa
            <input value={persona} maxLength={24} onChange={(e) => setPersona(e.target.value)} placeholder="Ej. Ana"
              style={{ minHeight: 44, padding: '0 12px', borderRadius: 'var(--m-r-md)', border: '1px solid var(--u-hair-2)', background: 'var(--surface-2)', color: 'var(--u-text)', fontSize: 16 }} />
          </label>
          <button type="button" onClick={sumar} disabled={pendiente} className="press"
            style={{ minHeight: 48, borderRadius: 'var(--m-r-lg)', border: '1px solid var(--u-hair-2)', background: 'var(--surface-3)', color: 'var(--u-text)', fontWeight: 700, cursor: 'pointer' }}>
            {pendiente ? 'Sumando…' : 'Sumar lo mío a la mesa'}
          </button>
        </div>
      )}

      {lineas.length > 0 && (
        <button type="button" onClick={enviar} disabled={pendiente}
          className={`press ${config.ctaStyle === 'accent' ? 'btn-accent' : 'btn-white'}`}
          style={{ minHeight: 52, borderRadius: 'var(--m-r-lg)', border: 'none', fontWeight: 700, fontSize: 'var(--m-fs-md)', cursor: 'pointer' }}>
          {pendiente ? 'Mandando…' : confirmar ? `Sí, mandar todo a cocina · ${formatPrice(totalMesa, config)}` : `Mandar la mesa a cocina · ${formatPrice(totalMesa, config)}`}
        </button>
      )}
      {confirmar && !pendiente && (
        <p style={{ margin: 0, fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-3)' }}>
          Se manda lo de todos ({porPersona.map(([q]) => q).join(', ')}). <button type="button" onClick={() => setConfirmar(false)} style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', color: 'inherit', cursor: 'pointer' }}>Todavía no</button>
        </p>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger)' }}>{error}</p>}
    </section>
  );
}

function agrupar(lineas: LineaMesa[]): Array<[string, LineaMesa[]]> {
  const m = new Map<string, LineaMesa[]>();
  for (const l of lineas) m.set(l.persona, [...(m.get(l.persona) ?? []), l]);
  return [...m.entries()];
}
