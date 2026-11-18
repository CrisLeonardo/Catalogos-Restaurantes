'use client';

/* «Tus platillos» en Analítica (línea N, 2026-11-18): las dos listas de
   diez («Más vendidos» y «No se mueven», con ceros en rojo) pasan a una
   tarjeta con dos pestañas. «Sin pedidos» trae solo los que nadie pidió
   en el rango, y cada uno abre su ficha en Menú. */

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import s from './negocio.module.css';

export type PlatilloVendido = { name: string; qty: number };
export type PlatilloSinPedidos = { name: string; href: string };

export default function PlatillosAnalitica({
  masPedidos, sinPedidos, rango,
}: {
  masPedidos: PlatilloVendido[];
  sinPedidos: PlatilloSinPedidos[];
  /** «en estos 30 días», «del 1 al 15 nov»… */
  rango: string;
}) {
  const [vista, setVista] = useState<'mas' | 'sin'>(masPedidos.length > 0 ? 'mas' : 'sin');
  const [todos, setTodos] = useState(false);
  const lista = vista === 'mas' ? masPedidos : sinPedidos;
  const visibles = todos ? lista : lista.slice(0, 5);

  function cambiar(v: 'mas' | 'sin') { setVista(v); setTodos(false); }

  return (
    <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby="tus-platillos">
      <h2 className={s.titulo} id="tus-platillos">Tus platillos</h2>
      {sinPedidos.length > 0 && masPedidos.length > 0 && (
        <div className={s.pildoras} role="group" aria-label="Ver">
          <button type="button" className={s.pildora} aria-pressed={vista === 'mas'} onClick={() => cambiar('mas')}>Más pedidos</button>
          <button type="button" className={s.pildora} aria-pressed={vista === 'sin'} onClick={() => cambiar('sin')}>
            Sin pedidos <em>{sinPedidos.length}</em>
          </button>
        </div>
      )}

      {vista === 'mas' ? (
        <ol className={s.ranking}>
          {(visibles as PlatilloVendido[]).map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <span className={s.n}>{i + 1}</span>
              <b>{p.name}</b>
              <em aria-label={`${p.qty} pedidos`}>{p.qty.toLocaleString('es-GT')}</em>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <p className={s.vacio}>Nadie los pidió {rango}. Revisa si conviene sacarlos de la carta.</p>
          <ul className={`${s.ranking} ${s.sinNumero}`}>
            {(visibles as PlatilloSinPedidos[]).map((p) => (
              <li key={p.href}>
                <Link className={s.fila} href={p.href}>
                  <span>{p.name}</span>
                  <Icon name="chevronRight" size={16} className={s.chevron} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {lista.length > 5 && (
        <button type="button" className={s.mas} aria-expanded={todos} onClick={() => setTodos((t) => !t)}>
          {todos ? 'Ver solo cinco' : `Ver los ${lista.length}`}
        </button>
      )}
    </section>
  );
}
