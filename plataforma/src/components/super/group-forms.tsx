'use client';

import { useActionState } from 'react';
import { createOrganization, createGroupOwner, type SuperState } from '@/lib/actions/super-admin';

const input: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '11px 13px', color: 'var(--u-text)', fontSize: 15, outline: 'none',
};
const label: React.CSSProperties = {
  fontSize: 11.5, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 6, display: 'block',
};
const btn: React.CSSProperties = {
  width: '100%', padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15,
  border: 'none', cursor: 'pointer',
};
function ErrorBox({ state }: { state: SuperState }) {
  if (!state || !('error' in state)) return null;
  return <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)', color: '#f87171', fontSize: 14 }}>{state.error}</div>;
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrganization, null);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={label}>Nombre del grupo *</label>
        <input name="name" required placeholder="Ej. Tacos del Norte" style={input} />
      </div>
      <div>
        <label style={label}>Slug (subdominio)</label>
        <input name="slug" placeholder="tacos-del-norte" style={input} />
        <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 4, display: 'block' }}>
          El jefe entrará en <strong>slug-central.tudominio.com</strong>. Vacío = se genera del nombre.
        </span>
      </div>
      <div>
        <label style={label}>Email de contacto</label>
        <input name="contact_email" type="email" placeholder="jefe@grupo.com" style={input} />
      </div>
      <ErrorBox state={state} />
      <button type="submit" disabled={pending} className="press btn-accent" style={{ ...btn, opacity: pending ? 0.7 : 1 }}>
        {pending ? 'Creando…' : 'Crear grupo'}
      </button>
    </form>
  );
}

export function GroupOwnerForm({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(createGroupOwner, null);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input type="hidden" name="orgId" value={orgId} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={label}>Nombre</label>
          <input name="full_name" placeholder="Nombre del jefe" style={input} />
        </div>
        <div>
          <label style={label}>Email *</label>
          <input name="email" type="email" required placeholder="jefe@grupo.com" style={input} />
        </div>
      </div>
      <div>
        <label style={label}>Contraseña * (mín. 8)</label>
        <input name="password" type="text" required minLength={8} placeholder="contraseña inicial" style={input} />
      </div>
      <ErrorBox state={state} />
      <button type="submit" disabled={pending} className="press glass-quiet" style={{ ...btn, color: 'var(--u-text)', opacity: pending ? 0.7 : 1 }}>
        {pending ? 'Creando…' : 'Crear acceso del jefe'}
      </button>
    </form>
  );
}
