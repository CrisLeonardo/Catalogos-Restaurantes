'use client';

/* El buscador de platos — vive al fondo del panel derecho.
   ------------------------------------------------------------------
   Esta es la pieza que borra el "Paso 2 de 3". Antes, agregar un plato
   era salir de la mesa, entrar a una rejilla de tarjetas, buscar,
   volver. Aquí el campo está debajo de la comanda y los resultados
   salen en línea: se escribe, se toca (o se pulsa Enter) y la comanda
   de arriba se actualiza sola. Cero pantallas intermedias.

   Encima va la capa de teclado, que es lo que hace usable una PC:
     · el campo tiene el foco siempre que se pueda; `/` lo devuelve;
     · un número al principio ES la cantidad — "3 lim" son tres
       limonadas;
     · Enter agrega Y limpia el campo sin perder el foco, que es lo
       único que permite teclear una comanda de corrido;
     · ↑ ↓ recorren los resultados;
     · enviar a cocina exige DOS teclas: un Enter suelto no manda
       nunca una comanda.
   Todo atajo tiene su botón equivalente: el teclado acelera, no es
   obligatorio. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Group, Hr, Key, Label, Mono } from '@/components/admin/waiter/pieces';
import type { Category, Product } from '@/types';

/** Cuántos resultados se enseñan. Más de esto y el panel derecho se
    convierte en la rejilla de la que veníamos huyendo. */
const MAX_RESULTS = 6;

/**
 * Parte "3 lim" en cantidad y término de búsqueda.
 *
 * Solo cuenta como cantidad si detrás queda algo que buscar: "7" a
 * secas es alguien empezando a escribir "7 mares", no siete de nada.
 * El número que se haya interpretado se enseña en el propio campo,
 * para que nunca haya que adivinar qué entendió el sistema.
 */
export function parseQuery(raw: string): { qty: number; term: string } {
  const m = raw.match(/^\s*(\d{1,2})\s*(\S.*)$/);
  if (!m) return { qty: 1, term: raw.trim() };
  const qty = Number(m[1]);
  if (qty < 1) return { qty: 1, term: raw.trim() };
  return { qty, term: m[2].trim() };
}

interface Props {
  products: Product[];
  categories: Category[];
  /** Agrega `qty` unidades del plato. El padre decide si eso significa
      meterlo directo al carrito o abrir la hoja de opciones. */
  onPick: (product: Product, qty: number) => void;
  /** Cuántas unidades de este plato hay ya en el pedido por enviar. */
  qtyOf: (productId: string) => number;
  onDec: (productId: string) => void;
  money: (n: number) => string;
  /** Cmd/Ctrl + Enter. `null` si ahora mismo no hay nada que enviar. */
  onSend: (() => void) | null;
  /** El buscador reclama el foco al montar y tras cada Enter. Se apaga
      mientras hay un diálogo encima, para no robárselo. */
  autoFocus: boolean;
}

export default function DishFinder({
  products, categories, onPick, qtyOf, onDec, money, onSend, autoFocus,
}: Props) {
  const [raw, setRaw] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { qty, term } = useMemo(() => parseQuery(raw), [raw]);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  const results = useMemo(() => {
    const disponibles = products.filter((p) => p.is_available && p.is_active);
    const q = term.toLowerCase();
    if (!q) return disponibles.slice(0, MAX_RESULTS);
    /* Lo que EMPIEZA por lo tecleado va primero: quien escribe "car"
       quiere Carne asada, no "Tacos de carnitas". */
    const empieza: Product[] = [];
    const contiene: Product[] = [];
    for (const p of disponibles) {
      const n = p.name.toLowerCase();
      if (n.startsWith(q)) empieza.push(p);
      else if (n.includes(q)) contiene.push(p);
    }
    return [...empieza, ...contiene].slice(0, MAX_RESULTS);
  }, [products, term]);

  // Al cambiar la búsqueda, el resaltado vuelve arriba: si se quedara
  // donde estaba, Enter agregaría un plato que ya no es el que se ve.
  useEffect(() => { setActive(0); }, [term]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  /* `/` devuelve el foco al campo desde cualquier parte del panel, y
     Cmd/Ctrl + Enter envía. Se escucha en la ventana porque el foco
     puede estar en un botón de la comanda, no aquí. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const escribiendo = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (onSend) { e.preventDefault(); onSend(); }
        return;
      }
      if (e.key === '/' && !escribiendo) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSend]);

  function agregar(p: Product) {
    onPick(p, qty);
    // El campo se limpia y el foco se queda: esto es lo que permite
    // teclear "2car⏎1sop⏎3lim⏎" de corrido, sin volver a tocar nada.
    setRaw('');
    setActive(0);
    inputRef.current?.focus();
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Cmd/Ctrl + Enter ya lo atendió el escuchador de la ventana: aquí
      // solo llega el Enter limpio, que agrega el resultado resaltado.
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const p = results[active];
      if (p) agregar(p);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRaw('');
    }
  }

  return (
    <section>
      <Label aside={<span className="wp-wide-only" style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>no hace falta tocar nada</span>}>
        Agregar sin salir de aquí
      </Label>

      <div className="wp-find">
        <Icon name="search" size={17} style={{ color: 'var(--u-text-3)', flexShrink: 0 }} />
        {/* La cantidad interpretada, visible: si escribiste "3 lim" tiene
            que verse el 3 antes de pulsar Enter, no después. */}
        {qty > 1 && (
          <span style={{
            flexShrink: 0, padding: '2px 7px', borderRadius: 6,
            background: 'color-mix(in srgb, var(--adm-accent-500) 14%, transparent)',
            color: 'var(--brand-accent-ink)', fontFamily: 'var(--ui-font-mono)',
            fontSize: 12.5, fontWeight: 700,
          }}>
            ×{qty}
          </span>
        )}
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Escribe un plato… (o «3 lim»)"
          aria-label="Buscar un plato para agregar"
          autoComplete="off"
          enterKeyHint="done"
        />
        {raw && (
          <button
            type="button"
            onClick={() => { setRaw(''); inputRef.current?.focus(); }}
            aria-label="Borrar la búsqueda"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--u-text-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        {results.length === 0 ? (
          <div style={{ padding: '18px 6px', fontSize: 13.5, color: 'var(--u-text-3)', textAlign: 'center' }}>
            Ningún plato disponible se llama «{term}».
          </div>
        ) : (
          <Group>
            {results.map((p, i) => {
              const enCarrito = qtyOf(p.id);
              const resaltado = i === active;
              return (
                <div key={p.id}>
                  {i > 0 && <Hr />}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px 9px 16px', minHeight: 56,
                      background: resaltado ? 'color-mix(in srgb, var(--adm-accent-500) 8%, transparent)' : 'none',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => agregar(p)}
                      className="press"
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: 'var(--u-text)' }}>{p.name}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>
                        {catName.get(p.category_id ?? '') ?? 'Sin categoría'}
                      </span>
                    </button>
                    <Mono size={14} color="var(--u-text-2)">{money(p.price)}</Mono>
                    {enCarrito > 0 ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button type="button" className="wp-step press" onClick={() => onDec(p.id)} aria-label={`Quitar uno de ${p.name}`}>
                          <Icon name="minus" size={15} />
                        </button>
                        <Mono size={15}>{enCarrito}</Mono>
                        <button type="button" className="wp-step press" data-on="1" onClick={() => agregar(p)} aria-label={`Agregar otro ${p.name}`}>
                          <Icon name="plus" size={15} />
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="wp-step press" onClick={() => agregar(p)} aria-label={`Agregar ${p.name}`}>
                        <Icon name="plus" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Group>
        )}
      </div>

      {/* Los atajos se enseñan aquí, junto a lo que hacen, y no en una
          ayuda aparte: así el mesero que empieza con el ratón se los va
          aprendiendo solo. En pantalla táctil no se pintan. */}
      <div className="wp-wide-only" style={{ marginTop: 14 }}>
        <Label>Sin soltar el teclado</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '2px 28px' }}>
          <Atajo teclas={['↑', '↓']} que="Moverse entre resultados" />
          <Atajo teclas={['Enter']} que="Agregar y seguir escribiendo" />
          <Atajo teclas={['3', 'l', 'i', 'm']} que="Tres limonadas de una vez" />
          <Atajo teclas={['/']} que="Volver al buscador" />
          <Atajo teclas={['Ctrl', 'M']} que="Cambiar de mesa" />
          <Atajo teclas={['Ctrl', 'Enter']} que="Enviar a cocina" />
        </div>
      </div>
    </section>
  );
}

function Atajo({ teclas, que }: { teclas: string[]; que: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px' }}>
      <span style={{ display: 'inline-flex', gap: 3, width: 104, flexShrink: 0 }}>
        {teclas.map((k, i) => <Key key={i}>{k}</Key>)}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--u-text-2)' }}>{que}</span>
    </div>
  );
}
