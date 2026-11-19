'use client';

/* ============================================================
   ESTADOS DEL DÍA · carta (auditoría «La carta que vende», CV-32)
   ------------------------------------------------------------
   Círculos arriba de la carta, como los estados de WhatsApp: el gesto
   ya se conoce en Guatemala. Tocar uno abre la foto a pantalla
   completa; avanza solo a los 5 s, tocar la mitad derecha o izquierda
   pasa al siguiente o al anterior, y si el estado lleva a un platillo,
   «Ver y pedir» abre su ficha. Los ya vistos se apagan (en el aparato).
   Con «reducir movimiento» no hay barra animada: se avanza tocando.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import AssetImage from '@/components/asset-image';
import { Icon } from '@/components/icons';
import type { EstadoDelDia } from '@/lib/db/estados';

const DURACION = 5000;
const clave = (rid: string) => `estados-vistos-${rid}`;

function leerVistos(rid: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(clave(rid)) || '[]') as string[]); } catch { return new Set(); }
}
function guardarVisto(rid: string, id: string): void {
  try {
    const v = leerVistos(rid); v.add(id);
    localStorage.setItem(clave(rid), JSON.stringify([...v].slice(-50)));
  } catch { /* sin almacenamiento */ }
}

export default function Estados({
  restaurantId, estados, nombre, onPedir,
}: {
  restaurantId: string;
  estados: EstadoDelDia[];
  nombre: string;
  /** El estado lleva a un platillo: abrir su ficha. Devuelve false si ya no existe. */
  onPedir: (platilloId: string) => boolean;
}) {
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<number | null>(null);
  useEffect(() => { setVistos(leerVistos(restaurantId)); }, [restaurantId]);
  if (estados.length === 0) return null;

  return (
    <>
      <div className="u-noscroll" role="list" aria-label="Estados del día" style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '14px 0 2px', paddingBottom: 2 }}>
        {estados.map((e, i) => {
          const visto = vistos.has(e.id);
          return (
            <button key={e.id} role="listitem" type="button" className="press" onClick={() => setAbierto(i)}
              aria-label={`Estado ${i + 1} de ${estados.length}${e.texto ? `: ${e.texto}` : ''}${visto ? ' (visto)' : ''}`}
              style={{ flexShrink: 0, width: 68, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--u-text-2)' }}>
              <span style={{ display: 'block', padding: 2, borderRadius: 999, border: `2px solid ${visto ? 'var(--u-hair-2)' : 'var(--brand-accent)'}` }}>
                <span style={{ position: 'relative', display: 'block', width: 56, height: 56, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)' }}>
                  <AssetImage src={e.imagen_url} alt="" fill sizes="56px" style={{ objectFit: 'cover' }} />
                </span>
              </span>
              <span style={{ fontSize: 'var(--m-fs-xs)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.texto || 'Hoy'}</span>
            </button>
          );
        })}
      </div>
      {abierto !== null && (
        <Visor
          estados={estados}
          inicio={abierto}
          nombre={nombre}
          onVisto={(id) => { guardarVisto(restaurantId, id); setVistos((v) => new Set(v).add(id)); }}
          onCerrar={() => setAbierto(null)}
          onPedir={(id) => { if (onPedir(id)) setAbierto(null); }}
        />
      )}
    </>
  );
}

function Visor({ estados, inicio, nombre, onVisto, onCerrar, onPedir }: {
  estados: EstadoDelDia[]; inicio: number; nombre: string;
  onVisto: (id: string) => void; onCerrar: () => void; onPedir: (platilloId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(inicio);
  const [quieto] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const actual = estados[i];

  const siguiente = useCallback(() => { setI((n) => { if (n + 1 >= estados.length) { onCerrar(); return n; } return n + 1; }); }, [estados.length, onCerrar]);
  const anterior = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  useEffect(() => { onVisto(actual.id); }, [actual.id, onVisto]);
  useEffect(() => {
    if (quieto) return;
    const t = setTimeout(siguiente, DURACION);
    return () => clearTimeout(t);
  }, [i, quieto, siguiente]);

  return (
    <dialog ref={ref} aria-label={`Estados de ${nombre}`} onCancel={(e) => { e.preventDefault(); onCerrar(); }}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', margin: 0, padding: 0, border: 'none', background: '#000', color: '#fff' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <AssetImage key={actual.id} src={actual.imagen_url} alt={actual.texto || `Estado de ${nombre}`} fill sizes="100vw" style={{ objectFit: 'contain' }} />
      </div>
      {/* Avance: una barra por estado (sin animación con «reducir movimiento»). */}
      <div aria-hidden style={{ position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: 12, right: 12, display: 'flex', gap: 4 }}>
        {estados.map((e, n) => (
          <span key={e.id} style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgb(255 255 255 / 0.35)', overflow: 'hidden' }}>
            <span style={{
              display: 'block', height: '100%', background: '#fff',
              width: n < i ? '100%' : n > i ? '0%' : quieto ? '100%' : undefined,
              ...(n === i && !quieto ? { animationName: 'estado-avance', animationDuration: `${DURACION}ms`, animationTimingFunction: 'linear', animationFillMode: 'both' } : {}),
            }} />
          </span>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 'calc(22px + env(safe-area-inset-top, 0px))', left: 16, right: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 14, textShadow: '0 1px 4px rgb(0 0 0 / 0.6)' }}>{nombre}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar estados" className="press"
          style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 999, border: 'none', background: 'rgb(0 0 0 / 0.35)', color: '#fff', cursor: 'pointer' }}>
          <Icon name="x" size={20} />
        </button>
      </div>
      {/* Mitades tocables: izquierda = anterior, derecha = siguiente. */}
      <button type="button" aria-label="Estado anterior" onClick={anterior} style={{ position: 'absolute', left: 0, top: 80, bottom: 140, width: '35%', background: 'none', border: 'none', cursor: 'pointer' }} />
      <button type="button" aria-label="Estado siguiente" onClick={siguiente} style={{ position: 'absolute', right: 0, top: 80, bottom: 140, width: '65%', background: 'none', border: 'none', cursor: 'pointer' }} />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
        {actual.texto && <p style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.35, textShadow: '0 1px 6px rgb(0 0 0 / 0.7)' }}>{actual.texto}</p>}
        {actual.platillo_id && (
          <button type="button" className="press btn-white" onClick={() => onPedir(actual.platillo_id!)}
            style={{ minHeight: 52, borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
            Ver y pedir
          </button>
        )}
      </div>
    </dialog>
  );
}
