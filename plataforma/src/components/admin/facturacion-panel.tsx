'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  saveFelSettings,
  emitInvoice,
  anularInvoice,
  emitirNotaCredito,
  reintentarInvoice,
  type FelSettingsPatch,
} from '@/lib/actions/fel';
import { PROVIDER_META, ventanaDeAnulacion, type FelProvider, type FelSettings, type FelDocument } from '@/lib/fel';
import {
  OPCIONES_REGIMEN_IVA,
  OPCIONES_REGIMEN_ISR,
  type RegimenIva,
  type RegimenIsr,
} from '@/lib/fel/frases';
import { interpretarReceptorId, explicarIdInvalido } from '@/lib/fel/nit';
import type { FelSummary, InvoiceableOrder, FelEstadoConfig } from '@/lib/db/fel';

interface Props {
  restaurantId: string;
  settings: FelSettings;
  estado: FelEstadoConfig;
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

/* ── Avisos ─────────────────────────────────────────────────── */

function Aviso({ tono, children }: { tono: 'warn' | 'danger' | 'info'; children: React.ReactNode }) {
  const color = tono === 'danger' ? 'var(--c-danger)' : tono === 'warn' ? 'var(--c-warn)' : 'var(--u-text-3)';
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 'var(--radius-md)',
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start',
    }}>
      <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export default function FacturacionPanel({ restaurantId, settings, estado, documents, summary, invoiceable, hasSettingsRow }: Props) {
  const router = useRouter();
  const listo = hasSettingsRow && estado.problemas.length === 0;
  const [tab, setTab] = useState<'emitir' | 'config' | 'historial'>(listo ? 'emitir' : 'config');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Kpi label="Facturas ante el SAT" value={String(summary.certificados)} accent />
        <Kpi label="Monto facturado" value={money(summary.montoCertificado)} sub="Neto de notas de crédito" />
        <Kpi label="En cola" value={String(summary.pendientes)} sub={summary.conError > 0 ? `${summary.conError} con error` : undefined} />
        <Kpi
          label="Modo"
          value={estado.esFiscal ? 'Certificador' : 'Interno'}
          sub={estado.esFiscal ? (settings.ambiente === 'PRUEBAS' ? 'Pruebas' : 'Producción') : 'Sin validez fiscal'}
        />
      </div>

      {/* El aviso más importante de la pantalla: lo que impide facturar. */}
      {estado.problemas.length > 0 && (
        <Aviso tono="danger">
          <strong>No se pueden emitir facturas todavía.</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {estado.problemas.map((p) => <li key={p} style={{ marginBottom: 2 }}>{p}</li>)}
          </ul>
        </Aviso>
      )}

      {estado.problemas.length === 0 && !estado.esFiscal && (
        <Aviso tono="warn">
          Estás en <strong>modo interno</strong>: Leogin numera tus ventas pero <strong>no emite facturas ante el SAT</strong>.
          Estos documentos no tienen validez fiscal. Para facturar de verdad necesitas contratar un certificador
          y conectarlo en Configuración.
        </Aviso>
      )}

      {estado.problemas.length === 0 && estado.esFiscal && estado.faltanCredenciales && (
        <Aviso tono="danger">
          Faltan las credenciales de {PROVIDER_META[settings.provider].label}. Sin ellas todas las facturas
          quedarán en error.
        </Aviso>
      )}

      {estado.problemas.length === 0 && estado.esFiscal && settings.ambiente === 'PRUEBAS' && (
        <Aviso tono="warn">
          Estás en <strong>ambiente de pruebas</strong>: los documentos no llegan al SAT. Cambia a Producción
          cuando hayas verificado que todo sale bien.
        </Aviso>
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

      {tab === 'config' && <SettingsForm restaurantId={restaurantId} settings={settings} estado={estado} onSaved={() => router.refresh()} />}
      {tab === 'emitir' && <EmitForm restaurantId={restaurantId} settings={settings} invoiceable={invoiceable} listo={listo} onEmitted={() => router.refresh()} onGoConfig={() => setTab('config')} />}
      {tab === 'historial' && <DocumentsList restaurantId={restaurantId} settings={settings} documents={documents} onChange={() => router.refresh()} />}
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

function Fila({ label, children, ancho }: { label: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div style={ancho ? { gridColumn: '1 / -1' } : undefined}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Interruptor({ label, nota, checked, onChange }: { label: string; nota: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', gridColumn: '1 / -1' }}>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>{nota}</div>
      </div>
    </div>
  );
}

/* ── Configuración fiscal ───────────────────────────────────── */

function SettingsForm({ restaurantId, settings, estado, onSaved }: { restaurantId: string; settings: FelSettings; estado: FelEstadoConfig; onSaved: () => void }) {
  const [p, setP] = useState<FelSettingsPatch>({
    provider: settings.provider,
    ambiente: settings.ambiente,
    nit_emisor: settings.nit_emisor,
    nombre_emisor: settings.nombre_emisor,
    nombre_comercial: settings.nombre_comercial,
    correo_emisor: settings.correo_emisor ?? '',
    direccion: settings.direccion,
    codigo_postal: settings.codigo_postal,
    municipio: settings.municipio,
    departamento: settings.departamento,
    codigo_establecimiento: settings.codigo_establecimiento,
    regimen_iva: settings.regimen_iva,
    regimen_isr: settings.regimen_isr,
    agente_retencion_iva: settings.agente_retencion_iva,
    numero_resolucion: settings.numero_resolucion ?? '',
    fecha_resolucion: settings.fecha_resolucion ?? '',
    iva_incluido: settings.iva_incluido,
    emision_automatica: settings.emision_automatica,
    facturar_propina: settings.facturar_propina,
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
  const notaIva = OPCIONES_REGIMEN_IVA.find((o) => o.value === p.regimen_iva)?.nota;
  const notaIsr = OPCIONES_REGIMEN_ISR.find((o) => o.value === p.regimen_isr)?.nota;
  const pideResolucion = p.regimen_isr === 'SIMPLIFICADO_PAGO_DIRECTO' || p.regimen_iva === 'PEQUENO_ELECTRONICO';

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
  const seccion: React.CSSProperties = { fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' };

  return (
    <Card className="flex flex-col gap-3.5 p-4">
      <div className="t-kicker" style={{ fontSize: 10.5 }}>Datos del emisor</div>
      <div style={grid}>
        <Fila label="NIT emisor">
          <input style={inputStyle} value={p.nit_emisor} onChange={(e) => set('nit_emisor', e.target.value)} placeholder="3602978-5" />
        </Fila>
        <Fila label="Nombre / razón social">
          <input style={inputStyle} value={p.nombre_emisor} onChange={(e) => set('nombre_emisor', e.target.value)} />
        </Fila>
        <Fila label="Nombre comercial">
          <input style={inputStyle} value={p.nombre_comercial} onChange={(e) => set('nombre_comercial', e.target.value)} />
        </Fila>
        <Fila label="Correo del emisor">
          <input style={inputStyle} type="email" value={p.correo_emisor} onChange={(e) => set('correo_emisor', e.target.value)} placeholder="facturacion@turestaurante.com" />
        </Fila>
        <Fila label="Código establecimiento">
          <input style={inputStyle} value={p.codigo_establecimiento} onChange={(e) => set('codigo_establecimiento', e.target.value)} />
        </Fila>
        <Fila label="Dirección" ancho>
          <input style={inputStyle} value={p.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, zona, ciudad" />
        </Fila>
        <Fila label="Municipio">
          <input style={inputStyle} value={p.municipio} onChange={(e) => set('municipio', e.target.value)} placeholder="Guatemala" />
        </Fila>
        <Fila label="Departamento">
          <input style={inputStyle} value={p.departamento} onChange={(e) => set('departamento', e.target.value)} placeholder="Guatemala" />
        </Fila>
        <Fila label="Código postal">
          <input style={inputStyle} value={p.codigo_postal} onChange={(e) => set('codigo_postal', e.target.value)} placeholder="01001" />
        </Fila>
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
        Municipio y departamento deben coincidir con el domicilio fiscal registrado de tu NIT, o el certificador
        rechaza las facturas.
      </p>

      <div className="t-kicker" style={seccion}>Tu régimen fiscal</div>
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0 }}>
        Esto decide las leyendas legales que salen impresas en cada factura y si tu cliente puede usarla como
        crédito fiscal. <strong>Confírmalo con tu contador</strong>: aparece en tu constancia del RTU.
      </p>
      <div style={grid}>
        <Fila label="Régimen de IVA">
          <Select options={OPCIONES_REGIMEN_IVA.map((o) => ({ value: o.value, label: o.label }))}
            value={p.regimen_iva} onValueChange={(v) => set('regimen_iva', v as RegimenIva)} />
          {notaIva && <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '4px 0 0' }}>{notaIva}</p>}
        </Fila>
        <Fila label="Régimen de ISR">
          <Select options={OPCIONES_REGIMEN_ISR.map((o) => ({ value: o.value, label: o.label }))}
            value={p.regimen_isr} onValueChange={(v) => set('regimen_isr', v as RegimenIsr)} />
          {notaIsr && <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '4px 0 0' }}>{notaIsr}</p>}
        </Fila>
        {pideResolucion && (
          <>
            <Fila label="Número de resolución SAT">
              <input style={inputStyle} value={p.numero_resolucion} onChange={(e) => set('numero_resolucion', e.target.value)} />
            </Fila>
            <Fila label="Fecha de la resolución">
              <input style={inputStyle} type="date" value={p.fecha_resolucion} onChange={(e) => set('fecha_resolucion', e.target.value)} />
            </Fila>
          </>
        )}
        <Interruptor
          label="Soy agente de retención del IVA"
          nota="Solo si la SAT te nombró agente retenedor. Añade la leyenda correspondiente a tus facturas."
          checked={p.agente_retencion_iva}
          onChange={(v) => set('agente_retencion_iva', v)}
        />
      </div>

      {estado.frases.length > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)' }}>
          <div className="t-kicker" style={{ fontSize: 9.5, marginBottom: 6 }}>Lo que dirá tu factura</div>
          {estado.frases.map((f) => (
            <div key={f} style={{ fontSize: 13, color: 'var(--u-text)', fontFamily: 'var(--ui-font-mono)' }}>· {f}</div>
          ))}
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: '6px 0 0' }}>
            Se actualiza al guardar. Si algo no corresponde a tu régimen, corrígelo antes de emitir.
          </p>
        </div>
      )}

      <div className="t-kicker" style={seccion}>Cómo cobra y factura tu caja</div>
      <div style={grid}>
        <Fila label="Precios de la carta">
          <Select
            options={[{ value: 'si', label: 'Ya incluyen IVA (lo normal)' }, { value: 'no', label: 'Sin IVA (se agrega encima)' }]}
            value={p.iva_incluido ? 'si' : 'no'}
            onValueChange={(v) => set('iva_incluido', v === 'si')}
          />
        </Fila>
        <Interruptor
          label="Facturar automáticamente al cerrar cada pedido"
          nota="La caja emite la factura sola, como Consumidor Final, sin que nadie tenga que acordarse. Si el cliente da su NIT, emítela desde la pestaña Emitir."
          checked={p.emision_automatica}
          onChange={(v) => set('emision_automatica', v)}
        />
        <Interruptor
          label="Incluir la propina en la factura"
          nota="Apagado, la propina queda fuera de la base gravable (propina voluntaria). Enciéndelo solo si cobras un cargo por servicio obligatorio. Consúltalo con tu contador."
          checked={p.facturar_propina}
          onChange={(v) => set('facturar_propina', v)}
        />
      </div>

      <div className="t-kicker" style={seccion}>Certificador</div>
      <div style={grid}>
        <Fila label="Proveedor">
          <Select options={PROVIDERS.map((pv) => ({ value: pv, label: PROVIDER_META[pv].label }))}
            value={p.provider} onValueChange={(v) => set('provider', v as FelProvider)} />
        </Fila>
        <Fila label="Ambiente">
          <Select options={[{ value: 'PRUEBAS', label: 'Pruebas' }, { value: 'PRODUCCION', label: 'Producción' }]}
            value={p.ambiente} onValueChange={(v) => set('ambiente', v as 'PRUEBAS' | 'PRODUCCION')} />
        </Fila>
        {p.provider === 'MANUAL' && (
          <Fila label="Serie del registro interno">
            <input style={inputStyle} value={p.serie_prefijo} onChange={(e) => set('serie_prefijo', e.target.value)} placeholder="INT" />
          </Fila>
        )}
      </div>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {meta.note}
      </p>

      {meta.transmits && (
        <>
          <div style={grid}>
            <Fila label="Usuario API">
              <input style={inputStyle} value={p.api_usuario} onChange={(e) => set('api_usuario', e.target.value)} />
            </Fila>
            <Fila label="Clave / Token API">
              <input style={inputStyle} type="password" value={p.api_clave} onChange={(e) => set('api_clave', e.target.value)}
                placeholder={settings.tiene_clave ? '•••••••• (guardada)' : ''} />
            </Fila>
            <Fila label="Llave de firma">
              <input style={inputStyle} type="password" value={p.api_llave_firma} onChange={(e) => set('api_llave_firma', e.target.value)}
                placeholder={settings.tiene_llave_firma ? '•••••••• (guardada)' : ''} />
            </Fila>
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

function EmitForm({ restaurantId, settings, invoiceable, listo, onEmitted, onGoConfig }: { restaurantId: string; settings: FelSettings; invoiceable: InvoiceableOrder[]; listo: boolean; onEmitted: () => void; onGoConfig: () => void }) {
  const [mode, setMode] = useState<'pedido' | 'libre'>('pedido');
  const [orderId, setOrderId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [receptorId, setReceptorId] = useState('CF');
  const [extranjero, setExtranjero] = useState(false);
  const [nombre, setNombre] = useState('Consumidor Final');
  const [direccion, setDireccion] = useState('Ciudad');
  const [correo, setCorreo] = useState('');
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [enCola, setEnCola] = useState(false);

  const pendientes = useMemo(() => invoiceable.filter((o) => !o.already_invoiced), [invoiceable]);

  // Lo que se está por facturar, para poder avisar del tope ANTES de emitir.
  const totalAFacturar = useMemo(() => {
    if (mode === 'libre') return Number(monto) || 0;
    return pendientes.find((o) => o.id === orderId)?.total ?? 0;
  }, [mode, monto, orderId, pendientes]);

  const idInterpretado = extranjero ? null : interpretarReceptorId(receptorId);
  const esCF = !extranjero && idInterpretado?.tipo === 'CF';
  const idInvalido = !extranjero && receptorId.trim() !== '' && idInterpretado === null;
  const tope = Number(settings.tope_consumidor_final) || 2500;
  const superaTope = esCF && totalAFacturar > tope;

  if (!listo) {
    return (
      <Card className="p-6 text-center">
        <Icon name="receipt" size={30} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
        <p style={{ color: 'var(--u-text-3)', fontSize: 14, marginBottom: 12 }}>
          Antes de emitir hay que completar tus datos fiscales.
        </p>
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
        receptorId,
        receptorNombre: nombre,
        receptorDireccion: direccion,
        receptorCorreo: correo,
        receptorEsExtranjero: extranjero,
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

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };

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
        <Fila label="Pedido a facturar" ancho>
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
        </Fila>
      ) : (
        <div style={grid}>
          <Fila label="Descripción">
            <input style={inputStyle} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Consumo en restaurante" />
          </Fila>
          <Fila label="Monto (Q, con IVA)">
            <input style={inputStyle} type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
          </Fila>
        </div>
      )}

      <div className="t-kicker" style={{ fontSize: 10.5, paddingTop: 4, borderTop: '1px solid var(--u-hair)' }}>Cliente</div>
      <div style={grid}>
        <Fila label={extranjero ? 'Pasaporte / documento' : 'NIT o DPI'}>
          <input
            style={{ ...inputStyle, borderColor: idInvalido ? 'var(--c-danger)' : 'var(--u-hair-2)' }}
            value={receptorId}
            onChange={(e) => setReceptorId(e.target.value)}
            placeholder={extranjero ? 'AB123456' : 'CF'}
          />
        </Fila>
        <Fila label="Nombre">
          <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Fila>
        <Fila label="Correo (opcional)">
          <input style={inputStyle} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Para enviarle su factura" />
        </Fila>
        <Fila label="Dirección">
          <input style={inputStyle} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Fila>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Switch checked={extranjero} onCheckedChange={setExtranjero} aria-label="Cliente extranjero" />
        <span style={{ fontSize: 13, color: 'var(--u-text-3)' }}>El cliente es extranjero (pasaporte)</span>
      </div>

      {idInvalido && <Aviso tono="danger">{explicarIdInvalido(receptorId)}</Aviso>}

      {superaTope && (
        <Aviso tono="danger">
          Esta venta es de {money(totalAFacturar)} y el SAT <strong>no permite facturarla como Consumidor Final</strong> arriba
          de {money(tope)}. Pídele al cliente su NIT o su DPI — son Q100 de multa por cada factura mal emitida.
        </Aviso>
      )}

      {!esCF && !extranjero && idInterpretado && (
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', margin: 0 }}>
          {idInterpretado.tipo === 'CUI' ? 'Se facturará contra DPI.' : 'NIT válido.'} El nombre debe coincidir
          con el que la SAT tiene registrado, o el certificador rechazará la factura.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button onClick={emit} disabled={isPending || idInvalido || superaTope || (mode === 'pedido' && !orderId)} className="rounded-adm-full">
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

function DocumentsList({ restaurantId, settings, documents, onChange }: { restaurantId: string; settings: FelSettings; documents: FelDocument[]; onChange: () => void }) {
  const [isPending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Documento sobre el que se está pidiendo el motivo, y para qué. */
  const [pidiendo, setPidiendo] = useState<{ id: string; accion: 'anular' | 'nota' } | null>(null);
  const [motivo, setMotivo] = useState('');

  function ejecutar() {
    if (!pidiendo) return;
    const { id, accion } = pidiendo;
    setBusy(id);
    setError(null);
    start(async () => {
      const res = accion === 'anular'
        ? await anularInvoice(restaurantId, id, motivo)
        : await emitirNotaCredito(restaurantId, id, motivo);
      setBusy(null);
      if (res?.error) setError(res.error);
      else { setPidiendo(null); setMotivo(''); }
      onChange();
    });
  }

  function reintentar(id: string) {
    setBusy(id);
    setError(null);
    start(async () => {
      const res = await reintentarInvoice(restaurantId, id);
      setBusy(null);
      if (res?.error || res?.aviso) setError(res.error ?? res.aviso ?? null);
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

      {pidiendo && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--u-hair)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={pidiendo.accion === 'anular' ? 'Motivo de la anulación (el SAT lo exige)' : 'Motivo del ajuste'}
            autoFocus
          />
          <Button onClick={ejecutar} disabled={isPending || motivo.trim().length < 5} size="sm" className="rounded-adm-full">
            {pidiendo.accion === 'anular' ? 'Anular' : 'Emitir nota de crédito'}
          </Button>
          <Button onClick={() => { setPidiendo(null); setMotivo(''); setError(null); }} variant="outline" size="sm">Cancelar</Button>
        </div>
      )}

      <div className="table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--u-hair)' }}>
              {['Documento', 'Cliente', 'Monto', 'Estado', 'Fecha', ''].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--u-text-3)', fontWeight: 500, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const ventana = ventanaDeAnulacion(d.fecha_certificacion, Number(settings.horas_para_anular) || 24);
              const certificado = d.estado === 'CERTIFICADO';
              const puedeAnular = d.estado !== 'ANULADO' && (!d.es_fiscal || !certificado || ventana.puedeAnular);
              const puedeNota = d.es_fiscal && certificado && d.tipo !== 'NCRE' && !ventana.puedeAnular;

              return (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--u-hair)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--ui-font-mono)' }}>
                    {d.serie || '—'}{d.numero ? `-${d.numero}` : ''}
                    {d.tipo === 'NCRE' && <div style={{ fontSize: 10, color: 'var(--u-text-4)' }}>nota de crédito</div>}
                    {/* Un registro interno no es una factura. Decirlo, siempre. */}
                    {!d.es_fiscal && (
                      <div style={{ fontSize: 10, color: 'var(--c-warn)', fontWeight: 700 }}>SIN VALIDEZ FISCAL</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div>{d.receptor_nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
                      {d.receptor_nit}{d.receptor_tipo_id === 'CUI' ? ' (DPI)' : d.receptor_tipo_id === 'EXT' ? ' (extranjero)' : ''}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--ui-font-mono)', whiteSpace: 'nowrap' }}>
                    {money(Number(d.monto_total))}
                    {Number(d.propina_excluida) > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--u-text-4)' }}>+{money(Number(d.propina_excluida))} propina</div>
                    )}
                  </td>
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
                    {d.origen === 'CAJA' && <div style={{ fontSize: 10, color: 'var(--u-text-4)' }}>automática</div>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {(d.estado === 'ERROR' || d.estado === 'PENDIENTE') && (
                      <Button onClick={() => reintentar(d.id)} disabled={isPending && busy === d.id} variant="outline" size="sm" style={{ marginRight: 6 }}>
                        {busy === d.id ? '…' : 'Reintentar'}
                      </Button>
                    )}
                    {puedeAnular && (
                      <Button onClick={() => { setPidiendo({ id: d.id, accion: 'anular' }); setMotivo(''); }}
                        disabled={isPending} variant="outline" size="sm"
                        className="border-[var(--c-danger-line)] text-[var(--c-danger)]">
                        Anular
                      </Button>
                    )}
                    {puedeNota && (
                      <Button onClick={() => { setPidiendo({ id: d.id, accion: 'nota' }); setMotivo(''); }}
                        disabled={isPending} variant="outline" size="sm" title="Ya pasó la ventana de anulación del SAT">
                        Nota de crédito
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
