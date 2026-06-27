'use client';

/* ============================================================
   Gestión de API keys (Super Admin) — crear, copiar (1 vez), revocar.
   Para integraciones externas / pasarela de pago a futuro.
   ============================================================ */

import { useActionState, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyCreateResult } from '@/lib/actions/api-keys';
import type { ApiKeyRow } from '@/lib/api-keys';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 11, padding: '10px 12px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
};

export default function ApiKeysManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [state, action, pending] = useActionState<ApiKeyCreateResult | null, FormData>(createApiKeyAction, null);
  const justCreated = state && 'ok' in state ? state : null;

  return (
    <div style={{
      borderRadius: 16, background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px', maxWidth: 680,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', marginBottom: 6 }}>
        API keys
      </h2>
      <p style={{ fontSize: 13, color: 'var(--u-text-4)', marginBottom: 18, lineHeight: 1.5 }}>
        Llaves que Leogin emite a integradores para llamar su API (p.ej. webhooks de la
        pasarela de pago a futuro). El secreto se muestra <strong>una sola vez</strong> al crearla;
        guárdalo en un lugar seguro. Las llaves secretas de terceros (Stripe/Recurrente) van en
        variables de entorno, no aquí.
      </p>

      {/* Token recién creado */}
      {justCreated && (
        <div style={{ marginBottom: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
          <div style={{ fontSize: 12.5, color: '#4ade80', fontWeight: 700, marginBottom: 8 }}>
            Llave creada — cópiala ahora, no se volverá a mostrar:
          </div>
          <CopyRow token={justCreated.token} />
        </div>
      )}

      {/* Form de creación */}
      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input name="name" placeholder="Webhook Recurrente" style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>Scopes (coma)</label>
            <input name="scopes" placeholder="billing:read, webhooks:write" style={inputStyle} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--u-text-3)' }}>
          <input type="checkbox" name="live" value="true" defaultChecked style={{ width: 16, height: 16 }} />
          Llave de producción (desmarca para una de prueba)
        </label>
        {state && 'error' in state && (
          <p style={{ fontSize: 13, color: '#f87171' }}>{state.error}</p>
        )}
        <button type="submit" disabled={pending} style={{
          padding: '11px 22px', borderRadius: 10, fontWeight: 700, fontSize: 14,
          cursor: pending ? 'not-allowed' : 'pointer', alignSelf: 'flex-start',
          background: pending ? 'rgba(255,255,255,0.08)' : 'var(--u-text)',
          color: pending ? 'var(--u-text-3)' : 'var(--brand-bg)', border: 'none',
        }}>
          {pending ? 'Generando…' : 'Generar llave'}
        </button>
      </form>

      {/* Listado */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {initialKeys.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Aún no hay llaves.</p>
        ) : (
          initialKeys.map((k) => <KeyRow key={k.id} k={k} />)
        )}
      </div>
    </div>
  );
}

function CopyRow({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <code style={{ flex: 1, fontSize: 12.5, color: 'var(--u-text)', background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all', fontFamily: 'var(--ui-font-mono)' }}>
        {token}
      </code>
      <button
        type="button"
        onClick={async () => { try { await navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {} }}
        className="press"
        style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
      >
        {copied ? 'Copiado ✓' : 'Copiar'}
      </button>
    </div>
  );
}

function KeyRow({ k }: { k: ApiKeyRow }) {
  const [isPending, start] = useTransition();
  const [revoked, setRevoked] = useState(!!k.revoked_at);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--u-hair)', opacity: revoked ? 0.55 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text-2)' }}>{k.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', fontFamily: 'var(--ui-font-mono)' }}>
          {k.key_prefix}…{k.scopes.length > 0 ? ` · ${k.scopes.join(', ')}` : ''}
          {k.last_used_at ? ` · usada ${k.last_used_at.slice(0, 10)}` : ' · sin uso'}
        </div>
      </div>
      {revoked ? (
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>REVOCADA</span>
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => start(async () => { const r = await revokeApiKeyAction(k.id); if (!r.error) setRevoked(true); })}
          className="press"
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Icon name="trash" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Revocar
        </button>
      )}
    </div>
  );
}
