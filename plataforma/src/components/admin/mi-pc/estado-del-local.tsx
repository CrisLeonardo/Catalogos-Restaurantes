'use client';

/* ============================================================
   LA PC DEL LOCAL — el veredicto y sus cuatro piezas (ficha 2.6)
   ------------------------------------------------------------
   El dueño entra aquí a una sola cosa: saber si hoy todo va a
   imprimir. Antes la primera pantalla entera explicaba qué es la PC
   principal y el titular decía «Todo listo» con solo que la PC
   contestara, aunque la cocina no tuviera papel. Ahora arriba va lo
   primero que falla y, debajo, la PC, las dos impresoras y el
   respaldo, cada una con su arreglo al lado.

   Todo lo decide `lib/estado-pc.ts` en el servidor; aquí solo se pinta
   y se atienden «Reintentar» e «Imprimir prueba».
   ============================================================ */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { List, ListRow } from '@/components/ui/list';
import { reintentarImpresiones } from '@/lib/actions/estado-pc';
import { sendTestPrint } from '@/lib/actions/print-agent';
import s from './estado-del-local.module.css';

export type TonoPieza = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export interface PiezaDelLocal {
  key: string;
  titulo: string;
  texto: string;
  tono: TonoPieza;
  /** Reintentar lo que no salió de este papel. */
  reintentar?: 'kitchen' | 'receipt';
  /** Un enlace de arreglo (a otra parte de la página o externo). */
  enlace?: { href: string; label: string; externo?: boolean };
}

const ICONO: Record<TonoPieza, string> = { ok: 'check', warn: 'alertCircle', danger: 'alertCircle', info: 'plug', neutral: 'minus' };

export default function EstadoDelLocal({ restaurantId, veredicto, piezas, puedeProbar }: {
  restaurantId: string;
  veredicto: { titulo: string; detalle: string; tono: 'ok' | 'warn' | 'danger' | 'neutral' };
  piezas: PiezaDelLocal[];
  /** La PC contesta: una prueba saldría de verdad. */
  puedeProbar: boolean;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  function reintentar(papel: 'kitchen' | 'receipt') {
    start(async () => {
      const r = await reintentarImpresiones(restaurantId, papel);
      if ('error' in r) { setMsg({ text: r.error, bad: true }); return; }
      setMsg({ text: r.n ? `Listo: ${r.n} ${r.n === 1 ? 'papel vuelve' : 'papeles vuelven'} a la impresora.` : 'Ya no quedaba nada por mandar.' });
      router.refresh();
    });
  }

  function probar() {
    start(async () => {
      const [cocina, caja] = await Promise.all([sendTestPrint({ role: 'kitchen' }), sendTestPrint({ role: 'receipt' })]);
      const error = cocina.error ?? caja.error;
      setMsg(error
        ? { text: error, bad: true }
        : { text: 'Prueba enviada: en unos segundos sale una comanda y un recibo.' });
      router.refresh();
    });
  }

  return (
    <div className={s.estado}>
      <div className={s.veredicto} data-tono={veredicto.tono}>
        <h2>{veredicto.titulo}</h2>
        <p>{veredicto.detalle}</p>
      </div>

      <List>
        {piezas.map((p) => (
          <ListRow key={p.key}>
            <span className={s.ico} data-tono={p.tono} aria-hidden><Icon name={ICONO[p.tono]} size={15} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-adm-text">{p.titulo}</span>
              <span className="block text-[13px] text-adm-text-3">{p.texto}</span>
            </span>
            {p.reintentar && (
              <Button type="button" variant="outline" size="md" disabled={pendiente} onClick={() => reintentar(p.reintentar!)}>
                Reintentar
              </Button>
            )}
            {!p.reintentar && p.enlace && (
              <a className={s.enlace} href={p.enlace.href}
                {...(p.enlace.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {p.enlace.label}
              </a>
            )}
          </ListRow>
        ))}
      </List>

      <div className={s.acciones}>
        <Button type="button" variant="secondary" size="touch" disabled={!puedeProbar || pendiente} onClick={probar}
          title={puedeProbar ? undefined : 'La PC principal tiene que estar conectada'}>
          <Icon name="print" size={16} /> {pendiente ? 'Enviando…' : 'Imprimir prueba'}
        </Button>
        <Button render={<a href="#impresoras" />} variant="secondary" size="touch">Cambiar impresoras</Button>
      </div>
      {!puedeProbar && <p className={s.nota}>La prueba se activa cuando la PC principal está conectada.</p>}
      {msg && <p className={s.nota} role="status" data-bad={msg.bad ? '1' : undefined}>{msg.text}</p>}
    </div>
  );
}
