'use client';

/* Tarjetas de Finanzas que cambian al tocarlas (línea N, 2026-11-18).
   «De dónde vino»: canal, pago y zona eran tres tarjetas; ahora una con
   tres pestañas. «Lo que más vendiste»: cinco a la vista y el resto si
   se pide; «Por ganancia» solo existe cuando hay costos. */

import { useState } from 'react';
import { fmtMoney } from '@/lib/money';
import s from './negocio.module.css';

export type FilaReparto = { key: string; label: string; orders: number; revenue: number };
export type FilaProducto = { name: string; qty: number; revenue: number; profit: number };

type Vista = 'canal' | 'pago' | 'zona';

const pedidos = (n: number) => (n === 1 ? '1 pedido' : `${n.toLocaleString('es-GT')} pedidos`);
const pct = (parte: number, total: number) => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '');

export function DeDondeVino({
  canal, pago, zona, total, totalDomicilio,
}: {
  canal: FilaReparto[];
  pago: FilaReparto[];
  zona: FilaReparto[];
  /** Ingreso del rango: base del porcentaje de canal y pago. */
  total: number;
  /** Lo vendido a domicilio: base del porcentaje por zona. */
  totalDomicilio: number;
}) {
  const vistas: { valor: Vista; texto: string }[] = [
    { valor: 'canal', texto: 'Canal' },
    { valor: 'pago', texto: 'Pago' },
    ...(zona.length > 0 ? [{ valor: 'zona' as const, texto: 'Zona' }] : []),
  ];
  const [vista, setVista] = useState<Vista>('canal');

  let filas = vista === 'canal' ? canal : vista === 'pago' ? pago : zona;
  const base = vista === 'zona' ? totalDomicilio : total;
  if (vista === 'zona') {
    const conZona = zona.reduce((a, z) => a + z.revenue, 0);
    const resto = Math.round((totalDomicilio - conZona) * 100) / 100;
    if (resto > 0.5) filas = [...zona, { key: '__sin_zona', label: 'Sin zona anotada', orders: -1, revenue: resto }];
  }
  const max = Math.max(...filas.map((f) => f.revenue), 1);

  return (
    <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="de-donde-vino">
      <h2 className={s.titulo} id="de-donde-vino">De dónde vino</h2>
      <div className={s.segmentos} role="group" aria-label="Ver por">
        {vistas.map((v) => (
          <button key={v.valor} type="button" className={s.segmento} aria-pressed={vista === v.valor} onClick={() => setVista(v.valor)}>
            {v.texto}
          </button>
        ))}
      </div>
      {filas.length === 0 ? (
        <p className={s.vacio}>Nada que repartir en estas fechas.</p>
      ) : (
        <ul className={s.reparto}>
          {filas.map((f) => (
            <li key={f.key}>
              <b>{f.label}</b>
              <em>{fmtMoney(f.revenue)}</em>
              <span>{f.orders >= 0 ? pedidos(f.orders) : 'sin zona elegida al pedir'}</span>
              <small>{pct(f.revenue, base)}</small>
              <span className={s.medida} aria-hidden><i style={{ width: `${(f.revenue / max) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
      {vista === 'zona' && <p className={s.nota} style={{ padding: '2px 0 8px' }}>El porcentaje es sobre lo que vendiste a domicilio.</p>}
    </section>
  );
}

const unidades = (n: number) => (n === 1 ? '1 unidad' : `${n.toLocaleString('es-GT')} unidades`);

export function LoMasVendido({ porIngreso, porGanancia }: { porIngreso: FilaProducto[]; porGanancia: FilaProducto[] }) {
  const [orden, setOrden] = useState<'ingreso' | 'ganancia'>('ingreso');
  const [todos, setTodos] = useState(false);
  const lista = orden === 'ingreso' ? porIngreso : porGanancia;
  const vista = todos ? lista : lista.slice(0, 5);

  return (
    <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="lo-mas-vendido">
      <h2 className={s.titulo} id="lo-mas-vendido">
        Lo que más vendiste
        {porGanancia.length === 0 && <span>por ingreso</span>}
      </h2>
      {porGanancia.length > 0 && (
        <div className={s.pildoras} role="group" aria-label="Ordenar">
          <button type="button" className={s.pildora} aria-pressed={orden === 'ingreso'} onClick={() => { setOrden('ingreso'); setTodos(false); }}>Por ingreso</button>
          <button type="button" className={s.pildora} aria-pressed={orden === 'ganancia'} onClick={() => { setOrden('ganancia'); setTodos(false); }}>Por ganancia</button>
        </div>
      )}
      <ol className={s.ranking}>
        {vista.map((p, i) => (
          <li key={`${p.name}-${i}`}>
            <span className={s.n}>{i + 1}</span>
            <b>{p.name}<small>{unidades(p.qty)}</small></b>
            <em>{fmtMoney(orden === 'ingreso' ? p.revenue : p.profit)}</em>
          </li>
        ))}
      </ol>
      {lista.length > 5 && (
        <button type="button" className={s.mas} aria-expanded={todos} onClick={() => setTodos((t) => !t)}>
          {todos ? 'Ver solo cinco' : `Ver los ${lista.length}`}
        </button>
      )}
    </section>
  );
}
