'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { saveFelSettings, emitInvoice, anularInvoice, reintentarInvoice, type FelSettingsPatch } from '@/lib/actions/fel';
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
  CERTIFICADO: 'var(--c-ok)', PENDIENTE: 'var(--c-warn)', ANULADO: '#6b7280', ERROR: 'var(--c-danger)',
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
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)', color: 'var(--c-warn)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
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
    <Card className="flex flex-col gap-1 p-3.5">
      <span className="t-kicker" style={{ fontSize: 9.5 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: accent ? 'var(--brand-accent)' : 'var(--u-text)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>{sub}</span>}
    </Card>
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
    codigo_postal: settings.codigo_postal ?? '01001',
    municipio: settings.municipio ?? 'Guatemala',
    departamento: settings.departamento ?? 'Guatemala',
    codigo_establecimiento: settings.codigo_establecimiento,
    afiliacion_iva: settings.afiliacion_iva,
    iva_incluido: settings.iva_incluido,
    serie_prefijo: settings.serie_prefijo,
    api_usuario: settings.api_usuario,
    // Vacías a propósito: el servidor ya no manda las credenciales guardadas
    // al navegador. Vacío significa "no la cambies" al guardar.
    api_clave: '',
    api_llave_firma: '',
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
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="t-kicker" style={{ fontSize: 10.5 }}>Datos del emisor</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div><label style={labelStyle}>NIT emisor</label><input style={inputStyle} value={p.nit_emisor} onChange={(e) => set('nit_emisor', e.target.value)} placeholder="1234567K" /></div>
        <div><label style={labelStyle}>Nombre / razón social</label><input style={inputStyle} value={p.nombre_emisor} onChange={(e) => set('nombre_emisor', e.target.value)} /></div>
        <div><label style={labelStyle}>Nombre comercial</label><input style={inputStyle} value={p.nombre_comercial} onChange={(e) => set('nombre_comercial', e.target.value)} /></div>
        <div><label style={labelStyle}>Código establecimiento</label><input style={inputStyle} value={p.codigo_establecimiento} onChange={(e) => set('codigo_establecimiento', e.target.value)} /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Dirección</label><input style={inputStyle} value={p.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, zona, ciudad" /></div>
        <div><label style={labelStyle}>Municipio</label><input style={inputStyle} value={p.municipio} onChange={(e) => set('municipio', e.target.value)} placeholder="Guatemala" /></div>
        <div><label style={labelStyle}>Departamento</label><input style={inputStyle} value={p.departamento} onChange={(e) => set('departamento', e.target.value)} placeholder="Guatemala" /></div>
        <div><label style={labelStyle}>Código postal</label><input style={inputStyle} value={p.codigo_postal} onChange={(e) => set('codigo_postal', e.target.value)} placeholder="01001" /></div>
        <div>
          <label style={labelStyle}>Afiliación IVA</label>
          <Select
            options={[{ value: 'GEN', label: 'Régimen general (IVA 12%)' }, { value: 'PEQ', label: 'Pequeño contribuyente (5%)' }]}
            value={p.afiliacion_iva}
            onValueChange={(v) => set('afiliacion_iva', v as 'GEN' | 'PEQ')}
          />
        </div>
        <div>
          <label style={labelStyle}>Precios incluyen IVA</label>
          <Select
            options={[{ value: 'si', label: 'Sí (precio final con IVA)' }, { value: 'no', label: 'No (agregar IVA encima)' }]}
            value={p.iva_incluido ? 'si' : 'no'}
            onValueChange={(v) => set('iva_incluido', v === 'si')}
          />
        </div>
      </div>

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Certificador</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <label style={labelStyle}>Proveedor</label>
          <Select
            options={PROVIDERS.map((pv) => ({ value: pv, label: PROVIDER_META[pv].label }))}
            value={p.provider}
            onValueChange={(v) => set('provider', v as FelProvider)}
          />
        </div>
        <div>
          <label style={labelStyle}>Ambiente</label>
          <Select
            options={[{ value: 'PRUEBAS', label: 'Pruebas' }, { value: 'PRODUCCION', label: 'Producción' }]}
            value={p.ambiente}
            onValueChange={(v) => set('ambiente', v as 'PRUEBAS' | 'PRODUCCION')}
          />
        </div>
        <div><label style={labelStyle}>Serie (modo manual)</label><input style={inputStyle} value={p.serie_prefijo} onChange={(e) => set('serie_prefijo', e.target.value)} placeholder="FEL" /></div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {meta.note}
      </p>

      {meta.transmits && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><label style={labelStyle}>Usuario API</label><input style={inputStyle} value={p.api_usuario} onChange={(e) => set('api_usuario', e.target.value)} /></div>
            <div>
              <label style={labelStyle}>Clave / Token API</label>
              <input style={inputStyle} type="password" value={p.api_clave} onChange={(e) => set('api_clave', e.target.value)}
                placeholder={settings.tiene_clave ? '•••••••• (guardada)' : ''} />
            </div>
            <div>
              <label style={labelStyle}>Llave de firma</label>
              <input style={inputStyle} type="password" value={p.api_llave_firma} onChange={(e) => set('api_llave_firma', e.target.value)}
                placeholder={settings.tiene_llave_firma ? '•••••••• (guardada)' : ''} />
            </div>
          </div>
          {(settings.tiene_clave || settings.tiene_llave_firma) && (
            <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
              Tus credenciales están guardadas y cifradas. Por seguridad no se muestran:
              deja los campos en blanco para conservarlas, o escribe una nueva para reemplazarla.
            </p>
          )}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button onClick={save} disabled={isPending} className="rounded-adm-full">
          {isPending ? 'Guardando…' : 'Guardar configuración'}
        </Button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--c-ok)' }}>{msg}</span>}
      </div>
    </Card>
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
  /** La factura se guardó pero aún no certificó: ni éxito ni error. */
  const [enCola, setEnCola] = useState(false);

  if (!ready) {
    return (
      <Card className="p-6 text-center">
        <Icon name="receipt" size={30} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
        <p style={{ color: 'var(--u-text-3)', fontSize: 14, marginBottom: 12 }}>Primero configura tus datos fiscales (NIT y nombre del emisor).</p>
        <Button onClick={onGoConfig} className="rounded-adm-full">Ir a configuración</Button>
      </Card>
    );
  }

  function emit() {
    setMsg(null);
    setEnCola(false);
    start(async () => {
      const res = await emitInvoice(restaurantId, {
        orderId: mode === 'pedido' ? orderId || undefined : undefined,
        descripcion: mode === 'libre' ? descripcion : undefined,
        monto: mode === 'libre' ? parseFloat(monto) : undefined,
        receptorNit: nit, receptorNombre: nombre, receptorDireccion: direccion,
      });
      if (res.error) { setMsg(`Error: ${res.error}`); return; }
      // La venta quedó registrada aunque el certificador no haya respondido:
      // decirlo tal cual, en vez de un "emitida ✓" que haría creer al dueño
      // que ya tiene el DTE en mano.
      setEnCola(Boolean(res.aviso));
      setMsg(res.aviso ?? 'Factura emitida ✓');
      setOrderId(''); setDescripcion(''); setMonto('');
      onEmitted();
    });
  }

  const pendientes = invoiceable.filter((o) => !o.already_invoiced);

  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div style={{ display: 'flex', gap: 8 }}>
        {([['pedido', 'Desde un pedido'], ['libre', 'Factura libre']] as const).map(([k, label]) => (
          <Button key={k} type="button" onClick={() => setMode(k)} variant={mode === k ? 'primary' : 'secondary'} size="sm" className="rounded-adm-full">
            {label}
          </Button>
        ))}
      </div>

      {mode === 'pedido' ? (
        <div>
          <label style={labelStyle}>Pedido a facturar</label>
          {pendientes.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--u-text-4)' }}>No hay pedidos pendientes de facturar.</p>
          ) : (
            <Select
              options={pendientes.map((o) => ({ value: o.id, label: `${o.order_number} · ${o.customer_name} · ${money(o.total)}` }))}
              value={orderId}
              onValueChange={setOrderId}
              placeholder="Selecciona un pedido…"
            />
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
        <Button onClick={emit} disabled={isPending || (mode === 'pedido' && !orderId)} className="rounded-adm-full">
          {isPending ? 'Emitiendo…' : 'Emitir factura'}
        </Button>
        {msg && (
          <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger)' : enCola ? 'var(--c-warn)' : 'var(--c-ok)' }}>
            {msg}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ── Historial de documentos ────────────────────────────────── */

function DocumentsList({ restaurantId, documents, onChange }: { restaurantId: string; documents: FelDocument[]; onChange: () => void }) {
  const [isPending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  function anular(id: string) {
    if (!window.confirm('¿Anular esta factura? No se podrá revertir.')) return;
    setBusy(id);
    setError(null);
    start(async () => {
      // Anular un DTE certificado se transmite al SAT y puede fallar; antes
      // el resultado se descartaba y la UI mostraba "anulado" pasara lo que
      // pasara.
      const res = await anularInvoice(restaurantId, id);
      setBusy(null);
      if (res?.error) setError(res.error);
      onChange();
    });
  }

  function reintentar(id: string) {
    setBusy(id);
    setError(null);
    start(async () => {
      const res = await reintentarInvoice(restaurantId, id);
      setBusy(null);
      if (res?.error) setError(res.error);
      else if (res?.aviso) setError(res.aviso);
      onChange();
    });
  }

  if (documents.length === 0) {
    return (
      <Card className="p-7 text-center" style={{ color: 'var(--u-text-3)', fontSize: 14 }}>
        Aún no has emitido facturas.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {error && (
        <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--c-danger)', borderBottom: '1px solid var(--u-hair)' }}>
          {error}
        </div>
      )}
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
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `color-mix(in srgb, ${ESTADO_COLOR[d.estado] ?? '#888'} 13%, transparent)`, color: ESTADO_COLOR[d.estado] ?? '#888' }}>
                  {d.estado}
                </span>
                {/* El motivo importa más que el estado: "ERROR" a secas deja
                    al dueño sin saber si debe corregir algo o solo esperar. */}
                {d.error_mensaje && (d.estado === 'ERROR' || d.estado === 'PENDIENTE') && (
                  <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4, maxWidth: 260 }}>
                    {d.error_mensaje}
                  </div>
                )}
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--u-text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                {new Date(d.created_at).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: '2-digit' })}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {(d.estado === 'ERROR' || d.estado === 'PENDIENTE') && (
                  <Button onClick={() => reintentar(d.id)} disabled={isPending && busy === d.id} variant="outline" size="sm"
                    style={{ marginRight: 6 }}>
                    {busy === d.id ? '…' : 'Reintentar'}
                  </Button>
                )}
                {d.estado !== 'ANULADO' && (
                  <Button onClick={() => anular(d.id)} disabled={isPending && busy === d.id} variant="outline" size="sm"
                    className="border-[var(--c-danger-line)] text-[var(--c-danger)]">
                    {busy === d.id ? '…' : 'Anular'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}
