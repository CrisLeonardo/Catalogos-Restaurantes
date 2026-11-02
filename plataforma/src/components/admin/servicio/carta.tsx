'use client';

/* LA CARTA — encontrar el plato y agregarlo en un toque.
   ------------------------------------------------------------------
   Tres capas, de la más rápida a la más completa:

     1. el BUSCADOR, donde «2 pepián» + Enter agrega dos pepianes sin
        levantar las manos del teclado. Lo interpretado se enseña SIEMPRE
        en un chip antes de pulsar nada: si el sistema entendió otra cosa
        tiene que verse antes, no después;
     2. LOS MÁS PEDIDOS, seis platos a un toque, numerados del 1 al 9 en
        PC. Salen de las ventas reales del restaurante, no de una lista
        que alguien mantiene a mano;
     3. la REJILLA, para quien prefiere tocar, con la FOTO de cada plato
        (el mesero reconoce el plato antes de leer el nombre). Funciona
        como cualquier POS: un toque agrega uno —o abre la hoja si el plato
        tiene un grupo obligatorio—, el número de la esquina dice cuántos
        van, «−» quita uno y «⋯» abre opciones y nota.

   Lo AGOTADO sale, apagado y sin poder tocarse. El prototipo del handoff
   no lo contemplaba y esconderlo no contesta la pregunta que el mesero
   tiene delante del cliente: si escribe «roll» y no sale nada, no sabe si
   lo escribió mal, si no existe o si se acabó — que es lo único que le
   puede decir a quien tiene enfrente. */

import { useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import AssetImage from '@/components/asset-image';
import { Icon } from '@/components/icons';
import { Kicker, Pill } from '@/components/admin/servicio/pieces';
import { coincide, leerComanda, normalizar } from '@/lib/servicio/comanda';
import { iniciales, quedanPocos, tinteDe } from '@/lib/servicio/carta';
import type { Category, Product } from '@/types';

/** Cuántos platos lleva la fila de «los más pedidos». */
export const MAX_FAVS = 6;

/** Tres columnas en el teléfono; unos 150 px en tablet y PC. */
const FOTO_SIZES = '(max-width: 640px) 34vw, 160px';

export interface CartaProps {
  products: Product[];
  categories: Category[];
  /** Los ids más vendidos del restaurante, en orden. */
  masPedidos: string[];
  q: string;
  setQ: (v: string) => void;
  cat: string | null;
  setCat: (v: string | null) => void;
  /** Cuántas unidades de este plato hay ya apuntadas en la mesa abierta. */
  qtyOf: (productId: string) => number;
  /** Un toque en la tarjeta: agrega `qty` unidades. */
  onAdd: (p: Product, qty: number) => void;
  /** «Opciones»: abre la hoja de modificadores de ese plato. */
  onOpts: (p: Product, qty: number) => void;
  /** «−» en la tarjeta: quita una unidad de lo apuntado sin enviar. */
  onRemove: (p: Product) => void;
  /** «Ya hay» en un plato agotado. Solo llega con permiso de carta. */
  onReponer?: (p: Product) => void;
  /** Cobrar algo que no está en la carta (M-09), con el nombre ya escrito. */
  onOpenItem: (nombre: string) => void;
  onVoz: () => void;
  /** ¿Hay teclado de verdad? Decide las pistas, no el ancho de la ventana. */
  conTeclado: boolean;
  aprendiz: boolean;
  /** El dictado por voz solo se ofrece donde el navegador lo tiene. */
  hayVoz: boolean;
  money: (n: number) => string;
  /** Ancho: en móvil los favoritos solo salen sin búsqueda ni categoría. */
  movil: boolean;
}

export default function Carta({
  products, categories, masPedidos, q, setQ, cat, setCat,
  qtyOf, onAdd, onOpts, onRemove, onReponer, onOpenItem, onVoz, conTeclado, aprendiz, hayVoz, money, movil,
}: CartaProps) {
  const input = useRef<HTMLInputElement | null>(null);

  const { qty, term } = useMemo(() => leerComanda(q), [q]);

  const activos = useMemo(() => products.filter((p) => p.is_active), [products]);

  /** El plato que Enter agregaría. */
  const interpretado = useMemo(() => {
    if (!term) return null;
    const disponibles = activos.filter((p) => p.is_available);
    // Lo que EMPIEZA por lo tecleado gana: quien escribe «car» quiere
    // Carne asada, no «Tacos de carnitas».
    const empieza = disponibles.find((p) => coincide(p.name, term) && normalizar(p.name).startsWith(normalizar(term)));
    return empieza ?? disponibles.find((p) => coincide(p.name, term)) ?? null;
  }, [activos, term]);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.name);
    return m;
  }, [categories]);

  /* El filtro de la rejilla usa LO TECLEADO, no el nombre completo del
     plato interpretado. El prototipo hacía lo segundo y la rejilla se
     colapsaba a un solo resultado en cuanto escribías «2 pep»: el chip
     ya dice qué agrega Enter, la rejilla debe seguir enseñando todo lo
     que se parece a lo que estás escribiendo. */
  const dishes = useMemo(() => {
    const porCat = cat ? activos.filter((p) => p.category_id === cat) : activos;
    const lista = term
      ? porCat.filter((p) => coincide(`${p.name} ${catName.get(p.category_id ?? '') ?? ''}`, term))
      : porCat.filter((p) => p.is_available || p.is_active);
    // Lo que se puede pedir primero; lo agotado después, pero visible. Sin
    // buscar también (PED-13): antes, sin término, la rejilla seguía el
    // orden de la base y un agotado podía salir el primero.
    return [
      ...lista.filter((p) => p.is_available),
      ...lista.filter((p) => !p.is_available),
    ];
  }, [activos, cat, term, catName]);

  const favs = useMemo(() => {
    const porId = new Map(activos.map((p) => [p.id, p]));
    const out: Product[] = [];
    for (const id of masPedidos) {
      const p = porId.get(id);
      if (p?.is_available) out.push(p);
      if (out.length >= MAX_FAVS) break;
    }
    return out;
  }, [activos, masPedidos]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) return;   // ⌘⏎ es «enviar a cocina»
      e.preventDefault();
      if (!interpretado) return;
      onAdd(interpretado, qty);
      setQ('');
      // El foco se queda: es lo que permite teclear «2car⏎1sop⏎3lim⏎»
      // de corrido sin volver a tocar nada.
      input.current?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setQ('');
    }
  }

  const mostrarFavs = favs.length > 0 && (!movil || (!term && !cat));

  /* Si ningún plato tiene foto, una rejilla de iniciales sería una pared de
     cuadros de colores ocupando el doble que hoy: la carta se queda con las
     tarjetas compactas de texto. Con UNA foto ya vale la pena. */
  const conFotos = useMemo(() => activos.some((p) => !!p.image_url), [activos]);

  return (
    <>
      <div className="sv-carta-head">
        <div className="sv-find">
          <span className="sv-find-ico"><Icon name="search" size={17} /></span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={conTeclado ? 'Teclea «2 pepián» y Enter, o busca un plato' : 'Buscar plato'}
            aria-label="Buscar un plato para agregar"
            autoComplete="off"
            enterKeyHint="done"
          />
          {interpretado && (
            <span className="sv-find-parsed">
              {conTeclado ? '⏎ ' : ''}{qty > 1 ? `${qty}× ` : ''}{interpretado.name}
            </span>
          )}
          {!interpretado && q && (
            <button
              type="button"
              className="sv-find-clear"
              onClick={() => { setQ(''); input.current?.focus(); }}
              aria-label="Borrar la búsqueda"
            >
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        {hayVoz && (
          <button type="button" className="sv-mic" onClick={onVoz} aria-label="Dictar el pedido">
            <Icon name="mic" size={19} />
          </button>
        )}
      </div>

      <div className="sv-carta-bars">
        {mostrarFavs && (
          <>
            <Kicker aside={aprendiz ? <span className="sv-hint-inline">Un toque = se agrega 1</span> : undefined}>
              Los más pedidos
            </Kicker>
            <div className="sv-hs">
              {favs.map((p, i) => (
                <button key={p.id} type="button" className="sv-fav" onClick={() => onAdd(p, 1)}>
                  {conTeclado && i < 9 && <span className="sv-fav-key">{i + 1}</span>}
                  {p.name}
                  <span className="sv-fav-price">{money(p.price)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sv-hs">
          <Pill on={cat == null} onClick={() => setCat(null)}>Todos</Pill>
          {categories.map((c) => (
            <Pill key={c.id} on={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Pill>
          ))}
        </div>
      </div>

      <div className="sv-vs sv-carta-list">
        {dishes.length === 0 ? (
          <div className="sv-vacio">
            {term
              ? <>Ningún plato se llama «{term}».<br />Prueba otra palabra.</>
              : 'Esta categoría no tiene platos.'}
            {/* Y aquí, justo aquí, la salida (M-09). No es un botón más del
                menú: es la respuesta a lo que el mesero acaba de descubrir,
                y llega con el nombre ya escrito. */}
            {term && (
              <button
                type="button"
                className="sv-cta"
                data-tone="quiet"
                style={{ marginTop: 16, maxWidth: 340, marginInline: 'auto', height: 48, fontSize: 14 }}
                onClick={() => onOpenItem(term)}
              >
                <Icon name="plus" size={16} />
                Cobrarlo como artículo libre
              </button>
            )}
          </div>
        ) : (
          <div className="sv-dishes">
            {dishes.map((p) => {
              const enComanda = qtyOf(p.id);
              const agotado = !p.is_available;
              const quedan = quedanPocos(p);
              /* Los dos mandos pequeños de la tarjeta, como en cualquier
                 POS: «−» quita uno de lo apuntado sin abrir la comanda, y
                 «⋯» abre opciones y nota. Cada uno detiene el toque para que
                 no agregue un plato por error. Van sobre la foto o, sin
                 fotos, en el pie. */
              const mandos = agotado ? (onReponer ? (
                <span className="sv-dish-tools">
                  <button
                    type="button"
                    className="sv-dish-tool"
                    data-txt="1"
                    onClick={(e) => { e.stopPropagation(); onReponer(p); }}
                    aria-label={`${p.name} ya hay otra vez`}
                  >
                    Ya hay
                  </button>
                </span>
              ) : null) : (
                <span className="sv-dish-tools">
                  {enComanda > 0 && (
                    <button
                      type="button"
                      className="sv-dish-tool"
                      onClick={(e) => { e.stopPropagation(); onRemove(p); }}
                      aria-label={`Quitar un ${p.name}`}
                      title="Quitar uno"
                    >
                      <Icon name="minus" size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="sv-dish-tool"
                    onClick={(e) => { e.stopPropagation(); onOpts(p, 1); }}
                    aria-label={`Opciones y nota de ${p.name}`}
                    title="Opciones y nota"
                  >
                    <Icon name="more" size={16} />
                  </button>
                </span>
              );
              const aviso = agotado
                ? <span className="sv-dish-out">Agotado</span>
                : quedan != null ? <span className="sv-dish-left">Quedan {quedan}</span> : null;
              return (
                <div
                  key={p.id}
                  className="sv-dish"
                  data-has={enComanda > 0 ? '1' : '0'}
                  data-out={agotado ? '1' : '0'}
                  role="button"
                  tabIndex={agotado ? -1 : 0}
                  aria-disabled={agotado}
                  aria-label={`${p.name}, ${money(p.price)}${agotado ? ', agotado' : ''}${enComanda > 0 ? `, ${enComanda} en la comanda` : ''}`}
                  onClick={() => { if (!agotado) onAdd(p, 1); }}
                  onKeyDown={(e) => {
                    if (agotado) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(p, 1); }
                  }}
                >
                  {conFotos && (
                    <span className="sv-dish-ph">
                      {p.image_url ? (
                        <AssetImage src={p.image_url} alt="" fill sizes={FOTO_SIZES} style={{ objectFit: 'cover' }} />
                      ) : (
                        <span className="sv-dish-ini" style={{ '--tinte': tinteDe(p.name) } as CSSProperties} aria-hidden>
                          {iniciales(p.name)}
                        </span>
                      )}
                      {aviso}
                      {mandos}
                    </span>
                  )}
                  {!agotado && enComanda > 0 && <span className="sv-dish-q">×{enComanda}</span>}
                  <span className="sv-dish-name">{p.name}</span>
                  {!conFotos && aviso && <span>{aviso}</span>}
                  <span className="sv-dish-foot">
                    <span className="sv-dish-price">{money(p.price)}</span>
                    {!conFotos && mandos}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
