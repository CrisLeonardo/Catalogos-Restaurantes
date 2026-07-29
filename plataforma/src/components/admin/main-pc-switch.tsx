'use client';

/* El interruptor de "PC principal del local".

   Antes esto estaba repartido en cuatro sitios (Impresión, Sin internet,
   Leogin Desktop y un botón escondido en Ajustes → Este dispositivo), solo se
   podía ENCENDER, y en ningún lado decía QUÉ computadora era la principal.
   Un dueño con dos PCs no tenía forma de saber cuál era, ni de cambiarla sin
   desinstalar cosas a mano.

   Ahora es un único interruptor con tres verdades a la vista:
     · si hay o no una PC principal,
     · cuál es (nombre del equipo) y si está encendida ahora mismo,
     · qué se pierde si la apagas.

   Encender desde Leogin Desktop instala el servicio solo (el agente viaja
   dentro del instalador). Apagar funciona desde CUALQUIER dispositivo — hasta
   desde el celular — porque el corte real lo da la nube al revocar el token;
   si además estás en la PC en cuestión, se desinstala el servicio local. */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InstallSteps } from '@/components/admin/print-agent-settings';
import {
  getPrintAgentConfig, setLocalServerActive, type PrintAgentConfig,
} from '@/lib/actions/print-agent';

type TauriApi = { core: { invoke: (cmd: string, args?: object) => Promise<unknown> } };

function tauri(): TauriApi | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { __TAURI__?: TauriApi }).__TAURI__) ?? null;
}

/** Minutos desde un ISO, o null si no hay fecha. */
function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

export interface PcStatus {
  /** Hay una PC principal configurada Y encendida en el panel. */
  on: boolean;
  /** Está respondiendo ahora mismo (heartbeat < 90 s). */
  live: boolean;
  label: string;
  detail: string;
  tone: 'ok' | 'warn' | 'off';
}

export function readStatus(config: PrintAgentConfig | null): PcStatus {
  if (!config?.exists) {
    return {
      on: false, live: false, tone: 'off',
      label: 'Todavía no tienes una PC principal',
      detail: 'Sin ella no se imprimen comandas solas y el local se detiene si falla el internet.',
    };
  }
  if (!config.isActive) {
    return {
      on: false, live: false, tone: 'warn',
      label: 'PC principal apagada',
      detail: config.deviceName
        ? `La apagaste tú. Era ${config.deviceName}; sus impresoras siguen guardadas.`
        : 'La apagaste tú. Las impresoras que tenías asignadas siguen guardadas.',
    };
  }
  const mins = minutesSince(config.lastSeenAt);
  // Los agentes anteriores a 0.7.1 no mandan el nombre del equipo: mejor no
  // afirmar cuál es que decir "esta PC" al dueño que mira desde su celular.
  const named = config.deviceName ? `PC principal: ${config.deviceName}` : 'PC principal configurada';
  if (mins == null) {
    return {
      on: true, live: false, tone: 'warn',
      label: 'Esperando a la PC principal',
      detail: 'Ya quedó encendida; en cuanto el servicio arranque, aquí dirá "Conectada".',
    };
  }
  if (mins < 1.5) {
    return {
      on: true, live: true, tone: 'ok',
      label: named,
      detail: 'Conectada y funcionando. Imprime sola y cubre los cortes de internet.',
    };
  }
  const ago = mins < 60 ? `hace ${Math.round(mins)} min` : `hace ${Math.round(mins / 60)} h`;
  return {
    on: true, live: false, tone: 'warn',
    label: named,
    detail: `Sin responder desde ${ago}. ¿Está encendida y con internet?`,
  };
}

const TONE: Record<PcStatus['tone'], string> = {
  ok: 'var(--c-ok, #4ade80)',
  warn: 'var(--c-warn, #f59e0b)',
  off: 'var(--u-text-4)',
};

export default function MainPcSwitch({ onChanged }: { onChanged?: () => void }) {
  const [config, setConfig] = useState<PrintAgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [origin, setOrigin] = useState('');
  const [inDesktop, setInDesktop] = useState(false);
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    const res = await getPrintAgentConfig();
    if (!('error' in res)) setConfig(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setInDesktop(tauri() !== null);
    void load();
  }, [load]);

  const status = readStatus(config);

  /** Enciende: pide token nuevo y, si estamos dentro de la app, instala solo. */
  async function turnOn() {
    setBusy(true);
    setManualToken(null);
    setMsg({ text: 'Preparando esta PC…' });
    try {
      const res = await setLocalServerActive(true);
      if (res.error || !res.token) {
        setMsg({ text: res.error ?? 'No se pudo encender.', bad: true });
        return;
      }
      const api = tauri();
      if (!api) {
        // Desde el navegador no se puede instalar nada: la nube ya quedó
        // esperando, y el token se muestra para la instalación manual.
        setManualToken(res.token);
        setMsg({ text: 'Falta instalar el servicio en la PC del local — sigue los pasos de abajo.' });
        await load();
        onChanged?.();
        return;
      }
      setMsg({ text: 'Instalando el servicio en esta PC…' });
      await api.core.invoke('install_agent_as_server', { apiUrl: origin, token: res.token });
      setMsg({ text: 'Listo. En unos segundos aquí dirá «Conectada».' });
      pollUntilLive();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setConfirmOff(false);
    setManualToken(null);
    setMsg({ text: 'Apagando…' });
    try {
      const res = await setLocalServerActive(false);
      if (res.error) {
        setMsg({ text: res.error, bad: true });
        return;
      }
      // Best-effort: si estamos EN esa PC, además se quita el servicio. Si no
      // (el dueño lo apagó desde su celular), basta con el token revocado.
      try { await tauri()?.core.invoke('uninstall_agent_server'); } catch { /* otra PC */ }
      setMsg({ text: 'Esta PC ya no es la principal. Las impresoras quedaron guardadas.' });
      await load();
      onChanged?.();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  }

  /** Refresca hasta que el agente reporte (o se acaben los intentos). */
  function pollUntilLive() {
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      await load();
      onChanged?.();
      if (tries >= 15) clearInterval(timer);
    }, 4000);
  }

  if (loading) {
    return <div style={{ fontSize: 12.5, color: 'var(--u-text-4)' }}>Cargando…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Estado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, marginTop: 5, flexShrink: 0, background: TONE[status.tone] }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)' }}>{status.label}</div>
          <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.55, marginTop: 3 }}>{status.detail}</div>
          {config?.exists && config.isActive && (config.version || config.shellVersion) && (
            <div style={{ fontSize: 11, color: 'var(--u-text-4)', marginTop: 4 }}>
              {config.version ? `Servicio v${config.version}` : ''}
              {config.version && config.shellVersion ? ' · ' : ''}
              {config.shellVersion ? `Leogin Desktop v${config.shellVersion}` : ''}
            </div>
          )}
        </div>
        <Button type="button" onClick={load} variant="ghost" size="sm" className="h-auto py-1">↻</Button>
      </div>

      {/* El interruptor */}
      <Card variant="flat" className="flex items-center gap-3 p-3.5">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
            {inDesktop ? 'Esta computadora es la principal del local' : 'El local tiene una PC principal'}
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '4px 0 0' }}>
            {inDesktop
              ? 'Enciéndelo en la computadora que está en el local, junto a la impresora. Solo una PC del restaurante debe tenerlo encendido.'
              : 'Para encenderla hay que estar en esa computadora, con Leogin Desktop abierto. Desde aquí sí puedes apagarla.'}
          </p>
        </div>
        <Switch
          checked={status.on}
          disabled={busy || (!status.on && !inDesktop && manualToken !== null)}
          onCheckedChange={(next) => {
            if (next) void turnOn();
            else setConfirmOff(true);
          }}
          aria-label="Esta PC es la principal del local"
        />
      </Card>

      {/* Confirmación de apagado: no es un clic inocente */}
      {confirmOff && (
        <Card variant="flat" className="p-3.5" style={{ borderColor: 'color-mix(in srgb, var(--c-warn, #f59e0b) 35%, transparent)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
            ¿Apagar la PC principal del local?
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '6px 0 10px' }}>
            Dejarán de imprimirse las comandas solas y el local ya no podrá seguir tomando pedidos si
            se cae el internet. Puedes volver a encenderla cuando quieras; tus impresoras quedan guardadas.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={turnOff} disabled={busy} size="sm" variant="destructive">
              Sí, apagarla
            </Button>
            <Button type="button" onClick={() => setConfirmOff(false)} size="sm" variant="secondary">
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {msg && (
        <div style={{
          fontSize: 12.5, lineHeight: 1.5, padding: '9px 12px', borderRadius: 10,
          color: msg.bad ? 'var(--c-danger, #f87171)' : 'var(--u-text-2)',
          background: msg.bad
            ? 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)'
            : 'color-mix(in srgb, var(--u-text) 5%, transparent)',
        }}>
          {msg.text}
        </div>
      )}

      {/* Camino desde el navegador: descargar la app o instalar a mano */}
      {!inDesktop && !status.on && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button render={<a href="/api/desktop/download-exe" />}>
            <Icon name="download" size={16} /> Descargar Leogin para esta PC
          </Button>
          <span style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>
            Windows 10/11 · gratis · el servicio de impresión ya viene incluido.
          </span>
        </div>
      )}

      {manualToken && <InstallSteps token={manualToken} origin={origin} onCopied={(t) => setMsg({ text: t })} />}
    </div>
  );
}
