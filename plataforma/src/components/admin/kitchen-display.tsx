'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { syncRealtimeAuth } from '@/lib/supabase/realtime-auth';
import { transicionCocina, reimprimirCopiaCocina, type AccionCocina } from '@/lib/actions/cocina';
import { isAudioUnlocked, loadSoundSettings, playKitchenSound, playWaiterSound, primeAudio } from '@/lib/sounds';
import { remainingQuantity, type OrderWithItems } from '@/lib/db/orders';
import type { FalloDeImpresion } from '@/lib/db/print-stations';
import { etiquetaDeMesa } from '@/lib/mesa';
import { shortOrderNumber } from '@/lib/order-number';
import { useServiceMode } from '@/components/admin/service-mode';
import {
  PASE, GENERAL, etapaDe, estacionDe, lineasVivas, ultimaAnulacion, opcionesDe, alergenosDe,
  agruparPreparaciones, type Etapa, type EstacionCocina,
} from '@/lib/cocina/tablero';
import styles from './kitchen-display.module.css';

type Props = {
  restaurantId: string;
  initialOrders: OrderWithItems[];
  estaciones: EstacionCocina[];
  fallos: Record<string, FalloDeImpresion[]>;
  rondas: Record<string, number>;
  yellowMin: number;
  redMin: number;
  confirmFirst: boolean;
  scheme: 'light' | 'dark';
};

const etapas = { todas: 'Todas', espera: 'Por aceptar', preparacion: 'En preparación', pase: 'Listas para salir' } as const;
type Filtro = keyof typeof etapas;
type Comando = {
  pedido: OrderWithItems; accion: AccionCocina; lineas?: string[]; marca?: string | null;
};
type Aviso = { texto: string; error?: boolean; deshacer?: Comando };
type Copia = { pedido: OrderWithItems; fallo: FalloDeImpresion };

function minutos(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 172_800) return Math.floor(s / 86_400) + ' días';
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0');
}

const Reloj = memo(function Reloj({ desde, etapa, amarillo, rojo }: {
  desde: string | null; etapa: Etapa; amarillo: number; rojo: number;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    if (!desde) return;
    const primero = setTimeout(() => setAhora(Date.now()), 0);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearTimeout(primero); clearInterval(reloj); };
  }, [desde]);
  const transcurrido = ahora !== null && desde ? ahora - Date.parse(desde) : null;
  const tono = etapa === 'pase' ? 'ok' : transcurrido !== null && transcurrido >= rojo * 60_000
    ? 'alerta' : transcurrido !== null && transcurrido >= amarillo * 60_000 ? 'aviso' : undefined;
  const nombre = etapa === 'pase' ? 'Esperando salida' : etapa === 'espera' ? 'Desde el pedido' : 'En preparación';
  return (
    <div className={styles.reloj} data-tono={tono}>
      <time>{transcurrido == null ? '—' : minutos(transcurrido)}</time>
      <span>{desde ? nombre : 'Sin hora de aceptación'}{tono === 'alerta' ? ' · retraso' : tono === 'aviso' ? ' · atención' : ''}</span>
    </div>
  );
});

function ordenarInicial(ordenes: OrderWithItems[]): string[] {
  const cerrada = (o: OrderWithItems) => etapaDe(o) === 'cancelada' || etapaDe(o) === 'salida';
  return [...ordenes].sort((a, b) => Number(cerrada(a)) - Number(cerrada(b))).map((o) => o.id);
}

function nombrePedido(o: OrderWithItems) {
  if (o.order_type === 'DINE_IN') return etiquetaDeMesa(o);
  return o.order_type === 'PICKUP' ? 'Para llevar' : 'Domicilio';
}

export default function KitchenDisplay({
  restaurantId, initialOrders, estaciones, fallos, rondas, yellowMin, redMin, confirmFirst, scheme,
}: Props) {
  const router = useRouter();
  const modo = useServiceMode();
  const [seleccion, setSeleccion] = useState(PASE);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ordenFijo, setOrdenFijo] = useState(() => ordenarInicial(initialOrders));
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [copia, setCopia] = useState<Copia | null>(null);
  const [pendientes, setPendientes] = useState<string[]>([]);
  const enCurso = useRef(new Set<string>());
  const [online, setOnline] = useState(true);
  const [vivo, setVivo] = useState(false);
  const [silencio, setSilencio] = useState(false);
  const [sonido, setSonido] = useState('Sonido pendiente de activar');
  const ajustes = useRef(loadSoundSettings());
  const muteKey = 'leogin:cocina:silencio:' + restaurantId;

  const porEstacion = useMemo(() => {
    const nombres = new Map(estaciones.map((e) => [e.id, e.name]));
    for (const o of initialOrders) {
      for (const l of o.items) {
        const id = estacionDe(l);
        if (!nombres.has(id)) nombres.set(id, id === GENERAL ? 'Cocina general' : 'Estación retirada');
      }
    }
    return nombres;
  }, [estaciones, initialOrders]);
  const porPuesto = porEstacion.size > 1;
  const estacion = porPuesto && porEstacion.has(seleccion) ? seleccion : PASE;

  useEffect(() => {
    setOrdenFijo((antes) => {
      const conocidos = new Set(antes);
      const nuevos = initialOrders.filter((o) => !conocidos.has(o.id)).map((o) => o.id);
      return nuevos.length ? [...antes, ...nuevos] : antes;
    });
  }, [initialOrders]);

  const ordenes = useMemo(() => {
    const mapa = new Map(initialOrders.map((o) => [o.id, o]));
    const vistos = new Set(ordenFijo);
    return [...ordenFijo.flatMap((id) => mapa.get(id) ?? []), ...initialOrders.filter((o) => !vistos.has(o.id))];
  }, [initialOrders, ordenFijo]);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaLectura = useRef(0);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      ultimaLectura.current = Date.now();
      if (navigator.onLine) router.refresh();
    }, Math.max(0, 2500 - (Date.now() - ultimaLectura.current)));
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    try { setSilencio(localStorage.getItem(muteKey) === '1'); } catch { /* preferencia opcional */ }
    function red() { setOnline(navigator.onLine); if (navigator.onLine) refreshSoon(); }
    window.addEventListener('online', red);
    window.addEventListener('offline', red);
    window.addEventListener('focus', refreshSoon);
    const respaldo = setInterval(refreshSoon, 25_000); // también recoge el estado de impresión
    return () => {
      window.removeEventListener('online', red);
      window.removeEventListener('offline', red);
      window.removeEventListener('focus', refreshSoon);
      clearInterval(respaldo);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [muteKey, refreshSoon]);

  const silencioRef = useRef(false);
  useEffect(() => { silencioRef.current = silencio; }, [silencio]);
  const anunciadas = useRef(new Set(initialOrders.map((o) => o.id)));
  const canceladas = useRef(new Set(initialOrders.filter((o) => o.status === 'CANCEL').map((o) => o.id)));
  const sonar = useCallback((atencion = false) => {
    const { kitchenVolume, kitchenRepeat } = ajustes.current;
    if (silencioRef.current || kitchenVolume === 0) return;
    if (!isAudioUnlocked()) { setSonido('Sonido bloqueado. Usa Probar sonido para activarlo.'); return; }
    if (atencion) playWaiterSound(kitchenVolume, 1);
    else playKitchenSound(kitchenVolume, kitchenRepeat);
  }, []);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    const supabase = createClient();
    const { ready, stop: stopAuth } = syncRealtimeAuth(supabase);
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let terminado = false;
    let conectadoDesde = Infinity;
    void ready.then(() => {
      if (terminado) return;
      canal = supabase.channel('cocina-' + restaurantId + '-' + crypto.randomUUID().slice(0, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: 'restaurant_id=eq.' + restaurantId }, (evento) => {
          refreshSoon();
          if (evento.eventType === 'DELETE') return;
          const o = evento.new as OrderWithItems;
          const reciente = Date.parse(evento.commit_timestamp) >= conectadoDesde - 2000;
          if (o.status === 'CANCEL' && !canceladas.current.has(o.id)) {
            canceladas.current.add(o.id);
            if (reciente) sonar(true);
          }
          if (o.status !== 'PREP' && (confirmFirst || o.status !== 'NEW')) return;
          if (anunciadas.current.has(o.id)) return;
          anunciadas.current.add(o.id);
          if (reciente) {
            setAviso({ texto: 'Comanda nueva · ' + nombrePedido(o) + ' · ' + shortOrderNumber(o.order_number) });
            sonar();
          }
        })
        .subscribe((estado) => {
          conectadoDesde = estado === 'SUBSCRIBED' ? Date.now() : Infinity;
          setVivo(estado === 'SUBSCRIBED');
          if (estado === 'SUBSCRIBED') refreshSoon();
        });
    });
    return () => { terminado = true; if (canal) void supabase.removeChannel(canal); stopAuth(); };
  }, [restaurantId, confirmFirst, refreshSoon, sonar]);

  async function probarSonido() {
    primeAudio();
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!isAudioUnlocked()) { setSonido('Sonido bloqueado. Los avisos visuales siguen activos.'); return; }
    const { kitchenVolume, kitchenRepeat } = ajustes.current;
    playKitchenSound(kitchenVolume || 0.5, kitchenRepeat, { force: true });
    setSonido('Prueba de sonido reproducida.');
  }

  async function actuar({ pedido, accion, lineas = [], marca = null }: Comando) {
    if (!online || enCurso.current.has(pedido.id)) return;
    enCurso.current.add(pedido.id);
    setPendientes((antes) => [...antes, pedido.id]);
    try {
      const r = await transicionCocina(restaurantId, pedido.id, accion, lineas, marca);
      if ('error' in r) { setAviso({ texto: r.error, error: true }); refreshSoon(); return; }
      const mensajes = {
        aceptar: 'Comanda aceptada. Comenzó el tiempo de preparación.',
        preparar: r.estado === 'READY' ? 'Pedido listo para salir.' : 'Parte lista. Otras líneas siguen pendientes.',
        reabrir: 'Se reabrió la preparación.',
        salida: 'Salida confirmada para Servicio.',
        anulacion: r.estado === 'READY' ? 'Anulación confirmada. Pedido listo para salir.' : 'Anulación confirmada.',
      };
      setAviso({
        texto: nombrePedido(pedido) + ' · ' + mensajes[accion],
        deshacer: accion === 'preparar' && r.marca && r.lineas?.length
          ? { pedido, accion: 'reabrir', lineas: r.lineas, marca: r.marca } : undefined,
      });
      refreshSoon();
    } catch {
      setAviso({ texto: 'Se perdió la conexión. Revisa la comanda antes de volver a marcarla.', error: true });
      refreshSoon();
    } finally {
      enCurso.current.delete(pedido.id);
      setPendientes((antes) => antes.filter((id) => id !== pedido.id));
    }
  }

  const visibles = ordenes.filter((o) =>
    (filtro === 'todas' || etapaDe(o) === filtro) &&
    (estacion === PASE || o.items.some((l) => estacionDe(l) === estacion)));
  const abiertas = ordenes.filter((o) => ['espera', 'preparacion', 'pase'].includes(etapaDe(o)));
  const anulaciones = ordenes.flatMap((o) => {
    const marca = ultimaAnulacion(o);
    return marca && (!o.cocina_anulacion_vista_at || o.cocina_anulacion_vista_at < marca) ? [{ o, marca }] : [];
  });
  const grupos = useMemo(() => agruparPreparaciones(ordenes, estacion), [ordenes, estacion]);

  return (
    <section className={styles.cocina} data-esquema={scheme} aria-label="Tablero de Cocina">
      <header className={styles.barra}>
        <div>
          <h1>Cocina</h1>
          <p className={styles.menor}><strong data-tono={online && vivo ? 'ok' : 'aviso'}>
            {online ? vivo ? 'En línea' : 'Actualización de respaldo' : 'Sin conexión'}
          </strong> · {abiertas.length} {abiertas.length === 1 ? 'comanda activa' : 'comandas activas'}</p>
        </div>
        <div className={styles.acciones}>
          <button type="button" className={styles.boton} onClick={() => void probarSonido()}>Probar sonido</button>
          <button type="button" className={styles.boton} aria-pressed={silencio} onClick={() => {
            setSilencio(!silencio);
            try { localStorage.setItem(muteKey, silencio ? '0' : '1'); } catch { /* preferencia opcional */ }
          }}>{silencio ? 'Reactivar avisos' : 'Silenciar avisos'}</button>
          {modo && !modo.active && <button type="button" className={styles.boton} onClick={modo.toggle}>Modo servicio</button>}
        </div>
      </header>
      <div className={styles.franja}>
        {porPuesto && <nav className={styles.acciones} aria-label="Pase y estaciones">
          <button type="button" className={styles.boton} aria-pressed={estacion === PASE}
            onClick={() => { setSeleccion(PASE); setFiltro('todas'); }}>Pase · {abiertas.length}</button>
          {[...porEstacion].map(([id, nombre]) => (
            <button key={id} type="button" className={styles.boton} aria-pressed={estacion === id}
              onClick={() => { setSeleccion(id); setFiltro('todas'); }}>
              {nombre} · {abiertas.filter((o) => lineasVivas(o, id).some((l) => !l.cocina_preparada_at)).length}
            </button>
          ))}
        </nav>}
        <span className={styles.menor} role="status">{silencio ? 'Avisos sonoros en silencio.' : sonido}</span>
      </div>
      {!online && <div className={styles.aviso} data-tono="aviso" role="status">Última vista conservada. Reconecta para actualizar el tablero.</div>}
      {anulaciones.map(({ o, marca }) => (
        <div key={o.id} className={styles.aviso} data-tono="alerta">
          <div><strong>{o.status === 'CANCEL' ? 'Comanda cancelada' : 'Se anuló parte de la comanda'} · {nombrePedido(o)} · {shortOrderNumber(o.order_number)}</strong>
            {o.voids.at(-1)?.reason && <p>{o.voids.at(-1)?.reason}</p>}
          </div>
          <button type="button" className={styles.boton} disabled={!online || pendientes.includes(o.id)}
            onClick={() => void actuar({ pedido: o, accion: 'anulacion', marca })}>Confirmar anulación</button>
        </div>
      ))}
      {aviso && <div className={styles.aviso} data-tono={aviso.error ? 'alerta' : 'ok'}>
        <span role="status">{aviso.texto}</span>
        {aviso.deshacer && <button type="button" className={styles.boton} disabled={!online || pendientes.includes(aviso.deshacer.pedido.id)}
          onClick={() => { if (aviso.deshacer) void actuar(aviso.deshacer); }}>Deshacer marcado</button>}
        <button type="button" className={styles.boton} onClick={() => setAviso(null)}>Cerrar aviso</button>
      </div>}
      <div className={styles.encabezado}>
        <div><h2>{estacion === PASE ? porPuesto ? 'Pase' : 'Comandas' : porEstacion.get(estacion)}</h2>
          <p className={styles.menor}>{estacion === PASE ? 'Coordina la salida de cada comanda.' : 'Prepara las líneas de tu estación.'}</p></div>
        <nav className={styles.acciones} aria-label="Filtrar por etapa">
          {(Object.keys(etapas) as Filtro[]).map((f) => <button key={f} type="button" className={styles.boton}
            aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{etapas[f]}</button>)}
        </nav>
      </div>
      {visibles.length === 0 ? <p className={styles.vacio}>{confirmFirst && filtro === 'todas'
        ? 'Los pedidos aparecen aquí cuando se aceptan.' : 'No hay comandas en esta etapa.'}</p> : (
        <div className={styles.tablero}>
          {visibles.map((o) => <TarjetaCocina key={o.id} pedido={o} estacion={estacion} nombres={porEstacion}
            porPuesto={porPuesto} ronda={rondas[o.id]} amarillo={yellowMin} rojo={redMin}
            anulacionPendiente={anulaciones.some(({ o: pendiente }) => pendiente.id === o.id)}
            fallos={fallos[o.id]} onCopia={(fallo) => setCopia({ pedido: o, fallo })}
            bloqueado={!online || pendientes.includes(o.id)} actuar={actuar} />)}
        </div>
      )}
      <details className={styles.detalles}>
        <summary>Preparaciones iguales por estación</summary>
        {grupos.length ? <ul>{grupos.map((g, i) => <li key={i}>
          <strong>{g.cantidad}× {g.plato}</strong> · {porEstacion.get(g.estacion)} · {[...g.pedidos].map(shortOrderNumber).join(', ')}
          {(g.opciones || g.nota || g.alergias.length > 0) && <small>{[g.opciones, g.nota, ...g.alergias].filter(Boolean).join(' · ')}</small>}
        </li>)}</ul> : <p className={styles.menor}>Sin preparaciones pendientes.</p>}
      </details>
      <details className={styles.detalles}>
        <summary>Demora por estación</summary>
        <ul>{[...porEstacion].map(([id, nombre]) => {
          const pendientes = abiertas.filter((o) => o.status === 'PREP' && lineasVivas(o, id).some((l) => !l.cocina_preparada_at));
          const tiempos = ordenes.flatMap((o) => {
            if (!o.accepted_at || o.status === 'CANCEL') return [];
            const parte = lineasVivas(o, id);
            if (!parte.length || parte.some((l) => !l.cocina_preparada_at)) return [];
            const ultima = Math.max(...parte.map((l) => Date.parse(l.cocina_preparada_at!)));
            const tiempo = ultima - Date.parse(o.accepted_at);
            return tiempo > 0 ? [tiempo] : [];
          });
          const antigua = pendientes.flatMap((o) => o.accepted_at ? [o.accepted_at] : []).sort()[0];
          return <li key={id}><strong>{nombre}</strong> · {pendientes.length} pendientes
            {antigua && <small>Preparación más antigua desde las {new Date(antigua).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}</small>}
            <small>{tiempos.length >= 3 ? 'Promedio observado ' + minutos(tiempos.reduce((s, t) => s + t, 0) / tiempos.length) +
              ' en ' + tiempos.length + ' partes' : 'Aún no hay suficientes partes medidas.'}</small>
          </li>;
        })}</ul>
        <p className={styles.menor}>El tiempo observado orienta al encargado. La capacidad por hora se confirma en un turno real.</p>
      </details>
      {copia && <DialogoCopia restaurantId={restaurantId} copia={copia} onClose={() => setCopia(null)}
        onEncolada={() => { setCopia(null); setAviso({ texto: 'Copia en cola. Falta confirmación de la impresora.' }); refreshSoon(); }} />}
    </section>
  );
}

function TarjetaCocina({ pedido, estacion, nombres, porPuesto, ronda, amarillo, rojo, bloqueado, anulacionPendiente, fallos, onCopia, actuar }: {
  pedido: OrderWithItems; estacion: string; nombres: Map<string, string>; porPuesto: boolean; ronda?: number;
  amarillo: number; rojo: number; bloqueado: boolean; anulacionPendiente: boolean;
  fallos?: FalloDeImpresion[]; onCopia: (f: FalloDeImpresion) => void; actuar: (c: Comando) => Promise<void>;
}) {
  const etapa = etapaDe(pedido);
  const lineas = pedido.items.filter((l) => estacion === PASE || estacionDe(l) === estacion);
  const porHacer = lineasVivas(pedido, estacion).filter((l) => !l.cocina_preparada_at);
  const partes = [...new Set(lineasVivas(pedido).map(estacionDe))];
  const desde = etapa === 'pase' ? pedido.ready_at : etapa === 'espera' ? pedido.created_at : pedido.accepted_at;
  const cerrada = etapa === 'salida' || etapa === 'cancelada';
  const hayAccion = etapa === 'preparacion' && porHacer.length > 0 && (estacion !== PASE || !porPuesto);
  const ejecutar = (accion: AccionCocina, items?: string[], marca?: string | null) =>
    void actuar({ pedido, accion, lineas: items, marca });
  return (
    <article className={styles.comanda} aria-label={'Comanda ' + shortOrderNumber(pedido.order_number) + ' · ' + nombrePedido(pedido)}>
      <header className={styles.cabecera}>
        <div><h3>{nombrePedido(pedido)}</h3><p className={styles.menor}>
          {shortOrderNumber(pedido.order_number)}{ronda ? ' · ' + (ronda > 1 ? 'Ronda ' + ronda : 'Primera ronda') : ''}
        </p></div>
        {cerrada ? <strong className={styles.estado} data-tono={etapa === 'cancelada' ? 'alerta' : 'ok'}>
          {etapa === 'cancelada' ? 'Cancelada' : 'Salida confirmada'}
        </strong> : <Reloj desde={desde} etapa={etapa} amarillo={amarillo} rojo={rojo} />}
      </header>
      <ul className={styles.lineas}>
        {lineas.map((l) => {
          const cantidad = remainingQuantity(l, pedido.voids);
          const baja = etapa === 'cancelada' || cantidad === 0;
          const lista = l.cocina_preparada_at || etapa === 'pase' || etapa === 'salida';
          const opciones = opcionesDe(l);
          const alergias = alergenosDe(l);
          return <li className={styles.linea} key={l.id}>
            <strong className={styles.cantidad}>{baja ? l.quantity : cantidad}×</strong>
            <div>
              <strong className={styles.plato}>{l.name_snapshot}</strong>
              {opciones && <span className={styles.menor}>{opciones}</span>}
              {l.note && <span className={styles.nota}>{l.note}</span>}
              {alergias.length > 0 && <span className={styles.nota}>{alergias.join(' · ')}</span>}
              <span className={styles.menor} data-tono={baja ? 'alerta' : lista ? 'ok' : undefined}>
                {porPuesto ? (nombres.get(estacionDe(l)) ?? 'Cocina general') + ' · ' : ''}
                {baja ? 'Anulado · no preparar' : l.served_at ? 'Entregado' : lista ? 'Listo' : 'Pendiente'}
                {!baja && cantidad < l.quantity && ' · ' + (l.quantity - cantidad) + ' anuladas'}
              </span>
              {hayAccion && porHacer.length > 1 && !baja && !lista && (
                <button type="button" className={styles.enlace} disabled={bloqueado}
                  onClick={() => ejecutar('preparar', [l.id])}>Marcar {l.name_snapshot} listo</button>
              )}
              {!cerrada && !baja && l.cocina_preparada_at && !l.served_at && (estacion !== PASE || !porPuesto) && (
                <button type="button" className={styles.enlace} disabled={bloqueado}
                  onClick={() => ejecutar('reabrir', [l.id], l.cocina_preparada_at)}>Reabrir {l.name_snapshot}</button>
              )}
            </div>
          </li>;
        })}
      </ul>
      {pedido.notes && <p className={styles.notaPedido}>Nota · {pedido.notes}</p>}
      {pedido.waiter_name && <p className={styles.mesero}>Mesero · {pedido.waiter_name}</p>}
      {estacion === PASE && porPuesto && !cerrada && partes.length > 0 && <ul className={styles.partes}>
        {partes.map((id) => {
          const lista = lineasVivas(pedido, id).every((l) => l.cocina_preparada_at || etapa === 'pase');
          return <li key={id} data-tono={lista ? 'ok' : undefined}>{nombres.get(id)} · {lista ? 'lista' : 'pendiente'}</li>;
        })}
      </ul>}
      {fallos?.map((fallo) => <div className={styles.impresion} data-tono="aviso" key={fallo.stationId}>
        <span>Falló la impresión en {fallo.stationName}. La comanda está en Cocina.</span>
        <button type="button" className={styles.boton} disabled={bloqueado} onClick={() => onCopia(fallo)}>Reimprimir copia</button>
      </div>)}
      <footer className={styles.pie}>
        {etapa === 'espera' ? <button type="button" className={styles.principal} disabled={bloqueado}
          onClick={() => ejecutar('aceptar')}>Aceptar para preparar</button>
          : hayAccion ? <button type="button" className={styles.principal} disabled={bloqueado}
            onClick={() => ejecutar('preparar', porHacer.map((l) => l.id))}>{porPuesto ? 'Marcar mi parte lista' : 'Marcar pedido listo'}</button>
          : etapa === 'pase' && estacion === PASE ? <button type="button" className={styles.principal}
            disabled={bloqueado || anulacionPendiente} onClick={() => ejecutar('salida')}>Confirmar salida</button>
          : <p className={styles.menor}>
            {etapa === 'cancelada' ? anulacionPendiente ? 'Confirma la anulación en el aviso.' : 'Anulación confirmada por Cocina.'
              : etapa === 'salida' ? 'Salida confirmada para Servicio.'
              : etapa === 'pase' || estacion !== PASE ? 'Parte lista. Pase coordina la salida.'
              : 'Faltan líneas por terminar en las estaciones.'}
          </p>}
      </footer>
    </article>
  );
}
function DialogoCopia({ restaurantId, copia, onClose, onEncolada }: {
  restaurantId: string; copia: Copia; onClose: () => void; onEncolada: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { dialogo.current?.showModal(); }, []);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    try {
      const res = await reimprimirCopiaCocina(restaurantId, copia.pedido.id, motivo, copia.fallo.stationId || undefined);
      if (res.error) setError(res.error);
      else onEncolada();
    } catch {
      setError('No se pudo confirmar la copia. Revisa la cola de impresión.');
    } finally {
      setOcupado(false);
    }
  }

  return <dialog ref={dialogo} className={styles.dialogo} aria-labelledby="kds-copia-titulo" onCancel={onClose}>
    <form onSubmit={(e) => void enviar(e)}>
      <h2 id="kds-copia-titulo">Reimprimir {shortOrderNumber(copia.pedido.order_number)}</h2>
      <p className={styles.menor}>{copia.fallo.stationName} · El papel se marca como copia.</p>
      <label htmlFor="kds-copia-motivo">Motivo de la copia</label>
      <textarea id="kds-copia-motivo" rows={3} required maxLength={120} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {error && <p role="status" data-tono="alerta">{error}</p>}
      <button type="submit" className={styles.principal} disabled={ocupado || !motivo.trim()}>{ocupado ? 'Encolando…' : 'Encolar copia'}</button>
      <button type="button" className={styles.boton} onClick={onClose}>Volver a Cocina</button>
    </form>
  </dialog>;
}
