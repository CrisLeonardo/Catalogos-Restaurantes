'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { saveFelSettings, emitInvoice, anularInvoice, type FelSettingsPatch } from '@/lib/actions/fel';
import { PROVIDER_META, type FelProvider, type FelSettings, type FelDocument } from '@/lib/fel';
import type { FelSummary, InvoiceableOrder } from '@/lib/db/fel';

interface Props {
  restaurantId: string;
  settings: FelSettings;
  documents: FelDocument[];
  summary: FelSummary;
  invoiceable: InvoiceableOrder[];
  hasSettingsRow: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--u-text-3)', fontWeight: 500, letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 4, display: 'block',
};

function money(n: number) {
  return 'Q ' + Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PROVIDERS: FelProvider[] = ['MANUAL', 'INFILE', 'G4S', 'DIGIFACT', 'OTRO'];
const ESTADO_COLOR: Record<string, string> = {
  CERTIFICADO: '#22c55e', PENDIENTE: '#f59e0b', ANULADO: '#6b7280', ERROR: '#ef4444',
};

export default function FacturacionPanel({ restaurantId, settings, documents, summary, invoiceable, hasSettingsRow }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'emitir' | 'config' | 'historial'>(hasSettingsRow ? 'emitir' : 'config');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Documentos" value={String(summary.total)} />
        <Kpi label="Certificados" value={String(summary.certificados)} accent />
        <Kpi label="Monto facturado" value={money(summary.montoCertificado)} />
        <Kpi label="Modo" value={PROVIDER_META[settings.provider].transmits ? 'Certificador' : 'Manual'} sub={settings.ambiente === 'PRUEBAS' ? 'Pruebas' : 'Producción'} />
      </div>

      {!hasSettingsRow && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="alertCircle" size={16} /> Configura tus datos fiscales para empezar a emitir facturas.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--u-hair)' }}>
        {([['emitir', 'Emitir'], ['config', 'Configuración'], ['historial', 'Historial']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className="press"
            style={{ padding: '9px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--brand-accent)' : 'transparent'}`, color: tab === k ? 'var(--u-text)' : 'var(--u-text-3)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' && <SettingsForm restaurantId={restaurantId} settings={settings} onSaved={() => { router.refresh(); }} />}
      {tab === 'emitir' && <EmitForm restaurantId={restaurantId} invoiceable={invoiceable} ready={hasSettingsRow && !!settings.nit_emisor} onEmitted={() => router.refresh()} onGoConfig={() => setTab('config')} />}
      {tab === 'historial' && <DocumentsList restaurantId={restaurantId} documents={documents} onChange={() => router.refresh()} />}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Glass variant="quiet" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{sub}</span>}
    </Glass>
  );
}

/* ── Configuración fiscal ───────────────────────────────────── */

function SettingsForm({ restaurantId, settings, onSaved }: { restaurantId: string; settings: FelSettings; onSaved: () => void }) {
  const [p, setP] = useState<FelSettingsPatch>({
    provider: settings.provider,
    ambiente: settings.ambiente,
    nit_emisor: settings.nit_emisor,
    nombre_emisor: settings.nombre_emisor,
    nombre_comercial: settings.nombre_comercial,
    direccion: settings.direccion,
    codigo_establecimiento: settings.codigo_establecimiento,
    afiliacion_iva: settings.afiliacion_iva,
    iva_incluido: settings.iva_incluido,
    serie_prefijo: settings.serie_prefijo,
    api_usuario: settings.api_usuario,
    api_clave: settings.api_clave,
    api_llave_firma: settings.api_llave_firma,
  });
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  function set<K extends keyof FelSettingsPatch>(k: K, v: FelSettingsPatch[K]) { setP((s) => ({ ...s, [k]: v })); }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveFelSettings(restaurantId, p);
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      setMsg('Guardado ✓');
      onSaved();
    });
  }

  const meta = PROVIDER_META[p.provider];

  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="t-kicker" style={{ fontSize: 10.5 }}>Datos del emisor</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>NIT emisor</label><input style={inputStyle} value={p.nit_emisor} onChange={(e) => set('nit_emisor', e.target.value)} placeholder="1234567K" /></div>
        <div><label style={labelStyle}>Nombre / razón social</label><input style={inputStyle} value={p.nombre_emisor} onChange={(e) => set('nombre_emisor', e.target.value)} /></div>
        <div><label style={labelStyle}>Nombre comercial</label><input style={inputStyle} value={p.nombre_comercial} onChange={(e) => set('nombre_comercial', e.target.value)} /></div>
        <div><label style={labelStyle}>Código establecimiento</label><input style={inputStyle} value={p.codigo_establecimiento} onChange={(e) => set('codigo_establecimiento', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Dirección</label><input style={inputStyle} value={p.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, zona, ciudad" /></div>
        <div>
          <label style={labelStyle}>Afiliación IVA</label>
          <select style={inputStyle} value={p.afiliacion_iva} onChange={(e) => set('afiliacion_iva', e.target.value as 'GEN' | 'PEQ')}>
            <option value="GEN">Régimen general (IVA 12%)</option>
            <option value="PEQ">Pequeño contribuyente (5%)</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Precios incluyen IVA</label>
          <select style={inputStyle} value={p.iva_incluido ? 'si' : 'no'} onChange={(e) => set('iva_incluido', e.target.value === 'si')}>
            <option value="si">Sí (precio final con IVA)</option>
            <option value="no">No (agregar IVA encima)</option>
          </select>
        </div>
      </div>

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Certificador</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Proveedor</label>
          <select style={inputStyle} value={p.provider} onChange={(e) => set('provider', e.target.value as FelProvider)}>
            {PROVIDERS.map((pv) => <option key={pv} value={pv}>{PROVIDER_META[pv].label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Ambiente</label>
          <select style={inputStyle} value={p.ambiente} onChange={(e) => set('ambiente', e.target.value as 'PRUEBAS' | 'PRODUCCION')}>
            <option value="PRUEBAS">Pruebas</option>
            <option value="PRODUCCION">Producción</option>
          </select>
        </div>
        <div><label style={labelStyle}>Serie (modo manual)</label><input style={inputStyle} value={p.serie_prefijo} onChange={(e) => set('serie_prefijo', e.target.value)} placeholder="FEL" /></div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {meta.note}
      </p>

      {meta.transmits && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><label style={labelStyle}>Usuario API</label><input style={inputStyle} value={p.api_usuario} onChange={(e) => set('api_usuario', e.target.value)} /></div>
          <div><label style={labelStyle}>Clave / Token API</label><input style={inputStyle} type="password" value={p.api_clave} onChange={(e) => set('api_clave', e.target.value)} /></div>
          <div><label style={labelStyle}>Llave de firma</label><input style={inputStyle} type="password" value={p.api_llave_firma} onChange={(e) => set('api_llave_firma', e.target.value)} /></div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={isPending} className="press btn-accent" style={{ padding: '10px 22px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
          {isPending ? 'Guardando…' : 'Guardar configuración'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
    </Glass>
  );
}

/* ── Emitir factura ─────────────────────────────────────────── */

function EmitForm({ restaurantId, invoiceable, ready, onEmitted, onGoConfig }: { restaurantId: string; invoiceable: InvoiceableOrder[]; ready: boolean; onEmitted: () => void; onGoConfig: () => void }) {
  const [mode, setMode] = useState<'pedido' | 'libre'>('pedido');
  const [orderId, setOrderId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [nit, setNit] = useState('CF');
  const [nombre, setNombre] = useState('Consumidor Final');
  const [direccion, setDireccion] = useState('Ciudad');
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!ready) {
    return (
      <Glass variant="quiet" style={{ padding: 24, textAlign: 'center' }}>
        <Icon name="receipt" size={30} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
        <p style={{ color: 'var(--u-text-3)', fontSize: 14, marginBottom: 12 }}>Primero configura tus datos fiscales (NIT y nombre del emisor).</p>
        <button onClick={onGoConfig} className="press btn-accent" style={{ padding: '9px 18px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer' }}>Ir a configuración</button>
      </Glass>
    );
  }

  function emit() {
    setMsg(null);
    start(async () => {
      const res = await emitInvoice(restaurantId, {
        orderId: mode === 'pedido' ? orderId || undefined : undefined,
        descripcion: mode === 'libre' ? descripcion : undefined,
        monto: mode === 'libre' ? parseFloat(monto) : undefined,
        receptorNit: nit, receptorNombre: nombre, receptorDireccion: direccion,
      });
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      setMsg('Factura emitida ✓');
      setOrderId(''); setDescripcion(''); setMonto('');
      onEmitted();
    });
  }

  const pendientes = invoiceable.filter((o) => !o.already_invoiced);

  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {([['pedido', 'Desde un pedido'], ['libre', 'Factura libre']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className="press"
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${mode === k ? 'transparent' : 'var(--u-hair)'}`, background: mode === k ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: mode === k ? 'var(--brand-bg)' : 'var(--u-text-3)' }}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'pedido' ? (
        <div>
          <label style={labelStyle}>Pedido a facturar</label>
          {pendientes.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--u-text-4)' }}>No hay pedidos pendientes de facturar.</p>
          ) : (
            <select style={inputStyle} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Selecciona un pedido…</option>
              {pendientes.map((o) => (
                <option key={o.id} value={o.id}>{o.order_number} · {o.customer_name} · {money(o.total)}</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        // auto-fit: lado a lado en escritorio, apilado en móvil (antes 160px fijos)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><label style={labelStyle}>Descripción</label><input style={inputStyle} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Consumo en restaurante" /></div>
          <div><label style={labelStyle}>Monto (Q, con IVA)</label><input style={inputStyle} type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" /></div>
        </div>
      )}

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Receptor</div>
      {/* auto-fit: 3 columnas en escritorio, apiladas en móvil (antes el NIT de
          160px fijos dejaba nombre y dirección en ~90px cada uno). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>NIT</label><input style={inputStyle} value={nit} onChange={(e) => setNit(e.target.value)} placeholder="CF" /></div>
        <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div><label style={labelStyle}>Dirección</label><input style={inputStyle} value={direccion} onChange={(e) => setDireccion(e.target.value)} /></div>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: 0 }}>Usa <strong>CF</strong> en el NIT para consumidor final.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={emit} disabled={isPending || (mode === 'pedido' && !orderId)} className="press btn-accent" style={{ padding: '10px 22px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: (isPending || (mode === 'pedido' && !orderId)) ? 0.6 : 1 }}>
          {isPending ? 'Emitiendo…' : 'Emitir factura'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
    </Glass>
  );
}

/* ── Historial de documentos ────────────────────────────────── */

function DocumentsList({ restaurantId, documents, onChange }: { restaurantId: string; documents: FelDocument[]; onChange: () => void }) {
  const [isPending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function anular(id: string) {
    if (!window.confirm('¿Anular esta factura? No se podrá revertir.')) return;
    setBusy(id);
    start(async () => {
      await anularInvoice(restaurantId, id);
      setBusy(null);
      onChange();
    });
  }

  if (documents.length === 0) {
    return (
      <Glass variant="quiet" style={{ padding: 28, textAlign: 'center', color: 'var(--u-text-3)', fontSize: 14 }}>
        Aún no has emitido facturas.
      </Glass>
    );
  }

  return (
    <Glass variant="quiet" style={{ overflow: 'hidden' }}>
      {/* 6 columnas no caben en un teléfono: scroll horizontal en vez de
          romper el layout (los montos y estados se leen deslizando). */}
      <div className="table-scroll">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
            {['Documento', 'Receptor', 'Monto', 'Estado', 'Fecha', ''].map((h) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} style={{ borderBottom: '1px solid var(--u-hair)' }}>
              <td style={{ padding: '10px 12px', fontFamily: 'var(--ui-font-mono)' }}>
                {d.serie}-{d.numero}
                {d.uuid_sat?.startsWith('INT-') && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--u-text-4)' }}>interno</span>}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <div>{d.receptor_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{d.receptor_nit}</div>
              </td>
              <td style={{ padding: '10px 12px', fontFamily: 'var(--ui-font-mono)', whiteSpace: 'nowrap' }}>{money(Number(d.monto_total))}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `${ESTADO_COLOR[d.estado] ?? '#888'}22`, color: ESTADO_COLOR[d.estado] ?? '#888' }}>
                  {d.estado}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--u-text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                {new Date(d.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: '2-digit' })}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                {d.estado !== 'ANULADO' && (
                  <button onClick={() => anular(d.id)} disabled={isPending && busy === d.id} className="press"
                    style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171' }}>
                    {busy === d.id ? '…' : 'Anular'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Glass>
  );
}
