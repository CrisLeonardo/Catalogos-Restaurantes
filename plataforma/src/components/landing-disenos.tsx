'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { conEvento, EVENTOS } from '@/lib/analytics';
import { esMuestraAviso, guardarEleccionMuestra, type MuestraPedido } from '@/lib/muestra-mensajes';
import type { Diseno } from '@/lib/landing-disenos';

/* ============================================================
   VITRINA DE DISEÑOS DE LA PORTADA («Tu menú, a tu manera»)
   ------------------------------------------------------------
   Un teléfono con el menú DE VERDAD de Rincón 502 (/preview/muestra, en un
   iframe del mismo origen) se queda fijo mientras al lado pasan las ocho
   estructuras. La que llega al centro de la pantalla cambia el teléfono:
   deslizar es lo que diseña. Cada estructura trae tres paletas para
   probar, y el visitante puede escribir el nombre de su restaurante.

   Por qué así (docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md §1):
   · el menú lleva TU nombre → ya se siente tuyo (dotación);
   · cada estructura dice para quién es → «ese soy yo»;
   · «Quiero este diseño» guarda la elección y el alta la trae puesta.

   Cuidados:
   · el iframe se pide cuando la sección está a una pantalla, no antes;
   · el teléfono es de solo mirar hasta «Tócalo tú»: así nadie se queda
     atorado bajando el menú cuando quería bajar la página;
   · cambiar de estilo no recarga: se manda por postMessage.
   ============================================================ */


/** Ancho al que se dibuja el menú dentro del teléfono: el de un celular. */
const ANCHO_MENU = 390;

export function LandingDisenos({ disenos, combinaciones }: { disenos: Diseno[]; combinaciones: number }) {
  const [activo, setActivo] = useState(0);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [nombre, setNombre] = useState('');
  const [src, setSrc] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [tocando, setTocando] = useState(false);

  const seccionRef = useRef<HTMLDivElement>(null);
  const pantallaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const tocandoRef = useRef(false);
  const recorridoRef = useRef<number | undefined>(undefined);
  const ultimoEstiloRef = useRef<string | null>(null);

  const diseno = disenos[activo];
  const estilo = elegidos[diseno.id] ?? diseno.estilos[0].id;
  const estiloNombre = diseno.estilos.find((e) => e.id === estilo)?.nombre ?? '';

  // El iframe se pide cuando la sección está a una pantalla de distancia.
  useEffect(() => {
    const el = seccionRef.current;
    if (!el || src) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSrc(`/preview/muestra?estilo=${encodeURIComponent(disenos[0].estilos[0].id)}`);
          io.disconnect();
        }
      },
      { rootMargin: '100% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src, disenos]);

  // El menú se dibuja a 390 px y se encoge al tamaño de la pantalla del teléfono.
  useEffect(() => {
    const el = pantallaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      el.style.setProperty('--dz-k', String(e.contentRect.width / ANCHO_MENU));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // La estructura activa es la tarjeta que cruza la franja de lectura: el
  // centro de la pantalla en computadora; debajo del teléfono en el celular.
  useEffect(() => {
    const tarjetas = seccionRef.current?.querySelectorAll<HTMLElement>('[data-dz-i]');
    if (!tarjetas?.length) return;
    const movil = window.matchMedia('(max-width: 899px)').matches;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActivo(Number((e.target as HTMLElement).dataset.dzI));
      },
      // En el celular el teléfono ocupa la mitad de arriba: la franja es la
      // de justo debajo.
      { rootMargin: movil ? '-56% 0px -30% 0px' : '-46% 0px -46% 0px' },
    );
    tarjetas.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  // Recorrido automático: un instante en la portada y luego baja a la carta,
  // que es donde se nota la estructura. Si solo cambió el nombre, se queda
  // arriba (ahí se ve el nombre).
  const recorrer = useCallback((estiloPintado: string) => {
    const win = frameRef.current?.contentWindow;
    if (!win || tocandoRef.current) return;
    const nuevo = estiloPintado !== ultimoEstiloRef.current;
    ultimoEstiloRef.current = estiloPintado;
    window.clearTimeout(recorridoRef.current);
    win.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    if (!nuevo) return;
    recorridoRef.current = window.setTimeout(() => {
      const menu = win.document.getElementById('menu');
      if (menu && !tocandoRef.current) win.scrollTo({ top: Math.max(0, menu.offsetTop - 6), behavior: 'smooth' });
    }, 1300);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (!esMuestraAviso(e.data)) return;
      if (e.data.type === 'leogin-muestra-lista') setListo(true);
      else recorrer(e.data.estilo ?? '');
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(recorridoRef.current);
    };
  }, [recorrer]);

  // Estilo y nombre al menú (el nombre con un respiro para no repintar por letra).
  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(() => {
      const msg: MuestraPedido = { type: 'leogin-muestra', estilo, nombre };
      frameRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    }, 140);
    return () => window.clearTimeout(t);
  }, [estilo, nombre, listo]);

  const tocar = (si: boolean) => {
    tocandoRef.current = si;
    setTocando(si);
    if (si) window.clearTimeout(recorridoRef.current);
  };

  const elegir = (i: number, estiloId: string) => {
    setElegidos((prev) => ({ ...prev, [disenos[i].id]: estiloId }));
    if (i !== activo) {
      setActivo(i);
      seccionRef.current?.querySelector(`[data-dz-i="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div ref={seccionRef} className="lp-dz">
      <div className="lp-dz-lista">
        <label className="lp-dz-nombre">
          <span className="lp-dz-nombre-label">Pruébalo con el nombre de tu restaurante</span>
          <span className="lp-dz-nombre-campo">
            <Icon name="edit" size={16} />
            <input
              type="text"
              value={nombre}
              maxLength={40}
              placeholder="Rincón 502"
              autoComplete="off"
              enterKeyHint="done"
              onChange={(e) => setNombre(e.target.value)}
            />
          </span>
        </label>

        {disenos.map((d, i) => {
          const elegido = elegidos[d.id] ?? d.estilos[0].id;
          return (
            <article key={d.id} data-dz-i={i} className="lp-dz-card" data-on={i === activo ? '' : undefined}>
              <span className="lp-dz-num" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <h3 className="lp-dz-titulo">{d.nombre}</h3>
              <p className="lp-dz-hint">{d.hint}</p>
              <div className="lp-dz-paletas" role="group" aria-label={`Paletas para ${d.nombre}`}>
                {d.estilos.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="lp-dz-paleta"
                    aria-pressed={elegido === e.id}
                    onClick={() => elegir(i, e.id)}
                    title={e.nombre}
                  >
                    <span className="lp-dz-swatch" style={{ background: e.bg, color: e.accent, borderColor: e.text }} aria-hidden>
                      <span style={{ background: e.accent }} />
                    </span>
                    {e.nombre}
                  </button>
                ))}
              </div>
            </article>
          );
        })}

        <p className="lp-dz-cuenta">
          Y no son solo estas: hay <strong>{combinaciones}</strong> combinaciones de estructura y paleta,
          y todas se ajustan después a tus colores, tu logo y tu letra.
        </p>
        <p className="lp-dz-nota">
          Rincón 502 es nuestro restaurante de ejemplo y sus platillos son ilustraciones:
          con tus fotos se ve todavía mejor.
        </p>
      </div>

      <div className="lp-dz-escenario">
        <figure className="lp-dz-telefono" aria-label={`Menú de ejemplo en estilo ${diseno.nombre} · ${estiloNombre}`}>
          <div className="lp-device lp-device-phone lp-dz-marco">
            <div ref={pantallaRef} className="lp-device-screen-phone lp-dz-pantalla" data-tocando={tocando ? '' : undefined}>
              {!listo && (
                <div className="lp-dz-cargando" aria-hidden>
                  <span className="lp-dz-cargando-logo">R</span>
                  <span>Rincón 502</span>
                </div>
              )}
              {src && (
                <iframe
                  ref={frameRef}
                  src={src}
                  title="Menú de ejemplo de Rincón 502"
                  className="lp-dz-frame"
                  loading="lazy"
                  tabIndex={tocando ? 0 : -1}
                  style={{ width: ANCHO_MENU, height: Math.round((ANCHO_MENU * 19) / 9) }}
                />
              )}
            </div>
          </div>
        </figure>

        {/* Fuera de la figura a propósito: en el celular va a la derecha del
            teléfono (mitad y mitad), y en la computadora debajo. */}
        <div className="lp-dz-lado">
          <p className="lp-dz-estado" aria-live="polite">
            <span className="lp-dz-estado-num" aria-hidden>{String(activo + 1).padStart(2, '0')}</span>
            <span className="lp-dz-estado-nombre">{diseno.nombre}</span>
            <span className="lp-dz-estado-sep" aria-hidden>·</span>
            <span>{estiloNombre}</span>
          </p>
          <div className="lp-dz-acciones">
            <button type="button" className="lp-btn lp-btn-sm lp-btn-soft" onClick={() => tocar(!tocando)} aria-pressed={tocando}>
              <Icon name={tocando ? 'check' : 'smile'} size={15} />
              {tocando ? 'Listo' : 'Tócalo tú'}
            </button>
            <Link
              href="/registro"
              {...conEvento('lp-btn lp-btn-sm lp-btn-primary', EVENTOS.clicCrear, 'vitrina de diseños')}
              onClick={() => guardarEleccionMuestra(estilo, nombre)}
            >
              <span className="lp-dz-cta-largo">Quiero este diseño</span>
              <span className="lp-dz-cta-corto">Lo quiero</span>
              <Icon name="arrowRight" size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
