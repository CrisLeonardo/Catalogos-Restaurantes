'use client';

/* StaffPanel — gestión de personal con permisos + bitácora (Fase D).
   Modelo unificado: todo el personal es RESTAURANT_STAFF con permisos por
   sección. "Mesero" (tomar pedidos en mesa) es una sección más que el dueño
   marca como cualquier otra; puede combinarse con secciones del panel. */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Section } from '@/components/ui/section';
import { List, ListButton, ListRow, ListText } from '@/components/ui/list';
import { EmptyState } from '@/components/ui/empty-state';
import { ADMIN_SECTIONS } from '@/lib/permissions';
import {
  createStaff, updateStaffPermissions, removeStaff, resetStaffPassword,
  type StaffState, type StaffMember, type ActivityRow,
} from '@/lib/actions/staff';
import { setStaffPin, type StaffPinState } from '@/lib/actions/staff-pin';
import { staffLoginHandle } from '@/lib/staff-email';
import { haceTiempo } from '@/lib/dates';
import { describirActividad, humanizarClave } from '@/lib/activity-labels';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';

/** Secciones que un gerente NO recibe con su plantilla.
    'suscripcion' es el cobro del restaurante: quién paga, cuánto y con qué
    plan. Un encargado administra la operación, no la cuenta de su jefe.
    (La gestión de personal ni siquiera está en ADMIN_SECTIONS: no es
    delegable, así que un gerente tampoco puede darse permisos a sí mismo ni
    crear a otro gerente.) */
const GERENTE_EXCLUDES = ['suscripcion'];

/** Plantillas de permisos al crear personal — pre-llenan lo típico de cada
    rol para no abrumar al dueño con ~20 opciones en un miembro nuevo; sigue
    pudiendo ajustar libremente después de elegir una.

    "Gerente" es distinta de las otras tres en algo más que los permisos: es
    la única que entra con USUARIO y contraseña desde donde sea, en vez de
    con un PIN del aparato del local — ver `access` en el modal. */
const ROLE_PRESETS: { key: string; label: string; icon: string; perms: string[] | 'gerente'; access?: 'user' }[] = [
  { key: 'gerente', label: 'Gerente', icon: 'key', perms: 'gerente', access: 'user' },
  { key: 'mesero', label: 'Mesero', icon: 'userPlus', perms: ['mesero'] },
  { key: 'cajero', label: 'Cajero', icon: 'wallet', perms: ['pedidos', 'mesas', 'clientes'] },
  { key: 'cocina', label: 'Cocina', icon: 'flame', perms: ['cocina'] },
];

/* La bitácora se dice con frases (lib/activity-labels.ts): antes caía al
   nombre crudo de la acción y el dueño leía «order_void», «auto_archive» o
   «pedido → SERVED» (auditoría 2026-10-02, T-15). */
const describeActivity = (r: ActivityRow): string => describirActividad(r);

/** Cuántas filas de la bitácora se ven antes de «Ver toda la actividad». */
const ACTIVIDAD_VISIBLE = 10;
const timeAgo = (iso: string): string => haceTiempo(iso);

const SECTION_LABEL: Record<string, string> = Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.key, s.label]));

export default function StaffPanel({ restaurantId, slug, staff, activity, enabledSections, isOwner = true }: {
  restaurantId: string;
  /** La dirección del restaurante (`rincon-502`). Es la segunda mitad de la
      credencial de un administrador: sin ella, lo que el dueño le dicta
      (`carlos`) solo funciona desde el subdominio de este local. */
  slug: string | null;
  staff: StaffMember[];
  activity: ActivityRow[];
  /** Secciones que el restaurante realmente tiene activas — el picker de
      permisos no debe ofrecer módulos que el dueño ni siquiera prendió. */
  enabledSections: string[];
  /** ¿Lo mira el dueño? Solo él restablece la contraseña de un administrador
      (el servidor lo vuelve a comprobar; esto es para no enseñar un botón
      que iba a ser rechazado). */
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ open: boolean; member: StaffMember | null }>({ open: false, member: null });
  /* La bitácora entera eran ~40 filas: 4.600 px de pantalla en el teléfono
     antes de llegar a los accesos (auditoría 2026-10-02, AJU-12). */
  const [verTodaActividad, setVerTodaActividad] = useState(false);
  const actividadVisible = verTodaActividad ? activity : activity.slice(0, ACTIVIDAD_VISIBLE);

  function describePerms(m: StaffMember): string {
    if (m.permissions == null) return 'Acceso total';
    // Una llave que ya no está en ADMIN_SECTIONS (permisos viejos guardados
    // en el perfil) se dice con palabras, no con la clave («aprobar_anulaciones»).
    const labels = m.permissions.map((p) => SECTION_LABEL[p] ?? humanizarClave(p));
    if (labels.length === 0) return 'Sin acceso';
    if (labels.length <= 3) return labels.join(' · ');
    return `${labels.slice(0, 3).join(' · ')} +${labels.length - 3}`;
  }

  function MemberRow({ m }: { m: StaffMember }) {
    // La insignia dice QUÉ ES esta persona, no qué secciones tiene marcadas.
    // Con "tiene mesero" un gerente salía etiquetado como Mesero, porque su
    // plantilla incluye esa sección igual que las otras 25.
    const isMesero = m.meseroOnly;
    const conCredencial = m.access !== 'pin';
    const credencial = m.access === 'user'
      // La credencial ENTERA, no solo el usuario: es lo que hay que
      // dictarle para que pueda entrar también desde leogin.
      ? `Entra con ${staffLoginHandle(m.username ?? '', slug)}`
      : conCredencial
        ? `Entra con ${m.email ?? 'su correo'}`
        : 'Entra con PIN en el local';
    return (
      <ListRow key={m.id}>
        <div style={{ width: 38, height: 38, borderRadius: 99, background: isMesero ? 'var(--c-warn-bg)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)', display: 'grid', placeItems: 'center', color: isMesero ? 'var(--c-warn)' : 'var(--u-text)', flexShrink: 0 }}>
          <Icon name={isMesero ? 'userPlus' : 'user'} size={18} />
        </div>
        <ListText
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.full_name || 'Miembro del equipo'}</span>
              {isMesero && (
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--c-warn)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', borderRadius: 99, padding: '2px 8px' }}><Icon name="userPlus" size={11} /> Mesero</span>
              )}
            </span>
          }
          desc={`${credencial} · ${describePerms(m)}`}
        />
        <Button type="button" onClick={() => setEditor({ open: true, member: m })} variant="secondary" size="sm">
          Editar
        </Button>
      </ListRow>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      {/* Personal. Va en <Section> como todo lo demás de esta pantalla: antes
          este rótulo era un div suelto y el de al lado ("Actividad reciente")
          un <Section>, dos tratamientos distintos en el MISMO componente. */}
      <Section
        title="Personal"
        aside={
          <Button type="button" onClick={() => setEditor({ open: true, member: null })} size="sm">
            <Icon name="plus" size={14} /> Nuevo
          </Button>
        }
      >
        {staff.length === 0 ? (
          <EmptyState
            icon="users"
            title="Sin personal todavía"
            desc="Agrega cajeros, ayudantes o meseros y elige a qué secciones acceden. Marca Mesero para que pueda tomar pedidos en mesa desde Pedidos › Tomar pedidos."
            action={{ label: 'Agregar el primero', onClick: () => setEditor({ open: true, member: null }) }}
          />
        ) : (
          <List>{staff.map((m) => <MemberRow key={m.id} m={m} />)}</List>
        )}
      </Section>

      {/* Bitácora */}
      <Section title="Actividad reciente">
        {activity.length === 0 ? (
          <Card className="p-4.5" style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin actividad registrada todavía.</Card>
        ) : (
          <List>
            {actividadVisible.map((r) => (
              <ListRow key={r.id}>
                <span className="min-w-0 flex-1 truncate text-[13px] text-adm-text-2" title={describeActivity(r)}>{describeActivity(r)}</span>
                <span className="shrink-0 text-[11px] text-adm-text-4">{timeAgo(r.created_at)}</span>
              </ListRow>
            ))}
            {activity.length > ACTIVIDAD_VISIBLE && (
              <ListButton
                onClick={() => setVerTodaActividad((v) => !v)}
                className="gap-2 text-[13.5px] font-semibold"
                style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
              >
                {verTodaActividad ? 'Ver menos' : `Ver toda la actividad (${activity.length})`}
              </ListButton>
            )}
          </List>
        )}
      </Section>

      {editor.open && (
        <StaffModal
          restaurantId={restaurantId}
          slug={slug}
          member={editor.member}
          enabledSections={enabledSections}
          isOwner={isOwner}
          onClose={() => setEditor({ open: false, member: null })}
          onSaved={() => { setEditor({ open: false, member: null }); router.refresh(); }}
        />
      )}
    </div>
  );
}

function StaffModal({ restaurantId, slug, member, enabledSections, isOwner, onClose, onSaved }: {
  restaurantId: string;
  slug: string | null;
  member: StaffMember | null;
  enabledSections: string[];
  isOwner: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !member;
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? ['mesero']);
  // Con qué credencial entra: PIN en el aparato del local (lo normal) o un
  // usuario de este restaurante (el administrador, que entra desde donde sea).
  const [access, setAccess] = useState<'pin' | 'user'>('pin');
  // Qué plantilla está marcada — solo para resaltarla; el default 'mesero'
  // refleja los `perms` con los que arranca el formulario.
  const [selectedRole, setSelectedRole] = useState<string | null>(isNew ? 'mesero' : null);
  // Controlado solo para poder enseñar la credencial completa mientras se
  // escribe (`carlos` → `carlos@rincon-502`).
  const [username, setUsername] = useState('');
  const visibleSections = ADMIN_SECTIONS.filter((s) => enabledSections.includes(s.key));
  /* Un gerente da de alta a SU equipo, no a otro gerente: el servidor lo
     rechaza (ver createStaff), así que tampoco se le ofrece aquí. La
     plantilla Gerente y la credencial por usuario son del dueño. */
  const presets = isOwner ? ROLE_PRESETS : ROLE_PRESETS.filter((p) => p.key !== 'gerente');

  /** El gerente lleva todo lo que el restaurante tenga activo menos el cobro. */
  const gerentePerms = visibleSections
    .map((s) => s.key as string)
    .filter((k) => !GERENTE_EXCLUDES.includes(k));

  function applyPreset(preset: (typeof ROLE_PRESETS)[number]) {
    const list = preset.perms === 'gerente' ? gerentePerms : preset.perms;
    setPerms(list.filter((p) => enabledSections.includes(p)));
    setAccess(preset.access ?? 'pin');
    setSelectedRole(preset.key);
  }

  const createAction = useActionState<StaffState, FormData>(createStaff, null);
  const updateAction = useActionState<StaffState, FormData>(updateStaffPermissions, null);
  const pinAction = useActionState<StaffPinState, FormData>(setStaffPin, null);
  const passAction = useActionState<StaffState, FormData>(resetStaffPassword, null);

  const [state, formAction, isPending] = isNew ? createAction : updateAction;

  useEffect(() => { if (state && 'ok' in state) onSaved(); }, [state, onSaved]);
  /* Aviso del panel en vez de `alert()` (caja del sistema operativo).
     Dependen del RESULTADO, no de la tupla de useActionState, que es nueva
     en cada render y repetía el aviso (auditoría 2026-10-02, T-16). */
  const toast = useToastManager();
  const { confirmSubmit, dialog } = useConfirm();
  const pinResult = pinAction[0];
  const passResult = passAction[0];
  useEffect(() => {
    if (pinResult && 'ok' in pinResult) toast.add({ title: 'PIN actualizado', type: 'success' });
  }, [pinResult, toast]);
  useEffect(() => {
    if (passResult && 'ok' in passResult) {
      toast.add({ title: 'Contraseña actualizada', description: 'Pásasela a esta persona.', type: 'success' });
    }
  }, [passResult, toast]);

  function toggle(key: string) {
    setPerms((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  const label: React.CSSProperties = FIELD_LABEL;
  const input: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' };

  const isMesero = perms.includes('mesero');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showClose={false} className="flex w-[480px] max-w-[94vw] max-h-[90vh] flex-col p-0">
        {dialog}
        <DialogHeader className="flex-row items-center justify-between px-5.5 py-4.5 border-b border-[var(--u-hair)] space-y-0">
          <DialogTitle className="t-display" style={{ fontSize: 20 }}>{isNew ? 'Nuevo miembro' : (member!.full_name || 'Miembro del equipo')}</DialogTitle>
          <Button type="button" onClick={onClose} variant="ghost" size="icon" aria-label="Cerrar"><Icon name="x" size={18} /></Button>
        </DialogHeader>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            {!isNew && <input type="hidden" name="userId" value={member!.id} />}
            {perms.map((p) => <input key={p} type="hidden" name="permissions" value={p} />)}

            <div>
              <label style={label}>Nombre {isNew && '*'}</label>
              <input name="full_name" required={isNew} defaultValue={member?.full_name ?? ''} placeholder="Ej. Carlos, Juan (cajero)…" style={input} />
            </div>

            {isNew && (
              <div>
                <label style={label}>Plantilla</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {presets.map((p) => {
                    const on = selectedRole === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="press"
                        style={{
                          padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                          border: `1.5px solid ${on ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
                          background: on ? 'color-mix(in srgb, var(--brand-accent) 14%, transparent)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                          color: on ? 'var(--u-text)' : 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Icon name={p.icon} size={12} />{p.label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 8 }}>
                  Marca lo típico de ese rol para no revisar ~20 opciones — ajusta libremente las secciones de abajo después.
                  {isOwner && (
                    <>
                      <strong> Gerente</strong> da todo menos el cobro, y entra con su propio usuario.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Cómo entra. Dos credenciales para dos situaciones distintas:
                el PIN es para quien teclea quince veces por turno en el
                aparato del local; el correo es para el encargado, que entra
                desde su casa y responde por lo que hace. */}
            {isNew && !isOwner && <input type="hidden" name="access_type" value="pin" />}
            {isNew && isOwner && (
              <div>
                <input type="hidden" name="access_type" value={access} />
                <label style={label}>Cómo entra *</label>
                {/* La plantilla ya decide esto: Gerente entra con usuario,
                    cualquier otra con PIN. Se muestra solo la que aplica —
                    la otra desaparece en vez de dejarla ahí para escoger,
                    que era lo confuso. */}
                <div style={{
                  padding: '10px 12px', borderRadius: 11,
                  border: '1.5px solid var(--brand-accent)',
                  background: 'color-mix(in srgb, var(--brand-accent) 10%, transparent)',
                }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
                    {access === 'user' ? 'Con un usuario' : 'Con un PIN'}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                    {access === 'user' ? 'Desde donde sea' : 'En el aparato del local'}
                  </span>
                </div>
              </div>
            )}

            {isNew && access === 'pin' && (
              <div>
                <label style={label}>PIN de acceso (4 dígitos) *</label>
                <input
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  placeholder="1234"
                  style={{ ...input, letterSpacing: '0.3em' }}
                />
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6 }}>
                  Con este PIN entrará desde &quot;¿Quién eres?&quot; en el dispositivo del local — sin email ni contraseña.
                </p>
              </div>
            )}

            {isNew && access === 'user' && (
              <>
                <div>
                  <label style={label}>Usuario *</label>
                  <input
                    name="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    pattern="[a-z0-9_-]{3,24}"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Ej. carlos"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    style={input}
                  />
                  {/* La credencial se enseña ENTERA mientras se escribe. Es
                      la diferencia entre una credencial que solo funciona
                      desde el subdominio del local y una que se puede
                      dictar por WhatsApp y usar desde cualquier parte: el
                      dueño no tiene forma de adivinar que hay que pegarle
                      la dirección del restaurante detrás. */}
                  {username.length >= 3 && slug && (
                    <div
                      style={{
                        marginTop: 8, padding: '9px 12px', borderRadius: 10,
                        border: '1px solid var(--u-hair)',
                        background: 'color-mix(in srgb, var(--brand-accent) 8%, transparent)',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <Icon name="key" size={13} />
                      <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Entrará escribiendo{' '}
                        <strong style={{ color: 'var(--u-text)' }}>{staffLoginHandle(username, slug)}</strong>
                      </span>
                    </div>
                  )}
                  <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6 }}>
                    Minúsculas, números, guion y guion bajo. Este usuario es solo de tu
                    restaurante: no ocupa ningún correo ni sirve en ningún otro local.
                  </p>
                </div>
                <div>
                  <label style={label}>Contraseña (mínimo 8) *</label>
                  <input
                    name="password"
                    type="text"
                    minLength={8}
                    required
                    autoComplete="off"
                    placeholder="Ej. Sucursal2026"
                    style={input}
                  />
                  <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 6, lineHeight: 1.5 }}>
                    Pásale la credencial completa y la contraseña: con eso entra desde
                    esta misma dirección <em>o</em> desde el botón «Acceder» de la
                    página de Leogin, sin depender de tu cuenta. No aparecerá en la
                    grilla de PIN del local, y si la olvida se la cambias tú desde su ficha.
                  </p>
                </div>
              </>
            )}

            {/* Permisos de secciones — incluye "Mesero" como una más */}
            <div>
              <label style={label}>Acceso a secciones</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {visibleSections.map((s) => {
                  const on = perms.includes(s.key);
                  const accent = s.key === 'mesero';
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggle(s.key)}
                      className="press"
                      style={{
                        padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                        border: `1px solid ${on ? 'transparent' : accent ? 'var(--c-warn-line)' : 'var(--u-hair)'}`,
                        // Relleno sólido = --c-warn-solid (el ámbar vivo), NO --c-warn
                        // (que es la TINTA, casi marrón en claro: con texto oscuro
                        // encima la píldora quedaría ilegible).
                        background: on ? (accent ? 'var(--c-warn-solid)' : 'var(--u-text)') : accent ? 'var(--c-warn-bg)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                        color: on ? (accent ? '#1a1206' : 'var(--brand-bg)') : accent ? 'var(--c-warn)' : 'var(--u-text-3)',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {accent && <Icon name="userPlus" size={12} />}{s.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 8 }}>
                {isMesero
                  ? 'Con la sección Mesero podrá tomar pedidos en mesa desde /admin/mesero. Si además marcas otras secciones, también entrará al panel admin.'
                  : 'Marca las secciones del panel a las que tendrá acceso. Marca Mesero para que tome pedidos en mesa.'}
              </p>
            </div>

            {state && 'error' in state && <div style={{ fontSize: 13, color: 'var(--c-danger)' }}>{state.error}</div>}

            <Button type="submit" disabled={isPending} size="lg" className="w-full rounded-adm-full">
              {isPending ? 'Guardando…' : isNew ? 'Crear miembro' : 'Guardar cambios'}
            </Button>
          </form>

          {!isNew && (
            <>
              <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <form action={pinAction[1]} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="userId" value={member!.id} />
                  <div style={{ flex: 1 }}>
                    <label style={label}>Cambiar PIN</label>
                    <input name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" style={{ ...input, letterSpacing: '0.3em' }} />
                  </div>
                  <Button type="submit" variant="secondary" className="whitespace-nowrap">Cambiar</Button>
                </form>
                {pinAction[0] && 'error' in pinAction[0] && <div style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{pinAction[0].error}</div>}

                {/* Un acceso por usuario no tiene correo, así que no existe
                    "olvidé mi contraseña" para él: el buzón al que se
                    mandaría el enlace no existe. Esta es su única vía de
                    recuperación, y por eso es del dueño. */}
                {isOwner && member!.access === 'user' && (
                  <>
                    <form action={passAction[1]} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <input type="hidden" name="restaurantId" value={restaurantId} />
                      <input type="hidden" name="userId" value={member!.id} />
                      <div style={{ flex: 1 }}>
                        <label style={label}>Nueva contraseña de {staffLoginHandle(member!.username ?? '', slug)}</label>
                        <input name="password" type="text" minLength={8} autoComplete="off" placeholder="Mínimo 8 caracteres" style={input} />
                      </div>
                      <Button type="submit" variant="secondary" className="whitespace-nowrap">Cambiar</Button>
                    </form>
                    {passAction[0] && 'error' in passAction[0] && <div style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{passAction[0].error}</div>}
                  </>
                )}

                <form
                  action={removeStaff}
                  onSubmit={confirmSubmit({
                    title: '¿Quitar a esta persona del equipo?',
                    description: 'Pierde el acceso al panel desde ya.',
                    confirmLabel: 'Quitar',
                  })}
                >
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="userId" value={member!.id} />
                  <Button type="submit" variant="destructive" className="w-full">
                    Quitar del equipo
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
