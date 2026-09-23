'use client';

/* Las hojas del módulo de servicio que no son la del cobro.
   ------------------------------------------------------------------
   · HojaMesa   — nombre, mover, juntar y liberar sin cobrar.
   · HojaLlevar — abrir un pedido de mostrador.
   · HojaVoz    — dictar la comanda.
   · HojaAtajos — las teclas, para quien trabaja en PC.
   · HojaLinea  — qué se puede hacer con un plato YA enviado. Es donde
                  entra anular con motivo y PIN (migración 079), que el
                  handoff no dibujaba y sin lo cual un plato enviado por
                  error no tiene salida. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { Campo, Hoja, HojaHead, Kicker, Mono } from '@/components/admin/servicio/pieces';
import {
  crearReconocimiento, emparejarDictado, partirDictado, textoDeResultado,
} from '@/lib/servicio/voz';
import { importeLinea, type LineaServicio } from '@/lib/servicio/comanda';
import { subtituloDeMesa, type MesaServicio } from '@/lib/servicio/estado';
import type { Product } from '@/types';

/* ════════════════════════════════════════════════════════════
   LA MESA
   ════════════════════════════════════════════════════════════ */

export interface HojaMesaProps {
  mesa: MesaServicio;
  /** A dónde se puede mover (libres) y con cuál juntar (ocupadas). */
  libres: MesaServicio[];
  ocupadas: MesaServicio[];
  money: (n: number) => string;
  busy: boolean;
  onClose: () => void;
  onNombre: (nombre: string) => void;
  onMover: (n: number) => void;
  onJuntar: (n: number) => void;
  onLiberar: () => void;
  /** Cobrar algo que no está en la carta (M-09). */
  onArticuloLibre: () => void;
  /** Sale solo si la mesa tiene algo: no hay cuenta que imprimir sin pedido. */
  onImprimirCuenta: (() => void) | null;
}

export function HojaMesa({
  mesa, libres, ocupadas, money, busy, onClose,
  onNombre, onMover, onJuntar, onLiberar, onArticuloLibre, onImprimirCuenta,
}: HojaMesaProps) {
  const [nombre, setNombre] = useState(mesa.nombre);
  const [accion, setAccion] = useState<'mover' | 'juntar' | 'liberar' | null>(null);

  /* La confirmación en dos toques CADUCA. El prototipo la dejaba armada
     para siempre: quien tocaba «Liberar» y se iba, al volver encontraba
     el botón esperando un solo toque para borrar la mesa. */
  useEffect(() => {
    if (accion !== 'liberar') return;
    const t = setTimeout(() => setAccion(null), 4000);
    return () => clearTimeout(t);
  }, [accion]);

  const destinos = accion === 'mover' ? libres : accion === 'juntar' ? ocupadas : [];

  return (
    <Hoja onClose={onClose} label={`Opciones de ${mesa.etiqueta}`}>
      <div className="sv-sheet-pad">
        <HojaHead title={mesa.etiqueta} sub={subtituloDeMesa(mesa)} onClose={onClose} />

        <Campo label="Nombre de la mesa">
          <input
            className="sv-field"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onBlur={() => { if (nombre.trim() !== mesa.nombre) onNombre(nombre.trim()); }}
            placeholder="Ej. cumpleaños de Sofi"
            maxLength={40}
          />
          <div className="sv-foot-note">Lo ve todo el local, no solo esta tablet.</div>
        </Campo>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sv-choice"
            data-on={accion === 'mover' ? '1' : '0'}
            style={{ minWidth: 150 }}
            onClick={() => setAccion(accion === 'mover' ? null : 'mover')}
          >
            Mover a otra mesa
          </button>
          <button
            type="button"
            className="sv-choice"
            data-on={accion === 'juntar' ? '1' : '0'}
            style={{ minWidth: 150 }}
            onClick={() => setAccion(accion === 'juntar' ? null : 'juntar')}
          >
            Juntar con otra
          </button>
        </div>

        {(accion === 'mover' || accion === 'juntar') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', fontWeight: 500 }}>
              {accion === 'mover'
                ? 'Elige la mesa libre a donde se pasa todo.'
                : 'Elige la mesa con la que se junta la cuenta.'}
            </div>
            {destinos.length === 0 ? (
              <div className="sv-vacio" style={{ padding: '14px 0', fontSize: 13.5 }}>
                No hay mesas disponibles para eso.
              </div>
            ) : (
              <div className="sv-pick">
                {destinos.map((m) => (
                  <button
                    key={m.n}
                    type="button"
                    disabled={busy}
                    onClick={() => (accion === 'mover' ? onMover(m.n) : onJuntar(m.n))}
                  >
                    <span className="sv-pick-n">{m.n}</span>
                    <span className="sv-pick-sub">
                      {accion === 'juntar' && m.total > 0
                        ? money(m.total)
                        : (m.zona ?? (m.sillas ? `${m.sillas} p.` : ''))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* El artículo libre (M-09) vive aquí y en el buscador: aquí porque
            es una decisión de la MESA («cóbrale el descorche»), y allí
            porque es la respuesta a «ese plato no está en la carta». */}
        <button type="button" className="sv-cta" data-tone="quiet" onClick={onArticuloLibre}>
          <Icon name="plus" size={17} />
          Cobrar algo que no está en la carta
        </button>

        {onImprimirCuenta && (
          <button type="button" className="sv-cta" data-tone="quiet" onClick={onImprimirCuenta} disabled={busy}>
            <Icon name="print" size={17} />
            Imprimir la cuenta
          </button>
        )}

        <button
          type="button"
          className="sv-cta"
          data-tone={accion === 'liberar' ? 'danger' : 'quiet'}
          style={accion === 'liberar' ? undefined : { color: 'var(--c-danger)' }}
          onClick={() => (accion === 'liberar' ? onLiberar() : setAccion('liberar'))}
          disabled={busy}
        >
          {accion === 'liberar' ? 'Toca otra vez para confirmar' : 'Liberar mesa sin cobrar'}
        </button>
      </div>
    </Hoja>
  );
}

/* ════════════════════════════════════════════════════════════
   PARA LLEVAR
   ════════════════════════════════════════════════════════════ */

export function HojaLlevar({ onClose, onCrear }: {
  onClose: () => void;
  onCrear: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState('');

  return (
    <Hoja onClose={onClose} label="Pedido para llevar">
      <div className="sv-sheet-pad">
        <HojaHead
          title="Pedido para llevar"
          sub="Mostrador, barra o alguien que pasa a recoger"
          onClose={onClose}
        />
        <Campo label="¿A nombre de quién?">
          <input
            className="sv-field"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCrear(nombre.trim()); }}
            placeholder="Nombre o «mostrador»"
            maxLength={60}
          />
        </Campo>
        <button type="button" className="sv-cta" onClick={() => onCrear(nombre.trim())}>
          Abrir el pedido
        </button>
      </div>
    </Hoja>
  );
}

/* ════════════════════════════════════════════════════════════
   DICTADO POR VOZ
   ════════════════════════════════════════════════════════════ */

export function HojaVoz({ productos, money, onClose, onAgregar }: {
  productos: Product[];
  money: (n: number) => string;
  onClose: () => void;
  onAgregar: (lineas: { producto: Product; qty: number; nota: string }[]) => void;
}) {
  const [texto, setTexto] = useState('');
  const [fase, setFase] = useState<'escuchando' | 'listo' | 'error'>('escuchando');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<ReturnType<typeof crearReconocimiento>>(null);

  useEffect(() => {
    const r = crearReconocimiento();
    if (!r) { setFase('error'); setError('Este navegador no sabe escuchar.'); return; }
    rec.current = r;
    r.onresult = (e) => setTexto(textoDeResultado(e));
    r.onerror = (e) => {
      setFase('error');
      setError(e.error === 'not-allowed'
        ? 'No diste permiso al micrófono. Se activa desde los ajustes del navegador.'
        : 'No se entendió nada. Vuelve a intentarlo.');
    };
    r.onend = () => setFase((f) => (f === 'escuchando' ? 'listo' : f));
    try { r.start(); } catch { setFase('error'); setError('No se pudo abrir el micrófono.'); }
    return () => { try { r.abort(); } catch { /* ya estaba cerrado */ } };
  }, []);

  const lineas = useMemo(
    () => emparejarDictado(partirDictado(texto), productos),
    [texto, productos],
  );

  const total = lineas.reduce((s, l) => s + l.producto.price * l.qty, 0);

  return (
    <Hoja onClose={onClose} label="Dictar el pedido">
      <div className="sv-sheet-pad" style={{ alignItems: 'center', textAlign: 'center' }}>
        {fase === 'escuchando' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 0' }}>
            <div className="sv-voz-ring"><Icon name="mic" size={30} /></div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Escuchando…</div>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', maxWidth: 280, lineHeight: 1.5 }}>
              Dicta como le hablarías a la cocina: «dos pepián y una limonada sin hielo».
            </div>
            {texto && <div style={{ fontSize: 14, color: 'var(--u-text-2)', fontStyle: 'italic' }}>«{texto}»</div>}
            <button type="button" className="sv-cta" data-tone="quiet" style={{ maxWidth: 220 }} onClick={() => rec.current?.stop()}>
              Ya terminé
            </button>
          </div>
        )}

        {fase === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', padding: '18px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No se pudo dictar</div>
            <div style={{ fontSize: 13.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>{error}</div>
            <button type="button" className="sv-cta" data-tone="quiet" onClick={onClose}>Cerrar</button>
          </div>
        )}

        {fase === 'listo' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ textAlign: 'left' }}>
              <Kicker>Entendí esto</Kicker>
              {texto && (
                <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4, fontStyle: 'italic' }}>«{texto}»</div>
              )}
            </div>
            {lineas.length === 0 ? (
              <div className="sv-vacio" style={{ padding: '18px 0' }}>
                Ningún plato de la carta encaja con eso.<br />Prueba con el buscador.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lineas.map((l, i) => (
                  <div
                    key={`${l.producto.id}-${i}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: 12,
                      borderRadius: 'var(--radius-lg)', border: '1px solid var(--u-hair)',
                      background: 'var(--adm-card)', textAlign: 'left',
                    }}
                  >
                    <Mono size={15} color="var(--brand-accent-ink)">{l.qty}×</Mono>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600 }}>{l.producto.name}</span>
                    {l.nota && <span style={{ fontSize: 12.5, color: 'var(--c-warn)', fontWeight: 500 }}>{l.nota}</span>}
                    <Mono size={13} color="var(--u-text-3)">{money(l.producto.price * l.qty)}</Mono>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="sv-cta" data-tone="quiet" style={{ width: 'auto', padding: '0 18px', flexShrink: 0 }} onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="sv-cta" onClick={() => onAgregar(lineas)} disabled={lineas.length === 0}>
                Agregar · {money(total)}
              </button>
            </div>
          </div>
        )}
      </div>
    </Hoja>
  );
}

/* ════════════════════════════════════════════════════════════
   ATAJOS
   ════════════════════════════════════════════════════════════ */

export const ATAJOS: { k: string; d: string }[] = [
  { k: '⌘K / Ctrl K', d: 'Buscar plato, mesa o acción' },
  { k: '1 – 9', d: 'Agregar el más pedido número N' },
  { k: 'Alt 1 – 9', d: 'Saltar a la mesa abierta N' },
  { k: '⌘⏎ / Ctrl ⏎', d: 'Enviar a cocina' },
  { k: 'Alt C', d: 'Cobrar y cerrar mesa' },
  { k: '2 pepián ⏎', d: 'Teclear cantidad + plato en el buscador' },
  { k: '/', d: 'Volver al buscador' },
  { k: 'Esc', d: 'Cerrar o volver' },
  { k: '?', d: 'Ver estos atajos' },
];

export function HojaAtajos({ onClose }: { onClose: () => void }) {
  return (
    <Hoja onClose={onClose} label="Atajos de teclado">
      <div className="sv-sheet-pad">
        <HojaHead title="Atajos de teclado" onClose={onClose} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ATAJOS.map((a) => (
            <div key={a.k} className="sv-atajo">
              <span className="sv-atajo-k">{a.k}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{a.d}</span>
            </div>
          ))}
        </div>
      </div>
    </Hoja>
  );
}

/* ════════════════════════════════════════════════════════════
   UN PLATO YA ENVIADO
   ------------------------------------------------------------
   Aquí es donde entra anular (migración 079). No se le cuelga un tercer
   botón al renglón —en una columna de 288 px no cabe, y un «anular» a un
   dedo de «Servido» es un accidente esperando— : el cuerpo del renglón
   abre esto, que es inofensivo, y desde aquí sale la única acción que
   destruye algo.
   ════════════════════════════════════════════════════════════ */

export function HojaLinea({ linea, money, onClose, onServir, onDeshacerServir, onAnular }: {
  linea: LineaServicio;
  money: (n: number) => string;
  onClose: () => void;
  onServir: () => void;
  onDeshacerServir: () => void;
  onAnular: () => void;
}) {
  return (
    <Hoja onClose={onClose} label={`Opciones de ${linea.nombre}`}>
      <div className="sv-sheet-pad">
        <HojaHead
          title={`${linea.cantidad}× ${linea.nombre}`}
          sub={[linea.detalle, `${money(importeLinea(linea))} en la cuenta`].filter(Boolean).join(' · ')}
          onClose={onClose}
        />

        {linea.pagada && (
          <div className="sv-hint" style={{ background: 'var(--c-ok-bg)', color: 'var(--c-ok)' }}>
            Este plato ya está cobrado. Anularlo ahora deja un cobro sin nada detrás:
            devuélvelo desde Caja.
          </div>
        )}

        {linea.fase === 'cocina' ? (
          <button type="button" className="sv-cta" data-tone="info" onClick={onServir}>
            <Icon name="check" size={18} />
            Marcar como servido
          </button>
        ) : (
          <button type="button" className="sv-cta" data-tone="quiet" onClick={onDeshacerServir}>
            <Icon name="undo" size={17} />
            No estaba servido
          </button>
        )}

        <button
          type="button"
          className="sv-cta"
          data-tone="quiet"
          style={{ color: 'var(--c-danger)' }}
          onClick={onAnular}
          disabled={linea.pagada}
        >
          <Icon name="trash" size={17} />
          Anular este plato
        </button>
        <div className="sv-foot-note">
          Anular pide motivo y, si hace falta, el PIN de un encargado. Queda escrito.
        </div>
      </div>
    </Hoja>
  );
}

/* ════════════════════════════════════════════════════════════
   ARTÍCULO LIBRE (M-09)
   ------------------------------------------------------------
   Algo que no está en la carta: el plato del día que nadie dio de alta,
   un descorche, un recargo. El handoff no lo dibujaba y sin él la
   respuesta a «eso no está en la carta» es salirse del sistema y cobrar
   un número que no cuadra con nada.

   Se abre desde dos sitios, y los dos son el mismo momento: el buscador
   cuando acaba de comprobar que el plato no existe (llega con el nombre
   ya escrito) y la hoja de la mesa.
   ════════════════════════════════════════════════════════════ */

export function HojaLibre({ nombreInicial, money, onClose, onAgregar }: {
  nombreInicial: string;
  money: (n: number) => string;
  onClose: () => void;
  onAgregar: (d: { name: string; price: number; quantity: number; note?: string }) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  /* El precio se guarda como TEXTO mientras se teclea. Con un `number` en
     el estado, borrar el último dígito deja NaN y el campo se queda en
     blanco de una forma de la que no se puede salir escribiendo. */
  const [precio, setPrecio] = useState('');
  const [qty, setQty] = useState(1);
  const [nota, setNota] = useState('');

  const valor = Number(precio.replace(',', '.'));
  const precioOk = precio.trim() !== '' && Number.isFinite(valor) && valor >= 0 && valor <= 100_000;
  const listo = nombre.trim().length > 0 && precioOk;
  const total = precioOk ? valor * qty : 0;

  function agregar() {
    if (!listo) return;
    onAgregar({
      name: nombre.trim(),
      price: Math.round(valor * 100) / 100,
      quantity: qty,
      note: nota.trim() || undefined,
    });
  }

  return (
    <Hoja onClose={onClose} label="Artículo libre">
      <div className="sv-sheet-pad">
        <HojaHead
          title="Algo que no está en la carta"
          sub="El plato del día, un descorche, un recargo. Entra a la cuenta como cualquier otro y queda registrado."
          onClose={onClose}
        />

        <Campo label="Qué es">
          <input
            className="sv-field"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Descorche, plato del día…"
            maxLength={80}
          />
        </Campo>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Campo label="Precio por unidad">
              <input
                className="sv-field"
                value={precio}
                onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && listo) { e.preventDefault(); agregar(); } }}
                /* `inputMode` y no `type="number"`: en el teléfono saca el
                   teclado numérico igual, y sin las flechitas que en una
                   tablet se tocan sin querer. */
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Precio del artículo"
              />
            </Campo>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button type="button" className="sv-step" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Uno menos">
              <Icon name="minus" size={17} />
            </button>
            <div style={{ minWidth: 30, textAlign: 'center' }}><Mono size={18}>{qty}</Mono></div>
            <button type="button" className="sv-step" onClick={() => setQty((n) => Math.min(99, n + 1))} aria-label="Uno más">
              <Icon name="plus" size={17} />
            </button>
          </div>
        </div>

        <Campo label="Nota para cocina">
          <input
            className="sv-field"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && listo) { e.preventDefault(); agregar(); } }}
            placeholder="Sin hielo, para llevar…"
            maxLength={140}
          />
        </Campo>

        {/* El importe DENTRO del botón, igual que «Cobrar Q412.50»: es lo que
            se le va a sumar a la cuenta de alguien y se lee antes de tocar. */}
        <button type="button" className="sv-cta" onClick={agregar} disabled={!listo}>
          {listo ? `Agregar · ${money(total)}` : 'Agregar a la cuenta'}
        </button>
      </div>
    </Hoja>
  );
}
