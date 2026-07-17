'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  getPrintAgentConfig,
  regenerateAgentToken,
  setPrintTargets,
  sendTestPrint,
  setAutoPauseOffline,
  type PrintAgentConfig,
  type ReportedPrinter,
} from '@/lib/actions/print-agent';

// ── Estilos ────────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 'var(--radius-md)',
  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
  border: '1px solid var(--u-hair)',
  color: 'var(--u-text)',
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--u-text-2)',
  display: 'block',
  marginBottom: 5,
};

const stepNumStyle: React.CSSProperties = {
  flexShrink: 0,
  width: 22,
  height: 22,
  borderRadius: 99,
  background: 'var(--brand-accent, rgba(99,102,241,0.7))',
  display: 'grid',
  placeItems: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
};

const MANUAL = '__manual__';

// ── Selector de impresora por rol ─────────────────────────────────────────────

function PrinterPicker({
  label,
  value,
  printers,
  onChange,
  onTest,
}: {
  label: string;
  value: string;
  printers: ReportedPrinter[];
  onChange: (v: string) => void;
  onTest: () => void;
}) {
  const known = printers.flatMap((p) => [p.target, `doc:${p.name}`]);
  const isManual = value !== '' && value !== 'preview:' && !known.includes(value);
  const selectValue = isManual ? MANUAL : value;

  const options = [
    { value: '', label: '— No imprimir aquí —' },
    { value: 'preview:', label: 'Simulador en pantalla (preview:)' },
    ...printers.flatMap((p) => [
      { value: p.target, label: `${p.name} (térmica)` },
      { value: `doc:${p.name}`, label: `${p.name} · documento (impresora normal · pruebas)` },
    ]),
    { value: MANUAL, label: 'Otra · destino manual (tcp://…)' },
  ];

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <Select
        options={options}
        value={selectValue}
        onValueChange={(v) => onChange(v === MANUAL ? 'tcp://' : v)}
      />

      {(isManual || selectValue === MANUAL) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="tcp://192.168.1.50:9100"
          style={{ ...selectStyle, marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
        />
      )}

      <Button type="button" onClick={onTest} variant="secondary" size="sm" className="mt-2">
        Probar
      </Button>
    </div>
  );
}

// ── Sección de instalación (pasos) ────────────────────────────────────────────

function InstallSteps({
  token,
  origin,
  onCopied,
}: {
  token: string;
  origin: string;
  onCopied: (msg: string) => void;
}) {
  const configJson = JSON.stringify({ apiUrl: origin, token }, null, 2);

  const psCommand =
    `.\\installer\\install.ps1 -ApiUrl "${origin}" -Token "${token}"`;

  function downloadConfig() {
    const blob = new Blob([configJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.local.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyCmd() {
    void navigator.clipboard?.writeText(psCommand);
    onCopied('✓ Comando copiado');
  }

  function copyConfig() {
    void navigator.clipboard?.writeText(configJson);
    onCopied('✓ Config copiada');
  }

  const stepBoxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  };

  const stepContentStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  };

  // El backend genera un código corto de un solo uso y lo embebe en el nombre
  // del archivo → el exe lo resuelve al instalar y se autoinstala con doble
  // clic, sin copiar/pegar nada.
  const downloadHref = `/api/agent/download-exe?token=${encodeURIComponent(token)}`;

  return (
    <div style={{
      background: 'rgba(74,222,128,0.06)',
      border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ fontSize: 12, color: 'var(--c-ok, #4ade80)', fontWeight: 700 }}>
        ✓ Listo para instalar — solo descarga y haz doble clic en la PC del local
      </div>

      {/* Paso 1: Descargar */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>1</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Descarga el instalador en la PC del local
          </span>
          <Button render={<a href={downloadHref} />} className="self-start">
            ⬇ Descargar instalador (Windows)
          </Button>
          <span style={{ fontSize: 11, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
            Tu código de vinculación ya viene dentro del archivo: no hay nada que copiar.
            {' '}<strong style={{ color: 'var(--u-text-3)' }}>No le cambies el nombre.</strong>
          </span>
        </div>
      </div>

      {/* Paso 2: Doble clic */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>2</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Haz <strong>doble clic</strong> en el archivo descargado
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.55 }}>
            Se instala solo y queda funcionando — sin abrir nada más. Aparecerá un aviso
            {' '}<strong style={{ color: 'var(--u-text-3)' }}>«Agente instalado correctamente»</strong>.
          </span>
          <div style={{
            fontSize: 11,
            color: 'var(--u-text-4)',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 6,
            padding: '6px 9px',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--u-text-3)' }}>Si Windows muestra una pantalla azul</strong> («Windows protegió tu PC»),
            haz clic en <strong style={{ color: '#fcd34d' }}>Más información → Ejecutar de todos modos</strong>. Es normal: el aviso aparece porque el programa es nuevo.
          </div>
        </div>
      </div>

      {/* Paso 3: Verificar */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>3</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Vuelve aquí y pulsa «Actualizar»
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
            En unos segundos el estado cambiará a{' '}
            <span style={{ color: 'var(--c-ok, #4ade80)', fontWeight: 600 }}>● Conectado</span>
            {' '}y verás las impresoras detectadas.
          </span>
        </div>
      </div>

      {/* Alternativa: instalación manual avanzada (PowerShell) */}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 11.5, color: 'var(--u-text-4)', cursor: 'pointer', userSelect: 'none' }}>
          Instalación avanzada (PowerShell / config manual)
        </summary>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Equivalente por línea de comandos (PowerShell como Administrador, desde la carpeta <code>dist</code>):
          </span>
          {/* Bloque "terminal": oscuro SÓLIDO a propósito (el cian necesita fondo
              oscuro); antes era rgba(0,0,0,0.4) y en el panel claro quedaba un
              gris sucio con poco contraste. */}
          <pre style={{
            margin: 0, padding: '9px 11px', borderRadius: 8,
            background: '#15171c', border: '1px solid var(--u-hair)',
            fontSize: 11, color: '#a5f3fc', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
          }}>{psCommand}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={copyCmd} variant="secondary" size="sm">
              Copiar comando
            </Button>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.5, marginTop: 4 }}>
            O descarga el config y colócalo junto al exe:
          </span>
          {/* Adaptativo: antes rgba(0,0,0,0.35) fijo — en panel claro era una caja
              oscura con texto oscuro (var --u-text-2), ilegible. */}
          <pre style={{
            margin: 0, padding: '9px 11px', borderRadius: 8,
            background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', border: '1px solid var(--u-hair)',
            fontSize: 11, color: 'var(--u-text-2)', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{configJson}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={downloadConfig} variant="secondary" size="sm">
              ⬇ Descargar config.local.json
            </Button>
            <Button type="button" onClick={copyConfig} variant="secondary" size="sm">
              Copiar JSON
            </Button>
          </div>
        </div>
      </details>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PrintAgentSettings() {
  const [config, setConfig] = useState<PrintAgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [kitchen, setKitchen] = useState('');
  const [receipt, setReceipt] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState('');
  const [generating, setGenerating] = useState(false);
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const [pauseToggling, setPauseToggling] = useState(false);

  async function handleAutoPauseToggle() {
    if (!config || pauseToggling) return;
    setPauseToggling(true);
    const res = await setAutoPauseOffline(!config.autoPauseEnabled);
    if (res.error) setMsg(res.error);
    else { setMsg(''); await load(); }
    setPauseToggling(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPrintAgentConfig();
      if ('error' in res) {
        setMsg(res.error);
      } else {
        setConfig(res);
        setKitchen(res.kitchenTarget ?? '');
        setReceipt(res.receiptTarget ?? '');
      }
    } catch (e) {
      setMsg(`Error al cargar config: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    // window.__TAURI__ solo existe dentro de la app instalable Leogin
    // Desktop (ver leogin-desktop/) — desde el navegador normal es undefined.
    setInDesktopApp(typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__));
    void load();
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setMsg('Generando…');
    try {
      const res = await regenerateAgentToken();
      if (res.error) {
        setMsg(`Error: ${res.error}`);
        return;
      }
      setToken(res.token ?? null);
      setMsg('');
      await load();
    } catch (e) {
      setMsg(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMsg('Guardando…');
    try {
      const res = await setPrintTargets({ kitchen: kitchen || null, receipt: receipt || null });
      setMsg(res.error ? `Error: ${res.error}` : '✓ Destinos guardados');
      if (!res.error) await load();
    } catch (e) {
      setMsg(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(role: 'kitchen' | 'receipt') {
    const target = role === 'kitchen' ? kitchen : receipt;
    if (!target) { setMsg('Elige un destino antes de probar.'); return; }
    setMsg('Enviando prueba…');
    try {
      const res = await sendTestPrint({ role, target });
      setMsg(res.error
        ? `Error: ${res.error}`
        : `✓ Prueba encolada (${role === 'kitchen' ? 'cocina' : 'caja'}). El agente la imprimirá en segundos.`
      );
    } catch (e) {
      setMsg(`Error inesperado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function connectionLabel(): { text: string; color: string } {
    if (!config?.exists) return { text: 'Sin vincular', color: 'var(--u-text-4)' };
    if (!config.lastSeenAt) return { text: 'Token generado · esperando primera conexión', color: '#f59e0b' };
    // Etiqueta de "última conexión": el tiempo relativo se calcula al render a
    // propósito (es texto informativo del panel admin, no estado persistente).
    // eslint-disable-next-line react-hooks/purity
    const ageMs = Date.now() - new Date(config.lastSeenAt).getTime();
    if (ageMs < 90_000) return { text: '● Conectado', color: 'var(--c-ok, #4ade80)' };
    const mins = Math.round(ageMs / 60_000);
    const ago = mins < 60 ? `hace ${mins} min` : `hace ${Math.round(mins / 60)} h`;
    return { text: `Última conexión ${ago}`, color: '#f59e0b' };
  }

  const conn = connectionLabel();
  const printers = config?.reportedPrinters ?? [];

  return (
    <Card className="flex flex-col gap-4 p-4.5">
      {/* Encabezado */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
            Leogin en tu PC
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
            color: 'var(--brand-bg)', background: 'var(--u-text)', borderRadius: 6, padding: '2px 7px',
          }}>
            Nuevo
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '6px 0 0' }}>
          Imprime cocina y caja en silencio desde <strong style={{ color: 'var(--u-text-2)' }}>cualquier
          dispositivo</strong> (celular, tablet o PC), sin abrir diálogos. Instala el servicio de Leogin
          una sola vez en la PC del local; la configuración se guarda en la nube.
        </p>
      </div>

      {/* Estado de conexión */}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: conn.color }}>
        {conn.text}
        {config?.exists && (
          <span style={{ color: 'var(--u-text-4)', fontWeight: 500 }}>
            {' · '}{printers.length} impresora{printers.length === 1 ? '' : 's'} detectada{printers.length === 1 ? '' : 's'}
            {config.version ? ` · v${config.version}` : ''}
            {config.shellVersion ? ` · Leogin Desktop v${config.shellVersion}` : ''}
          </span>
        )}
        <Button type="button" onClick={load} variant="ghost" size="sm" className="ml-2.5 h-auto py-1">
          ↻ Actualizar
        </Button>
      </div>

      {/* El toggle "hacer de esta PC el servidor" vive en Ajustes → Este
          dispositivo (components/admin/desktop-server-settings.tsx): es una
          decisión sobre el dispositivo, no sobre impresoras. */}

      {/* Auto-pausa de pedidos en línea sin agente (opcional, mig. 069) */}
      {config?.exists && (
        <Card variant="flat" className="flex items-start gap-3 p-3.5">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--u-text)' }}>
              Pausar pedidos en línea si el local pierde internet
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '5px 0 0' }}>
              Si el agente lleva más de 5 minutos sin conexión, los pedidos del menú en línea se
              pausan con un aviso amable (nadie pide a un local que no puede ver su pedido) y se
              reanudan solos al reconectar. Los pedidos del mesero y del modo emergencia no se
              afectan. <strong style={{ color: 'var(--u-text-2)' }}>Requiere que la PC del agente esté
              encendida durante todo tu horario de atención</strong> — si la apagan, los pedidos en
              línea se pausarían aunque sí haya internet.
            </p>
          </div>
          <Switch
            checked={config.autoPauseEnabled}
            onCheckedChange={handleAutoPauseToggle}
            disabled={pauseToggling}
            aria-label="Pausar pedidos en línea si el local pierde internet"
          />
        </Card>
      )}

      {/* Generar / rotar token (instalación manual — también sirve como respaldo dentro de la app) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {inDesktopApp && (
          <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
            Instalación manual (alternativa a &quot;Hacer de esta PC el servidor del local&quot; en Ajustes):
          </span>
        )}
        <Button type="button" onClick={handleGenerate} disabled={generating} variant="secondary" size="sm" className="self-start">
          {generating
            ? 'Generando…'
            : config?.exists
              ? <><Icon name="arrowRight" size={14} /> Regenerar token de instalación</>
              : <><Icon name="key" size={14} /> Generar token de instalación</>}
        </Button>

        {token && (
          <InstallSteps
            token={token}
            origin={origin}
            onCopied={(m) => setMsg(m)}
          />
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--u-hair)' }} />

      {/* Asignación de impresoras */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>Cargando…</div>
      ) : !config?.exists ? (
        <div style={{ fontSize: 12, color: 'var(--u-text-4)', lineHeight: 1.55 }}>
          Genera el token e instala el agente. Cuando conecte, sus impresoras aparecerán aquí
          para asignarlas a Cocina y Caja.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {printers.length === 0 && (
            <div style={{
              fontSize: 11.5, color: 'var(--u-text-4)', background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.55,
            }}>
              El agente aún no ha reportado impresoras. Asegúrate de que esté corriendo en la PC del
              local y pulsa «Actualizar». También puedes probar con el simulador en pantalla.
            </div>
          )}

          <div style={{
            fontSize: 11.5, color: 'var(--u-text-4)', background: 'rgba(96,165,250,0.06)',
            border: '1px solid rgba(96,165,250,0.16)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.55,
          }}>
            ¿Aún sin impresora térmica? Elige la opción <strong style={{ color: 'var(--u-text-2)' }}>«documento»</strong>
            {' '}de tu impresora normal: imprime el ticket en una hoja para que pruebes todo el flujo. O usa
            {' '}<strong style={{ color: 'var(--u-text-2)' }}>«preview:»</strong> para verlo en pantalla.
          </div>

          <PrinterPicker
            label="Impresora de cocina"
            value={kitchen}
            printers={printers}
            onChange={setKitchen}
            onTest={() => handleTest('kitchen')}
          />
          <PrinterPicker
            label="Impresora de caja / recibos"
            value={receipt}
            printers={printers}
            onChange={setReceipt}
            onTest={() => handleTest('receipt')}
          />

          <Button type="button" onClick={handleSave} disabled={saving} variant="secondary" size="sm" className="self-start">
            {saving ? 'Guardando…' : 'Guardar destinos'}
          </Button>
        </div>
      )}

      {msg && (
        <div style={{
          fontSize: 12,
          fontWeight: msg.startsWith('Error') ? 600 : 400,
          color: msg.startsWith('✓') ? '#4ade80' : msg.startsWith('Error') ? '#f87171' : 'var(--u-text-3)',
          background: msg.startsWith('Error') ? 'rgba(248,113,113,0.08)' : 'transparent',
          border: msg.startsWith('Error') ? '1px solid rgba(248,113,113,0.2)' : 'none',
          borderRadius: msg.startsWith('Error') ? 6 : 0,
          padding: msg.startsWith('Error') ? '7px 10px' : 0,
        }}>
          {msg}
        </div>
      )}
    </Card>
  );
}
