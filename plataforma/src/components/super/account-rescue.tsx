'use client';

/* Las acciones de rescate de una cuenta (fase 2).
   ------------------------------------------------------------
   Tres formularios y ninguna sorpresa: cada uno dice ANTES de pulsar
   qué va a pasar, y el que no se puede usar sale explicando por qué en
   lugar de desaparecer. Un botón que no está no enseña nada; uno que
   está y dice «esta cuenta entra con Google» contesta la pregunta que
   trajo aquí a quien mira. */

import { useActionState, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icons';
import { FIELD_LABEL } from '@/components/admin/field-label';
import {
  resetAccountPassword,
  changeAccountEmail,
  sendAccountRecoveryLink,
  markAccountVerified,
  type AccountActionState,
} from '@/lib/actions/accounts';
import {
  impedimentoDeCuentaParaCorreo,
  impedimentoParaEnlace,
} from '@/lib/account-rescue-rules';

const vacio: AccountActionState = null;

export type RescueAccount = {
  id: string;
  email: string | null;
  providers: string[];
  esPin: boolean;
  verificado: boolean;
};

export default function AccountRescue({
  cuenta,
  correoDisponible,
}: {
  cuenta: RescueAccount;
  correoDisponible: boolean;
}) {
  const conGoogle = cuenta.providers.includes('google');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ResetPasswordCard cuenta={cuenta} conGoogle={conGoogle} />
      <RecoveryLinkCard cuenta={cuenta} correoDisponible={correoDisponible} />
      <ChangeEmailCard cuenta={cuenta} />
      {/* Solo cuando hay algo que dar por bueno: una tarjeta que dice «ya
          está verificado» no hace falta que exista. */}
      {!cuenta.verificado && !cuenta.esPin && <VerifyEmailCard cuenta={cuenta} />}
    </div>
  );
}

/* ── Reponer la contraseña ──────────────────────────────────── */

function ResetPasswordCard({ cuenta, conGoogle }: { cuenta: RescueAccount; conGoogle: boolean }) {
  const [state, action, pending] = useActionState(resetAccountPassword, vacio);
  const [password, setPassword] = useState('');

  return (
    <Seccion
      icon="key"
      titulo="Reponer la contraseña"
      descripcion="Le pones una contraseña nueva ahora mismo. No hace falta que tenga ningún restaurante — que era justo lo que impedía ayudar a quien más lo necesita."
    >
      {conGoogle && (
        <Aviso tono="warn">
          Esta cuenta entra <strong>con Google</strong>. Ponerle contraseña no le quita esa
          puerta: le añade una segunda. Si lo que perdió fue el acceso a su Google, esto sí
          la salva; si no, probablemente quiera seguir entrando como siempre.
        </Aviso>
      )}

      <form action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="userId" value={cuenta.id} />
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <label htmlFor="rescue-pass" style={labelStyle}>Contraseña nueva</label>
          <input
            id="rescue-pass"
            name="password"
            type="text"
            required
            minLength={8}
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            className="adm-field"
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => setPassword(generarPassword())}>
          Generar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Cambiando…' : 'Cambiar'}
        </Button>
      </form>

      {/* En claro a propósito: se va a dictar por teléfono, y un campo de
          puntitos obliga a copiarlo a ciegas. */}
      <Resultado state={state} />
    </Seccion>
  );
}

/* ── Mandarle el enlace ─────────────────────────────────────── */

function RecoveryLinkCard({ cuenta, correoDisponible }: { cuenta: RescueAccount; correoDisponible: boolean }) {
  const [state, action, pending] = useActionState(sendAccountRecoveryLink, vacio);
  // La MISMA regla que aplica la acción, y por eso se enseña UN motivo y no
  // los que se cumplan: a una credencial por PIN decirle además que falta
  // Resend haría creer que el día que se configure esto va a funcionar, y
  // no va a funcionar nunca — no hay buzón.
  const impedimento = impedimentoParaEnlace(cuenta, correoDisponible);
  const bloqueado = impedimento !== null;

  return (
    <Seccion
      icon="mail"
      titulo="Mandarle el enlace de recuperación"
      descripcion="El mismo correo que sale de «Olvidé mi contraseña», disparado por ti. Es mejor que dictar una contraseña: la elige la persona y no pasa por nadie más."
    >
      {impedimento === 'sin-proveedor' && (
        <Aviso tono="warn">
          Todavía no hay proveedor de correo configurado (falta <code>RESEND_API_KEY</code>),
          así que este botón no puede hacer nada. Mientras tanto, la salida es ponerle la
          contraseña a mano aquí arriba.
        </Aviso>
      )}
      {impedimento === 'pin' && (
        <Aviso tono="warn">
          Es una credencial de acceso por PIN: su correo es interno y no existe ningún buzón
          al que mandar el enlace.
        </Aviso>
      )}
      {impedimento === 'sin-correo' && (
        <Aviso tono="warn">Esta cuenta no tiene ningún correo al que escribir.</Aviso>
      )}

      <form action={action}>
        <input type="hidden" name="userId" value={cuenta.id} />
        <Button type="submit" disabled={pending || bloqueado}>
          {pending ? 'Enviando…' : 'Enviar el enlace'}
        </Button>
      </form>

      <Resultado state={state} />
    </Seccion>
  );
}

/* ── Corregir el correo ─────────────────────────────────────── */

function ChangeEmailCard({ cuenta }: { cuenta: RescueAccount }) {
  const [state, action, pending] = useActionState(changeAccountEmail, vacio);
  const impedimento = impedimentoDeCuentaParaCorreo(cuenta);
  const bloqueado = impedimento !== null;

  return (
    <Seccion
      icon="edit"
      titulo="Corregir el correo"
      descripcion="Para el dedazo del registro. Sin esto, quien escribió mal su correo tiene un login que no recuerda, un enlace de recuperación que va a un buzón inexistente y ninguna salida que no sea abrir otra cuenta."
    >
      {impedimento === 'google' && (
        <Aviso tono="danger">
          No se puede: esta cuenta entra con Google y su identidad seguiría apuntando al
          correo viejo, así que al volver a entrar se partiría en dos cuentas. Dile que use
          el botón de Google.
        </Aviso>
      )}
      {impedimento === 'pin' && (
        <Aviso tono="danger">
          No se puede: de este correo interno se leen el restaurante y el usuario del acceso
          por PIN. Se cambia desde Personal, en el panel de su restaurante.
        </Aviso>
      )}

      <form action={action} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="userId" value={cuenta.id} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <label htmlFor="rescue-email" style={labelStyle}>Correo nuevo</label>
          <input
            id="rescue-email"
            name="email"
            type="email"
            required
            disabled={bloqueado}
            defaultValue=""
            placeholder={cuenta.email ?? 'nombre@dominio.com'}
            className="adm-field" style={{ opacity: bloqueado ? 0.5 : 1 }}
          />
        </div>
        <Button type="submit" disabled={pending || bloqueado}>
          {pending ? 'Guardando…' : 'Cambiar el correo'}
        </Button>
      </form>

      {!bloqueado && (
        <p style={notaStyle}>
          El correo nuevo queda como <strong>sin verificar</strong> hasta que la persona
          confirme el buzón: que tú lo escribas no prueba que sea suyo.
        </p>
      )}

      <Resultado state={state} />
    </Seccion>
  );
}

/* ── Dar el correo por bueno ────────────────────────────────── */

function VerifyEmailCard({ cuenta }: { cuenta: RescueAccount }) {
  const [state, action, pending] = useActionState(markAccountVerified, vacio);

  return (
    <Seccion
      icon="checkCircle"
      titulo="Dar el correo por bueno"
      descripcion="Cuando te consta por teléfono que el buzón es suyo pero el enlace nunca llegó — se fue a spam, o todavía no hay proveedor de correo. Sin esto la cuenta se queda marcada «sin verificar» para siempre aunque sepas que está bien."
    >
      <form action={action}>
        <input type="hidden" name="userId" value={cuenta.id} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Guardando…' : 'Confirmo que es suyo'}
        </Button>
      </form>
      <p style={notaStyle}>
        Queda registrado que lo diste por bueno <strong>tú</strong>, no la persona.
      </p>
      <Resultado state={state} />
    </Seccion>
  );
}

/* ── Piezas ─────────────────────────────────────────────────── */

function Seccion({
  icon, titulo, descripcion, children,
}: {
  icon: string; titulo: string; descripcion: string; children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name={icon} size={17} style={{ color: 'var(--u-text-4)', flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{titulo}</div>
          <p style={{ fontSize: 13, color: 'var(--u-text-4)', margin: '3px 0 0', lineHeight: 1.55 }}>
            {descripcion}
          </p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function Aviso({ tono, children }: { tono: 'warn' | 'danger'; children: React.ReactNode }) {
  const color = tono === 'danger' ? 'var(--c-danger)' : 'var(--c-warn)';
  return (
    <div
      style={{
        display: 'flex', gap: 9, alignItems: 'flex-start',
        padding: '10px 12px', borderRadius: 'var(--radius-md)',
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 26%, transparent)`,
        fontSize: 12, lineHeight: 1.55, color: 'var(--u-text-2, var(--u-text))',
      }}
    >
      <Icon name="alertCircle" size={15} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

function Resultado({ state }: { state: AccountActionState }) {
  if (!state) return null;
  const esError = 'error' in state;
  const color = esError ? 'var(--c-danger)' : 'var(--c-ok)';
  return (
    <div
      role="status"
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        fontSize: 12, lineHeight: 1.55, color,
      }}
    >
      <Icon name={esError ? 'alertCircle' : 'checkCircle'} size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{esError ? state.error : state.ok}</span>
    </div>
  );
}

/** Sin caracteres ambiguos (0/O, 1/l): esto se dicta por teléfono. */
function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
  return out;
}


/* El rótulo de campo del panel (D-8): en minúscula, no en mayúsculas de cartel. */
const labelStyle: React.CSSProperties = FIELD_LABEL;

const notaStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--u-text-4)',
  margin: 0,
  lineHeight: 1.55,
};
