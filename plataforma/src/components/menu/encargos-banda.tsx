'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { encargosDelMenu, type EncargoPublico } from '@/lib/actions/encargos';
import { alCambiarEncargo, elegirEncargo, leerEncargoElegido, type EncargoElegido } from '@/lib/encargo-elegido';

/* ============================================================
   FRANJA DE ENCARGOS — arriba del menú (plan 2026-10-28, N6)
   ------------------------------------------------------------
   «Tamales del sábado · entrega sáb 7 nov · quedan 12 · cierra vie
   6 p. m.» y un botón para encargar. Al elegir una tanda, lo que el
   comensal agregue al carrito va para ESE día. Los números salen de
   pedidos reales (nada de «quedan pocos» inventado) y se piden al
   abrir el menú, no se hornean en la página guardada en caché.
   ============================================================ */

export default function EncargosBanda({ restaurantId }: { restaurantId: string }) {
  const [tandas, setTandas] = useState<EncargoPublico[]>([]);
  const [elegido, setElegido] = useState<EncargoElegido | null>(null);

  useEffect(() => {
    let vivo = true;
    encargosDelMenu(restaurantId).then((t) => { if (vivo) setTandas(t); }).catch(() => {});
    setElegido(leerEncargoElegido(restaurantId));
    const quitar = alCambiarEncargo(restaurantId, setElegido);
    return () => { vivo = false; quitar(); };
  }, [restaurantId]);

  // Una tanda elegida que ya no aparece (se llenó, cerró o pausaron) se suelta.
  useEffect(() => {
    if (elegido && tandas.length > 0 && !tandas.some((t) => t.id === elegido.id && !t.lleno)) {
      elegirEncargo(restaurantId, null);
    }
  }, [tandas, elegido, restaurantId]);

  if (tandas.length === 0) return null;

  return (
    <section aria-label="Encargos" style={{ padding: '14px 16px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="calendar" size={13} /> Encargos
      </div>
      {tandas.map((t) => {
        const activo = elegido?.id === t.id;
        return (
          /* Superficie SÓLIDA con el fondo del propio menú: los textos del tema
             están pensados para ese fondo. Con `.m-surface` (translúcida en
             varias paletas) el texto chico se perdía. */
          <div
            key={t.id}
            style={{
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
              background: 'var(--brand-bg)', border: '1px solid var(--u-hair)',
              borderRadius: 'var(--m-r-lg)', boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--m-fs-lg)', fontWeight: 800, color: 'var(--u-text)', lineHeight: 1.2 }}>{t.titulo}</div>
                <div style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', marginTop: 3 }}>Entrega {t.entrega}</div>
              </div>
              <span
                style={{
                  flexShrink: 0, fontSize: 'var(--m-fs-xs)', fontWeight: 700, padding: '4px 9px', borderRadius: 'var(--radius-full)',
                  // Colores del propio tema, invertidos: contrastan en cualquier
                  // paleta (el verde de «ok» se perdía sobre fondos oscuros).
                  background: t.lleno ? 'transparent' : 'var(--u-text)',
                  color: t.lleno ? 'var(--u-text-3)' : 'var(--brand-bg)',
                  border: t.lleno ? '1px solid var(--u-hair)' : '1px solid transparent',
                }}
              >
                {t.lleno ? 'Agotado' : t.quedan === 1 ? 'Queda 1' : `Quedan ${t.quedan}`}
              </span>
            </div>
            <div style={{ fontSize: 'var(--m-fs-xs)', color: 'var(--u-text-4)' }}>
              Recibimos encargos hasta el {t.cierre}{t.pagoAdelantado ? ' · se paga por adelantado' : ''}
            </div>
            {!t.lleno && (
              activo ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--m-fs-sm)', fontWeight: 700, color: 'var(--u-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="checkCircle" size={15} /> Agrega lo que quieras: va para este día
                  </span>
                  <button
                    type="button"
                    onClick={() => elegirEncargo(restaurantId, null)}
                    style={{ background: 'none', border: 0, padding: '6px 0', fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    Pedir para ahora
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="press btn-outline"
                  onClick={() => elegirEncargo(restaurantId, { id: t.id, titulo: t.titulo, entrega: t.entrega })}
                  style={{ alignSelf: 'flex-start', padding: '10px 16px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--m-fs-sm)', fontWeight: 700, minHeight: 'var(--m-tap)', cursor: 'pointer' }}
                >
                  Encargar para este día
                </button>
              )
            )}
          </div>
        );
      })}
    </section>
  );
}
