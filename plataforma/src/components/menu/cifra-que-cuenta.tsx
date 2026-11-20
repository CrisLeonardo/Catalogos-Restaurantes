'use client';

/* ============================================================
   EL TOTAL QUE CUENTA (fase 4 de «La carta que vende», F4-5)
   ------------------------------------------------------------
   En la ficha, al elegir un extra el total del botón pasa de Q52 a
   Q62 contando en 200 ms, en vez de cambiar de golpe: así se nota
   qué movió el precio. Con «reducir movimiento», cambia al instante.
   La lectura asistida recibe solo el valor final (el botón ya lo
   anuncia); los pasos intermedios son visuales.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';

const DURACION_MS = 200;

export default function CifraQueCuenta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      desde.current = valor;
      setMostrado(valor);
      return;
    }
    const t0 = performance.now();
    let cuadro = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / DURACION_MS);
      const suave = 1 - Math.pow(1 - p, 3);
      const actual = inicio + (valor - inicio) * suave;
      desde.current = actual;
      setMostrado(p < 1 ? Math.round(actual * 100) / 100 : valor);
      if (p < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);

  return <>{formato(mostrado)}</>;
}
