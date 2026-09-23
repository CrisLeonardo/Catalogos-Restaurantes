'use client';

/* Las piezas pequeñas del módulo de servicio.
   ------------------------------------------------------------------
   Viven aquí por el mismo motivo de siempre: el chip de estado de una
   mesa lo pintan el riel, la rejilla, el plano, las pestañas de arriba
   y la paleta de comandos. Cinco copias del mismo chip es cómo se llega
   a que cuatro digan «Por cobrar» y una diga «Listo».

   Nada de esto lleva estilos en línea de color: todo sale de las clases
   `.sv-*` de globals.css, que son las que saben leer los tokens del
   sistema en tema claro y en oscuro. El prototipo del handoff traía los
   colores incrustados y en oscuro dejaba texto negro sobre negro. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { ESTADO_LABEL, ATENCION_LABEL, type EstadoServicio, type AtencionServicio } from '@/lib/servicio/estado';

/* ── Cifras ────────────────────────────────────────────────────
   Precios, cantidades y atajos van en monoespaciada: es lo que hace
   que una columna de importes se lea como una columna y no como texto
   con números dentro. */
export function Mono({ children, size = 13, weight = 600, color, className }: {
  children: ReactNode; size?: number; weight?: number; color?: string; className?: string;
}) {
  return (
    <span
      className={className}
      style={{ fontFamily: 'var(--ui-font-mono)', fontSize: size, fontWeight: weight, color }}
    >
      {children}
    </span>
  );
}

/** El rótulo de una sección, en versalitas de 11 px. */
export function Kicker({ children, tone, rule = false, aside }: {
  children: ReactNode;
  tone?: 'warn' | 'info' | 'accent';
  /** La línea fina que cierra el rótulo hasta el borde. */
  rule?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="sv-kicker" data-tone={tone}>
      <span>{children}</span>
      {aside}
      {rule && <span className="sv-rule" />}
    </div>
  );
}

/** El chip de estado de una mesa. El color ES el dato. */
export function ChipEstado({ estado, big = false }: { estado: EstadoServicio; big?: boolean }) {
  return (
    <span className="sv-chip" data-st={estado} data-big={big ? '1' : '0'}>
      {ESTADO_LABEL[estado]}
    </span>
  );
}

/**
 * «Alguien levantó la mano».
 *
 * Va ENCIMA del estado y nunca en su lugar: el color de la mesa dice en
 * qué va la comida, y esto dice que hay una persona esperando. Si una
 * cosa tapara a la otra volveríamos al problema que el diseño original
 * tenía —una mesa que pidió la cuenta se veía igual que una que no—.
 */
export function ChipMano({ atencion, corto = false }: { atencion: Exclude<AtencionServicio, null>; corto?: boolean }) {
  return (
    <span className="sv-mano">
      <Icon name={atencion === 'cuenta' ? 'receipt' : 'bellRing'} size={12} />
      {corto ? (atencion === 'cuenta' ? 'Cuenta' : 'Llaman') : ATENCION_LABEL[atencion]}
    </span>
  );
}

/** Una píldora de filtro o de categoría. */
export function Pill({ on, onClick, children, count }: {
  on: boolean; onClick: () => void; children: ReactNode; count?: number;
}) {
  return (
    <button type="button" className="sv-pill" data-on={on ? '1' : '0'} onClick={onClick} aria-pressed={on}>
      {children}
      {count != null && count > 0 && <span className="sv-pill-count">{count}</span>}
    </button>
  );
}

/** Botón fantasma de barra: buscar, modo aprendiz, cambiar de vista. */
export function Ghost({ onClick, children, icon, on, title, soloIcono = false, disabled }: {
  onClick: () => void; children?: ReactNode; icon?: IconName; on?: boolean;
  title?: string; soloIcono?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sv-ghost"
      data-on={on ? '1' : '0'}
      data-icon={soloIcono ? '1' : '0'}
      onClick={onClick}
      title={title}
      aria-label={soloIcono ? title : undefined}
      aria-pressed={on}
      disabled={disabled}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
    </button>
  );
}

/** La tecla de un atajo, dicha en el propio botón. */
export function Key({ children }: { children: ReactNode }) {
  return <span className="sv-kbd">{children}</span>;
}

/**
 * Cómo se llama la tecla modificadora en ESTE teclado: «⌘» en un Mac y
 * «Ctrl» en todo lo demás.
 *
 * Las pistas decían «⌘K» y «⌘⏎» en todas partes, y los locales trabajan
 * con PCs Windows: una tecla que no existe en el teclado que se tiene
 * delante no es una pista. El propio buscador del panel ya decía «Ctrl K»
 * en la misma pantalla. Arranca en «Ctrl» y se corrige al montar: las
 * pistas solo se pintan con teclado de verdad, que también se sabe al
 * montar, así que el HTML del servidor nunca las lleva.
 */
export function useTeclaMod(): string {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    const plataforma = (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? '';
    if (/mac|iphone|ipad|ipod/i.test(plataforma)) setMod('⌘');
  }, []);
  return mod;
}

/** «Ctrl K» / «⌘K»: con Ctrl va separado, con el símbolo va pegado. */
export function atajo(mod: string, tecla: string): string {
  return mod === '⌘' ? `⌘${tecla}` : `${mod} ${tecla}`;
}

/* ── Hojas ────────────────────────────────────────────────────── */

/**
 * El armazón de toda hoja del módulo.
 *
 * Se encarga de las tres cosas que ninguna hoja debería tener que volver
 * a escribir: Escape cierra, el toque en el velo cierra, y el foco se
 * queda dentro mientras esté abierta. La animación sube desde abajo en el
 * teléfono y aparece centrada en pantalla grande, que es lo que el
 * handoff pide.
 */
export function Hoja({ onClose, children, label }: {
  onClose: () => void; children: ReactNode; label: string;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      /* En captura, y parando la propagación: si no, el mismo Escape lo
         atiende además el buscador de la carta (que se vacía) y la
         paleta. Una tecla, una consecuencia. */
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /* El foco entra en la hoja al abrirse. Sin esto, quien navega con
     teclado sigue en el botón de detrás y el tabulador recorre la
     pantalla tapada. */
  useEffect(() => {
    const primero = panel.current?.querySelector<HTMLElement>(
      'input, textarea, button:not([data-noautofocus])',
    );
    // En táctil NO se enfoca un campo de texto: levantaría el teclado y
    // taparía media hoja antes de que nadie pidiera escribir nada.
    const tactil = window.matchMedia('(pointer: coarse)').matches;
    if (primero && !(tactil && /INPUT|TEXTAREA/.test(primero.tagName))) primero.focus();
  }, []);

  return (
    <div className="sv-scrim" onClick={onClose}>
      <div
        ref={panel}
        className="sv-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** La cabecera de una hoja: título, subtítulo y la ✕. */
export function HojaHead({ title, sub, total, onClose }: {
  title: ReactNode; sub?: ReactNode; total?: ReactNode; onClose: () => void;
}) {
  return (
    <div className="sv-sheet-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sv-sheet-title">{title}</div>
        {sub && <div className="sv-sheet-sub">{sub}</div>}
        {total && <div className="sv-sheet-total">{total}</div>}
      </div>
      <button type="button" className="sv-x" onClick={onClose} aria-label="Cerrar" data-noautofocus>
        <Icon name="x" size={17} />
      </button>
    </div>
  );
}

/** Un grupo de la hoja: rótulo arriba, contenido debajo. */
export function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
  );
}

/* ── El acuse de recibo ───────────────────────────────────────── */

export interface Aviso {
  text: string;
  bad?: boolean;
  /** Lo que se acaba de hacer se puede deshacer: el botón vive AQUÍ. */
  undo?: () => void;
  undoLabel?: string;
}

/**
 * El acuse de recibo de lo que se acaba de hacer.
 *
 * Dura 1,9 s como pide el handoff, salvo dos casos: si trae «deshacer»
 * aguanta nueve segundos —que es lo que se tarda en LEER que uno se
 * equivocó de mesa— y si es un error, siete. Un aviso que se va antes de
 * poder leerlo es lo mismo que no avisar.
 */
export function Toast({ aviso, onClose }: { aviso: Aviso; onClose: () => void }) {
  useEffect(() => {
    const ms = aviso.undo ? 9000 : aviso.bad ? 7000 : 1900;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [aviso, onClose]);

  /* En el teléfono el módulo tiene una barra propia a pie de pantalla
     (resumen + «Enviar a cocina»), y el aviso anclado a una altura fija
     caía encima del resumen. Se mide esa barra y el aviso se posa justo
     por encima. Vive 2 s: con medirla al aparecer basta. En pantalla
     grande la barra está en la columna de la derecha y no estorba. */
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const pie = document.querySelector<HTMLElement>('.sv-m-foot, .sv-pane > .sv-foot');
    const r = pie?.getBoundingClientRect();
    setBottom(r && r.height > 0 ? Math.max(0, window.innerHeight - r.top) + 12 : null);
  }, [aviso]);

  return (
    <div
      className="sv-toast"
      data-bad={aviso.bad ? '1' : '0'}
      role="status"
      aria-live="polite"
      style={bottom != null ? { bottom } : undefined}
    >
      <span>{aviso.text}</span>
      {aviso.undo && (
        <button
          type="button"
          className="sv-toast-undo"
          onClick={() => { aviso.undo?.(); onClose(); }}
        >
          {aviso.undoLabel ?? 'Deshacer'}
        </button>
      )}
    </div>
  );
}

/* ── El reloj del salón ───────────────────────────────────────── */

/**
 * `Date.now()` que empieza en `null`.
 *
 * Los minutos de una mesa dependen de la hora del cliente. Si el primer
 * render los pintara, el HTML del servidor y el del navegador no
 * coincidirían y React se quejaría. Arranca en null —sin relojes— y
 * entra en cuanto el componente vive.
 */
export function useReloj(cadaMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return now;
}
