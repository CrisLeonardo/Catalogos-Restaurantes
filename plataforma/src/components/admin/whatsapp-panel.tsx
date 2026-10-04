'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/icons';
import { connectWhatsApp, disconnectWhatsApp, type WhatsAppState } from '@/lib/actions/whatsapp';
import { FIELD_LABEL } from '@/components/admin/field-label';

export interface WhatsAppAccountView {
  phoneNumberId: string;
  displayPhone: string | null;
  wabaId: string | null;
  activo: boolean;
  updatedAt: string;
}

/* ============================================================
   /admin/whatsapp — conectar el número del restaurante
   ------------------------------------------------------------
   El token JAMÁS baja al cliente: este componente solo recibe qué número
   está conectado. Para cambiarlo se vuelve a pegar el token completo, no
   se edita el guardado (no hay forma de leerlo de vuelta, por diseño).
   ============================================================ */
export default function WhatsAppPanel({
  restaurantId, account, tokenKeyReady,
}: {
  restaurantId: string;
  account: WhatsAppAccountView | null;
  tokenKeyReady: boolean;
}) {
  const [state, formAction, isPending] = useActionState<WhatsAppState, FormData>(
    connectWhatsApp,
    null,
  );


  const labelSt: React.CSSProperties = FIELD_LABEL;
  const fieldSt: React.CSSProperties = { marginBottom: 14 };
  const avisoSt: React.CSSProperties = {
    display: 'block', whiteSpace: 'normal', borderRadius: 'var(--radius-lg)',
    padding: 12, marginBottom: 18, lineHeight: 1.5, fontWeight: 600,
  };

  return (
    <div className="adm-w-read">
      {/* El título lo pone la barra («WhatsApp»); aquí se repetía (T-10). */}
      <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 20 }}>
        Conecta el número de tu negocio para avisarle a cada cliente cómo va su
        pedido: cuando entra a cocina, cuando está listo y cuando va en camino.
      </p>

      {!tokenKeyReady && (
        /* Un aviso de varias líneas no es un chip: `.chip` no parte el
           texto (`nowrap`) y esta frase empujaba la página entera 448 px
           hacia la derecha en el teléfono. Va en azul de información y no
           en rojo: no es un error del dueño, es algo que falta de nuestro
           lado (auditoría 2026-10-02, T-18). */
        <div className="note note-info" style={{ marginBottom: 18, fontSize: 13, fontWeight: 500 }}>
          <span>La conexión con WhatsApp todavía no está activa en Leogin.
          Escríbenos a soporte y la activamos para tu restaurante.</span>
          {/* Aquí iba «Detalle técnico: falta WHATSAPP_TOKEN_KEY»: el nombre de
              una variable del servidor, a la vista del dueño (auditoría
              2026-10-02, T-15). Eso es para soporte, no para él. */}
        </div>
      )}

      {account ? (
        <div
          style={{
            border: '1px solid var(--u-hair)', borderRadius: 'var(--radius-lg)',
            padding: 16, marginBottom: 22,
          }}
        >
          <span className="chip chip-ok" style={{ marginBottom: 10 }}>
            <Icon name="whatsapp" size={12} /> Número conectado
          </span>
          <p style={{ fontSize: 15, fontWeight: 600 }}>
            {account.displayPhone ?? account.phoneNumberId}
          </p>
          <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4 }}>
            ID del número: {account.phoneNumberId}
            {account.wabaId ? ` · WABA: ${account.wabaId}` : ''}
          </p>

          <form action={disconnectWhatsApp} style={{ marginTop: 14 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <button type="submit" className="chip chip-danger" style={{ cursor: 'pointer' }}>
              Desconectar
            </button>
          </form>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginBottom: 18 }}>
          Todavía no hay ningún número conectado.
        </p>
      )}

      {/* Sin la clave del servidor el token no se puede guardar: enseñar el
          formulario era invitar a llenar cinco campos para terminar en un
          error (auditoría 2026-10-02, AJU-15). */}
      {tokenKeyReady && (
      <form action={formAction}>
        <input type="hidden" name="restaurantId" value={restaurantId} />

        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
          {account ? 'Reemplazar la conexión' : 'Conectar un número'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 16 }}>
          Estos datos salen del panel de Meta, en WhatsApp → Configuración de la API.
        </p>

        <div style={fieldSt}>
          <label style={labelSt} htmlFor="wa-pnid">ID del número (phone number ID)</label>
          <input id="wa-pnid" name="phone_number_id" required className="adm-field"
            defaultValue={account?.phoneNumberId ?? ''} placeholder="123456789012345" />
        </div>

        <div style={fieldSt}>
          <label style={labelSt} htmlFor="wa-token">Token de acceso</label>
          <input id="wa-token" name="access_token" type="password" required className="adm-field"
            placeholder="EAAG..." autoComplete="off" />
          <p style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 5 }}>
            Se guarda cifrado y no se vuelve a mostrar. Para cambiarlo, pégalo de nuevo.
          </p>
        </div>

        <div style={fieldSt}>
          <label style={labelSt} htmlFor="wa-display">Número visible (opcional)</label>
          <input id="wa-display" name="display_phone" className="adm-field"
            defaultValue={account?.displayPhone ?? ''} placeholder="+502 5555 1234" />
        </div>

        <div style={fieldSt}>
          <label style={labelSt} htmlFor="wa-waba">ID de la cuenta de WhatsApp Business (opcional)</label>
          <input id="wa-waba" name="waba_id" className="adm-field"
            defaultValue={account?.wabaId ?? ''} placeholder="987654321098765" />
        </div>

        {state && 'error' in state && (
          <p className="chip chip-danger" style={{ ...avisoSt, marginBottom: 12 }}>
            {state.error}
          </p>
        )}
        {state && 'ok' in state && (
          <p className="chip chip-ok" style={{ ...avisoSt, marginBottom: 12 }}>
            Número conectado.
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Guardando…' : account ? 'Reemplazar' : 'Conectar'}
        </button>
      </form>
      )}
    </div>
  );
}
