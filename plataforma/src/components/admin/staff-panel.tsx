'use client';

/* StaffPanel — gestión de personal con permisos + bitácora (Fase D). */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { ADMIN_SECTIONS } from '@/lib/permissions';
import {
  createStaff, updateStaffPermissions, resetStaffPassword, removeStaff,
  type StaffState, type StaffMember, type ActivityRow,
} from '@/lib/actions/staff';

const STATUS_ES: Record<string, string> = {
  NEW: 'Nuevo', PREP: 'Preparando', READY: 'Listo', TRANSIT: 'En camino', DELIVERED: 'Entregado', CANCEL: 'Cancelado',
};
function describeActivity(r: ActivityRow): string {
  const who = r.actor_name ? `${r.actor_name}: ` : '';
  if (r.action === 'order_status') return `${who}pedido → ${STATUS_ES[r.entity ?? ''] ?? r.entity ?? ''}`;
  if (r.action === 'stock') return `${who}ajustó inventario`;
  if (r.action === 'promo') return `${who}promoción "${r.entity ?? ''}"`;
  if (r.action === 'staff') return `${who}gestión de personal`;
  return `${who}${r.action}`;
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export default function StaffPanel({ restaurantId, staff, activity }: { restaurantId: string; staff: StaffMember[]; activity: ActivityRow[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ open: boolean; member: StaffMember | null }>({ open: false, member: null });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      {/* Staff */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="t-kicker" style={{ fontSize: 9.5 }}>Equipo</div>
          <button onClick={() => setEditor({ open: true, member: null })} className="press" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 99, cursor: 'pointer', background: 'var(--u-text)', color: 'var(--brand-bg)', border: 'none', fontWeight: 600, fontSize: 12.5 }}>
            <Icon name="plus" size={14} /> Nuevo miembro
          </button>
        </div>

        {staff.length === 0 ? (
          <div className="glass" style={{ borderRadius: 14, padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 13.5 }}>
            Aún no tienes personal. Agrega meseros o cajeros y dales acceso solo a lo que necesiten.
          </div>
        ) : staff.map((m) => (
          <div key={m.id} className="glass" style={{ borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 99, background: 'rgba(255,255,255,0.08)', display: 'grid', placeItems: 'center', color: 'var(--u-text)', flexShrink: 0 }}>
              <Icon name="user" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--u-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.full_name || m.email}</div>
              <div style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
                {m.permissions == null ? 'Acceso total' : `${m.permissions.length} secciones`}
              </div>
            </div>
            <button onClick={() => setEditor({ open: true, member: m })} className="press glass-quiet" style={{ padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--u-text-2)' }}>
              Editar
            </button>
          </div>
        ))}
      </div>

      {/* Bitácora */}
      <div className="glass" style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Actividad reciente</div>
        {activity.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin actividad registrada todavía.</div>
        ) : activity.map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--u-hair)', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--u-text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeActivity(r)}</span>
            <span style={{ fontSize: 11, color: 'var(--u-text-4)', flexShrink: 0 }}>{timeAgo(r.created_at)}</span>
          </div>
        ))}
      </div>

      {editor.open && (
        <StaffModal
          restaurantId={restaurantId}
          member={editor.member}
          onClose={() => setEditor({ open: false, member: null })}
          onSaved={() => { setEditor({ open: false, member: null }); router.refresh(); }}
        />
      )}
    </div>
  );
}

function StaffModal({ restaurantId, member, onClose, onSaved }: { restaurantId: string; member: StaffMember | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !member;
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? ['pedidos']);

  const createAction = useActionState<StaffState, FormData>(createStaff, null);
  const updateAction = useActionState<StaffState, FormData>(updateStaffPermissions, null);
  const resetAction = useActionState<StaffState, FormData>(resetStaffPassword, null);

  const [state, formAction, isPending] = isNew ? createAction : updateAction;

  useEffect(() => { if (state && 'ok' in state) onSaved(); }, [state, onSaved]);
  useEffect(() => { if (resetAction[0] && 'ok' in resetAction[0]) alert('Contraseña actualizada.'); }, [resetAction]);

  function toggle(key: string) {
    setPerms((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }

  const label: React.CSSProperties = { fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block' };
  const input: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)', borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'grid', placeItems: 'center', background: 'rgba(7,7,8,0.65)', backdropFilter: 'blur(8px)' }}>
      <div className="glass-solid anim-pop" onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: '94vw', maxHeight: '90vh', borderRadius: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--u-hair)' }}>
          <div className="t-display" style={{ fontSize: 20 }}>{isNew ? 'Nuevo miembro' : (member!.full_name || member!.email)}</div>
          <button onClick={onClose} className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            {!isNew && <input type="hidden" name="userId" value={member!.id} />}
            {perms.map((p) => <input key={p} type="hidden" name="permissions" value={p} />)}

            <div>
              <label style={label}>Nombre</label>
              <input name="full_name" defaultValue={member?.full_name ?? ''} placeholder="Ej. Juan (mesero)" style={input} />
            </div>

            {isNew && (
              <>
                <div>
                  <label style={label}>Email *</label>
                  <input name="email" type="email" required placeholder="mesero@correo.com" style={input} />
                </div>
                <div>
                  <label style={label}>Contraseña *</label>
                  <input name="password" type="text" required minLength={8} placeholder="mínimo 8 caracteres" style={input} />
                </div>
              </>
            )}

            <div>
              <label style={label}>Acceso a secciones</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ADMIN_SECTIONS.map((s) => {
                  const on = perms.includes(s.key);
                  return (
                    <button key={s.key} type="button" onClick={() => toggle(s.key)} className="press" style={{ padding: '7px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)', color: on ? 'var(--brand-bg)' : 'var(--u-text-3)' }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {state && 'error' in state && <div style={{ fontSize: 13, color: '#f87171' }}>{state.error}</div>}

            <button type="submit" disabled={isPending} className="press btn-accent" style={{ width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Guardando…' : isNew ? 'Crear miembro' : 'Guardar permisos'}
            </button>
          </form>

          {!isNew && (
            <>
              <div style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <form action={resetAction[1]} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="userId" value={member!.id} />
                  <div style={{ flex: 1 }}>
                    <label style={label}>Nueva contraseña</label>
                    <input name="password" type="text" minLength={8} placeholder="mínimo 8 caracteres" style={input} />
                  </div>
                  <button type="submit" className="press glass-quiet" style={{ padding: '10px 14px', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)', whiteSpace: 'nowrap' }}>Cambiar</button>
                </form>
                {resetAction[0] && 'error' in resetAction[0] && <div style={{ fontSize: 12.5, color: '#f87171' }}>{resetAction[0].error}</div>}

                <form action={removeStaff} onSubmit={(e) => { if (!confirm('¿Quitar a este miembro? Perderá el acceso.')) e.preventDefault(); }}>
                  <input type="hidden" name="restaurantId" value={restaurantId} />
                  <input type="hidden" name="userId" value={member!.id} />
                  <button type="submit" className="press" style={{ width: '100%', padding: '11px', borderRadius: 11, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Quitar del equipo
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
