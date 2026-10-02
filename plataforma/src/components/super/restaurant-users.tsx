'use client';

import { useActionState, useState } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import DeleteButton from '@/components/admin/delete-button';
import {
  createRestaurantUser,
  resetRestaurantUserPassword,
  deleteRestaurantUser,
  type SuperState,
} from '@/lib/actions/super-admin';
import {
  grantMembership,
  changeMembershipRole,
  revokeMembership,
  type MembershipState,
} from '@/lib/actions/memberships';
import type { RestaurantUser } from '@/lib/db/super-admin';
import type { MemberRole } from '@/lib/membership-roles';

const empty: SuperState = null;
const emptyMembership: MembershipState = null;

const PAPEL: { v: MemberRole; l: string }[] = [
  { v: 'OWNER',   l: 'Dueño' },
  { v: 'MANAGER', l: 'Gerente' },
  { v: 'STAFF',   l: 'Personal' },
  { v: 'WAITER',  l: 'Mesero' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
  border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  color: 'var(--u-text)',
  fontSize: 15,
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--u-text-3)',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

function genPassword(): string {
  // Sin caracteres ambiguos (0/O, 1/l) para dictar por teléfono.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[arr[i] % chars.length];
  return out;
}

export default function RestaurantUsers({
  restaurantId,
  slug,
  users,
}: {
  restaurantId: string;
  slug: string;
  users: RestaurantUser[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Usuarios existentes */}
      {users.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {users.map((u) => (
            <UserRow key={u.id} user={u} restaurantId={restaurantId} />
          ))}
        </div>
      )}

      {/* Dar acceso a alguien que YA tiene cuenta: es lo que faltaba para
          poder traspasar un restaurante sin borrarlo (hallazgo A-08). */}
      <GrantAccessForm restaurantId={restaurantId} />

      {/* Alta de nuevo acceso */}
      <AddUserForm restaurantId={restaurantId} slug={slug} />
    </div>
  );
}

function RoleBadge({ role }: { role: RestaurantUser['role'] }) {
  const isOwner = role === 'RESTAURANT_OWNER';
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        color: isOwner ? 'var(--c-warn)' : 'var(--u-text-3)',
        background: isOwner ? 'var(--c-warn-bg)' : 'color-mix(in srgb, var(--u-text) 6%, transparent)',
        border: `1px solid ${isOwner ? 'var(--c-warn-line)' : 'var(--u-hair)'}`,
        whiteSpace: 'nowrap',
      }}
    >
      {isOwner ? 'Dueño' : 'Staff'}
    </span>
  );
}

function UserRow({
  user,
  restaurantId,
}: {
  user: RestaurantUser;
  restaurantId: string;
}) {
  const [showReset, setShowReset] = useState(false);

  return (
    <Glass variant="quiet" style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--u-text)',
              wordBreak: 'break-all',
            }}
          >
            {user.email ?? '(sin email)'}
          </div>
          {user.full_name && (
            <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 1 }}>
              {user.full_name}
            </div>
          )}
        </div>
        {user.memberRole ? (
          <RoleSelect restaurantId={restaurantId} userId={user.id} role={user.memberRole} />
        ) : (
          <RoleBadge role={user.role} />
        )}
        <button
          type="button"
          onClick={() => setShowReset((v) => !v)}
          className="press"
          style={{
            background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            border: '1px solid var(--u-hair)',
            color: 'var(--u-text-3)',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Contraseña
        </button>
        {/* Con membresía se quita el ACCESO A ESTE LOCAL y nada más: esa
            cuenta puede ser la de un dueño con tres restaurantes, y borrarla
            desde la ficha de uno lo dejaría fuera de los tres. Borrar la
            cuenta entera vive en su ficha, en Cuentas.

            Sin membresía —el camino viejo— la cuenta no administra nada más,
            así que «Quitar» sigue siendo lo que era: borrarla. */}
        {user.memberRole ? (
          <DeleteButton
            action={revokeMembership}
            hiddenFields={{ userId: user.id, restaurantId }}
            label="Quitar de aquí"
            confirm={`¿Quitarle a ${user.email ?? 'esta persona'} el acceso a este restaurante?`}
            description="Su cuenta de Leogin y sus otros locales no se tocan."
          />
        ) : (
          <DeleteButton
            action={deleteRestaurantUser}
            hiddenFields={{ userId: user.id, restaurantId }}
            label="Quitar"
            confirm={`¿Quitar el acceso de ${user.email ?? 'este usuario'}?`}
            description="Ya no podrá iniciar sesión."
          />
        )}
      </div>

      {showReset && (
        <ResetPasswordForm userId={user.id} restaurantId={restaurantId} />
      )}
    </Glass>
  );
}

function ResetPasswordForm({
  userId,
  restaurantId,
}: {
  userId: string;
  restaurantId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    resetRestaurantUserPassword,
    empty,
  );
  const [password, setPassword] = useState('');

  return (
    <form
      action={formAction}
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--u-hair)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          name="password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Nueva contraseña (mín. 8)"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }}
        />
        <button
          type="button"
          onClick={() => setPassword(genPassword())}
          className="press"
          style={{
            background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
            border: '1px solid var(--u-hair)',
            color: 'var(--u-text-3)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Generar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: 13,
            border: 'none',
            color: '#fff',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {isPending ? '…' : 'Cambiar'}
        </button>
      </div>
      {state?.error && <ErrorMsg msg={state.error} />}
    </form>
  );
}

/* El papel de alguien en ESTE local, cambiable en el sitio.
   Se envía al elegir: un botón «Guardar» al lado de un desplegable de cuatro
   opciones es un paso de más para algo que ya es explícito. */
function RoleSelect({
  restaurantId,
  userId,
  role,
}: {
  restaurantId: string;
  userId: string;
  role: MemberRole;
}) {
  const [state, formAction, isPending] = useActionState(changeMembershipRole, emptyMembership);

  return (
    <form action={formAction} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={role}
        disabled={isPending}
        aria-label="Papel en este restaurante"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{
          height: 32, padding: '0 8px', borderRadius: 'var(--radius-full)',
          fontSize: 12, fontWeight: 600,
          background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
          color: 'var(--u-text-2, var(--u-text))',
          border: '1px solid var(--u-hair)', cursor: 'pointer',
        }}
      >
        {PAPEL.map((p) => (
          <option key={p.v} value={p.v} style={{ color: 'var(--u-text)' }}>{p.l}</option>
        ))}
      </select>
      {/* El único caso que importa es el candado del último dueño, y hay que
          poder leerlo: si se callara, el desplegable volvería a su sitio sin
          que nadie supiera por qué. */}
      {state && 'error' in state && (
        <span style={{ fontSize: 11, color: 'var(--c-danger)', maxWidth: 260, lineHeight: 1.4 }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

/* Dar acceso a alguien que YA tiene su cuenta de Leogin.
   Es la mitad del traspaso —la otra es «Quitar de aquí»— y por eso pide un
   correo existente en vez de crear nada: la persona que compra el local ya
   tiene cuenta, y fabricarle otra la partiría en dos. */
function GrantAccessForm({ restaurantId }: { restaurantId: string }) {
  const [state, formAction, isPending] = useActionState(grantMembership, emptyMembership);

  return (
    <Glass variant="quiet" style={{ padding: 16 }}>
      <p style={{ ...labelStyle, marginBottom: 4 }}>Dar acceso a alguien que ya tiene cuenta</p>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-4)', margin: '0 0 12px', lineHeight: 1.55 }}>
        Para traspasar el restaurante: nombra dueño al nuevo aquí y después quita al anterior
        arriba. En ese orden — un local no puede quedarse sin ninguna persona dueña.
      </p>

      <form action={formAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor="grant_email" style={labelStyle}>Su correo de Leogin</label>
          <input
            id="grant_email"
            name="email"
            type="email"
            required
            placeholder="persona@ejemplo.com"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="grant_role" style={labelStyle}>Papel</label>
          <select id="grant_role" name="role" defaultValue="OWNER" style={{ ...inputStyle, cursor: 'pointer' }}>
            {PAPEL.map((p) => (
              <option key={p.v} value={p.v} style={{ color: 'var(--u-text)' }}>{p.l}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            padding: '12px 18px', borderRadius: 'var(--radius-md)', fontWeight: 600,
            fontSize: 14, border: 'none', color: '#fff',
            cursor: isPending ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {isPending ? 'Dando…' : 'Dar acceso'}
        </button>
      </form>

      {state && 'error' in state && <ErrorMsg msg={state.error} />}
      {state && 'ok' in state && (
        <p style={{ fontSize: 12.5, color: 'var(--c-ok)', margin: '10px 0 0' }}>{state.ok}</p>
      )}
    </Glass>
  );
}

function AddUserForm({
  restaurantId,
  slug,
}: {
  restaurantId: string;
  slug: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createRestaurantUser,
    empty,
  );
  const [role, setRole] = useState<'RESTAURANT_OWNER' | 'RESTAURANT_STAFF'>(
    'RESTAURANT_OWNER',
  );
  const [password, setPassword] = useState('');

  return (
    <Glass variant="quiet" style={{ padding: 16 }}>
      <p style={{ ...labelStyle, marginBottom: 12 }}>Crear un acceso nuevo</p>

      <form
        action={formAction}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="role" value={role} />

        <div>
          <label htmlFor="u_email" style={labelStyle}>Email *</label>
          <input
            id="u_email"
            name="email"
            type="email"
            required
            placeholder="dueno@restaurante.com"
            style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="u_name" style={labelStyle}>Nombre</label>
          <input
            id="u_name"
            name="full_name"
            type="text"
            placeholder="Nombre del encargado"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Rol</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(
              [
                { v: 'RESTAURANT_OWNER', l: 'Dueño', d: 'Gestiona todo el menú' },
                { v: 'RESTAURANT_STAFF', l: 'Staff', d: 'Apoyo (ej. pedidos)' },
              ] as const
            ).map((opt) => {
              const active = role === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setRole(opt.v)}
                  className="press"
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: active ? 'var(--brand-accent)' : 'var(--u-hair)',
                    background: active
                      ? 'rgba(217,119,87,0.10)'
                      : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: active ? 'var(--brand-accent)' : 'var(--u-text-3)',
                    }}
                  >
                    {opt.l}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 1 }}>
                    {opt.d}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="u_pass" style={labelStyle}>Contraseña *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="u_pass"
              name="password"
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 14 }}
            />
            <button
              type="button"
              onClick={() => setPassword(genPassword())}
              className="press"
              style={{
                background: 'color-mix(in srgb, var(--u-text) 6%, transparent)',
                border: '1px solid var(--u-hair)',
                color: 'var(--u-text-3)',
                padding: '0 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Generar
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 6, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--c-warn)' }} />
            <span>Copia la contraseña ahora: no se vuelve a mostrar. Entrega estas credenciales al restaurante.</span>
          </p>
        </div>

        {state?.error && <ErrorMsg msg={state.error} />}

        <button
          type="submit"
          disabled={isPending}
          className="press btn-accent"
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 600,
            fontSize: 15,
            border: 'none',
            color: '#fff',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Creando acceso…' : 'Crear acceso'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--u-text-4)', textAlign: 'center' }}>
          El dueño entrará en{' '}
          <strong style={{ color: 'var(--u-text-3)' }}>{slug}-admin.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'leogin.online'}</strong>
          {' '}— el panel del restaurante en su propio subdominio.
        </p>
      </form>
    </Glass>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--c-danger-bg)',
        border: '1px solid var(--c-danger-line)',
        color: 'var(--c-danger)',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}
