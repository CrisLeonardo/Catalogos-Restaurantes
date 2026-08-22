'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* ============================================================
   ¿HAY ALGO QUE GUARDAR? (rediseño 2026-08-21, Fase 4)
   ------------------------------------------------------------
   El botón "Guardar" se veía igual hubieras cambiado algo o no.
   Un botón encendido es una promesa: dice "hay trabajo pendiente
   aquí". Si está encendido siempre, deja de significar nada, y
   quien no está seguro de si guardó vuelve a apretarlo por si
   acaso.

   Esto compara el formulario contra cómo estaba al abrirlo. Se
   hace sobre `FormData`, no sobre estado de React, para que
   funcione con los campos no controlados que usa medio panel
   (`defaultValue`) y con los interruptores, que viajan en un
   <input type="hidden">.

   Se escucha en el propio formulario por delegación: da igual
   cuántos campos tenga, cuáles se pinten después o cuáles sean
   componentes de terceros.
   ============================================================ */

function serialize(form: HTMLFormElement): string {
  const fd = new FormData(form);
  const pairs: string[] = [];
  for (const [k, v] of fd.entries()) {
    // Los archivos no se comparan por contenido: basta con saber si hay uno
    // elegido, que es lo que cambia respecto al estado inicial.
    pairs.push(`${k}=${v instanceof File ? (v.size ? `file:${v.name}:${v.size}` : '') : v}`);
  }
  // El orden lo fija el DOM, así que es estable entre lecturas.
  return pairs.join('&');
}

export interface FormDirty {
  /** Ref a poner en el <form>. */
  ref: React.RefObject<HTMLFormElement | null>;
  /** ¿Cambió algo desde que se abrió (o desde el último `markSaved`)? */
  dirty: boolean;
  /** Llamar tras guardar bien: lo de ahora pasa a ser el nuevo punto de partida. */
  markSaved: () => void;
}

export function useFormDirty(): FormDirty {
  const ref = useRef<HTMLFormElement | null>(null);
  const baseline = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const check = useCallback(() => {
    const form = ref.current;
    if (!form || baseline.current === null) return;
    setDirty(serialize(form) !== baseline.current);
  }, []);

  const markSaved = useCallback(() => {
    const form = ref.current;
    if (!form) return;
    baseline.current = serialize(form);
    setDirty(false);
  }, []);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    baseline.current = serialize(form);
    setDirty(false);

    // `input` cubre lo que se escribe; `change` cubre selects, checkboxes y
    // archivos. Los dos en captura: algunos componentes detienen la
    // propagación en su propia raíz.
    const onAny = () => check();
    form.addEventListener('input', onAny, true);
    form.addEventListener('change', onAny, true);
    return () => {
      form.removeEventListener('input', onAny, true);
      form.removeEventListener('change', onAny, true);
    };
  }, [check]);

  // Los interruptores (Base UI) cambian un <input type="hidden">, y a un hidden
  // el navegador no le dispara ningún evento. Se revisa después de cada render,
  // que es justo cuando ese valor pudo cambiar.
  useEffect(check);

  return { ref, dirty, markSaved };
}
