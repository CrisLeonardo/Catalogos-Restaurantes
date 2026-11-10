'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { guardarBorradorCaja, type AlcanceCaja, type BorradorCaja, type ConteoCaja, type TipShare } from '@/lib/actions/finanzas';

export type ConteoPantalla = Omit<ConteoCaja, 'openingFloat' | 'shiftLabel' | 'notes' | 'tips'> & {
  opening: string;
  shiftLabel: string;
  notes: string;
  tips: TipShare[] | null;
};

type CopiaLocal = { conteo: ConteoPantalla; revision: string | null };
type EstadoGuardado = { estado: 'inicial' | 'local' | 'guardando' | 'nube' | 'conflicto' | 'error'; at?: string; mensaje?: string };

export function datosConteo(conteo: ConteoPantalla): ConteoCaja {
  const { opening, ...resto } = conteo;
  return { ...resto, openingFloat: Math.max(0, Number(opening) || 0) };
}

export function useBorradorCaja({
  restaurantId, operador, turno, inicial, nube, disponible,
}: {
  restaurantId: string; operador: string; turno: AlcanceCaja; inicial: ConteoPantalla;
  nube: BorradorCaja | null; disponible: boolean;
}) {
  const clave = `leogin:caja:borrador:${restaurantId}:${operador}:${turno.desde}`;
  const [conteo, setConteo] = useState(inicial);
  const [guardado, setGuardado] = useState<EstadoGuardado>(nube ? { estado: 'nube', at: nube.savedAt } : { estado: 'inicial' });
  const [bloqueo, setBloqueo] = useState(false);
  const actual = useRef(inicial);
  const revision = useRef(nube?.revision ?? null);
  const sucio = useRef(false);
  const enviando = useRef(false);
  const conflicto = useRef(false);
  const listo = useRef(false);
  const pausado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarLocal = useCallback(() => {
    try { localStorage.setItem(clave, JSON.stringify({ conteo: actual.current, revision: revision.current })); return true; }
    catch { return false; }
  }, [clave]);

  const sincronizar = useCallback(async function guardar(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    if (conflicto.current || enviando.current || pausado.current) return false;
    if (!sucio.current) return true;
    if (!disponible || !navigator.onLine) {
      setGuardado(guardarLocal() ? { estado: 'local' } : { estado: 'error', mensaje: 'El navegador no pudo guardar este conteo.' });
      return false;
    }
    const enviado = actual.current;
    enviando.current = true;
    setBloqueo(true);
    setGuardado({ estado: 'guardando' });
    try {
      const res = await guardarBorradorCaja({
        restaurantId, turno: { desde: turno.desde, id: turno.id }, revision: revision.current, conteo: datosConteo(enviado),
      });
      if (!res.guardado) {
        conflicto.current = !!res.conflicto;
        setGuardado({ estado: res.conflicto ? 'conflicto' : 'error', mensaje: res.error });
        return false;
      }
      revision.current = res.guardado.revision;
      sucio.current = actual.current !== enviado;
      if (sucio.current) {
        guardarLocal();
        timer.current = setTimeout(() => { void guardar(); }, 700);
      } else {
        try { localStorage.removeItem(clave); } catch { /* El servidor ya confirmó. */ }
        setGuardado({ estado: 'nube', at: res.guardado.savedAt });
      }
      return true;
    } catch {
      setGuardado(guardarLocal() ? { estado: 'local' } : { estado: 'error', mensaje: 'El conteo sigue en pantalla. Guarda de nuevo.' });
      return false;
    } finally {
      enviando.current = false;
      setBloqueo(false);
    }
  }, [clave, disponible, guardarLocal, restaurantId, turno.desde, turno.id]);

  useEffect(() => {
    if (!listo.current) {
      listo.current = true;
      try {
        const raw = localStorage.getItem(clave);
        const copia = raw ? JSON.parse(raw) as CopiaLocal : null;
        if (copia?.conteo && copia.conteo.counts) {
          actual.current = copia.conteo;
          revision.current = copia.revision;
          sucio.current = true;
          setConteo(copia.conteo);
          setGuardado({ estado: 'local' });
        }
      } catch { /* Se conserva la lectura del servidor. */ }
    }
    const reintentar = () => { void sincronizar(); };
    if (sucio.current) timer.current = setTimeout(reintentar, 700);
    window.addEventListener('online', reintentar);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('online', reintentar);
    };
  }, [clave, sincronizar]);

  function cambiar(cambio: Partial<ConteoPantalla>) {
    actual.current = { ...actual.current, ...cambio };
    sucio.current = true;
    setConteo(actual.current);
    const local = guardarLocal();
    if (!conflicto.current) setGuardado(local ? { estado: 'local' } : { estado: 'error', mensaje: 'El navegador no pudo guardar este conteo.' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void sincronizar(); }, 700);
  }

  const limpiarLocal = useCallback(() => {
    try { localStorage.removeItem(clave); } catch { /* El guardado en nube sigue disponible. */ }
  }, [clave]);

  function usarNube() {
    limpiarLocal();
    window.location.reload();
  }

  const pausar = useCallback((valor: boolean) => {
    pausado.current = valor;
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { conteo, cambiar, guardado, bloqueo, sincronizar, usarNube, pausar, limpiarLocal, revision };
}
