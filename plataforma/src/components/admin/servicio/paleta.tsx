'use client';

/* LA PALETA DE COMANDOS (⌘K).
   ------------------------------------------------------------------
   Un campo y una lista: platos, mesas y acciones, en ese orden. Es lo
   que convierte una PC en el aparato más rápido del local — «2 pepián»
   ⏎ y ya está en la mesa abierta, sin tocar el ratón.

   Vive aquí y no dentro del panel porque lo que hace es TRADUCIR texto a
   acciones, y esa lista tiene que poder crecer sin que el orquestador se
   entere. Lo que el panel le pasa son las acciones que existen ahora
   mismo; la paleta decide cuáles caben en lo que se está escribiendo.

   Se abre también en táctil (la lupa de la barra superior): el teclado
   acelera, pero buscar «mesa 12» en un salón de cuarenta también
   ahorra un dedo en la tablet. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { coincide, leerComanda, normalizar } from '@/lib/servicio/comanda';
import { subtituloDeMesa, ESTADO_LABEL, type MesaServicio } from '@/lib/servicio/estado';
import type { Product } from '@/types';

export interface AccionPaleta {
  label: string;
  hint: string;
  run: () => void;
  /** Si es `false`, la acción no se ofrece ahora (no hay mesa, nada que enviar…). */
  enabled?: boolean;
}

export interface PaletaProps {
  productos: Product[];
  mesas: MesaServicio[];
  acciones: AccionPaleta[];
  /** La mesa abierta, para poder decir «a Mesa 4». */
  destino: string | null;
  money: (n: number) => string;
  onAgregar: (p: Product, qty: number) => void;
  onMesa: (n: number) => void;
  onClose: () => void;
}

interface Resultado {
  kind: 'Agregar' | 'Mesa' | 'Plato' | 'Acción';
  label: string;
  sub: string;
  run: () => void;
}

/** Cuántos resultados caben sin que la lista deje de leerse de un vistazo. */
const MAX = 9;

export default function Paleta({
  productos, mesas, acciones, destino, money, onAgregar, onMesa, onClose,
}: PaletaProps) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const lista = useRef<HTMLDivElement | null>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const resultados = useMemo<Resultado[]>(() => {
    const texto = q.trim();
    const { qty, term } = leerComanda(texto);
    const disponibles = productos.filter((p) => p.is_active && p.is_available);
    /* La misma regla que el buscador de la carta: lo que EMPIEZA por lo
       tecleado gana. Si no, «car» agregaba aquí unos tacos de carnitas y
       allí una carne asada — el mismo texto, dos platos distintos. */
    const interpretado = term
      ? disponibles.find((p) => coincide(p.name, term) && normalizar(p.name).startsWith(normalizar(term)))
        ?? disponibles.find((p) => coincide(p.name, term)) ?? null
      : null;

    const out: Resultado[] = [];

    /* «2 pepián» primero: es lo que se escribe noventa veces por turno. */
    if (interpretado && texto) {
      out.push({
        kind: 'Agregar',
        label: `${qty > 1 ? `${qty}× ` : ''}${interpretado.name}`,
        sub: `${money(interpretado.price * qty)} · a ${destino ?? 'ninguna mesa'}`,
        run: () => { onAgregar(interpretado, qty); onClose(); },
      });
    }

    /* Las mesas solo cuando se las busca: sin esto, escribir un plato
       llena la lista con las mesas cuyo número aparece en el texto. */
    if (texto) {
      for (const m of mesas) {
        if (out.length >= MAX) break;
        const buscable = `mesa ${m.n} ${m.nombre} ${m.alias ?? ''} ${m.zona ?? ''}`;
        if (!coincide(buscable, texto)) continue;
        out.push({
          kind: 'Mesa',
          label: m.etiqueta,
          sub: m.estado === 'libre'
            ? `libre${m.sillas ? ` · ${m.sillas} personas` : ''}`
            : `${ESTADO_LABEL[m.estado]} · ${subtituloDeMesa(m)}`,
          run: () => { onMesa(m.n); onClose(); },
        });
      }
    }

    if (texto) {
      for (const p of disponibles) {
        if (out.length >= MAX) break;
        if (p.id === interpretado?.id) continue;
        if (!coincide(p.name, term || texto)) continue;
        out.push({
          kind: 'Plato',
          label: p.name,
          sub: money(p.price),
          run: () => { onAgregar(p, 1); onClose(); },
        });
      }
    }

    for (const a of acciones) {
      if (out.length >= MAX) break;
      if (a.enabled === false) continue;
      if (texto && !coincide(a.label, texto)) continue;
      out.push({ kind: 'Acción', label: a.label, sub: a.hint, run: a.run });
    }

    return out.slice(0, MAX);
  }, [q, productos, mesas, acciones, destino, money, onAgregar, onMesa, onClose]);

  // Al cambiar la búsqueda el resaltado vuelve arriba: si se quedara donde
  // estaba, Enter ejecutaría algo que ya no es lo que se ve.
  useEffect(() => { setI(0); }, [q]);

  /* El resaltado tiene que verse aunque esté fuera de la parte visible de
     la lista: con nueve resultados y 46vh de alto, los dos últimos quedan
     por debajo del canto. */
  useEffect(() => {
    const activo = lista.current?.querySelector<HTMLElement>('[data-on="1"]');
    activo?.scrollIntoView({ block: 'nearest' });
  }, [i, resultados]);

  return (
    <div className="sv-palette-scrim" onClick={onClose}>
      <div
        className="sv-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar plato, mesa o acción"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="2 pepián · mesa 7 · cobrar · juntar"
          aria-label="Buscar plato, mesa o acción"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault(); setI((n) => Math.min(resultados.length - 1, n + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault(); setI((n) => Math.max(0, n - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault(); resultados[i]?.run();
            } else if (e.key === 'Escape') {
              e.preventDefault(); e.stopPropagation(); onClose();
            }
          }}
        />
        <div className="sv-palette-list sv-vs" ref={lista}>
          {resultados.length === 0 ? (
            <div className="sv-vacio" style={{ padding: '28px 0' }}>Nada con eso</div>
          ) : resultados.map((r, n) => (
            <button
              key={`${r.kind}-${r.label}-${n}`}
              type="button"
              className="sv-pres"
              data-on={n === i ? '1' : '0'}
              onMouseEnter={() => setI(n)}
              onClick={r.run}
            >
              <span className="sv-pres-kind">{r.kind}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sv-pres-l">{r.label}</span>
                <span className="sv-pres-s">{r.sub}</span>
              </span>
              {n === i && <span className="sv-kbd">⏎</span>}
            </button>
          ))}
        </div>
        <div className="sv-palette-foot">↑↓ moverse · ⏎ elegir · esc salir</div>
      </div>
    </div>
  );
}
