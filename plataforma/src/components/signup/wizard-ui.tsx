'use client';

import { useEffect, useId, useRef } from 'react';
import type React from 'react';

/* ============================================================
   PIEZAS COMPARTIDAS DE LOS DOS ASISTENTES
   ------------------------------------------------------------
   Desde que el alta se partió en dos, hay dos asistentes con la misma
   forma y distinto contenido:

     · `/registro`         → crea la CUENTA (y nada más).
     · `/mi-cuenta/nuevo`  → crea un RESTAURANTE de esa cuenta.

   El paso a paso, los campos y el pie de navegación se ven igual en los
   dos a propósito: para quien se registra hoy y crea su local a los dos
   minutos, es un solo camino aunque por dentro sean dos pantallas. Vivir
   aquí es lo que impide que se separen con el tiempo.
   ============================================================ */

/* El mismo relleno que el login: con blanco al 5 %, en la web clara el
   registro tenía campos blancos con borde y el login grises rellenos — dos
   estilos de campo en el mismo flujo (auditoría 2026-10-02, WEB-06). */

/** Lo que `Field` le pasa a su control para que el lector de pantalla lo
 *  anuncie con su etiqueta y su ayuda. Antes la etiqueta solo se dibujaba:
 *  el lector leía el placeholder como nombre y la contraseña quedaba sin
 *  nombre (auditoría de lanzamiento 2026-11-23, WEB-04 / LZ-04). */
export type FieldIds = { id: string; 'aria-describedby'?: string };

export function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  /** Con una función, el campo recibe `id` y `aria-describedby` y la
   *  etiqueta queda asociada; con un nodo suelto solo se dibuja. */
  children: React.ReactNode | ((ids: FieldIds) => React.ReactNode);
}) {
  const id = useId();
  const hintId = hint ? `${id}-ayuda` : undefined;
  const asociado = typeof children === 'function';
  return (
    <div>
      <label htmlFor={asociado ? id : undefined} style={{ fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {asociado ? children({ id, 'aria-describedby': hintId }) : children}
      {hint && <p id={hintId} style={{ fontSize: 12, color: 'var(--u-text-4)', margin: '6px 0 0' }}>{hint}</p>}
    </div>
  );
}

export function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
      <span style={{ color: 'var(--u-text-4)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--u-text)', fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

/** La barra de progreso con el nombre de cada paso. */
export function Stepper({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {steps.map((label, i) => (
        <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            height: 4, borderRadius: 99,
            background: i <= step ? 'var(--brand-accent)' : 'rgba(255,255,255,0.12)',
            transition: 'background 200ms',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: i === step ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* El error se ANUNCIA (role="alert"): antes aparecía en silencio y quien
   usa lector de pantalla no se enteraba de por qué no avanzaba. Y va con los
   tokens --c-danger*: el rojo claro escrito a mano (#f87171) apenas se leía
   sobre el fondo claro del registro (auditoría de lanzamiento 2026-11-23,
   LZ-04; WCAG 4.1.3 y 1.4.3). */
export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)', color: 'var(--c-danger)', fontSize: 13.5, lineHeight: 1.45 }}>
      {children}
    </div>
  );
}

/** Lleva el foco al control que hay que corregir y lo marca como inválido.
 *  `selector` se busca dentro de `raiz` (el formulario del paso). */
export function enfocarCampo(raiz: HTMLElement | null, selector: string, reintento = true): void {
  const el = raiz?.querySelector<HTMLElement>(selector);
  if (!el) {
    // El campo puede aparecer con el mismo cambio de estado (la dirección
    // de la carta se abre al pedirla): se busca otra vez tras dibujar.
    if (reintento) setTimeout(() => enfocarCampo(raiz, selector, false), 0);
    return;
  }
  el.setAttribute('aria-invalid', 'true');
  el.focus();
  // Se limpia al escribir o elegir de nuevo.
  const limpiar = () => { el.removeAttribute('aria-invalid'); el.removeEventListener('input', limpiar); el.removeEventListener('change', limpiar); };
  el.addEventListener('input', limpiar);
  el.addEventListener('change', limpiar);
}

/**
 * El pie de navegación, pegado al fondo de la pantalla.
 *
 * Va sticky porque el paso del estilo es largo por naturaleza —hay 154
 * combinaciones que enseñar— y tener que bajar hasta el final para pulsar
 * «Continuar» era justo lo que se sentía pesado.
 */
export function WizardNav({
  step, lastStep, onBack, onNext, submitLabel, pendingLabel, isPending, canSubmit = true, nextLabel = 'Continuar',
}: {
  step: number;
  lastStep: number;
  onBack: () => void;
  onNext: () => void;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  canSubmit?: boolean;
  /** Texto del botón de avanzar («Ver mi carta» en el alta). */
  nextLabel?: string;
}) {
  const blocked = isPending || !canSubmit;
  const pie = useRef<HTMLDivElement>(null);

  /* El navegador no desplaza al enfocar un campo que ya se ve en parte, y
     `scroll-padding-bottom` solo cuenta cuando sí desplaza: a 390 × 844 la
     contraseña quedaba medio debajo de este pie al llegar con Tab o al
     tocarla (WEB-UX-05). Si el campo enfocado o su ayuda tocan el pie, se
     sube lo justo. */
  useEffect(() => {
    const form = pie.current?.closest('form') ?? document;
    const alEnfocar = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || pie.current?.contains(el)) return;
      // Después de pintar: la ayuda de la contraseña aparece al enfocarla.
      requestAnimationFrame(() => subirSiTapa(el));
    };
    const subirSiTapa = (el: HTMLElement) => {
      const barra = pie.current;
      if (!barra || document.activeElement !== el) return;
      const ayuda = el.getAttribute('aria-describedby');
      const abajo = Math.max(
        el.getBoundingClientRect().bottom,
        (ayuda && document.getElementById(ayuda)?.getBoundingClientRect().bottom) || 0,
      );
      const tope = barra.getBoundingClientRect().top - 12;
      if (abajo > tope) window.scrollBy({ top: abajo - tope });
    };
    form.addEventListener('focusin', alEnfocar);
    return () => form.removeEventListener('focusin', alEnfocar);
  }, []);

  return (
    <div
      ref={pie}
      /* Con `data-wizard-nav`, globals.css reserva su alto al llevar el foco
         a un campo: con Tab el campo de contraseña quedaba debajo de este
         pie (WCAG 2.4.11, auditoría 2026-11-23 WEB-04). */
      data-wizard-nav=""
      style={{
        position: 'sticky', bottom: 0, zIndex: 5,
        display: 'flex', gap: 10,
        margin: '0 -24px', padding: '14px 24px',
        // Sólido: con el degradado translúcido el campo de abajo se
        // transparentaba a medias detrás del botón.
        background: 'var(--brand-bg)',
        borderTop: '1px solid var(--u-hair)',
      }}
    >
      {step > 0 && (
        <button
          type="button"
          onClick={onBack}
          className="press"
          style={{ padding: '13px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer' }}
        >
          Atrás
        </button>
      )}
      {/* Una `key` distinta para cada botón: sin ella React reutiliza el mismo
          <button> y le cambia el `type` a «submit» en medio del clic de
          «Continuar» del penúltimo paso, y el navegador envía el formulario
          saltándose el resumen. */}
      {step < lastStep ? (
        <button
          key="continuar"
          type="button"
          onClick={onNext}
          className="press btn-accent"
          style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: 'pointer' }}
        >
          {nextLabel}
        </button>
      ) : (
        <button
          key="enviar"
          type="submit"
          disabled={blocked}
          className="press btn-accent"
          style={{ flex: 1, padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', color: '#fff', cursor: blocked ? 'not-allowed' : 'pointer', opacity: blocked ? 0.6 : 1 }}
        >
          {isPending ? pendingLabel : submitLabel}
        </button>
      )}
    </div>
  );
}

/** La dirección del menú, tal como se teclea. */
export function localSlugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
