'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPrintAgentConfig,
  regenerateAgentToken,
  setPrintTargets,
  sendTestPrint,
  type PrintAgentConfig,
  type ReportedPrinter,
} from '@/lib/actions/print-agent';

// ── Estilos ────────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--u-hair)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--u-hair)',
  color: 'var(--u-text)',
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  padding: '9px 13px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--u-text-2)',
  fontWeight: 600,
  fontSize: 12.5,
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

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        style={selectStyle}
        value={selectValue}
        onChange={(e) => onChange(e.target.value === MANUAL ? 'tcp://' : e.target.value)}
      >
        <option value="">— No imprimir aquí —</option>
        <option value="preview:">Simulador en pantalla (preview:)</option>
        {printers.flatMap((p) => [
          <option key={p.target} value={p.target}>{p.name} (térmica)</option>,
          <option key={`doc:${p.name}`} value={`doc:${p.name}`}>{p.name} · documento (impresora normal · pruebas)</option>,
        ])}
        <option value={MANUAL}>Otra · destino manual (tcp://…)</option>
      </select>

      {(isManual || selectValue === MANUAL) && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="tcp://192.168.1.50:9100"
          style={{ ...selectStyle, marginTop: 6, fontFamily: 'monospace', fontSize: 12 }}
        />
      )}

      <button
        type="button"
        onClick={onTest}
        className="press glass-quiet"
        style={{ ...btnStyle, marginTop: 8, color: 'var(--u-text-3)' }}
      >
        Probar
      </button>
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

  return (
    <div style={{
      background: 'rgba(74,222,128,0.06)',
      border: '1px solid rgba(74,222,128,0.22)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>
        ✓ Token generado — sigue los pasos para instalar el agente en la PC del local
      </div>

      {/* Paso 1: Descargar el agente */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>1</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Descarga el agente en la PC del local
          </span>
          <a
            href="/api/agent/download-exe"
            download="LeoginAgent.exe"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid var(--u-hair)',
              color: 'var(--u-text-2)',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              alignSelf: 'flex-start',
            }}
          >
            ⬇ Descargar LeoginAgent.exe
          </a>
          <span style={{ fontSize: 11, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
            Si Windows SmartScreen advierte al abrir el exe, haz clic en
            {' '}<strong style={{ color: 'var(--u-text-3)' }}>"Más información → Ejecutar de todos modos"</strong>.
          </span>
        </div>
      </div>

      {/* Paso 2: Ejecutar el instalador */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>2</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Abre <strong>PowerShell como Administrador</strong> en esa PC y ejecuta
          </span>
          <pre style={{
            margin: 0,
            padding: '9px 11px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--u-hair)',
            fontSize: 11,
            color: '#a5f3fc',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}>
            {psCommand}
          </pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={copyCmd}
              className="press glass-quiet"
              style={{ ...btnStyle, fontSize: 11.5, padding: '6px 10px' }}
            >
              Copiar comando
            </button>
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--u-text-4)',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 6,
            padding: '6px 9px',
            lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--u-text-3)' }}>Si PowerShell dice "no se puede ejecutar scripts":</strong>
            {' '}primero ejecuta{' '}
            <code style={{ color: '#fcd34d' }}>Set-ExecutionPolicy -Scope CurrentUser RemoteSigned</code>
            {' '}y vuelve a intentarlo.
          </div>
        </div>
      </div>

      {/* Paso 3: Verificar */}
      <div style={stepBoxStyle}>
        <span style={stepNumStyle}>3</span>
        <div style={stepContentStyle}>
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 600 }}>
            Vuelve aquí y pulsa "Actualizar"
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.5 }}>
            En unos segundos el estado cambiará a{' '}
            <span style={{ color: '#4ade80', fontWeight: 600 }}>● Agente conectado</span>
            {' '}y verás las impresoras detectadas.
          </span>
        </div>
      </div>

      {/* Alternativa: config manual */}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 11.5, color: 'var(--u-text-4)', cursor: 'pointer', userSelect: 'none' }}>
          Instalación manual (sin parámetros)
        </summary>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
            Descarga el config y colócalo junto al exe antes de ejecutar el instalador sin parámetros:
          </span>
          <pre style={{
            margin: 0, padding: '9px 11px', borderRadius: 8,
            background: 'rgba(0,0,0,0.35)', border: '1px solid var(--u-hair)',
            fontSize: 11, color: 'var(--u-text-2)', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>{configJson}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={downloadConfig}
              className="press glass-quiet"
              style={{ ...btnStyle, fontSize: 11.5, padding: '6px 10px' }}
            >
              ⬇ Descargar config.local.json
            </button>
            <button
              type="button"
              onClick={copyConfig}
              className="press glass-quiet"
              style={{ ...btnStyle, fontSize: 11.5, padding: '6px 10px' }}
            >
              Copiar JSON
            </button>
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
    if (!config?.exists) return { text: 'Sin agente vinculado', color: 'var(--u-text-4)' };
    if (!config.lastSeenAt) return { text: 'Token generado · esperando primera conexión', color: '#f59e0b' };
    const ageMs = Date.now() - new Date(config.lastSeenAt).getTime();
    if (ageMs < 90_000) return { text: '● Agente conectado', color: '#4ade80' };
    const mins = Math.round(ageMs / 60_000);
    const ago = mins < 60 ? `hace ${mins} min` : `hace ${Math.round(mins / 60)} h`;
    return { text: `Última conexión ${ago}`, color: '#f59e0b' };
  }

  const conn = connectionLabel();
  const printers = config?.reportedPrinters ?? [];

  return (
    <div style={cardStyle}>
      {/* Encabezado */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--u-text)' }}>
            Agente Leogin
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
          dispositivo</strong> (celular, tablet o PC), sin abrir diálogos. Instala el agente una sola
          vez en una PC del local; la configuración se guarda en la nube.
        </p>
      </div>

      {/* Estado de conexión */}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: conn.color }}>
        {conn.text}
        {config?.exists && (
          <span style={{ color: 'var(--u-text-4)', fontWeight: 500 }}>
            {' · '}{printers.length} impresora{printers.length === 1 ? '' : 's'} detectada{printers.length === 1 ? '' : 's'}
            {config.version ? ` · v${config.version}` : ''}
          </span>
        )}
        <button
          type="button"
          onClick={load}
          className="press"
          style={{ ...btnStyle, marginLeft: 10, padding: '4px 9px', color: 'var(--u-text-4)', background: 'rgba(255,255,255,0.05)' }}
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Generar / rotar token */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="press glass-quiet"
          style={{ ...btnStyle, alignSelf: 'flex-start', opacity: generating ? 0.6 : 1 }}
        >
          {generating
            ? 'Generando…'
            : config?.exists
              ? '↻ Regenerar token de instalación'
              : '🔑 Generar token de instalación'}
        </button>

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

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="press glass-quiet"
            style={{ ...btnStyle, alignSelf: 'flex-start', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Guardando…' : 'Guardar destinos'}
          </button>
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
    </div>
  );
}
