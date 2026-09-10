'use client';

/* El buscador de platos.
   ------------------------------------------------------------------
   Esta es la pieza que borra el "Paso 2 de 3". Antes, agregar un plato
   era salir de la mesa, entrar a una rejilla de tarjetas, buscar,
   volver. Aquí se escribe, se toca (o se pulsa Enter) y la comanda se
   actualiza sola. Cero pantallas intermedias.

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
   obligatorio.

   ── PARTIDO EN DOS (2026-09-09, T-01) ─────────────────────────────
   El campo y sus resultados vivían en una sola caja al fondo de la
   pantalla de la mesa. Medido en un teléfono de 375×812 con solo tres
   platos apuntados, esa caja empezaba en el píxel 821: fuera de la
   pantalla. La única forma de apuntar sin cambiar de vista estaba bajo
   el borde inferior, y cada plato que pedía el cliente la alejaba otros
   118 px.

   Ahora el CAMPO sube a una banda fija bajo la cabecera y los
   RESULTADOS ocupan el cuerpo, en el mismo sitio donde vive la rejilla
   del menú: se escribe arriba y lo de abajo cambia. Por eso el archivo
   exporta tres cosas en vez de un componente:

     · `useDishFinder`  — el estado y toda la capa de teclado;
     · `DishFinderInput`— el campo;
     · `DishResults`    — la lista.

   Ya no hay un componente «buscador completo»: hacerlo de dos formas
   distintas era lo que permitía que una de las dos se quedara atrás. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Group, Hr, Key, Mono } from '@/components/admin/waiter/pieces';
import type { Category, Product } from '@/types';

/** Cuántos resultados se enseñan cuando la lista va DEBAJO del campo,
    dentro de una tarjeta. Más de esto y esa tarjeta se convierte en la
    rejilla de la que veníamos huyendo. Cuando la lista ocupa el cuerpo
    de la pantalla el techo lo pone quien la usa, y es mucho más alto:
    ahí no estorba a nada. */
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

/**
 * Los platos que contestan a lo tecleado, en el orden en que hay que
 * enseñarlos.
 *
 * El agotado se ESCONDÍA, y esconderlo no contesta la pregunta: el
 * mesero escribía «roll», leía «ningún plato se llama roll» y se
 * quedaba sin saber si lo había escrito mal, si el dueño no lo dio de
 * alta o si se acabó — que es lo único que le puede decir al cliente
 * que tiene delante. Ahora, AL BUSCAR, sale: al final, apagado y sin
 * poder tocarse. Sin nada escrito no sale.
 *
 * `is_active` sigue mandando y no se toca: eso no es "se acabó", es
 * "este plato ya no existe en la carta".
 */
export function buscarPlatos(products: Product[], term: string, max: number): Product[] {
  const activos = products.filter((p) => p.is_active);
  const q = term.toLowerCase();
  if (!q) return activos.filter((p) => p.is_available).slice(0, max);
  /* Lo que EMPIEZA por lo tecleado va primero: quien escribe "car"
     quiere Carne asada, no "Tacos de carnitas". */
  const empieza: Product[] = [];
  const contiene: Product[] = [];
  for (const p of activos) {
    const n = p.name.toLowerCase();
    if (n.startsWith(q)) empieza.push(p);
    else if (n.includes(q)) contiene.push(p);
  }
  const orden = [...empieza, ...contiene];
  // Lo que se puede pedir primero; lo agotado después, pero visible.
  return [
    ...orden.filter((p) => p.is_available),
    ...orden.filter((p) => !p.is_available),
  ].slice(0, max);
}

/** Todo lo que el campo y la lista necesitan compartir. */
export interface DishFinderState {
  raw: string;
  setRaw: (v: string) => void;
  qty: number;
  term: string;
  results: Product[];
  active: number;
  agregar: (p: Product) => void;
  onInputKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  enfocar: () => void;
}

/**
 * El estado del buscador y la capa de teclado entera.
 *
 * Vive en un hook —y no dentro del campo— porque desde el rediseño de
 * la mesa el campo y la lista están en dos sitios distintos de la
 * pantalla, y el resaltado que mueve ↑↓ tiene que ser el mismo en los
 * dos.
 */
export function useDishFinder({ products, onPick, onSend, max = MAX_RESULTS }: {
  products: Product[];
  onPick: (product: Product, qty: number) => void;
  /** Cmd/Ctrl + Enter. `null` si ahora mismo no hay nada que enviar. */
  onSend: (() => void) | null;
  max?: number;
}): DishFinderState {
  const [raw, setRaw] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { qty, term } = useMemo(() => parseQuery(raw), [raw]);
  const results = useMemo(() => buscarPlatos(products, term, max), [products, term, max]);

  // Al cambiar la búsqueda, el resaltado vuelve arriba: si se quedara
  // donde estaba, Enter agregaría un plato que ya no es el que se ve.
  useEffect(() => { setActive(0); }, [term]);

  const enfocar = useCallback(() => { inputRef.current?.focus(); }, []);

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

  const agregar = useCallback((p: Product) => {
    /* Un agotado se puede resaltar con las flechas —para leerlo— pero no
       se agrega ni con Enter ni con el toque. */
    if (!p.is_available) { inputRef.current?.focus(); return; }
    onPick(p, qty);
    // El campo se limpia y el foco se queda: esto es lo que permite
    // teclear "2car⏎1sop⏎3lim⏎" de corrido, sin volver a tocar nada.
    setRaw('');
    setActive(0);
    inputRef.current?.focus();
  }, [onPick, qty]);

  const onInputKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
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
  }, [results, active, agregar]);

  return { raw, setRaw, qty, term, results, active, agregar, onInputKey, inputRef, enfocar };
}

/* ── El campo ──────────────────────────────────────────────────
   Un renglón y nada más. Va en la banda fija de la pantalla de la
   mesa, justo bajo la cabecera: es lo primero que el pulgar alcanza. */
export function DishFinderInput({ fin, autoFocus, placeholder }: {
  fin: DishFinderState;
  autoFocus: boolean;
  placeholder?: string;
}) {
  const { raw, setRaw, qty, onInputKey, inputRef } = fin;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus, inputRef]);

  return (
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
        placeholder={placeholder ?? 'Escribe un plato… (o «3 lim»)'}
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
  );
}

/* ── La lista ──────────────────────────────────────────────────
   Los platos que contestan a lo tecleado. Cuando ocupa el cuerpo de la
   pantalla sustituye a la rejilla del menú: se escribe arriba y esto
   cambia, sin ir a ninguna parte. */
export function DishResults({ fin, categories, qtyOf, onDec, money, onOpenItem }: {
  fin: DishFinderState;
  categories: Category[];
  /** Cuántas unidades de este plato hay ya en el pedido por enviar. */
  qtyOf: (productId: string) => number;
  onDec: (productId: string) => void;
  money: (n: number) => string;
  /** Cobrar algo que no está en la carta (M-09). Se ofrece justo cuando
      la búsqueda no encuentra nada: ese es el momento en que el mesero
      acaba de comprobar que el plato no existe. `undefined` = esta
      pantalla no lo permite. */
  onOpenItem?: (nombre: string) => void;
}) {
  const { results, active, term, agregar } = fin;

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  if (results.length === 0) {
    return (
      <div style={{ padding: '18px 6px', fontSize: 13.5, color: 'var(--u-text-3)', textAlign: 'center' }}>
        {/* Sin «disponible»: ahora los agotados SÍ salen, así que si no
            hay nada es que ese plato no está en la carta. La palabra
            sobraba y además insinuaba una respuesta que no era. */}
        Ningún plato se llama «{term}».
        {/* Y aquí, justo aquí, la salida (M-09). No es un botón más del
            menú: es la respuesta a lo que el mesero acaba de descubrir,
            y llega con el nombre ya escrito. */}
        {onOpenItem && (
          <button
            type="button"
            onClick={() => onOpenItem(term)}
            className="press"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', marginTop: 12, height: 44, borderRadius: 12, cursor: 'pointer',
              border: '1px solid var(--u-hair-2)', background: 'var(--adm-card)',
              color: 'var(--u-text)', fontSize: 14, fontWeight: 600,
            }}
          >
            <Icon name="plus" size={16} />
            Cobrarlo como artículo libre
          </button>
        )}
      </div>
    );
  }

  return (
    <Group>
      {results.map((p, i) => {
        const enCarrito = qtyOf(p.id);
        const resaltado = i === active;
        const agotado = !p.is_available;
        return (
          <div key={p.id}>
            {i > 0 && <Hr />}
            <div className="wp-res" data-on={resaltado && !agotado ? '1' : '0'} style={agotado ? { opacity: 0.6 } : undefined}>
              <button
                type="button"
                onClick={() => agregar(p)}
                disabled={agotado}
                className="press"
                style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: agotado ? 'default' : 'pointer', padding: 0 }}
              >
                <span style={{
                  display: 'block', fontSize: 14.5, fontWeight: 500,
                  color: agotado ? 'var(--u-text-3)' : 'var(--u-text)',
                  textDecoration: agotado ? 'line-through' : 'none',
                }}>
                  {p.name}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--u-text-3)', marginTop: 1 }}>
                  {catName.get(p.category_id ?? '') ?? 'Sin categoría'}
                </span>
              </button>
              {/* Qué agrega Enter, dicho en el propio renglón. El tinte
                  solo no basta: quien no lo distingue tiene que poder
                  VER cuál es. Se apaga solo donde no hay teclado. */}
              {resaltado && !agotado && <Key>↵</Key>}
              <Mono size={14} color="var(--u-text-2)">{money(p.price)}</Mono>
              {/* «Agotado» con todas sus letras, en el sitio donde
                  estaría el botón de agregar: el renglón contesta la
                  pregunta sin que haya que preguntarle a nadie. */}
              {agotado ? (
                <span
                  style={{
                    flexShrink: 0, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap',
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
                    background: 'color-mix(in srgb, var(--c-warn) 14%, transparent)',
                    color: 'var(--c-warn)',
                  }}
                >
                  Agotado
                </span>
              ) : enCarrito > 0 ? (
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
  );
}

/* El componente completo (campo + lista en una tarjeta) VIVÍA AQUÍ y se
   ha ido: desde que la pantalla de la mesa pone el campo arriba y los
   resultados en el cuerpo, nadie lo usaba. Dejarlo «por si acaso» era
   dejar una segunda forma de dibujar el buscador que nadie mantendría —
   y ese es justo el pecado que este rediseño vino a corregir.

   Lo que queda es lo que se usa: `useDishFinder`, `DishFinderInput` y
   `DishResults`, más `buscarPlatos` y `parseQuery` para quien solo
   necesite las reglas. */
