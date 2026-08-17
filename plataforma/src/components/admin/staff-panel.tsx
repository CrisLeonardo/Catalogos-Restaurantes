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
import { ADMIN_SECTIONS } from '@/lib/permissions';
import {
  createStaff, updateStaffPermissions, removeStaff,
  type StaffState, type StaffMember, type ActivityRow,
} from '@/lib/actions/staff';
import { setStaffPin, type StaffPinState } from '@/lib/actions/staff-pin';

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
    la única que entra con SU correo (o con Google) en vez de con un PIN del
    local — ver `access` en el modal. */
const ROLE_PRESETS: { key: string; label: string; icon: string; perms: string[] | 'gerente'; access?: 'email' }[] = [
  { key: 'gerente', label: 'Gerente', icon: 'key', perms: 'gerente', access: 'email' },
  { key: 'mesero', label: 'Mesero', icon: 'userPlus', perms: ['mesero'] },
  { key: 'cajero', label: 'Cajero', icon: 'wallet', perms: ['pedidos', 'mesas', 'clientes'] },
  { key: 'cocina', label: 'Cocina', icon: 'flame', perms: ['cocina'] },
];

const STATUS_ES: Record<string, string> = {
  NEW: 'Nuevo', PREP: 'Preparando', READY: 'Listo', TRANSIT: 'En camino', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};
function describeActivity(r: ActivityRow): string {
  const who = r.actor_name ? `${r.actor_name}: ` : '';
  if (r.action === 'order_status') return `${who}pedido → ${STATUS_ES[r.entity ?? ''] ?? r.entity ?? ''}`;
  if (r.action === 'stock') return `${who}ajustó inventario`;
  if (r.action === 'promo') return `${who}promoción "${r.entity ?? ''}"`;
  if (r.action === 'staff') return `${who}gestión de personal`;
  // Soporte de Leogin dentro del panel: el actor no es del restaurante, así
  // que el nombre va en `entity` y no en `actor_name` (no está en su staff).
  if (r.action === 'soporte') return `Soporte de Leogin entró al panel${r.entity ? ` (${r.entity})` : ''}`;
  return `${who}${r.action}`;
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

const SECTION_LABEL: Record<string, string> = Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.key, s.label]));

export default function StaffPanel({ restaurantId, staff, activity, enabledSections }: {
  restaurantId: string;
  staff: StaffMember[];
  activity: ActivityRow[];
  /** Secciones que el restaurante realmente tiene activas — el picker de
      permisos no debe ofrecer módulos que el dueño ni siquiera prendió. */
  enabledSections: string[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ open: boolean; member: StaffMember | null }>({ open: false, member: null });

  function describePerms(m: StaffMember): string {
    if (m.permissions == null) return 'Acceso total';
    const labels = m.permissions.map((p) => SECTION_LABEL[p] ?? p);
    if (labels.length === 0) return 'Sin acceso';
    if (labels.length <= 3) return labels.join(' · ');
    return `${labels.slice(0, 3).join(' · ')} +${labels.length - 3}`;
  }

  function MemberCard({ m }: { m: StaffMember }) {
    const isMesero = m.permissions?.includes('mesero') ?? false;
    const byEmail = m.access === 'email';
    return (
      <Card key={m.id} className="p-3.5 flex items-center gap-3">
        <div style={{ width: 38, height: 38, borderRadius: 99, background: isMesero ? 'var(--c-warn-bg)' : 'color-mix(in srgb, var(--u-text) 8%, transparent)', display: 'grid', placeItems: 'center', color: isMesero ? 'var(--c-warn)' : 'var(--u-text)', flexShrink: 0 }}>
          <Icon name={isMesero ? 'userPlus' : 'user'} size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.full_name || 'Miembro del equipo'}</span>
            {isMesero && (
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--c-warn)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', borderRadius: 99, padding: '2px 8px' }}><Icon name="userPlus" size={11} /> Mesero</span>
            )}
          </div>
          {/* Con qué credencial entra: es lo primero que el dueño necesita
              saber cuando alguien le dice "no puedo entrar". */}
          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {byEmail ? `Entra con ${m.email ?? 'su correo'}` : 'Entra con PIN en el local'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {describePerms(m)}
          </div>
        </div>
        <Button type="button" onClick={() => setEditor({ open: true, member: m })} variant="secondary" size="sm">
          Editar
        </Button>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      {/* Personal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Personal</div>
          <Button type="button" onClick={() => setEditor({ open: true, member: null })} size="sm">
            <Icon name="plus" size={14} /> Nuevo
          </Button>
        </div>
        {staff.length === 0 ? (
          <Card className="p-4.5 text-center" style={{ color: 'var(--u-text-3)', fontSize: 13.5 }}>
            Sin personal. Agrega cajeros, ayudantes o meseros y elige a qué secciones acceden. Marca <strong>Mesero</strong> para que pueda tomar pedidos en mesa desde <strong>/admin/mesero</strong>.
          </Card>
        ) : staff.map((m) => <MemberCard key={m.id} m={m} />)}
      </div>

      {/* Bitácora */}
      <Card className="p-4.5 flex flex-col gap-2.5">
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Actividad reciente</div>
        {activity.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin actividad registrada todavía.</div>
        ) : activity.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--u-hair)', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeActivity(r)}</span>
            <span style={{ fontSize: 11, color: 'var(--u-text-4)', flexShrink: 0 }}>{timeAgo(r.created_at)}</span>
          </div>
        ))}
      </Card>

      {editor.open && (
        <StaffModal
          restaurantId={restaurantId}
          member={editor.member}
          enabledSections={enabledSections}
          onClose={() => setEditor({ open: false, member: null })}
          onSaved={() => { setEditor({ open: false, member: null }); router.refresh(); }}
        />
      )}
    </div>
  );
}

function StaffModal({ restaurantId, member, enabledSections, onClose, onSaved }: {
  restaurantId: string;
  member: StaffMember | null;
  enabledSections: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !member;
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? ['mesero']);
  // Con qué credencial entra: PIN en el aparato del local (lo normal) o su
  // propio correo (el gerente, que entra desde donde sea).
  const [access, setAccess] = useState<'pin' | 'email'>('pin');
  const visibleSections = ADMIN_SECTIONS.filter((s) => enabledSections.includes(s.key));

  /** El gerente lleva todo lo que el restaurante tenga activo menos el cobro. */
  const gerentePerms = visibleSections
    .map((s) => s.key as string)
    .filter((k) => !GERENTE_EXCLUDES.includes(k));

  function applyPreset(preset: (typeof ROLE_PRESETS)[number]) {
    const list = preset.perms === 'gerente' ? gerentePerms : preset.perms;
    setPerms(list.filter((p) => enabledSections.includes(p)));
    setAccess(preset.access ?? 'pin');
  }

  const createAction = useActionState<StaffState, FormData>(createStaff, null);
  const updateAction = useActionState<StaffState, FormData>(updateStaffPermissions, null);
  const pinAction = useActionState<StaffPinState, FormData>(setStaffPin, null);

  const [state, formAction, isPending] = isNew ? createAction : updateAction;

  useEffect(() => { if (state && 'ok' in state) onSaved(); }, [state, onSaved]);
  useEffect(() => { if (pinAction[0] && 'ok' in pinAction[0]) alert('PIN actualizado.'); }, [pinAction]);

  function toggle(key: string) {
    setPerms((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' };
  const input: React.CSSProperties = { width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' };

  const isMesero = perms.includes('mesero');

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showClose={false} className="flex w-[480px] max-w-[94vw] max-h-[90vh] flex-col p-0">
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
                  {ROLE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="press"
                      style={{
                        padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                        border: '1px solid var(--u-hair)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                        color: 'var(--u-text-2)', display: 'inline-flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <Icon name={p.icon} size={12} />{p.label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 8 }}>
                  Marca lo típico de ese rol para no revisar ~20 opciones — ajusta libremente las secciones de abajo después.
                  <strong> Gerente</strong> da todo menos el cobro, y entra con su propio correo.
                </p>
              </div>
            )}

            {/* Cómo entra. Dos credenciales para dos situaciones distintas:
                el PIN es para quien teclea quince veces por turno en el
                aparato del local; el correo es para el encargado, que entra
                desde su casa y responde por lo que hace. */}
            {isNew && (
              <div>
                <input type="hidden" name="access_type" value={access} />
                <label style={label}>Cómo entra *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([
                    { id: 'pin' as const, title: 'Con un PIN', desc: 'En el aparato del local' },
                    { id: 'email' as const, title: 'Con su correo', desc: 'Desde donde sea' },
                  ]).map((opt) => {
                    const on = access === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAccess(opt.id)}
                        className="press"
                        style={{
                          flex: 1, textAlign: 'left', cursor: 'pointer',
                          padding: '10px 12px', borderRadius: 11,
                          border: `1.5px solid ${on ? 'var(--brand-accent)' : 'var(--u-hair)'}`,
                          background: on ? 'color-mix(in srgb, var(--brand-accent) 10%, transparent)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)',
                        }}
                      >
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>{opt.title}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>{opt.desc}</span>
                      </button>
                    );
                  })}
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

            {isNew && access === 'email' && (
              <>
                <div>
                  <label style={label}>Su correo *</label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="encargado@ejemplo.com"
                    style={input}
                  />
                </div>
                <div>
                  <label style={label}>Contraseña temporal (mínimo 8) *</label>
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
                    Pásasela y pídele que la cambie desde &quot;Olvidé mi contraseña&quot;. También podrá
                    entrar con <strong>Continuar con Google</strong> usando ese mismo correo.
                    No aparecerá en la grilla de PIN del local.
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

                <form action={removeStaff} onSubmit={(e) => { if (!confirm('¿Quitar a este miembro? Perderá el acceso.')) e.preventDefault(); }}>
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
