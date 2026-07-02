'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import {
  saveLoyaltySettings, adjustPoints, saveReward, deleteReward, toggleReward,
  type LoyaltySettingsPatch, type RewardPatch,
} from '@/lib/actions/loyalty';
import type { LoyaltySettings, LoyaltyAccount, LoyaltySummary, RewardRow } from '@/lib/db/loyalty';

interface RewardProduct { id: string; name: string; price: number; image_url: string | null; cost: number | null }

interface Props {
  restaurantId: string;
  settings: LoyaltySettings;
  accounts: LoyaltyAccount[];
  customers: { id: string; name: string; phone: string }[];
  summary: LoyaltySummary;
  hasSettings: boolean;
  rewards: RewardRow[];
  products: RewardProduct[];
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
  // El panel admin siempre es oscuro; sin esto el popup nativo de <select>
  // se renderiza en blanco (tema claro del SO), ilegible sobre el resto de la UI.
  colorScheme: 'dark',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
};

type Tab = 'miembros' | 'recompensas' | 'config';

export default function LoyaltyPanel({ restaurantId, settings, accounts, customers, summary, hasSettings, rewards, products }: Props) {
  const [tab, setTab] = useState<Tab>(hasSettings ? 'miembros' : 'config');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Miembros" value={String(summary.members)} />
        <Kpi label="Puntos vigentes" value={summary.puntosVigentes.toLocaleString('es-GT')} accent />
        <Kpi label="Canjeados este mes" value={summary.canjeadosMes.toLocaleString('es-GT')} />
        <Kpi label="Recompensas activas" value={String(rewards.filter((r) => r.active).length)} />
      </div>

      {!hasSettings && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: 13 }}>
          Configura las tasas del programa para empezar a acumular puntos.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['miembros', 'Miembros'], ['recompensas', 'Recompensas'], ['config', 'Configuración']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' && <SettingsForm restaurantId={restaurantId} settings={settings} />}
      {tab === 'miembros' && <MembersTab restaurantId={restaurantId} accounts={accounts} customers={customers} settings={settings} />}
      {tab === 'recompensas' && <RewardsTab restaurantId={restaurantId} rewards={rewards} products={products} />}
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
    min_redeem: settings.min_redeem,
    signup_bonus: settings.signup_bonus,
    rewards_enabled: settings.rewards_enabled,
  });
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function set<K extends keyof LoyaltySettingsPatch>(k: K, v: LoyaltySettingsPatch[K]) { setP((s) => ({ ...s, [k]: v })); }

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
        <div><label style={labelStyle}>Puntos por cada Q10 gastados</label><input style={inputStyle} type="number" min="0" step="0.1" value={p.earn_rate} onChange={(e) => set('earn_rate', parseFloat(e.target.value) || 0)} /></div>
        <div><label style={labelStyle}>Mínimo para canjear (puntos)</label><input style={inputStyle} type="number" min="0" step="1" value={p.min_redeem} onChange={(e) => set('min_redeem', parseInt(e.target.value, 10) || 0)} /></div>
        <div><label style={labelStyle}>Puntos de bienvenida</label><input style={inputStyle} type="number" min="0" step="1" value={p.signup_bonus} onChange={(e) => set('signup_bonus', parseInt(e.target.value, 10) || 0)} /></div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13.5, color: 'var(--u-text-2)' }}>
        <input type="checkbox" checked={p.rewards_enabled} onChange={(e) => set('rewards_enabled', e.target.checked)} style={{ width: 17, height: 17, accentColor: 'var(--brand-accent)' }} />
        Mostrar el catálogo de <strong>Recompensas</strong> en el menú (canje de puntos por productos)
      </label>

      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        La regla general (<strong>{p.earn_rate} pts/Q10</strong>) aplica a los productos sin puntos propios. Puedes fijar
        los puntos exactos de cada producto en su ficha (Menú → editar producto → <em>Puntos de lealtad</em>).
        Los puntos se acumulan cuando el pedido se marca <strong>entregado</strong>.
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

function RewardsTab({ restaurantId, rewards, products }: { restaurantId: string; rewards: RewardRow[]; products: RewardProduct[] }) {
  const router = useRouter();
  const blank: RewardPatch = { product_id: '', title: '', description: '', image_url: '', points_cost: 100, active: true, stock: null, per_customer_limit: null, sort_order: 0 };
  const [form, setForm] = useState<RewardPatch>(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof RewardPatch>(k: K, v: RewardPatch[K]) { setForm((s) => ({ ...s, [k]: v })); }

  function pickProduct(id: string) {
    const prod = products.find((p) => p.id === id);
    setForm((s) => ({
      ...s,
      product_id: id || null,
      title: s.title?.trim() ? s.title : (prod?.name ?? ''),
      image_url: s.image_url?.trim() ? s.image_url : (prod?.image_url ?? ''),
    }));
  }

  function startEdit(r: RewardRow) {
    setEditingId(r.id);
    setForm({
      id: r.id, product_id: r.product_id ?? '', title: r.title, description: r.description ?? '',
      image_url: r.image_url ?? '', points_cost: r.points_cost, active: r.active,
      stock: r.stock, per_customer_limit: r.per_customer_limit, sort_order: r.sort_order,
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reset() { setEditingId(null); setForm(blank); setMsg(null); }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveReward(restaurantId, form);
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      reset();
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteReward(restaurantId, id);
      if (editingId === id) reset();
      router.refresh();
    });
  }

  function toggle(id: string, active: boolean) {
    start(async () => { await toggleReward(restaurantId, id, active); router.refresh(); });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="t-kicker" style={{ fontSize: 10.5 }}>{editingId ? 'Editar recompensa' : 'Nueva recompensa'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Producto del menú</label>
            <select style={inputStyle} value={form.product_id ?? ''} onChange={(e) => pickProduct(e.target.value)}>
              <option value="">— Recompensa sin producto —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} · Q{Number(p.price).toFixed(2)}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Nombre visible</label><input style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Hamburguesa gratis" /></div>
          <div><label style={labelStyle}>Costo en puntos</label><input style={{ ...inputStyle, textAlign: 'right' }} type="number" min="1" step="1" value={form.points_cost} onChange={(e) => set('points_cost', parseInt(e.target.value, 10) || 0)} /></div>
        </div>
        <div><label style={labelStyle}>Descripción (opcional)</label><input style={inputStyle} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalle breve de la recompensa" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><label style={labelStyle}>Stock límite (vacío = ilimitado)</label><input style={inputStyle} type="number" min="0" step="1" value={form.stock ?? ''} onChange={(e) => set('stock', e.target.value === '' ? null : parseInt(e.target.value, 10))} /></div>
          <div><label style={labelStyle}>Máx. por cliente (vacío = sin límite)</label><input style={inputStyle} type="number" min="1" step="1" value={form.per_customer_limit ?? ''} onChange={(e) => set('per_customer_limit', e.target.value === '' ? null : parseInt(e.target.value, 10))} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)' }}>
          <input type="checkbox" checked={form.active !== false} onChange={(e) => set('active', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--brand-accent)' }} />
          Activa (visible para los comensales)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={isPending || !form.title.trim() || !(form.points_cost > 0)} className="press btn-accent" style={{ padding: '9px 20px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: (isPending || !form.title.trim() || !(form.points_cost > 0)) ? 0.6 : 1 }}>
            {isPending ? '…' : editingId ? 'Guardar cambios' : 'Agregar recompensa'}
          </button>
          {editingId && <button onClick={reset} className="press" style={{ background: 'none', border: '1px solid var(--u-hair-2)', borderRadius: 'var(--radius-full)', padding: '8px 16px', color: 'var(--u-text-2)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
        </div>
      </Glass>

      {rewards.length === 0 ? (
        <Glass variant="quiet" style={{ padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>Aún no hay recompensas. Crea la primera arriba.</Glass>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rewards.map((r) => (
            <Glass key={r.id} variant="quiet" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center', opacity: r.active ? 1 : 0.6 }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 18 }}>
                {r.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={r.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🎁'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>
                  {r.product_name ? r.product_name : 'Sin producto'}
                  {r.stock != null && ` · stock ${r.stock}`}
                  {r.per_customer_limit != null && ` · máx ${r.per_customer_limit}/cliente`}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: 'var(--brand-accent)', fontSize: 14, whiteSpace: 'nowrap' }}>{r.points_cost.toLocaleString('es-GT')} pts</div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(r.id, !r.active)} disabled={isPending} className="press" title={r.active ? 'Desactivar' : 'Activar'} style={{ background: 'none', border: '1px solid var(--u-hair-2)', borderRadius: 9, padding: '6px 10px', color: 'var(--u-text-2)', fontSize: 12, cursor: 'pointer' }}>{r.active ? 'Ocultar' : 'Mostrar'}</button>
                <button onClick={() => startEdit(r)} className="press" style={{ background: 'none', border: '1px solid var(--u-hair-2)', borderRadius: 9, padding: '6px 10px', color: 'var(--u-text-2)', fontSize: 12, cursor: 'pointer' }}>Editar</button>
                <button onClick={() => remove(r.id)} disabled={isPending} className="press" style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 9, padding: '6px 10px', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Borrar</button>
              </div>
            </Glass>
          ))}
        </div>
      )}
    </div>
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
        <div className="t-kicker" style={{ fontSize: 10.5 }}>Asignar / restar puntos manualmente</div>
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
              <option value="REDEEM">Restar</option>
            </select>
          </div>
        </div>
        <div><label style={labelStyle}>Nota (opcional)</label><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo del ajuste" /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={apply} disabled={isPending || !customerId} className="press btn-accent" style={{ padding: '9px 20px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer', opacity: (isPending || !customerId) ? 0.6 : 1 }}>
            {isPending ? '…' : tipo === 'REDEEM' ? 'Restar puntos' : 'Sumar puntos'}
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
