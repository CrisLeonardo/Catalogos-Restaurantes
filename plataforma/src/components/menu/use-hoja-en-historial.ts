'use client';

import { useEffect, useRef } from 'react';

/* ============================================================
   «ATRÁS» Y ESC CIERRAN LA HOJA, NO EL MENÚ
   ------------------------------------------------------------
   Las hojas del menú (platillo, carrito, Mi cuenta, Mis puntos, Mis
   pedidos) eran estado de React y nada más: abrir una no dejaba rastro
   en el historial. En Android el gesto de «Atrás» es LA forma de cerrar
   algo, y lo que hacía era sacar al comensal del menú — si había entrado
   por un QR, de vuelta a la cámara. En PC, Esc no cerraba nada
   (auditoría de navegación 2026-10-14).

   Ahora abrir una hoja apila UNA entrada en el historial, en la misma
   URL. «Atrás» la saca y la hoja se cierra. Cerrar desde la propia hoja
   (la X, «Agregar», tocar fuera) retira esa entrada con un `back()`, así
   el historial queda igual que si nunca se hubiera abierto.

   Una sola entrada mientras haya algo abierto, no una por hoja: pasar de
   Mi cuenta a Mis puntos son pestañas, no pasos, y «Atrás» desde
   cualquiera vuelve a la carta. La entrada lleva el NOMBRE de la hoja
   (`leerHojaGuardada`) para poder reabrirla al volver de una página que
   salió desde ella —el pago desde el carrito, el seguimiento desde Mis
   pedidos—, que es donde la persona espera aterrizar.

   `pushState` sin URL lo admite el router de Next: copia su estado
   interno a la entrada nueva y al volver la trata como suya, sin recargar
   (node_modules/next/dist/docs, «Native History API»).
   ============================================================ */

const MARCA = '__leoginHoja';

/** La hoja que estaba abierta en esta entrada del historial, si la hay. */
export function leerHojaGuardada(): string | null {
  const v = (window.history.state as Record<string, unknown> | null)?.[MARCA];
  return typeof v === 'string' ? v : null;
}

/** Quita la marca de la entrada actual (la hoja ya no se puede reabrir). */
export function olvidarHojaGuardada(): void {
  if (!leerHojaGuardada()) return;
  window.history.replaceState({ ...window.history.state, [MARCA]: null }, '');
}

interface Opciones {
  /** Nombre de la hoja de arriba, o null si no hay ninguna abierta. */
  hoja: string | null;
  /** «Atrás»: la entrada era una sola, así que se cierra todo. */
  cerrarTodo: () => void;
  /** Esc: solo la de arriba, como cualquier diálogo. */
  cerrarArriba: () => void;
}

export function useHojaEnHistorial({ hoja, cerrarTodo, cerrarArriba }: Opciones) {
  const abierta = hoja !== null;

  const nombre = useRef(hoja);
  const alCerrarTodo = useRef(cerrarTodo);
  const alCerrarArriba = useRef(cerrarArriba);
  useEffect(() => {
    nombre.current = hoja;
    alCerrarTodo.current = cerrarTodo;
    alCerrarArriba.current = cerrarArriba;
  });

  /** Nuestra entrada está arriba del historial. */
  const entrada = useRef(false);
  /** Lanzamos un `back()` y su `popstate` aún no llega. */
  const retirando = useRef(false);
  /** Se abrió otra hoja mientras se retiraba la anterior: apilar al llegar. */
  const apilarAlVolver = useRef(false);
  /** Se tocó un enlace a otra página con la hoja abierta. */
  const saliendo = useRef(false);

  // El oído va montado SIEMPRE, no solo con la hoja abierta: el `popstate`
  // de un `back()` nuestro llega cuando la hoja ya se cerró.
  useEffect(() => {
    function onPop() {
      if (retirando.current) {
        retirando.current = false;
        if (apilarAlVolver.current) {
          apilarAlVolver.current = false;
          window.history.pushState({ [MARCA]: nombre.current }, '');
          entrada.current = true;
        }
        return;
      }
      if (!entrada.current) return;
      // El comensal pulsó «Atrás»: la entrada ya no está, solo queda cerrar.
      entrada.current = false;
      alCerrarTodo.current();
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!abierta) return;
    if (retirando.current) {
      // Pegado a un cierre: si se apila ahora, el `popstate` del `back()`
      // en vuelo cerraría esta hoja recién abierta.
      apilarAlVolver.current = true;
    } else {
      // Ya hay una entrada nuestra: se vuelve a la hoja desde otra página,
      // o se recargó con ella abierta. Se adopta en vez de apilar otra.
      if (!leerHojaGuardada()) window.history.pushState({ [MARCA]: nombre.current }, '');
      entrada.current = true;
    }
    /* «Ir a pagar» cierra el carrito Y navega en el mismo toque. Si al
       cerrarse se retirara la entrada, el `back()` llegaría con la ida al
       pago todavía en vuelo y Next la cancelaría: el botón no haría nada.
       Así que un enlace a OTRA página deja la entrada donde está —queda
       debajo de la página nueva, y al volver reabre el carrito—. Se mira en
       la fase de captura porque el `onClick` de la hoja la cierra antes de
       que el clic suba hasta `window`. */
    saliendo.current = false;
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const destino = new URL(a.href, window.location.href);
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      saliendo.current = true;
    }
    window.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('click', onClick, true);
      apilarAlVolver.current = false;
      if (!entrada.current) return;
      entrada.current = false;
      if (saliendo.current) { saliendo.current = false; return; }
      // Solo si la entrada de arriba sigue siendo la nuestra: si Next ya
      // apiló otra página, retroceder desharía esa navegación.
      if (leerHojaGuardada()) {
        retirando.current = true;
        window.history.back();
      }
    };
  }, [abierta]);

  // Cambiar de hoja sin cerrar (Mi cuenta → Mis puntos) reescribe el nombre:
  // así se reabre la que estaba de verdad.
  useEffect(() => {
    if (!hoja || !entrada.current) return;
    const guardada = leerHojaGuardada();
    if (guardada && guardada !== hoja) {
      window.history.replaceState({ ...window.history.state, [MARCA]: hoja }, '');
    }
  }, [hoja]);

  useEffect(() => {
    if (!abierta) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escribiendo en un campo (la nota del platillo, tus datos) Esc no
      // tira lo escrito: la misma regla que el modo servicio del panel.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      alCerrarArriba.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierta]);
}
