'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icons';
import { friendlyError } from '@/lib/friendly-error';
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
import { haceTiempo } from '@/lib/dates';
import SaveBar, { type SaveStatus } from '@/components/admin/save-bar';

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

/* Exportado para que el editor de estaciones (M-07) use el MISMO selector:
   la advertencia de «esta impresora no la reporta la PC principal» es
   justo la que hace falta cuando hay tres destinos en vez de dos. */
export function PrinterPicker({
  label,
  value,
  printers,
  onChange,
  onCommit,
  onTest,
}: {
  label: string;
  value: string;
  printers: ReportedPrinter[];
  /** En CADA tecla del campo manual. Para el estado de la pantalla. */
  onChange: (v: string) => void;
  /** Cuando el valor está TERMINADO: se eligió del desplegable, o se salió
      del campo manual. Quien guarde contra el servidor debe usar este —con
      `onChange` guardaría una vez por letra, y casi todas esas veces el
      destino está a medio escribir. */
  onCommit?: (v: string) => void;
  onTest: () => void;
}) {
  const known = printers.flatMap((p) => [p.target, `doc:${p.name}`]);
  const isManual = value !== '' && value !== 'preview:' && !known.includes(value);
  const selectValue = isManual ? MANUAL : value;

  /* Al cambiar de PC principal las impresoras asignadas se conservan (mig.
     094), pero son las de la computadora ANTERIOR: aquí siguen guardadas y en
     la nueva PC no existen, así que las comandas se encolan y fallan calladas.
     Un destino de Windows que la PC conectada no reporta es exactamente eso.
     (Un tcp:// no: esa impresora vive en la red, no en la PC.) */
  const missingOnThisPc =
    isManual && printers.length > 0 && !/^tcp:\/\//i.test(value);

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
        onValueChange={(v) => {
          const nuevo = v === MANUAL ? 'tcp://' : v;
          onChange(nuevo);
          // «tcp://» a secas es el arranque del campo manual, no un destino:
          // guardarlo sería guardar basura antes de que escriban la IP.
          if (v !== MANUAL) onCommit?.(nuevo);
        }}
      />

      {(isManual || selectValue === MANUAL) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit?.(e.target.value)}
          placeholder="tcp://192.168.1.50:9100"
          style={{ ...selectStyle, marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
        />
      )}

      {missingOnThisPc && (
        <div style={{
          fontSize: 11.5, color: 'var(--u-text-3)', background: 'var(--c-warn-bg)',
          border: '1px solid var(--c-warn-line)', borderRadius: 8,
          padding: '7px 10px', lineHeight: 1.55, marginTop: 6,
        }}>
          Esta impresora no aparece entre las de la PC principal actual. Si cambiaste de
          computadora, elige aquí una de las suyas: si no, las comandas se encolan y no salen.
        </div>
      )}

      <Button type="button" onClick={onTest} variant="secondary" size="sm" className="mt-2">
        Probar
      </Button>
    </div>
  );
}

// ── Sección de instalación (pasos) ────────────────────────────────────────────

export function InstallSteps({
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
    onCopied('✓ Config descargada');
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
      background: 'var(--c-ok-bg)',
      border: '1px solid var(--c-ok-line)',
      borderRadius: 10,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ fontSize: 12, color: 'var(--c-ok)', fontWeight: 700 }}>
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
            background: 'var(--c-warn-bg)',
            border: '1px solid var(--c-warn-line)',
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
            <span style={{ color: 'var(--c-ok)', fontWeight: 600 }}>● Conectado</span>
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const [origin, setOrigin] = useState('');
  const [generating, setGenerating] = useState(false);
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
      setMsg(`No se pudo leer la configuración de la PC. ${friendlyError(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
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
      setMsg(friendlyError(e));
    } finally {
      setGenerating(false);
    }
  }

  /* Hay algo sin guardar si lo elegido no es lo que la PC tiene guardado. Tras
     guardar se actualiza la foto local en vez de recargar todo (recargar
     pintaba «Cargando…» y se llevaba la barra con su «Guardado»). */
  const targetsDirty = !!config
    && (kitchen !== (config.kitchenTarget ?? '') || receipt !== (config.receiptTarget ?? ''));

  async function handleSave() {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await setPrintTargets({ kitchen: kitchen || null, receipt: receipt || null });
      if (res.error) { setSaveStatus({ error: res.error }); return; }
      setConfig((c) => (c ? { ...c, kitchenTarget: kitchen || null, receiptTarget: receipt || null } : c));
      setSaveStatus({ saved: true });
    } catch (e) {
      setSaveStatus({ error: friendlyError(e) });
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
      setMsg(friendlyError(e));
    }
  }

  function connectionLabel(): { text: string; color: string } {
    if (!config?.exists) return { text: 'Sin vincular', color: 'var(--u-text-4)' };
    if (!config.lastSeenAt) return { text: 'Token generado · esperando primera conexión', color: 'var(--c-warn)' };
    // Etiqueta de "última conexión": el tiempo relativo se calcula al render a
    // propósito (es texto informativo del panel admin, no estado persistente).
    // eslint-disable-next-line react-hooks/purity
    const ageMs = Date.now() - new Date(config.lastSeenAt).getTime();
    if (ageMs < 90_000) return { text: '● Conectado', color: 'var(--c-ok)' };
    // Antes solo contaba en horas: «Última conexión hace 2004 h» (T-02).
    return { text: `Última conexión ${haceTiempo(config.lastSeenAt)}`, color: 'var(--c-warn)' };
  }

  const conn = connectionLabel();
  const printers = config?.reportedPrinters ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* El estado de la PC y el interruptor de encenderla/apagarla los lleva
          MainPcSwitch, arriba en la misma pantalla (/admin/mi-pc). Aquí solo
          quedan las impresoras: qué se imprime y dónde. */}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: conn.color }}>
        {conn.text}
        {config?.exists && (
          <span style={{ color: 'var(--u-text-4)', fontWeight: 500 }}>
            {' · '}{printers.length} impresora{printers.length === 1 ? '' : 's'} detectada{printers.length === 1 ? '' : 's'}
          </span>
        )}
        <Button type="button" onClick={load} variant="ghost" size="sm" className="ml-2.5 h-auto py-1">
          ↻ Actualizar
        </Button>
      </div>

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
              afectan. <strong style={{ color: 'var(--u-text-2)' }}>Requiere que la PC principal esté
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

      {/* Asignación de impresoras */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--u-text-4)' }}>Cargando…</div>
      ) : !config?.exists ? (
        <details>
          <summary style={{ fontSize: 11.5, color: 'var(--u-text-4)', cursor: 'pointer', userSelect: 'none' }}>
            Instalar el servicio a mano (avanzado)
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
              Lo normal es encender el interruptor de arriba desde la PC del local. Esto es el
              camino largo: genera un token e instala el servicio tú mismo.
            </span>
            <Button type="button" onClick={handleGenerate} disabled={generating} variant="secondary" size="sm" className="self-start">
              {generating
                ? 'Generando…'
                : <><Icon name="key" size={14} /> Generar token de instalación</>}
            </Button>
            {token && <InstallSteps token={token} origin={origin} onCopied={(m) => setMsg(m)} />}
          </div>
        </details>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {printers.length === 0 && (
            <div style={{
              fontSize: 11.5, color: 'var(--u-text-4)', background: 'var(--c-warn-bg)',
              border: '1px solid var(--c-warn-line)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.55,
            }}>
              El agente aún no ha reportado impresoras. Asegúrate de que esté corriendo en la PC del
              local y pulsa «Actualizar». También puedes probar con el simulador en pantalla.
            </div>
          )}

          <div style={{
            fontSize: 11.5, color: 'var(--u-text-4)', background: 'var(--c-info-bg)',
            border: '1px solid var(--c-info-line)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.55,
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

          <SaveBar
            dirty={targetsDirty}
            pending={saving}
            status={saveStatus}
            onSave={handleSave}
            label="Guardar impresoras"
          />
        </div>
      )}

      {msg && (
        <div style={{
          fontSize: 12,
          fontWeight: msg.startsWith('Error') ? 600 : 400,
          color: msg.startsWith('✓') ? 'var(--c-ok)' : msg.startsWith('Error') ? 'var(--c-danger)' : 'var(--u-text-3)',
          background: msg.startsWith('Error') ? 'var(--c-danger-bg)' : 'transparent',
          border: msg.startsWith('Error') ? '1px solid var(--c-danger-line)' : 'none',
          borderRadius: msg.startsWith('Error') ? 6 : 0,
          padding: msg.startsWith('Error') ? '7px 10px' : 0,
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}
