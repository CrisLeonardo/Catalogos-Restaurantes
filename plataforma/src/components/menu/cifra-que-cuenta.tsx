'use client';

/* ============================================================
   EL TOTAL QUE CUENTA (fase 4 de «La carta que vende», F4-5)
   ------------------------------------------------------------
   En la ficha, al elegir un extra el total del botón pasa de Q52 a
   Q62 contando en 200 ms, en vez de cambiar de golpe: así se nota
   qué movió el precio. Con «reducir movimiento», cambia al instante.
   La lectura asistida recibe solo el valor final (el botón ya lo
   anuncia); los pasos intermedios son visuales.

   PEDIDOS-01 (auditoría funcional 2026-11-25): la ficha mostró Q69.78
   mientras carrito y comanda decían Q70.00. No era un descuento: la
   cuenta se quedó a medio camino porque el navegador dejó de dar
   cuadros (pestaña en segundo plano, panel oculto). Un número de dinero
   no puede depender de la animación: si la página no está visible se
   cambia de golpe, y un temporizador fija el valor exacto pase lo que
   pase con requestAnimationFrame.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';

const DURACION_MS = 200;

export default function CifraQueCuenta({ valor, formato }: { valor: number; formato: (n: number) => string }) {
  const [mostrado, setMostrado] = useState(valor);
  const desde = useRef(valor);

  useEffect(() => {
    const inicio = desde.current;
    if (inicio === valor) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible') {
      desde.current = valor;
      setMostrado(valor);
      return;
    }
    const t0 = performance.now();
    let cuadro = 0;
    const fijar = () => {
      cancelAnimationFrame(cuadro);
      desde.current = valor;
      setMostrado(valor);
    };
    const red = setTimeout(fijar, DURACION_MS + 80);
    const paso = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / DURACION_MS));
      const suave = 1 - Math.pow(1 - p, 3);
      const actual = inicio + (valor - inicio) * suave;
      desde.current = actual;
      setMostrado(p < 1 ? Math.round(actual * 100) / 100 : valor);
      if (p < 1) cuadro = requestAnimationFrame(paso);
      else { clearTimeout(red); desde.current = valor; }
    };
    cuadro = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(cuadro); clearTimeout(red); };
  }, [valor]);

  return <>{formato(mostrado)}</>;
}
