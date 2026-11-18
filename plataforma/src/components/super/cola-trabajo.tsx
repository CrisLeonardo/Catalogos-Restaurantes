'use client';

/* ============================================================
   LA COLA DE TRABAJO — filas, la hoja de un asunto y posponer
   ------------------------------------------------------------
   Ficha 4.9 y línea N (maqueta aprobada el 2026-11-18). La arma el
   servidor (lib/super/cola.ts); aquí se toca: cada fila abre su hoja
   con la evidencia, el contacto y lo que se puede hacer (WhatsApp,
   posponer con motivo, anotar, abrir la ficha, resolver). Lo que se
   hace queda en la historia (migración 187).
   ============================================================ */

import { useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import {
  anotarSoporte, historiaDelAsunto, posponerAsunto, reabrirAsunto, resolverAsunto,
} from '@/lib/actions/super-cola';
import type { EventoSuper } from '@/lib/db/super-cola';
import { antiguedad, type Asunto, type Pospuesto, type TipoAsunto } from '@/lib/super/cola';
import s from './cola.module.css';

export type GrupoDeCola = { tipo: TipoAsunto; titulo: string; icono: string; asuntos: Asunto[] };
/** WhatsApp de cada restaurante (solo dígitos), por id. */
export type Contactos = Record<string, { whatsapp: string | null; dueno: string | null }>;

const ICONO: Record<TipoAsunto, string> = { servicio: 'monitor', cobranza: 'wallet', activacion: 'sparkle', seguimiento: 'clock' };
const VISIBLES = 3;

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-GT', { day: 'numeric', month: 'short', timeZone: 'America/Guatemala' });
}
function horaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Guatemala' });
}

/* ── Inicio: los grupos y los pospuestos ─────────────────────── */

export default function ColaDeTrabajo({
  grupos, pospuestos, contactos, ahora, guardaEstados,
}: {
  grupos: GrupoDeCola[];
  pospuestos: Pospuesto[];
  contactos: Contactos;
  ahora: number;
  /** false sin la migración 187: se ve la cola, pero no se guarda nada. */
  guardaEstados: boolean;
}) {
  const [abierto, setAbierto] = useState<Asunto | null>(null);
  const [verPospuestos, setVerPospuestos] = useState(false);
  const mitad = Math.ceil(grupos.length / 2);
  const columnas = [grupos.slice(0, mitad), grupos.slice(mitad)];

  return (
    <>
      <div className={s.columnas}>
        {columnas.map((col, i) => (
          <div key={i}>
            {col.map((g) => (
              <GrupoDeAsuntos key={g.tipo} grupo={g} ahora={ahora} onAbrir={setAbierto} />
            ))}
            {i === columnas.length - 1 && pospuestos.length > 0 && (
              <p className={s.pie}>
                {pospuestos.length === 1 ? '1 pospuesto' : `${pospuestos.length} pospuestos`} ·{' '}
                <button type="button" onClick={() => setVerPospuestos(true)}>ver</button>
              </p>
            )}
          </div>
        ))}
      </div>

      {abierto && (
        <HojaAsunto
          asunto={abierto}
          contacto={abierto.restaurantId ? contactos[abierto.restaurantId] : undefined}
          ahora={ahora}
          guardaEstados={guardaEstados}
          onClose={() => setAbierto(null)}
        />
      )}
      {verPospuestos && <HojaPospuestos pospuestos={pospuestos} onClose={() => setVerPospuestos(false)} />}
    </>
  );
}

export function GrupoDeAsuntos({
  grupo, ahora, onAbrir, sinTitulo,
}: { grupo: GrupoDeCola; ahora: number; onAbrir: (a: Asunto) => void; sinTitulo?: boolean }) {
  const [todos, setTodos] = useState(false);
  const visibles = todos ? grupo.asuntos : grupo.asuntos.slice(0, VISIBLES);
  const tono = grupo.asuntos.some((a) => a.tono === 'danger') ? 'danger' : undefined;
  return (
    <section aria-label={grupo.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!sinTitulo && (
        <h2 className={s.grupo} data-tono={tono}>{grupo.titulo} <em>{grupo.asuntos.length}</em></h2>
      )}
      <div className={s.tarjeta}>
        <ul className={s.lista}>
          {visibles.map((a) => (
            <li key={a.clave}>
              <FilaAsunto asunto={a} ahora={ahora} onAbrir={() => onAbrir(a)} conTipo={sinTitulo} />
            </li>
          ))}
        </ul>
        {grupo.asuntos.length > VISIBLES && (
          <button type="button" className={s.mas} aria-expanded={todos} onClick={() => setTodos((t) => !t)}>
            {todos ? `Ver solo ${VISIBLES}` : `Ver los ${grupo.asuntos.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

const TITULO_TIPO: Record<TipoAsunto, string> = {
  servicio: 'Servicio afectado', cobranza: 'Cobranza', activacion: 'Activación', seguimiento: 'Seguimiento',
};

function FilaAsunto({ asunto, ahora, onAbrir, conTipo }: { asunto: Asunto; ahora: number; onAbrir: () => void; conTipo?: boolean }) {
  return (
    <button type="button" className={s.asunto} onClick={onAbrir}>
      <span className={s.icono} data-tono={asunto.tono} aria-hidden><Icon name={ICONO[asunto.tipo]} size={17} /></span>
      <span style={{ minWidth: 0 }}>
        <span className={s.nombre}>{conTipo ? TITULO_TIPO[asunto.tipo] : asunto.nombre}</span>
        <span className={s.resumen}>{asunto.resumen}</span>
        {asunto.volvio && (
          <span className={s.volvio}>{asunto.volvio === 'evidencia' ? 'Volvió: hay algo nuevo' : 'Volvió: se cumplió la fecha'}</span>
        )}
      </span>
      <span className={s.cuando}>{antiguedad(asunto.desde, ahora) ?? ''}</span>
    </button>
  );
}

/* ── La hoja de un asunto ────────────────────────────────────── */

export function HojaAsunto({
  asunto, contacto, ahora, guardaEstados, onClose, sinFicha,
}: {
  asunto: Asunto;
  contacto?: { whatsapp: string | null; dueno: string | null };
  ahora: number;
  guardaEstados: boolean;
  onClose: () => void;
  /** Ya se está en su ficha: no se ofrece abrirla. */
  sinFicha?: boolean;
}) {
  const toast = useToastManager();
  const [historia, setHistoria] = useState<EventoSuper[] | null>(null);
  const [paso, setPaso] = useState<'asunto' | 'posponer' | 'nota'>('asunto');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const notaId = useId();

  useEffect(() => {
    let vivo = true;
    if (guardaEstados) historiaDelAsunto(asunto.clave).then((h) => { if (vivo) setHistoria(h); });
    return () => { vivo = false; };
  }, [asunto.clave, guardaEstados]);

  const hace = antiguedad(asunto.desde, ahora);
  const ultimo = historia?.[0];
  const estadoTexto = ultimo
    ? `${ultimo.tipo === 'nota' ? 'Última nota' : 'Último movimiento'}: ${horaCorta(ultimo.creadoEn)}`
    : historia ? 'Nadie lo ha tocado' : '';

  function resolver() {
    setError(null);
    start(async () => {
      const r = await resolverAsunto({ clave: asunto.clave, restaurantId: asunto.restaurantId, firma: asunto.firma });
      if ('error' in r) { setError(r.error); return; }
      onClose();
      toast.add({ title: `Resuelto: ${asunto.nombre}`, type: 'success' });
    });
  }

  function guardarNota() {
    setError(null);
    start(async () => {
      const r = await anotarSoporte({ restaurantId: asunto.restaurantId, clave: asunto.clave, texto: nota });
      if ('error' in r) { setError(r.error); return; }
      setNota('');
      setPaso('asunto');
      setHistoria(await historiaDelAsunto(asunto.clave));
      toast.add({ title: 'Nota guardada', type: 'success' });
    });
  }

  if (paso === 'posponer') {
    return <HojaPosponer asunto={asunto} onClose={onClose} onVolver={() => setPaso('asunto')} />;
  }

  const wa = contacto?.whatsapp
    ? `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(`Hola, te escribo de Leogin sobre ${asunto.nombre}.`)}`
    : null;

  return (
    <HojaOperativa
      label={`${asunto.nombre} · ${TITULO_TIPO[asunto.tipo].toLowerCase()}`}
      resumen={<p className={s.sub}>{[hace ? `Pasa desde ${hace.startsWith('hace') ? hace : `hace ${hace}`}` : null, estadoTexto].filter(Boolean).join(' · ')}</p>}
      onClose={onClose}
      footer={paso === 'nota' ? (
        <Button type="button" size="action" className="w-full" onClick={guardarNota} disabled={pendiente || nota.trim().length < 3}>
          {pendiente ? 'Guardando…' : 'Guardar la nota'}
        </Button>
      ) : (
        <Button type="button" size="action" className="w-full" onClick={resolver} disabled={pendiente || !guardaEstados}>
          {pendiente ? 'Guardando…' : 'Marcar como resuelto'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <dl className={s.evidencia}>
          {asunto.evidencia.map((e, i) => (
            <div key={i}><dt>{e.etiqueta}</dt><dd>{e.texto}</dd></div>
          ))}
          {contacto?.dueno && <div><dt>Dueño</dt><dd>{contacto.dueno}</dd></div>}
        </dl>

        {paso === 'nota' ? (
          <label className={s.campo} htmlFor={notaId}>
            Qué hiciste o qué quedó pendiente
            <textarea id={notaId} className="adm-field" rows={3} maxLength={600} value={nota} onChange={(e) => setNota(e.target.value)} autoFocus />
          </label>
        ) : (
          <ul className={s.opciones}>
            {wa && (
              <li>
                <a className={s.opcion} href={wa} target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={18} /><span>Escribirle por WhatsApp</span><Icon name="arrowUpRight" size={16} />
                </a>
              </li>
            )}
            <li>
              <button type="button" className={s.opcion} disabled={!guardaEstados} onClick={() => setPaso('posponer')}>
                <Icon name="clock" size={18} /><span>Posponer…</span><em>con motivo</em>
              </button>
            </li>
            <li>
              <button type="button" className={s.opcion} disabled={!guardaEstados} onClick={() => setPaso('nota')}>
                <Icon name="edit" size={18} /><span>Anotar lo que hiciste</span>
              </button>
            </li>
            {!sinFicha && (
              <li>
                <Link className={s.opcion} href={asunto.href}>
                  <Icon name="list" size={18} /><span>{asunto.restaurantId ? 'Abrir su ficha' : 'Abrir la cuenta'}</span><Icon name="chevronRight" size={16} />
                </Link>
              </li>
            )}
          </ul>
        )}

        {!guardaEstados && <p className={s.sub}>Falta aplicar la migración 187: todavía no se pueden posponer, resolver ni anotar asuntos.</p>}
        {historia && historia.length > 0 && paso === 'asunto' && (
          <ul className={s.historia} aria-label="Historia de este asunto">
            {historia.slice(0, 5).map((h) => (
              <li key={h.id}>
                {h.tipo === 'nota' ? h.texto : h.tipo === 'pospuso' ? `Pospuesto: ${h.texto ?? ''}` : h.tipo === 'resolvio' ? `Resuelto${h.texto ? `: ${h.texto}` : ''}` : 'Volvió a la cola'}
                <small>{h.autorNombre ?? 'Superadmin'} · {horaCorta(h.creadoEn)}</small>
              </li>
            ))}
          </ul>
        )}
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </HojaOperativa>
  );
}

/* ── Posponer, con motivo y fecha ────────────────────────────── */

const MOTIVOS = ['Cerrado por temporada', 'Ya le escribí', 'Espera un pago', 'Otro'] as const;
const PLAZOS = [
  { texto: 'Mañana', dias: 1 },
  { texto: '1 semana', dias: 7 },
  { texto: '1 mes', dias: 30 },
] as const;

function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function HojaPosponer({ asunto, onClose, onVolver }: { asunto: Asunto; onClose: () => void; onVolver: () => void }) {
  const toast = useToastManager();
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number]>(asunto.tipo === 'seguimiento' ? 'Cerrado por temporada' : asunto.tipo === 'cobranza' ? 'Espera un pago' : 'Ya le escribí');
  const [otro, setOtro] = useState('');
  const [plazo, setPlazo] = useState<number | 'fecha'>(7);
  const [fecha, setFecha] = useState(enDias(7));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const otroId = useId();
  const fechaId = useId();

  const dia = plazo === 'fecha' ? fecha : enDias(plazo);
  const texto = motivo === 'Otro' ? otro.trim() : motivo;
  const listo = texto.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(dia);

  function posponer() {
    setError(null);
    start(async () => {
      const r = await posponerAsunto({
        clave: asunto.clave, restaurantId: asunto.restaurantId, firma: asunto.firma,
        motivo: texto, hasta: `${dia}T14:00:00Z`,
      });
      if ('error' in r) { setError(r.error); return; }
      onClose();
      toast.add({ title: `Pospuesto hasta el ${fechaCorta(`${dia}T14:00:00Z`)}`, type: 'success' });
    });
  }

  return (
    <HojaOperativa
      label={`Posponer «${asunto.nombre}»`}
      resumen={<p className={s.sub}>Vuelve a la cola el día que elijas, o antes si pasa algo nuevo.</p>}
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" onClick={posponer} disabled={pendiente || !listo}>
          {pendiente ? 'Guardando…' : listo ? `Posponer hasta el ${fechaCorta(`${dia}T14:00:00Z`)}` : 'Di el motivo'}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <div className={s.motivos} role="group" aria-label="Motivo">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" className={s.motivo} aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>
          ))}
        </div>
        {motivo === 'Otro' && (
          <label className={s.campo} htmlFor={otroId}>
            Motivo
            <input id={otroId} className="adm-field" maxLength={200} value={otro} onChange={(e) => setOtro(e.target.value)} autoFocus />
          </label>
        )}
        <div className={s.segmentos} role="group" aria-label="Hasta cuándo">
          {PLAZOS.map((p) => (
            <button key={p.dias} type="button" className={s.segmento} aria-pressed={plazo === p.dias} onClick={() => setPlazo(p.dias)}>{p.texto}</button>
          ))}
          <button type="button" className={s.segmento} aria-pressed={plazo === 'fecha'} onClick={() => setPlazo('fecha')}>Fecha…</button>
        </div>
        {plazo === 'fecha' && (
          <label className={s.campo} htmlFor={fechaId}>
            Hasta
            <input id={fechaId} type="date" className="adm-field" min={enDias(1)} max={enDias(180)} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
        )}
        <button type="button" className={s.motivo} style={{ alignSelf: 'flex-start' }} onClick={onVolver}>← Volver al asunto</button>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </HojaOperativa>
  );
}

/* ── Los pospuestos ──────────────────────────────────────────── */

function HojaPospuestos({ pospuestos, onClose }: { pospuestos: Pospuesto[]; onClose: () => void }) {
  const toast = useToastManager();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function reabrir(p: Pospuesto) {
    setError(null);
    start(async () => {
      const r = await reabrirAsunto({ clave: p.clave, restaurantId: p.restaurantId });
      if ('error' in r) { setError(r.error); return; }
      toast.add({ title: `${p.nombre} volvió a la cola`, type: 'success' });
      if (pospuestos.length === 1) onClose();
    });
  }

  return (
    <HojaOperativa label="Pospuestos" onClose={onClose} footer={null} className="hoja-negocio">
      <div className={s.hojaCuerpo}>
        <ul className={s.opciones}>
          {pospuestos.map((p) => (
            <li key={p.clave}>
              <div className={s.opcion} style={{ cursor: 'default', minHeight: 64 }}>
                <span>
                  <b style={{ display: 'block' }}>{p.nombre} · {TITULO_TIPO[p.tipo].toLowerCase()}</b>
                  <span className={s.resumen}>{p.motivo ? `${p.motivo} · ` : ''}vuelve el {fechaCorta(p.hasta)}</span>
                </span>
                <button type="button" className={s.motivo} disabled={pendiente} onClick={() => reabrir(p)}>Volver ya</button>
              </div>
            </li>
          ))}
        </ul>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </HojaOperativa>
  );
}

/* ── Ficha: lo abierto de un restaurante ─────────────────────── */

export function AbiertosDeLaFicha({
  asuntos, contacto, ahora, guardaEstados,
}: { asuntos: Asunto[]; contacto?: { whatsapp: string | null; dueno: string | null }; ahora: number; guardaEstados: boolean }) {
  const [abierto, setAbierto] = useState<Asunto | null>(null);
  if (asuntos.length === 0) return null;
  const tono = asuntos.some((a) => a.tono === 'danger') ? 'danger' : undefined;
  return (
    <>
      <h2 className={s.grupo} data-tono={tono}>Abierto <em>{asuntos.length}</em></h2>
      <GrupoDeAsuntos grupo={{ tipo: 'servicio', titulo: 'Abierto', icono: 'monitor', asuntos }} ahora={ahora} onAbrir={setAbierto} sinTitulo />
      {abierto && (
        <HojaAsunto asunto={abierto} contacto={contacto} ahora={ahora} guardaEstados={guardaEstados} onClose={() => setAbierto(null)} sinFicha />
      )}
    </>
  );
}

/* ── Ficha: notas de soporte ─────────────────────────────────── */

export function NotasDeSoporte({
  restaurantId, notas, guardaEstados,
}: { restaurantId: string; notas: EventoSuper[]; guardaEstados: boolean }) {
  const toast = useToastManager();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const id = useId();

  function guardar() {
    setError(null);
    start(async () => {
      const r = await anotarSoporte({ restaurantId, texto });
      if ('error' in r) { setError(r.error); return; }
      setTexto('');
      setAbierta(false);
      toast.add({ title: 'Nota guardada', type: 'success' });
    });
  }

  return (
    <section className={`${s.tarjeta} ${s.bloque}`} aria-labelledby={`${id}-t`}>
      <h2 className={s.titulo} id={`${id}-t`}>
        Notas de soporte
        {guardaEstados && <button type="button" onClick={() => setAbierta(true)}>+ Anotar</button>}
      </h2>
      {notas.length === 0 ? (
        <p className={s.sub}>{guardaEstados ? 'Todavía no hay notas. Anota lo que hablas con este restaurante para no tener que preguntarlo dos veces.' : 'Falta aplicar la migración 187 para guardar notas.'}</p>
      ) : notas.slice(0, 5).map((n) => (
        <div key={n.id} className={s.nota}>
          {n.texto}
          <small>{n.autorNombre ?? 'Superadmin'} · {horaCorta(n.creadoEn)}</small>
        </div>
      ))}
      {abierta && (
        <HojaOperativa
          label="Nota de soporte"
          onClose={() => setAbierta(false)}
          footer={(
            <Button type="button" size="action" className="w-full" onClick={guardar} disabled={pendiente || texto.trim().length < 3}>
              {pendiente ? 'Guardando…' : 'Guardar la nota'}
            </Button>
          )}
        >
          <div className={s.hojaCuerpo}>
            <label className={s.campo} htmlFor={`${id}-n`}>
              Qué hablaste o qué quedó pendiente
              <textarea id={`${id}-n`} className="adm-field" rows={4} maxLength={600} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
            </label>
            {error && <p className={s.error} role="alert">{error}</p>}
          </div>
        </HojaOperativa>
      )}
    </section>
  );
}
