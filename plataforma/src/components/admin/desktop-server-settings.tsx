'use client';

/* "Hacer de esta PC el servidor del local" — vivía dentro de Impresión, pero
   es una decisión sobre el DISPOSITIVO (esta PC), no sobre impresoras, así
   que ahora vive en Ajustes. Solo aplica dentro de Leogin Desktop (Tauri);
   fuera de ahí no se muestra nada. Autocontenido a propósito (no reusa
   PrintAgentSettings completo) para no duplicar el resto de esa pantalla. */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPrintAgentConfig, regenerateAgentToken, type PrintAgentConfig } from '@/lib/actions/print-agent';

function connectionLabel(config: PrintAgentConfig | null): { text: string; color: string } {
  if (!config?.exists) return { text: 'Esta PC no es el servidor todavía', color: 'var(--u-text-4)' };
  if (!config.lastSeenAt) return { text: 'Token generado · esperando primera conexión', color: '#f59e0b' };
  const ageMs = Date.now() - new Date(config.lastSeenAt).getTime();
  if (ageMs < 90_000) return { text: '● Conectado — esta PC es el servidor', color: 'var(--c-ok, #4ade80)' };
  const mins = Math.round(ageMs / 60_000);
  const ago = mins < 60 ? `hace ${mins} min` : `hace ${Math.round(mins / 60)} h`;
  return { text: `Última conexión ${ago}`, color: '#f59e0b' };
}

export default function DesktopServerSettings() {
  const [config, setConfig] = useState<PrintAgentConfig | null>(null);
  const [origin, setOrigin] = useState('');
  const [inDesktopApp, setInDesktopApp] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await getPrintAgentConfig();
    if (!('error' in res)) setConfig(res);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    // window.__TAURI__ solo existe dentro de la app instalable Leogin Desktop.
    setInDesktopApp(typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__));
    void load();
  }, [load]);

  async function handleInstallAsServer() {
    setInstalling(true);
    setMsg('Generando token…');
    try {
      const res = await regenerateAgentToken();
      if (res.error || !res.token) {
        setMsg(`Error: ${res.error ?? 'No se pudo generar el token.'}`);
        return;
      }
      setMsg('Instalando el servicio de Leogin en esta PC…');
      const tauri = (window as unknown as { __TAURI__?: { core: { invoke: (cmd: string, args?: object) => Promise<void> } } }).__TAURI__;
      await tauri?.core.invoke('install_agent_as_server', { apiUrl: origin, token: res.token });
      setMsg('✓ Instalando… en unos segundos verás "Conectado" aquí abajo.');
      let tries = 0;
      const poll = setInterval(() => {
        tries += 1;
        void load();
        if (tries >= 15) clearInterval(poll);
      }, 4000);
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInstalling(false);
    }
  }

  if (!inDesktopApp) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6, margin: 0 }}>
        Esta opción solo aparece cuando abres el panel desde <strong style={{ color: 'var(--u-text-2)' }}>Leogin Desktop</strong>,
        la app instalable para la PC del local. Descárgala desde{' '}
        <a href="/admin/escritorio" style={{ color: 'var(--brand-accent)' }}>Leogin Desktop</a>.
      </p>
    );
  }

  const conn = connectionLabel(config);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: conn.color }}>{conn.text}</div>
      <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: 0 }}>
        ¿Esta es la PC del local? Con un clic la conviertes en el servidor: imprime sola y
        mantiene el restaurante funcionando aunque se corte el internet.
      </p>
      <Button type="button" onClick={handleInstallAsServer} disabled={installing} size="sm" className="self-start">
        {installing ? 'Instalando…' : 'Hacer de esta PC el servidor del local'}
      </Button>
      {msg && <div style={{ fontSize: 12, color: 'var(--u-text-3)' }}>{msg}</div>}
    </div>
  );
}
