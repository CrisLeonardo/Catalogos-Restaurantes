'use client';

/* ============================================================
   DEMO OPERATIVA · MOSTRADOR (Estándar) Y MESAS (Premium)
   ------------------------------------------------------------
   Maqueta aprobada por el dueño el 2026-11-25:
   docs/diseno/MAQUETA_DEMO_POR_CASO_Y_CUPO_2026-11-25.html §1.

   `demo.<dominio>/?caso=mostrador` y `?caso=mesas` abrían la misma carta
   del comensal que la demo general. Ahora enseñan lo que se compra:
     · mostrador: tomar el pedido, cobrar con cambio, cocina y cerrar caja;
     · mesas: abrir la mesa, comanda con nota, cocina, servir, dividir la
       cuenta en tres y liberar la mesa.
   Todo vive en memoria: no hay base, pedido ni caja (lib/demo-operativa).

   Colores fijos del panel de Leogin, como `PanelEnVivo`: dentro de la
   carta del restaurante esto tiene que seguir viéndose como el panel.
   ============================================================ */

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/money';
import {
  FONDO_DEMO, PASOS, billetesSugeridos, cambio, partesIguales,
  type CasoDemo, type PlatoDemo,
} from '@/lib/demo-operativa';
import s from './demo-operativa.module.css';

const dinero = (n: number) => fmtMoney(n);
const MESAS = [1, 2, 3, 4, 5, 6];
const MESA_DEMO = 4;

export function DemoOperativa({ caso, platos, cartaHref, registroHref, plan, precio }: {
  caso: CasoDemo;
  platos: PlatoDemo[];
  /** La carta del comensal y el pedido de prueba de siempre. */
  cartaHref: string;
  /** El alta con el plan y el caso ya elegidos. */
  registroHref: string;
  plan: string;
  /** «Q150 / mes», de la configuración vigente. */
  precio: string;
}) {
  const pasos = PASOS[caso];
  const [paso, setPaso] = useState(0);
  const [cuenta, setCuenta] = useState<Record<string, number>>({});
  const [sinCebolla, setSinCebolla] = useState(true);
  const [recibido, setRecibido] = useState<number | null>(null);
  const [pagadas, setPagadas] = useState<boolean[]>([false, false, false]);

  const lineas = useMemo(
    () => platos.filter((p) => (cuenta[p.id] ?? 0) > 0).map((p) => ({ ...p, cantidad: cuenta[p.id] })),
    [platos, cuenta],
  );
  const total = useMemo(() => Math.round(lineas.reduce((t, l) => t + l.precio * l.cantidad * 100, 0)) / 100, [lineas]);
  const unidades = lineas.reduce((n, l) => n + l.cantidad, 0);
  const partes = useMemo(() => partesIguales(total, 3), [total]);
  const primera = lineas[0]?.id ?? null;

  const agregar = (id: string) => setCuenta((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const quitar = (id: string) => setCuenta((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }));
  const reiniciar = () => { setPaso(0); setCuenta({}); setRecibido(null); setPagadas([false, false, false]); setSinCebolla(true); };
  /* Mostrador termina en su paso 4 (la caja cuadrada ya lleva la invitación,
     como en la maqueta); mesas, después de liberar la mesa. */
  const conInvitacion = caso === 'mostrador' ? paso >= 3 : paso >= pasos.length;
  const fin = caso === 'mesas' && paso >= pasos.length;

  /* ── Lo que dice cada paso: título, ayuda y la acción principal ── */
  const guia = (() => {
    if (caso === 'mostrador') {
      return [
        { t: 'Llega un cliente al mostrador', a: 'Toca lo que pide. Es la misma pantalla que usará tu cajero.' },
        { t: `Paga con un billete${recibido ? ` de ${dinero(recibido)}` : ''}`, a: 'Elige con cuánto paga: Leogin te dice el cambio y el cobro entra solo a la caja del turno.' },
        { t: 'Así le llega a la cocina', a: 'Pagado y en cola. Tócalo cuando esté listo para entregar.' },
        { t: 'Fin del turno: cuenta el cajón', a: `Abriste con ${dinero(FONDO_DEMO)} y entraron ${dinero(total)} en efectivo.` },
      ][Math.min(paso, 3)];
    }
    return [
      { t: `Llegan clientes: abre la Mesa ${MESA_DEMO}`, a: 'El salón de un vistazo: qué mesa está libre y cuál espera.' },
      { t: 'Toma la comanda', a: 'Toca lo que piden. La nota del platillo viaja con él hasta la cocina.' },
      { t: 'Así le llega a la cocina', a: 'Con la mesa y la nota. Cocina lo marca listo desde su pantalla.' },
      { t: 'Listo para servir', a: 'El mesero sabe qué llevar a cuál mesa sin preguntar.' },
      { t: 'Piden la cuenta en tres', a: 'Leogin la divide exacta, al centavo. Cobra cada parte.' },
      { t: `Mesa ${MESA_DEMO} pagada`, a: 'Libérala para el siguiente cliente.' },
    ][Math.min(paso, 5)];
  })();

  return (
    <div className={s.demo}>
      <div className={s.cinta}>
        <span>Demo {caso === 'mostrador' ? 'de mostrador' : 'de mesas'} · nada se guarda</span>
        <a href={cartaHref}>Ver la carta del cliente</a>
      </div>

      <div className={s.cuerpo}>
        <aside className={s.lado} aria-label="Pasos de la demo">
          <div className={s.ladoTitulo}>{caso === 'mostrador' ? 'Así se atiende en mostrador' : 'Así se atiende una mesa'}</div>
          <ol className={s.lista}>
            {pasos.map((t, i) => (
              <li key={t} data-estado={i < paso || fin ? 'hecho' : i === paso ? 'actual' : undefined} aria-current={i === paso && !fin ? 'step' : undefined}>
                <i aria-hidden>{i < paso || fin ? '✓' : i + 1}</i>{t}
              </li>
            ))}
          </ol>
          <p className={s.nota}>Unos 2 minutos, con la carta de Rincón 502.</p>
          <p className={s.nota} style={{ marginTop: 'auto' }}>{plan}{precio ? ` · ${precio}` : ''}</p>
        </aside>

        <main className={s.principal}>
          <div className={s.progreso} aria-hidden>
            {pasos.map((t, i) => <i key={t} data-on={i <= paso || fin ? '1' : undefined} />)}
          </div>

          {!fin && (
            <div className={s.guia} aria-live="polite">
              <small>Paso {paso + 1} de {pasos.length}</small>
              <h1>{guia.t}</h1>
              <p>{guia.a}</p>
            </div>
          )}

          {/* ── Elegir platillos (mostrador 1 · mesas 2) ── */}
          {((caso === 'mostrador' && paso === 0) || (caso === 'mesas' && paso === 1)) && (
            <div className={s.rejilla}>
              {platos.map((p) => {
                const n = cuenta[p.id] ?? 0;
                return (
                  <button key={p.id} type="button" className={s.plato} data-sel={n > 0 ? '1' : undefined}
                    onClick={() => agregar(p.id)} aria-label={`Agregar ${p.nombre}, ${dinero(p.precio)}${n ? `. Van ${n}` : ''}`}>
                    <b>{p.nombre}</b>
                    <span>{dinero(p.precio)}</span>
                    {n > 0 && <em aria-hidden>{n}</em>}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Mesas 1: el salón ── */}
          {caso === 'mesas' && paso === 0 && (
            <div className={s.salon}>
              {MESAS.map((m) => (
                <button key={m} type="button" className={s.mesa} data-sel={m === MESA_DEMO ? '1' : undefined}
                  disabled={m !== MESA_DEMO} onClick={() => setPaso(1)}>
                  <b>Mesa {m}</b>
                  <span>{m === 2 || m === 5 ? 'Ocupada' : 'Libre'}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Mostrador 2: cobrar ── */}
          {caso === 'mostrador' && paso === 1 && (
            <div className={s.cuadro}>
              <div className={s.fila}><span>Total</span><b>{dinero(total)}</b></div>
              <div className={s.billetes} role="radiogroup" aria-label="Con cuánto paga">
                {billetesSugeridos(total).map((b) => (
                  <button key={b} type="button" role="radio" aria-checked={recibido === b} data-sel={recibido === b ? '1' : undefined}
                    onClick={() => setRecibido(b)}>{dinero(b)}</button>
                ))}
              </div>
              {recibido != null && (
                <div className={s.fila}><span>Cambio</span><b data-tono="ok">{dinero(cambio(total, recibido) ?? 0)}</b></div>
              )}
              <p className={s.nota}>Tarjeta y transferencia también se eligen aquí mismo.</p>
            </div>
          )}

          {/* ── Comanda en cocina (mostrador 3 · mesas 3 y 4) ── */}
          {((caso === 'mostrador' && paso === 2) || (caso === 'mesas' && (paso === 2 || paso === 3))) && (
            <div className={s.comanda} data-listo={caso === 'mesas' && paso === 3 ? '1' : undefined}>
              <div className={s.comandaCab}>
                <span className={s.pill} data-tono={caso === 'mesas' && paso === 3 ? 'ok' : undefined}>
                  {caso === 'mesas' && paso === 3 ? 'LISTO' : 'EN COCINA'}
                </span>
                <span>#121 · hace 1 min</span>
              </div>
              <div className={s.comandaTitulo}>{caso === 'mostrador' ? 'Para llevar · pagado' : `Mesa ${MESA_DEMO}`}</div>
              <ul>
                {lineas.map((l) => (
                  <li key={l.id}>
                    <b>{l.cantidad}×</b> {l.nombre}
                    {caso === 'mesas' && l.id === primera && sinCebolla && <small>Sin cebolla</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Mesas 5: dividir ── */}
          {caso === 'mesas' && paso === 4 && (
            <div className={s.cuadro}>
              <div className={s.fila}><span>Consumo de la Mesa {MESA_DEMO}</span><b>{dinero(total)}</b></div>
              {partes.map((p, i) => (
                <div key={i} className={s.fila}>
                  <span>Persona {i + 1}</span>
                  {pagadas[i]
                    ? <b data-tono="ok">✓ {dinero(p)}</b>
                    : <button type="button" className={s.boton2} onClick={() => setPagadas((x) => x.map((v, j) => (j === i ? true : v)))}>Cobrar {dinero(p)}</button>}
                </div>
              ))}
              <div className={s.fila}><span>Saldo</span><b>{dinero(partes.reduce((t, p, i) => (pagadas[i] ? t : t + p), 0))}</b></div>
            </div>
          )}

          {/* ── Cierre: caja (mostrador 4) ── */}
          {caso === 'mostrador' && paso === 3 && (
            <>
              <div className={s.cuadro}>
                <div className={s.fila}><span>Fondo inicial</span><b>{dinero(FONDO_DEMO)}</b></div>
                <div className={s.fila}><span>Cobrado en efectivo</span><b>{dinero(total)}</b></div>
                <hr />
                <div className={s.fila}><span>Debe haber</span><b>{dinero(FONDO_DEMO + total)}</b></div>
                <div className={s.fila}><span>Contaste</span><b>{dinero(FONDO_DEMO + total)}</b></div>
              </div>
              <div className={s.aviso} role="status">✓ Caja cuadrada · el dueño lo ve desde su teléfono</div>
            </>
          )}

          {/* ── Mesas 6 ── */}
          {caso === 'mesas' && paso === 5 && (
            <div className={s.aviso} role="status">✓ Consumo {dinero(total)} · pagado {dinero(total)} · saldo {dinero(0)}</div>
          )}

          {fin && (
            <div className={s.guia} aria-live="polite">
              <small>Listo</small>
              <h1>Mesa {MESA_DEMO} libre para el siguiente cliente</h1>
              <p>Comanda con nota, cocina, cuenta dividida al centavo y la mesa liberada.</p>
            </div>
          )}
        </main>

        {/* ── El pedido y la acción principal (al lado en PC, abajo en el teléfono) ── */}
        <div className={s.pie}>
          {lineas.length > 0 && !fin && (paso <= 1 || (caso === 'mesas' && paso <= 4)) && (
            <ul className={s.pedido} aria-label="Pedido">
              {lineas.map((l) => (
                <li key={l.id}>
                  <span>{l.cantidad}× {l.nombre}</span>
                  <span>{dinero(l.precio * l.cantidad)}</span>
                  {((caso === 'mostrador' && paso === 0) || (caso === 'mesas' && paso === 1)) && (
                    <button type="button" aria-label={`Quitar uno de ${l.nombre}`} onClick={() => quitar(l.id)}>−</button>
                  )}
                </li>
              ))}
              {caso === 'mesas' && paso === 1 && primera && (
                <li>
                  <button type="button" className={s.notaBtn} aria-pressed={sinCebolla} onClick={() => setSinCebolla((v) => !v)}>
                    {sinCebolla ? '✓ ' : '+ '}Nota «sin cebolla» en {lineas[0].nombre}
                  </button>
                </li>
              )}
            </ul>
          )}

          {!fin && caso === 'mostrador' && paso === 0 && (
            <>
              {total > 0 && <div className={s.total}><span>{unidades} {unidades === 1 ? 'platillo' : 'platillos'} · para llevar</span><b>{dinero(total)}</b></div>}
              <button type="button" className={s.boton} disabled={total <= 0} onClick={() => setPaso(1)}>
                {total > 0 ? `Cobrar ${dinero(total)}` : 'Toca un platillo para empezar'}
              </button>
            </>
          )}
          {!fin && caso === 'mostrador' && paso === 1 && (
            <button type="button" className={s.boton} disabled={recibido == null} onClick={() => setPaso(2)}>
              {recibido == null ? 'Elige con cuánto paga' : 'Cobrar y enviar a cocina'}
            </button>
          )}
          {!fin && caso === 'mostrador' && paso === 2 && (
            <button type="button" className={s.boton} onClick={() => setPaso(3)}>Marcar listo</button>
          )}

          {!fin && caso === 'mesas' && paso === 1 && (
            <>
              {total > 0 && <div className={s.total}><span>Mesa {MESA_DEMO} · {unidades} {unidades === 1 ? 'platillo' : 'platillos'}</span><b>{dinero(total)}</b></div>}
              <button type="button" className={s.boton} disabled={total <= 0} onClick={() => setPaso(2)}>
                {total > 0 ? 'Enviar a cocina' : 'Toca un platillo para empezar'}
              </button>
            </>
          )}
          {!fin && caso === 'mesas' && paso === 2 && (
            <button type="button" className={s.boton} onClick={() => setPaso(3)}>Marcar listo (cocina)</button>
          )}
          {!fin && caso === 'mesas' && paso === 3 && (
            <button type="button" className={s.boton} onClick={() => setPaso(4)}>Marcar servido</button>
          )}
          {!fin && caso === 'mesas' && paso === 4 && (
            <button type="button" className={s.boton} disabled={!pagadas.every(Boolean)} onClick={() => setPaso(5)}>
              {pagadas.every(Boolean) ? 'Siguiente: liberar la mesa' : 'Cobra las tres partes'}
            </button>
          )}
          {!fin && caso === 'mesas' && paso === 5 && (
            <button type="button" className={s.boton} onClick={() => setPaso(6)}>Liberar la Mesa {MESA_DEMO}</button>
          )}

          {conInvitacion && (
            <>
              <a className={s.boton} href={registroHref}>Empezar con {plan}{precio ? ` · ${precio}` : ''}</a>
              <button type="button" className={s.botonSec} onClick={reiniciar}>Volver a empezar la demo</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
