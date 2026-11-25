'use client';

/* ============================================================
   CUPO DE ESTA TANDA (maqueta MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25 §2)
   ------------------------------------------------------------
   Quien vende por tandas o ediciones dice cuántas hay de una pieza: al
   venderse todas queda agotada sola, y la Vitrina enseña «Quedan 4 de 30».
   Va en todos los planes (decisión del dueño, 2026-11-25) y es el mismo
   conteo de existencias de Inventario: con Inventario encendido, la ficha
   solo muestra las existencias y manda allá, para que no haya dos lugares
   donde editar lo mismo.

   Se guarda aparte del formulario del platillo, con su propio botón: es
   una acción de existencias (queda en el historial), no un dato de la ficha.
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import PanelLink from '@/components/admin/panel-link';
import { fijarCupo } from '@/lib/actions/inventory';
import s from './cupo-tanda.module.css';

const MAX = 9999;
/* Vive dentro del <form> del platillo, pero no es parte de él: se guarda
   con su propio botón. Apuntar sus campos a un formulario que no existe
   los saca del FormData, y «Guardar cambios» no los cuenta como pendientes. */
const FUERA = 'cupo-tanda-aparte';

export default function CupoTanda({
  restaurantId, productId, contando, quedan, cupo, inventarioActivo,
}: {
  restaurantId: string;
  productId: string;
  /** El platillo ya cuenta existencias. */
  contando: boolean;
  /** Existencias actuales (null si no cuenta). */
  quedan: number | null;
  /** El cupo de la tanda vigente (saldo del último conteo). */
  cupo: number | null;
  /** Inventario (Premium) encendido: las existencias se llevan allá. */
  inventarioActivo: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [poniendo, setPoniendo] = useState(false);
  const base = cupo ?? quedan ?? 20;
  const [valor, setValor] = useState<number>(Math.max(1, Math.min(MAX, base)));

  if (inventarioActivo) {
    return (
      <div className={s.bloque}>
        <div className={s.titulo}>{contando ? `Existencias: ${quedan ?? 0}` : 'Sin control de existencias'}</div>
        <p className={s.nota}>
          {contando ? 'Las llevas en Inventario, con entradas, mermas y costo.' : 'Para ponerle un límite, activa su control en Inventario.'}{' '}
          <PanelLink href="/admin/inventario" className={s.enlace}>Abrir Inventario</PanelLink>
        </p>
      </div>
    );
  }

  const conCupo = contando || poniendo;
  const vendidas = contando && cupo != null && quedan != null ? Math.max(0, cupo - quedan) : null;
  /* «Empezar tanda de N» cuando N no es lo que ya queda: con 4 de 30 se
     ofrece repetir la tanda de 30; fijar lo mismo no haría nada (la base no
     registra un ajuste sin cambio). */
  const cambio = !contando || valor !== quedan;

  function guardar(nuevo: number | null) {
    setError(null);
    iniciar(async () => {
      const res = await fijarCupo(restaurantId, productId, nuevo);
      if (res.error) { setError(res.error); return; }
      setPoniendo(false);
      router.refresh();
    });
  }

  const ajustar = (n: number) => setValor(Math.max(1, Math.min(MAX, Math.trunc(n) || 1)));

  return (
    <div className={s.bloque}>
      <div>
        <div id="cupo-titulo" className={s.titulo}>Cupo de esta tanda</div>
        <p className={s.nota}>¿Cuántas preparas? Al venderse todas, se agota sola.</p>
      </div>

      {!contando && (
        <div className={s.opciones} role="radiogroup" aria-labelledby="cupo-titulo">
          <label className={s.op} data-sel={!poniendo ? '1' : undefined}>
            <input type="radio" name="cupo-modo" form={FUERA} checked={!poniendo} onChange={() => setPoniendo(false)} />
            Sin límite
          </label>
          <label className={s.op} data-sel={poniendo ? '1' : undefined}>
            <input type="radio" name="cupo-modo" form={FUERA} checked={poniendo} onChange={() => setPoniendo(true)} />
            Poner cupo
          </label>
        </div>
      )}

      {conCupo && (
        <>
          <div className={s.fila}>
            <div className={s.paso} role="group" aria-label="Cupo de esta tanda">
              <button type="button" aria-label="Uno menos" onClick={() => ajustar(valor - 1)} disabled={pendiente || valor <= 1}>−</button>
              <input
                type="number" inputMode="numeric" min={1} max={MAX} value={valor} aria-label="Cupo" form={FUERA}
                onChange={(e) => ajustar(Number(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              />
              <button type="button" aria-label="Uno más" onClick={() => ajustar(valor + 1)} disabled={pendiente || valor >= MAX}>+</button>
            </div>
            {contando && (
              <button type="button" className={s.enlace} onClick={() => guardar(null)} disabled={pendiente}>Quitar cupo</button>
            )}
          </div>

          {contando && quedan != null && (
            <div className={s.estado} data-tono={quedan === 0 ? 'agotado' : quedan <= 5 ? 'pocas' : undefined} role="status">
              {quedan === 0 ? 'Se vendieron todas: está agotada' : `Quedan ${quedan}`}
              {vendidas != null && vendidas > 0 ? ` · vendidas ${vendidas} desde que pusiste el cupo` : ''}
            </div>
          )}

          {cambio && (
            <div className={s.fila}>
              <Button type="button" size="touch" onClick={() => guardar(valor)} disabled={pendiente}>
                {pendiente ? 'Guardando…' : contando ? `Empezar tanda de ${valor}` : `Poner cupo de ${valor}`}
              </Button>
            </div>
          )}
          <p className={s.nota}>
            {contando
              ? 'Para otra tanda, cambia el número: las disponibles pasan a ser esas. Con «Avisar cuando quedan pocas» (Personalizar), la carta enseña cuántas quedan.'
              : 'Al llegar a 0 se marca agotada. Con «Avisar cuando quedan pocas» (Personalizar), la carta enseña cuántas quedan.'}
          </p>
        </>
      )}

      {error && <p role="alert" className={s.error}>{error}</p>}
    </div>
  );
}
