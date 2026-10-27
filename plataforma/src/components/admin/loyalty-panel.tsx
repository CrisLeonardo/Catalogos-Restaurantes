'use client';

import { useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  saveLoyaltySettings, adjustPoints, saveReward, deleteReward, toggleReward, saveLealtadExtras,
  type LoyaltySettingsPatch, type RewardPatch, type LealtadExtrasPatch,
} from '@/lib/actions/loyalty';
import type { AjustesExtraLealtad, LoyaltySettings, LoyaltyAccount, LoyaltySummary, RewardRow } from '@/lib/db/loyalty';
import { assetSrc } from '@/lib/asset-image';
import { fmtMoney } from '@/lib/money';
import { FIELD_LABEL } from '@/components/admin/field-label';
import SaveBar, { type SaveStatus } from '@/components/admin/save-bar';
import { useValueDirty } from '@/lib/use-form-dirty';
import { Stat, StatGroup } from '@/components/ui/stat';
import PageTabs from '@/components/admin/page-tabs';

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
  extras: AjustesExtraLealtad;
}

const labelStyle: React.CSSProperties = FIELD_LABEL;

type Tab = 'miembros' | 'recompensas' | 'config';

export default function LoyaltyPanel({ restaurantId, settings, accounts, customers, summary, hasSettings, rewards, products, extras }: Props) {
  const [tab, setTab] = useState<Tab>(hasSettings ? 'miembros' : 'config');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* La fila de cifras del panel (`StatGroup`), no cuatro tarjetas sueltas
          con su propia letra (auditoría 2026-10-02, T-05). */}
      <StatGroup>
        <Stat label="Miembros" value={summary.members.toLocaleString('es-GT')} />
        <Stat label="Puntos vigentes" value={summary.puntosVigentes.toLocaleString('es-GT')} />
        <Stat label="Canjeados este mes" value={summary.canjeadosMes.toLocaleString('es-GT')} />
        <Stat label="Recompensas activas" value={String(rewards.filter((r) => r.active).length)} />
      </StatGroup>

      {/* Los campos de Configuración ya traen valores (1 punto por cada Q10…),
          así que «configura las tasas» no se entendía: lo que falta es
          GUARDARLAS, aunque sean esas (auditoría 2026-10-02, CLI-02). */}
      {!hasSettings && (
        <div className="note note-warn" style={{ fontSize: 13 }}>
          El programa todavía no está activo: revisa las tasas en Configuración y guárdalas
          (aunque te sirvan las que vienen) para empezar a dar puntos.
        </div>
      )}

      <PageTabs tabs={[['miembros', 'Miembros'], ['recompensas', 'Recompensas'], ['config', 'Configuración']] as const} value={tab} onChange={setTab} />

      {tab === 'config' && <SettingsForm restaurantId={restaurantId} settings={settings} isNew={!hasSettings} />}
      {tab === 'config' && hasSettings && <ExtrasForm restaurantId={restaurantId} extras={extras} />}
      {tab === 'miembros' && <MembersTab restaurantId={restaurantId} accounts={accounts} customers={customers} settings={settings} />}
      {tab === 'recompensas' && <RewardsTab restaurantId={restaurantId} rewards={rewards} products={products} />}
    </div>
  );
}

/* Lo que engancha (PLAN_MOMENTOS_PICO M3 y M4): el doble de puntos en el
   primer pedido y la sorpresa de la casa. Se guarda aparte de las tasas. */
function ExtrasForm({ restaurantId, extras }: { restaurantId: string; extras: AjustesExtraLealtad }) {
  const [p, setP] = useState<LealtadExtrasPatch>({
    primer_pedido_doble: extras.primerPedidoDoble,
    sorpresa_texto: extras.sorpresaTexto,
    sorpresa_cada: extras.sorpresaCada ?? 20,
  });
  const [sorpresa, setSorpresa] = useState(!!extras.sorpresaTexto);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveLealtadExtras(restaurantId, { ...p, sorpresa_texto: sorpresa ? p.sorpresa_texto : null });
      setMsg(res.error ? { text: res.error, bad: true } : { text: 'Guardado.', bad: false });
    });
  }

  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)' }}>Lo que hace volver a tus clientes</div>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: '3px 0 0', lineHeight: 1.5 }}>
          Dos detalles que el cliente ve al enviar su pedido desde su celular.
        </p>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)' }}>
        <Switch checked={p.primer_pedido_doble} onCheckedChange={(v) => setP((s) => ({ ...s, primer_pedido_doble: v }))} />
        <span>
          <strong>Doble de puntos en el primer pedido.</strong> El primer pedido que un cliente hace desde su
          celular, con su cuenta, suma el doble. Es la mejor razón para que pida por el QR.
        </span>
      </label>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)' }}>
        <Switch checked={sorpresa} onCheckedChange={setSorpresa} />
        <span>
          <strong>Sorpresa de la casa.</strong> De vez en cuando, al azar, un pedido se lleva un regalo. Le sale
          al cliente al enviar su pedido y a tu personal en la tarjeta del pedido. Tú decides el regalo;
          no se descuenta solo.
        </span>
      </label>
      {sorpresa && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>La sorpresa</label>
            <input className="adm-field" maxLength={80} placeholder="Hoy el postre va por la casa" value={p.sorpresa_texto ?? ''} onChange={(e) => setP((s) => ({ ...s, sorpresa_texto: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Sale en 1 de cada… pedidos</label>
            <input className="adm-field" type="number" inputMode="numeric" min="2" max="500" step="1" value={p.sorpresa_cada ?? ''} onChange={(e) => setP((s) => ({ ...s, sorpresa_cada: parseInt(e.target.value, 10) || null }))} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button onClick={save} disabled={isPending}>{isPending ? 'Guardando…' : 'Guardar'}</Button>
        {msg && <span role="status" style={{ fontSize: 13, color: msg.bad ? 'var(--c-danger)' : 'var(--c-ok)' }}>{msg.text}</span>}
      </div>
    </Card>
  );
}

function SettingsForm({ restaurantId, settings, isNew }: { restaurantId: string; settings: LoyaltySettings; isNew: boolean }) {
  const [p, setP] = useState<LoyaltySettingsPatch>({
    earn_rate: settings.earn_rate,
    earn_amount: settings.earn_amount,
    min_redeem: settings.min_redeem,
    signup_bonus: settings.signup_bonus,
    rewards_enabled: settings.rewards_enabled,
  });
  const [isPending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatus>(null);
  const { dirty, markSaved } = useValueDirty(p);
  function set<K extends keyof LoyaltySettingsPatch>(k: K, v: LoyaltySettingsPatch[K]) { setP((s) => ({ ...s, [k]: v })); }

  function save() {
    setStatus(null);
    start(async () => {
      const res = await saveLoyaltySettings(restaurantId, p);
      if (res.error) { setStatus({ error: res.error }); return; }
      markSaved();
      setStatus({ saved: true });
    });
  }

  return (
    <>
    <Card className="flex flex-col gap-3.5 p-4">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>Puntos otorgados</label><input className="adm-field" type="number" inputMode="decimal" min="0" step="0.1" value={p.earn_rate} onChange={(e) => set('earn_rate', parseFloat(e.target.value) || 0)} /></div>
        <div><label style={labelStyle}>Por cada Q gastados</label><input className="adm-field" type="number" inputMode="decimal" min="0.01" step="1" value={p.earn_amount} onChange={(e) => set('earn_amount', parseFloat(e.target.value) || 0)} /></div>
        <div><label style={labelStyle}>Mínimo para canjear (puntos)</label><input className="adm-field" type="number" inputMode="decimal" min="0" step="1" value={p.min_redeem} onChange={(e) => set('min_redeem', parseInt(e.target.value, 10) || 0)} /></div>
        <div><label style={labelStyle}>Puntos de bienvenida</label><input className="adm-field" type="number" inputMode="decimal" min="0" step="1" value={p.signup_bonus} onChange={(e) => set('signup_bonus', parseInt(e.target.value, 10) || 0)} /></div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)' }}>
        <Switch checked={p.rewards_enabled} onCheckedChange={(v) => set('rewards_enabled', v)} />
        {/* En un <span>: sueltos, el texto y el <strong> eran tres hijos del
            flex y la frase se partía en columnas en el teléfono. */}
        <span>Mostrar el catálogo de <strong>Recompensas</strong> en el menú (canje de puntos por productos)</span>
      </label>

      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        La regla general (<strong>{p.earn_rate} pts por cada Q{p.earn_amount}</strong>) aplica a los productos sin puntos propios. Puedes fijar
        los puntos exactos de cada producto en su ficha (Menú → editar producto → <em>Puntos de lealtad</em>).
        Los puntos se acumulan cuando el pedido se marca <strong>entregado</strong>.
      </p>
      {/* Plegado: es la letra pequeña del programa, se lee una vez. */}
      <details style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--u-text-2)', width: 'fit-content' }}>
          ¿Quién acumula puntos?
        </summary>
        <p style={{ margin: '6px 0 0' }}>
          Solo quien pide con su <strong>cuenta de Google</strong>. Los pedidos sin sesión (invitados)
          quedan registrados como pedido normal, pero no suman puntos ni reciben los de bienvenida; y si
          esa persona inicia sesión más tarde, sus pedidos anteriores no ganan puntos.
        </p>
      </details>
    </Card>
    {/* Recién creado el programa, los valores de muestra también hay que
        guardarlos: la barra sale aunque no se haya tocado nada. */}
    <SaveBar
      dirty={dirty || (isNew && !status)}
      pending={isPending}
      status={status}
      onSave={save}
      label={isNew && !dirty ? 'Activar el programa' : 'Guardar'}
      hint={isNew && !dirty ? 'El programa aún no está activo' : undefined}
      guardLeave={dirty}
    />
    </>
  );
}

function RewardsTab({ restaurantId, rewards, products }: { restaurantId: string; rewards: RewardRow[]; products: RewardProduct[] }) {
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
    });
  }

  function remove(id: string) {
    start(async () => {
      await deleteReward(restaurantId, id);
      if (editingId === id) reset();
    });
  }

  function toggle(id: string, active: boolean) {
    start(async () => { await toggleReward(restaurantId, id, active); });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card className="flex flex-col gap-3 p-4">
        <div className="adm-label">{editingId ? 'Editar recompensa' : 'Nueva recompensa'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={labelStyle}>Platillo del menú</label>
            <Select
              options={[{ value: '', label: '— Recompensa sin producto —' }, ...products.map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(Number(p.price))}` }))]}
              value={form.product_id ?? ''}
              onValueChange={pickProduct}
            />
          </div>
          <div><label style={labelStyle}>Nombre visible</label><input className="adm-field" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Hamburguesa gratis" /></div>
          <div><label style={labelStyle}>Costo en puntos</label><input className="adm-field" style={{ textAlign: 'right' }} type="number" inputMode="decimal" min="1" step="1" value={form.points_cost} onChange={(e) => set('points_cost', parseInt(e.target.value, 10) || 0)} /></div>
        </div>
        <div><label style={labelStyle}>Descripción (opcional)</label><input className="adm-field" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Detalle breve de la recompensa" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><label style={labelStyle}>Stock límite (vacío = ilimitado)</label><input className="adm-field" type="number" inputMode="decimal" min="0" step="1" value={form.stock ?? ''} onChange={(e) => set('stock', e.target.value === '' ? null : parseInt(e.target.value, 10))} /></div>
          <div><label style={labelStyle}>Máx. por cliente (vacío = sin límite)</label><input className="adm-field" type="number" inputMode="decimal" min="1" step="1" value={form.per_customer_limit ?? ''} onChange={(e) => set('per_customer_limit', e.target.value === '' ? null : parseInt(e.target.value, 10))} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13, color: 'var(--u-text-2)' }}>
          <Switch checked={form.active !== false} onCheckedChange={(v) => set('active', v)} />
          Activa (visible para los comensales)
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={save} disabled={isPending || !form.title.trim() || !(form.points_cost > 0)} size="sm" className="rounded-adm-full">
            {isPending ? '…' : editingId ? 'Guardar cambios' : 'Agregar recompensa'}
          </Button>
          {editingId && <Button onClick={reset} variant="outline" size="sm" className="rounded-adm-full">Cancelar</Button>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>{msg}</span>}
        </div>
      </Card>

      {rewards.length === 0 ? (
        <Card className="p-7 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>Aún no hay recompensas. Crea la primera arriba.</Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rewards.map((r) => (
            <Card key={r.id} className="flex items-center gap-3 p-3" style={{ opacity: r.active ? 1 : 0.6 }}>
              <div style={{ width: 46, height: 46, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 18 }}>
                {r.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={assetSrc(r.image_url, 96)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🎁'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 2 }}>
                  {r.product_name ? r.product_name : 'Sin producto'}
                  {r.stock != null && ` · stock ${r.stock}`}
                  {r.per_customer_limit != null && ` · máx ${r.per_customer_limit}/cliente`}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: 'var(--brand-accent-ink)', fontSize: 14, whiteSpace: 'nowrap' }}>{r.points_cost.toLocaleString('es-GT')} pts</div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Button onClick={() => toggle(r.id, !r.active)} disabled={isPending} variant="outline" size="sm" title={r.active ? 'Desactivar' : 'Activar'}>{r.active ? 'Ocultar' : 'Mostrar'}</Button>
                <Button onClick={() => startEdit(r)} variant="outline" size="sm">Editar</Button>
                <Button onClick={() => remove(r.id)} disabled={isPending} variant="outline" size="sm" className="border-[var(--c-danger-line)] text-[var(--c-danger)]">Borrar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersTab({ restaurantId, accounts, customers, settings }: { restaurantId: string; accounts: LoyaltyAccount[]; customers: { id: string; name: string; phone: string }[]; settings: LoyaltySettings }) {
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
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card className="flex flex-col gap-3 p-4">
        <div className="adm-label">Asignar / restar puntos manualmente</div>
        {/* .admin-form-3: 3 columnas en escritorio, apilado en móvil (antes
            columnas fijas que aplastaban el selector de cliente). */}
        <div className="admin-form-3">
          <div className="fg-full">
            <label style={labelStyle}>Cliente</label>
            <Select
              options={[{ value: '', label: 'Selecciona…' }, ...customers.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))]}
              value={customerId}
              onValueChange={setCustomerId}
            />
          </div>
          <div><label style={labelStyle}>Puntos</label><input className="adm-field" style={{ textAlign: 'right' }} type="number" inputMode="numeric" min="1" step="1" value={points} onChange={(e) => setPoints(e.target.value)} /></div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <Select
              options={[{ value: 'ADJUST', label: 'Sumar' }, { value: 'REDEEM', label: 'Restar' }]}
              value={tipo}
              onValueChange={(v) => setTipo(v as 'ADJUST' | 'REDEEM')}
            />
          </div>
        </div>
        <div><label style={labelStyle}>Nota (opcional)</label><input className="adm-field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo del ajuste" /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={apply} disabled={isPending || !customerId} size="sm" className="rounded-adm-full">
            {isPending ? '…' : tipo === 'REDEEM' ? 'Restar puntos' : 'Sumar puntos'}
          </Button>
          {tipo === 'REDEEM' && points && <span style={{ fontSize: 12, color: 'var(--u-text-3)' }}>≈ {fmtMoney((parseInt(points, 10) || 0) * settings.redeem_value)} de descuento</span>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>{msg}</span>}
        </div>
      </Card>

      {accounts.length === 0 ? (
        <Card className="p-7 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>Aún no hay miembros con puntos.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* En móvil se oculta "Histórico" (columna menos útil) para que
              Cliente/Saldo/Valor quepan sin desbordar la pantalla. */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
              {['Cliente', 'Saldo', 'Histórico', 'Valor'].map((h) => <th key={h} className={h === 'Histórico' ? 'hide-mobile' : undefined} style={{ padding: '10px 12px', textAlign: h === 'Cliente' ? 'left' : 'right', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  <td style={{ padding: '10px 12px' }}><div style={{ fontWeight: 500 }}>{a.customer_name}</div><div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{a.customer_phone}</div></td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--ui-font-mono)', color: 'var(--brand-accent-ink)' }}>{a.points_balance.toLocaleString('es-GT')}</td>
                  <td className="hide-mobile" style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{a.lifetime_points.toLocaleString('es-GT')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--u-text-3)', fontFamily: 'var(--ui-font-mono)' }}>{fmtMoney(a.points_balance * settings.redeem_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
