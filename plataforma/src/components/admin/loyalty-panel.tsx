'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { saveLoyaltySettings, adjustPoints, type LoyaltySettingsPatch } from '@/lib/actions/loyalty';
import type { LoyaltySettings, LoyaltyAccount, LoyaltySummary } from '@/lib/db/loyalty';

interface Props {
  restaurantId: string;
  settings: LoyaltySettings;
  accounts: LoyaltyAccount[];
  customers: { id: string; name: string; phone: string }[];
  summary: LoyaltySummary;
  hasSettings: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
};

export default function LoyaltyPanel({ restaurantId, settings, accounts, customers, summary, hasSettings }: Props) {
  const [tab, setTab] = useState<'miembros' | 'config'>(hasSettings ? 'miembros' : 'config');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Miembros" value={String(summary.members)} />
        <Kpi label="Puntos vigentes" value={summary.puntosVigentes.toLocaleString('es-GT')} accent />
        <Kpi label="Canjeados este mes" value={summary.canjeadosMes.toLocaleString('es-GT')} />
        <Kpi label="1 punto =" value={`Q ${Number(settings.redeem_value).toFixed(2)}`} />
      </div>

      {!hasSettings && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: 13 }}>
          Configura las tasas del programa para empezar a acumular puntos.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['miembros', 'Miembros'], ['config', 'Configuración']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'config'
        ? <SettingsForm restaurantId={restaurantId} settings={settings} />
        : <MembersTab restaurantId={restaurantId} accounts={accounts} customers={customers} settings={settings} />}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Glass variant="quiet" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', lineHeight: 1 }}>{value}</span>
    </Glass>
  );
}

function SettingsForm({ restaurantId, settings }: { restaurantId: string; settings: LoyaltySettings }) {
  const router = useRouter();
  const [p, setP] = useState<LoyaltySettingsPatch>({
    earn_rate: settings.earn_rate,
    redeem_value: settings.redeem_value,
    min_redeem: settings.min_redeem,
    signup_bonus: settings.signup_bonus,
  });
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function set<K extends keyof LoyaltySettingsPatch>(k: K, v: number) { setP((s) => ({ ...s, [k]: v })); }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveLoyaltySettings(restaurantId, p);
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      setMsg('Guardado ✓');
      router.refresh();
    });
  }

  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>Puntos por cada Q1 gastado</label><input style={inputStyle} type="number" min="0" step="0.1" value={p.earn_rate} onChange={(e) => set('earn_rate', parseFloat(e.target.value) || 0)} /></div>
        <div><label style={labelStyle}>Valor de 1 punto (Q)</label><input style={inputStyle} type="number" min="0" step="0.01" value={p.redeem_value} onChange={(e) => set('redeem_value', parseFloat(e.target.value) || 0)} /></div>
        <div><label style={labelStyle}>Mínimo para canjear (puntos)</label><input style={inputStyle} type="number" min="0" step="1" value={p.min_redeem} onChange={(e) => set('min_redeem', parseInt(e.target.value, 10) || 0)} /></div>
        <div><label style={labelStyle}>Puntos de bienvenida</label><input style={inputStyle} type="number" min="0" step="1" value={p.signup_bonus} onChange={(e) => set('signup_bonus', parseInt(e.target.value, 10) || 0)} /></div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0 }}>
        Ejemplo: con {p.earn_rate} pts/Q1, un pedido de Q100 da <strong>{Math.floor(100 * p.earn_rate)} puntos</strong> = Q{(Math.floor(100 * p.earn_rate) * p.redeem_value).toFixed(2)} en futuros canjes.
        Los puntos se acumulan automáticamente cuando el pedido se marca <strong>entregado</strong>.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={isPending} className="press btn-accent" style={{ padding: '10px 22px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
          {isPending ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
    </Glass>
  );
}

function MembersTab({ restaurantId, accounts, customers, settings }: { restaurantId: string; accounts: LoyaltyAccount[]; customers: { id: string; name: string; phone: string }[]; settings: LoyaltySettings }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [points, setPoints] = useState('');
  const [tipo, setTipo] = useState<'ADJUST' | 'REDEEM'>('ADJUST');
  const [note, setNote] = useState('');
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function apply() {
    setMsg(null);
    start(async () => {
      const res = await adjustPoints(restaurantId, customerId, parseInt(points, 10) || 0, tipo, note);
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      setMsg(`Saldo actualizado: ${res.balance} pts`);
      setPoints(''); setNote('');
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="t-kicker" style={{ fontSize: 10.5 }}>Asignar / canjear puntos manualmente</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px', gap: 10 }}>
          <div>
            <label style={labelStyle}>Cliente</label>
            <select style={inputStyle} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Selecciona…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Puntos</label><input style={{ ...inputStyle, textAlign: 'right' }} type="number" min="1" step="1" value={points} onChange={(e) => setPoints(e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select style={inputStyle} value={tipo} onChange={(e) => setTipo(e.target.value as 'ADJUST' | 'REDEEM')}>
              <option value="ADJUST">Sumar</option>
              <option value="REDEEM">Canjear</option>
            </select>
          </div>
        </div>
        <div><label style={labelStyle}>Nota (opcional)</label><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo del ajuste" /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={apply} disabled={isPending || !customerId} className="press btn-accent" style={{ padding: '9px 20px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: (isPending || !customerId) ? 0.6 : 1 }}>
            {isPending ? '…' : tipo === 'REDEEM' ? 'Canjear puntos' : 'Sumar puntos'}
          </button>
          {tipo === 'REDEEM' && points && <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>≈ Q{((parseInt(points, 10) || 0) * settings.redeem_value).toFixed(2)} de descuento</span>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
        </div>
      </Glass>

      {accounts.length === 0 ? (
        <Glass variant="quiet" style={{ padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>Aún no hay miembros con puntos.</Glass>
      ) : (
        <Glass variant="quiet" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
              {['Cliente', 'Saldo', 'Histórico', 'Valor'].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Cliente' ? 'left' : 'right', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500 }}>{a.customer_name}</div><div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{a.customer_phone}</div></td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: 'var(--brand-accent)' }}>{a.points_balance.toLocaleString('es-GT')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{a.lifetime_points.toLocaleString('es-GT')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>Q{(a.points_balance * settings.redeem_value).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Glass>
      )}
    </div>
  );
}
