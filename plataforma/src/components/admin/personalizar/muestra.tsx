'use client';

/* ============================================================
   LA CARTA DE VERDAD, EN PEQUEÑO (ficha 2.7)
   ------------------------------------------------------------
   Las miniaturas de la galería dibujan «Tacos · Bebidas · Q45»; un
   diseño se elige mucho mejor viéndolo con lo propio. Aquí se pinta con
   los platillos, precios y fotos del restaurante:

     · MiniCarta ... la muestra de cada diseño recomendado.
     · VistaRapida . portada, un platillo abierto y el carrito, siempre
                     encendida y sin cargar la carta entera (la carta
                     interactiva se abre en otra pestaña).

   Es una aproximación con los colores, letras, radios y forma del
   platillo del tema; la de verdad sigue siendo «Probar como cliente».
   ============================================================ */

import { useState } from 'react';
import { assetSrc } from '@/lib/asset-image';
import { DEFAULT_CONFIG, findFont, type ThemeConfig } from '@/lib/theme/defaults';
import { SELF_HOSTED_FONT_VARS } from '@/lib/theme/resolve';
import { fmtMoney } from '@/lib/money';
import s from './muestra.module.css';

export interface PlatoMuestra {
  nombre: string;
  precio: number;
  foto: string | null;
  desc: string | null;
  categoria: string | null;
}

function familia(f: string): string {
  const stack = findFont(f)?.stack ?? 'system-ui, sans-serif';
  const propia = SELF_HOSTED_FONT_VARS[f];
  return propia ? `${propia}, ${stack}` : `'${f}', ${stack}`;
}

function velo(hex: string, a: number): string {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(128,128,128,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function vars(c: ThemeConfig): React.CSSProperties {
  return {
    '--m-bg': c.colorBg, '--m-bg2': c.colorBg2, '--m-text': c.colorText,
    '--m-text2': velo(c.colorText, 0.66), '--m-hair': velo(c.colorText, 0.14), '--m-tile': velo(c.colorText, 0.07),
    '--m-accent': c.colorAccent, '--m-on': c.onAccent,
    '--m-r': `${Math.round(12 * c.cornerRadius)}px`,
    '--m-display': familia(c.fontDisplay), '--m-body': familia(c.fontBody), '--m-serif': familia(c.fontSerif),
  } as React.CSSProperties;
}

const Foto = ({ src, alt }: { src: string | null; alt: string }) => src
  // eslint-disable-next-line @next/next/no-img-element
  ? <img className={s.foto} src={assetSrc(src, 256)} alt={alt} loading="lazy" />
  : <span className={s.foto} data-vacia aria-hidden>{alt.slice(0, 1)}</span>;

/** El precio sin decimales en la miniatura, como en el menú: «Q52». */
const precioCorto = (n: number) => fmtMoney(n).replace(/\.00$/, '');

/* ── MiniCarta ─────────────────────────────────────────────── */
export function MiniCarta({ config, platos, nombre, logo }: {
  config: Partial<ThemeConfig>;
  platos: PlatoMuestra[];
  nombre: string;
  logo: string | null;
}) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const conFoto = platos.filter((p) => p.foto);
  const forma = c.cardStyle;
  const cats = [...new Set(platos.map((p) => p.categoria).filter(Boolean))].slice(0, 3) as string[];

  return (
    <div className={s.mini} style={vars(c)} aria-hidden>
      <div className={s.miniHead} data-centrado={forma === 'texto' ? '1' : undefined}>
        {forma !== 'texto' && (logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img className={s.logo} src={assetSrc(logo, 64)} alt="" />
          : <span className={s.logo}>{nombre.slice(0, 1)}</span>)}
        <b>{forma === 'texto' ? nombre.toUpperCase() : nombre}</b>
      </div>

      {c.catalogNav === 'portadas' ? (
        <div className={s.miniGrid}>
          {cats.slice(0, 4).map((cat, i) => (
            <div key={cat} className={s.portada}>
              <Foto src={(conFoto[i] ?? platos[i])?.foto ?? null} alt={cat} />
              <span>{cat}</span>
            </div>
          ))}
        </div>
      ) : forma === 'texto' ? (
        <div className={s.miniLista}>
          {platos.slice(0, 4).map((p) => (
            <div key={p.nombre} className={s.puntos}><span>{p.nombre}</span><i /><span>{fmtMoney(p.precio)}</span></div>
          ))}
        </div>
      ) : forma === 'fila' ? (
        <div className={s.miniLista}>
          {platos.slice(0, 3).map((p) => (
            <div key={p.nombre} className={s.fila}>
              <Foto src={p.foto} alt={p.nombre} />
              <span className={s.filaNombre}>{p.nombre}</span>
              <span className={s.precio}>{precioCorto(p.precio)}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {cats.length > 0 && (
            <div className={s.chips}>
              {cats.map((cat, i) => <span key={cat} data-on={i === 0 ? '1' : undefined}>{cat}</span>)}
            </div>
          )}
          <div className={s.miniGrid} data-mosaico={forma === 'mosaico' ? '1' : undefined}>
            {(conFoto.length >= 2 ? conFoto : platos).slice(0, 2).map((p) => (
              <div key={p.nombre} className={s.tarjeta}>
                <Foto src={p.foto} alt={p.nombre} />
                <span className={s.tarjetaPie}><span>{p.nombre}</span><b>{precioCorto(p.precio)}</b></span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── VistaRapida ───────────────────────────────────────────── */
type Pantalla = 'portada' | 'platillo' | 'carrito';

export function VistaRapida({ config, platos, nombre, lema, logo }: {
  config: ThemeConfig;
  platos: PlatoMuestra[];
  nombre: string;
  lema: string;
  logo: string | null;
}) {
  const [pantalla, setPantalla] = useState<Pantalla>('portada');
  /* Con lo difícil a la vista: el nombre más largo, el precio más alto y uno
     sin foto. Así se nota antes de publicar si algo se rompe. */
  const largo = [...platos].sort((a, b) => b.nombre.length - a.nombre.length)[0];
  const caro = [...platos].sort((a, b) => b.precio - a.precio)[0];
  const sinFoto = platos.find((p) => !p.foto);
  const abierto = largo ?? platos[0];
  const carrito = [caro, sinFoto ?? platos[1]].filter((p, i, a): p is PlatoMuestra => !!p && a.indexOf(p) === i);
  const total = carrito.reduce((n, p) => n + p.precio, 0);

  return (
    <div className={s.vista}>
      <div className={s.pestanas} role="tablist" aria-label="Qué pantalla ver">
        {(['portada', 'platillo', 'carrito'] as const).map((p) => (
          <button key={p} type="button" role="tab" aria-selected={pantalla === p} data-on={pantalla === p ? '1' : undefined}
            onClick={() => setPantalla(p)}>
            {p === 'portada' ? 'Portada' : p === 'platillo' ? 'Platillo' : 'Carrito'}
          </button>
        ))}
      </div>
      <div className={s.telefono} style={vars(config)}>
        {pantalla === 'portada' && (
          <div className={s.portadaGrande}>
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img className={s.logoGrande} src={assetSrc(logo, 160)} alt="" />
              : <span className={s.logoGrande}>{nombre.slice(0, 1)}</span>}
            <b className={s.nombreGrande}>{nombre}</b>
            {lema && <span className={s.lema}>{lema}</span>}
            <span className={s.cta}>Ver el menú</span>
            <MiniCarta config={config} platos={platos} nombre={nombre} logo={logo} />
          </div>
        )}
        {pantalla === 'platillo' && abierto && (
          <div className={s.ficha}>
            <Foto src={abierto.foto} alt={abierto.nombre} />
            <b className={s.fichaNombre}>{abierto.nombre}</b>
            {abierto.desc && <span className={s.lema}>{abierto.desc}</span>}
            <span className={s.cta} data-abajo>Agregar · {fmtMoney(abierto.precio)}</span>
          </div>
        )}
        {pantalla === 'carrito' && (
          <div className={s.carrito}>
            <b className={s.fichaNombre}>Tu pedido</b>
            {carrito.map((p) => (
              <div key={p.nombre} className={s.fila}>
                <Foto src={p.foto} alt={p.nombre} />
                <span className={s.filaNombre}>1× {p.nombre}</span>
                <span className={s.precio}>{fmtMoney(p.precio)}</span>
              </div>
            ))}
            <div className={s.total}><span>Total</span><b>{fmtMoney(total)}</b></div>
            <span className={s.cta} data-abajo>Hacer el pedido</span>
          </div>
        )}
      </div>
    </div>
  );
}
