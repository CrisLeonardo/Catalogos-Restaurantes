'use client';

/* LA COMANDA DE LA MESA — qué se pidió, qué falta servir y cerrar.
   ------------------------------------------------------------------
   Cuatro secciones seguidas, en el orden en que pasan las cosas:

     QR          lo que el comensal pidió desde la mesa y nadie ha
                 aceptado todavía. Va primero porque es lo único que
                 puede estar esperando una respuesta.
     SIN ENVIAR  lo que el mesero acaba de apuntar. Lo único con ± y ✎.
     FALTA SERVIR ya salió a cocina y no está en la mesa.
     EN LA MESA  puesto delante del cliente.

   Y un pie que siempre dice el siguiente paso: enviar si hay algo
   nuevo, cobrar si no queda nada sin enviar.

   DÓNDE ENTRA ANULAR (migración 079). El handoff no lo dibujaba, y sin
   ello un plato enviado por error no tiene salida. No se le cuelga un
   tercer botón al renglón —ahí ya viven la cantidad, el nombre y
   «Servido», y en una columna de 288 px no cabe—: el CUERPO del renglón
   abre una hoja con lo que se puede hacer con ese plato. Tocar para ver
   opciones es inofensivo; un botón de anular a un dedo de «Servido», no. */

import { Icon } from '@/components/icons';
import { ChipMano, Kicker, Mono } from '@/components/admin/servicio/pieces';
import { importeLinea, type LineaServicio, type ResumenComanda } from '@/lib/servicio/comanda';
import type { AtencionServicio } from '@/lib/servicio/estado';

export interface ComandaProps {
  resumen: ResumenComanda;
  money: (n: number) => string;
  /** Lo que el comensal pidió por QR y espera aceptación. */
  pendientes: { id: string; texto: string; unidades: number } | null;
  onAceptarQr: () => void;
  onRechazarQr: () => void;
  atencion: AtencionServicio;
  onAtender: () => void;
  /** ± de una línea sin enviar. */
  onStep: (l: LineaServicio, delta: number) => void;
  /** ✎ de una línea sin enviar: abre sus opciones. */
  onEditar: (l: LineaServicio) => void;
  /** «Servido» de una línea ya en cocina. */
  onServir: (l: LineaServicio) => void;
  /** El cuerpo de una línea ya enviada: anular, deshacer servido. */
  onLinea: (l: LineaServicio) => void;
  aprendiz: boolean;
  /** Mientras se envía o se sirve, para no dejar tocar dos veces. */
  ocupado: boolean;
}

export default function Comanda({
  resumen, money, pendientes, onAceptarQr, onRechazarQr, atencion, onAtender,
  onStep, onEditar, onServir, onLinea, aprendiz, ocupado,
}: ComandaProps) {
  const { nuevas, cocina, servidas, nNuevas, nCocina, nServidas } = resumen;
  const vacia = nuevas.length + cocina.length + servidas.length === 0 && !pendientes;

  return (
    <div className="sv-ticket-body">
      {/* Alguien levantó la mano. Va arriba del todo y con su acción al
          lado: el aviso sin salida es lo que hace que la gente lo ignore. */}
      {atencion && (
        <div className="sv-qr" style={{ borderColor: 'var(--c-danger-solid)', background: 'var(--c-danger-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ChipMano atencion={atencion} />
          </div>
          <button type="button" className="sv-cta" data-tone="danger" style={{ height: 44, fontSize: 14 }} onClick={onAtender}>
            {atencion === 'cuenta' ? 'Voy a cobrar' : 'Ya voy'}
          </button>
        </div>
      )}

      {pendientes && (
        <div className="sv-qr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="sv-qr-badge">QR</span>
            <span className="sv-qr-title">
              El cliente pidió {pendientes.unidades} {pendientes.unidades === 1 ? 'cosa' : 'cosas'} desde el QR
            </span>
          </div>
          <div className="sv-qr-items">{pendientes.texto}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="sv-cta"
              data-tone="info"
              style={{ height: 44, fontSize: 13 }}
              onClick={onAceptarQr}
              disabled={ocupado}
            >
              Aceptar y mandar
            </button>
            <button
              type="button"
              className="sv-cta"
              data-tone="quiet"
              style={{ height: 44, fontSize: 13, width: 'auto', padding: '0 16px', flexShrink: 0 }}
              onClick={onRechazarQr}
              disabled={ocupado}
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {nuevas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker tone="warn" rule>Sin enviar · {nNuevas}</Kicker>
          {aprendiz && (
            <div className="sv-hint">
              Esto todavía no lo ha visto cocina. Toca «Enviar a cocina» abajo y sale el papel.
            </div>
          )}
          {nuevas.map((l) => (
            <div key={l.id} className="sv-line-new">
              <div style={{ minWidth: 0 }}>
                <div className="sv-line-name">
                  {l.nombre}
                  {l.libre && (
                    <span className="sv-chip" style={{ marginLeft: 8 }}>Libre</span>
                  )}
                </div>
                {l.detalle && <div className="sv-line-mods">{l.detalle}</div>}
                <div className="sv-line-unit">{money(l.unidad)} c/u</div>
              </div>
              <div className="sv-line-ctl">
                <button
                  type="button"
                  className="sv-edit"
                  onClick={() => onEditar(l)}
                  aria-label={`Cambiar las opciones de ${l.nombre}`}
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  className="sv-step"
                  onClick={() => onStep(l, -1)}
                  aria-label={`Quitar uno de ${l.nombre}`}
                >
                  <Icon name="minus" size={17} />
                </button>
                <span className="sv-qty">{l.cantidad}</span>
                <button
                  type="button"
                  className="sv-step"
                  onClick={() => onStep(l, 1)}
                  aria-label={`Agregar otro ${l.nombre}`}
                >
                  <Icon name="plus" size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cocina.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker tone="info" rule>Falta servir · {nCocina}</Kicker>
          {cocina.map((l) => (
            <div key={l.id} className="sv-line" data-paid={l.pagada ? '1' : '0'} data-sending={l.enviando ? '1' : undefined}>
              <button
                type="button"
                className="sv-line-body"
                onClick={() => onLinea(l)}
                disabled={l.enviando}
                title={l.enviando ? 'Enviándose a cocina' : 'Ver qué se puede hacer con este plato'}
              >
                <span className="sv-line-q">{l.cantidad}×</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="sv-line-name" style={{ display: 'block' }}>{l.nombre}</span>
                  {l.detalle && <span className="sv-line-mods" style={{ display: 'block' }}>{l.detalle}</span>}
                </span>
              </button>
              {/* Cobrado en un cobro por partes y todavía en cocina: se dice
                  con la misma etiqueta que en «En la mesa». Apagar la fila
                  entera sin decir por qué dejaba «Servido» con cara de
                  botón deshabilitado, y sigue haciendo falta. */}
              {l.pagada && <span className="sv-paid">Pagado</span>}
              {/* Todavía sin confirmar por la nube: no hay pedido al que
                  marcarle «Servido». Dura lo que tarda la respuesta. */}
              {l.enviando ? (
                <span className="sv-sending" role="status">Enviando…</span>
              ) : (
                <button
                  type="button"
                  className="sv-serve"
                  onClick={() => onServir(l)}
                  disabled={ocupado}
                >
                  Servido
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {servidas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker tone="accent" rule>En la mesa · {nServidas}</Kicker>
          {servidas.map((l) => (
            <button
              key={l.id}
              type="button"
              className="sv-line-done"
              data-paid={l.pagada ? '1' : '0'}
              onClick={() => onLinea(l)}
              style={{ border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
            >
              <span className="sv-line-q">{l.cantidad}×</span>
              <span className="sv-line-done-name">{l.nombre}</span>
              {l.pagada && <span className="sv-paid">Pagado</span>}
              <Mono size={13} color="var(--u-text-3)">{money(importeLinea(l))}</Mono>
            </button>
          ))}
        </div>
      )}

      {vacia && (
        <div className="sv-vacio" style={{ padding: '26px 0' }}>
          Mesa abierta y sin nada.<br />Toca un plato y aparece aquí.
        </div>
      )}
    </div>
  );
}
