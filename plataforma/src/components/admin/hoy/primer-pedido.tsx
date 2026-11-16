'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PanelLink from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { dismissOnboarding } from '@/lib/actions/restaurant';
import { iniciarPedidoDePrueba } from '@/lib/actions/primeros-pasos';
import type { ClavePaso, PasoPrimerPedido } from '@/lib/hoy-etapa';

/* «Llega a tu primer pedido» (ficha 2.2, maqueta MAQUETA_HOY_POR_ETAPA).
   Tres pasos marcados por lo que pasó, no por formularios llenos. Solo el
   paso que sigue lleva botón; los hechos se pliegan con su palomita. El
   logo, los horarios y la impresora salen de aquí: aparecen cuando hacen
   falta, no como tareas de arranque. */

const TEXTO: Record<ClavePaso, { titulo: string; detalle: string }> = {
  platillos: {
    titulo: 'Publica tus primeros platillos',
    detalle: 'Con nombre y precio basta; la foto, después. Si no tienes categorías, creamos «Platillos» por ti.',
  },
  carta: {
    titulo: 'Ábrelo como cliente',
    detalle: 'Abre tu carta en el teléfono, o escanea tu QR, y mírala como la verá la gente.',
  },
  prueba: {
    titulo: 'Recibe un pedido de prueba',
    detalle: 'Pídelo tú desde tu carta, acéptalo en Pedidos y míralo llegar a cocina. No cuenta en tus cifras.',
  },
  qr: {
    titulo: 'Pon tu QR en las mesas',
    detalle: 'Descárgalo e imprímelo. Este paso se marca cuando tres personas abran tu carta.',
  },
};

export function PrimerPedido({
  restaurantId, pasos, menuUrl, platilloHref, qrHref,
}: {
  restaurantId: string;
  pasos: PasoPrimerPedido[];
  menuUrl: string;
  platilloHref: string;
  qrHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const siguiente = pasos.find((p) => !p.hecho)?.clave ?? null;
  const faltan = pasos.filter((p) => !p.hecho).length;

  function pedidoDePrueba() {
    setError('');
    // La pestaña se abre YA, dentro del toque: después de esperar al
    // servidor, el navegador la bloquearía como ventana emergente.
    const pestana = window.open('', '_blank');
    start(async () => {
      const res = await iniciarPedidoDePrueba(restaurantId);
      if ('error' in res) {
        pestana?.close();
        setError(res.error);
        return;
      }
      if (pestana) pestana.location.href = res.url;
      else window.location.href = res.url;
    });
  }

  function omitir() {
    start(async () => {
      await dismissOnboarding(restaurantId);
      router.refresh();
    });
  }

  function accion(clave: ClavePaso) {
    const clase = 'mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-adm-lg px-4 text-[14px] font-semibold no-underline btn-accent';
    if (clave === 'platillos') return <PanelLink href={platilloHref} className={clase}>Agregar platillo</PanelLink>;
    if (clave === 'carta') {
      return (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={menuUrl} target="_blank" rel="noopener noreferrer" className={clase.replace('mt-3 ', '')}>Abrir mi carta</a>
          <PanelLink href={qrHref} className="text-[13px] font-semibold no-underline text-adm-accent-ink">Ver mi QR</PanelLink>
        </div>
      );
    }
    if (clave === 'qr') return <PanelLink href={qrHref} className={clase}>Descargar mi QR</PanelLink>;
    return (
      <button type="button" onClick={pedidoDePrueba} disabled={pending} className={`${clase} cursor-pointer border-0`}>
        {pending ? 'Abriendo tu carta…' : 'Hacer pedido de prueba'}
      </button>
    );
  }

  return (
    <section aria-labelledby="guia-primer-pedido" className="rounded-adm-xl border border-adm-border bg-adm-card shadow-adm-sm">
      <div className="px-4 pt-4 pb-1 md:px-5">
        <h2 id="guia-primer-pedido" className="text-[18px] font-bold tracking-[-0.02em] text-adm-text">Llega a tu primer pedido</h2>
        <p className="mt-0.5 text-[13px] text-adm-text-3">
          {faltan === pasos.length ? 'Tres pasos · unos 10 minutos' : faltan === 1 ? 'Te falta un paso' : `Te faltan ${faltan} pasos`}
        </p>
      </div>
      <ol className="m-0 list-none p-0">
        {pasos.map((p, i) => {
          const actual = p.clave === siguiente;
          const t = TEXTO[p.clave];
          return (
            <li key={p.clave} aria-current={actual ? 'step' : undefined} className="flex items-start gap-3 px-4 py-3.5 md:px-5">
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold ${
                  p.hecho ? 'border-transparent' : actual ? 'text-adm-accent-ink' : 'border-adm-border text-adm-text-3'}`}
                style={p.hecho
                  ? { background: 'var(--c-ok-bg)', color: 'var(--c-ok)' }
                  : actual ? { borderColor: 'var(--brand-accent-ink, var(--adm-accent-500))' } : undefined}
              >
                {p.hecho ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] font-semibold ${p.hecho ? 'text-adm-text-3' : 'text-adm-text'}`}>
                  {t.titulo}
                  {p.hecho && <span className="sr-only"> · hecho</span>}
                </div>
                {!p.hecho && <p className="mt-0.5 text-[13px] leading-snug text-adm-text-2">{t.detalle}</p>}
                {actual && accion(p.clave)}
                {actual && error && <p role="alert" className="mt-2 text-[13px] font-medium" style={{ color: 'var(--c-danger)' }}>{error}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="border-t border-adm-border px-4 py-1 text-center md:px-5">
        <button type="button" onClick={omitir} disabled={pending}
          className="min-h-11 cursor-pointer border-0 bg-transparent text-[13px] font-medium text-adm-text-3">
          Omitir la guía
        </button>
      </div>
    </section>
  );
}
