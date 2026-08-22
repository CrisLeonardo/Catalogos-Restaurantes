'use client';

/* El interruptor de "PC principal del local".

   Antes esto estaba repartido en cuatro sitios (Impresión, Sin internet,
   Leogin Desktop y un botón escondido en Ajustes → Este dispositivo), solo se
   podía ENCENDER, y en ningún lado decía QUÉ computadora era la principal.
   Un dueño con dos PCs no tenía forma de saber cuál era, ni de cambiarla sin
   desinstalar cosas a mano.

   Y quedaba una media verdad más grande: `is_active` es del RESTAURANTE, así
   que el interruptor aparecía ENCENDIDO en todas partes. Abrías el panel en el
   celular o en la laptop de tu casa y esa pantalla decía que ahí había una PC
   principal encendida. Ahora la pantalla cruza las dos preguntas —¿el local
   tiene PC principal? ¿es ESTE aparato?— y solo enseña el interruptor en el
   aparato que la encendió (migración 110, ver lib/main-pc.ts). En los demás
   dice cuál es y ofrece lo que sí se puede hacer desde lejos: apagarla, o
   poner esta computadora en su lugar.

   Encender desde Leogin Desktop instala el servicio solo (el agente viaja
   dentro del instalador). Apagar funciona desde CUALQUIER dispositivo — hasta
   desde el celular — porque el corte real lo da la nube al revocar el token;
   si además estás en la PC en cuestión, se desinstala el servicio local. */

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { friendlyError } from '@/lib/friendly-error';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InstallSteps } from '@/components/admin/print-agent-settings';
import { getDeviceId, describeThisDevice } from '@/lib/device-id';
import { readMainPcStatus, type PcStatus } from '@/lib/main-pc';
import {
  claimMainPcDevice, getPrintAgentConfig, setLocalServerActive, type PrintAgentConfig,
} from '@/lib/actions/print-agent';

type TauriApi = { core: { invoke: (cmd: string, args?: object) => Promise<unknown> } };

function tauri(): TauriApi | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { __TAURI__?: TauriApi }).__TAURI__) ?? null;
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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const load = useCallback(async () => {
    const res = await getPrintAgentConfig();
    if (!('error' in res)) setConfig(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    setInDesktop(tauri() !== null);
    setDeviceId(getDeviceId());
    void load();
  }, [load]);

  const status = readMainPcStatus(config, deviceId);

  /** Enciende: pide token nuevo y, si estamos dentro de la app, instala solo. */
  async function turnOn() {
    setBusy(true);
    setConfirmReplace(false);
    setManualToken(null);
    setMsg({ text: 'Preparando esta PC…' });
    try {
      // El sello de dispositivo viaja aquí: es lo que después permite decir
      // "esta computadora" en vez de "el local tiene una".
      const id = deviceId ?? getDeviceId();
      const res = await setLocalServerActive(
        true,
        id ? { id, label: describeThisDevice(inDesktop) } : undefined,
      );
      if (res.error || !res.token) {
        setMsg({ text: res.error ?? 'No se pudo encender.', bad: true });
        return;
      }
      if (id && !deviceId) setDeviceId(id);
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
      setMsg({ text: friendlyError(e), bad: true });
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
      setMsg({ text: 'El local ya no tiene PC principal. Las impresoras quedaron guardadas.' });
      await load();
      onChanged?.();
    } catch (e) {
      setMsg({ text: friendlyError(e), bad: true });
    } finally {
      setBusy(false);
    }
  }

  /** "Sí, la principal es esta" para instalaciones sin sello (mig. 110). */
  async function claimThisDevice() {
    setBusy(true);
    try {
      const id = deviceId ?? getDeviceId();
      if (!id) {
        setMsg({ text: 'Este navegador no permite guardar datos del sitio, así que no podemos reconocerlo.', bad: true });
        return;
      }
      const res = await claimMainPcDevice({ id, label: describeThisDevice(inDesktop) });
      if (res.error) {
        setMsg({ text: res.error, bad: true });
        return;
      }
      setDeviceId(id);
      setMsg({ text: 'Anotado: esta computadora es la PC principal del local.' });
      await load();
      onChanged?.();
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

  // El interruptor solo se enseña donde significa algo: en la PC que la
  // encendió (para apagarla) y donde no hay ninguna (para encenderla).
  const showSwitch = !status.on || status.isThisDevice;
  const otherName = status.deviceLabel ?? 'otra computadora';

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

      {showSwitch ? (
        /* El interruptor */
        <Card variant="flat" className="flex items-center gap-3 p-3.5">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
              {status.isThisDevice
                ? 'Esta computadora es la principal del local'
                : inDesktop
                  ? 'Hacer de esta computadora la principal'
                  : 'El local no tiene PC principal'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '4px 0 0' }}>
              {status.isThisDevice
                ? 'Mientras esté encendido, esta computadora imprime las comandas y cubre los cortes de internet.'
                : inDesktop
                  ? 'Enciéndelo en la computadora que está en el local, junto a la impresora. Solo una PC del restaurante debe tenerlo encendido.'
                  : 'Para encenderla hay que estar en esa computadora, con Leogin Desktop abierto.'}
            </p>
          </div>
          <Switch
            checked={status.isThisDevice}
            disabled={busy || (!status.on && !inDesktop && manualToken !== null)}
            onCheckedChange={(next) => {
              if (next) void turnOn();
              else setConfirmOff(true);
            }}
            aria-label="Esta computadora es la PC principal del local"
          />
        </Card>
      ) : (
        /* Hay PC principal, pero NO es este aparato. Ni interruptor ni engaño:
           lo que se puede hacer desde aquí, dicho con todas sus letras. */
        <Card variant="flat" className="p-3.5">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icon name="monitor" size={17} style={{ color: 'var(--u-text-3)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
                {status.where === 'unknown'
                  ? 'No sabemos desde qué computadora se encendió'
                  : `Este dispositivo no es la PC principal`}
              </div>
              <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.55, margin: '4px 0 0' }}>
                {status.where === 'unknown'
                  ? 'Se encendió con una versión anterior del panel, que no lo anotaba. Si la PC principal del local es esta misma computadora, dínoslo y dejamos de preguntar.'
                  : `La PC principal es ${otherName}. Desde aquí solo la estás viendo: no imprime nada por este aparato ni te cubre si se cae el internet.`}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {status.where === 'unknown' && (
                  <Button type="button" onClick={claimThisDevice} disabled={busy} size="sm">
                    Sí, es esta computadora
                  </Button>
                )}
                <Button type="button" onClick={() => setConfirmReplace(true)} disabled={busy} size="sm" variant="secondary">
                  Poner esta computadora en su lugar
                </Button>
                <Button type="button" onClick={() => setConfirmOff(true)} disabled={busy} size="sm" variant="ghost">
                  Apagar la PC principal
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Reemplazo: encender aquí NO añade una segunda PC principal, sustituye
          a la que había (el token de la anterior deja de servir). Decirlo antes
          evita que alguien crea que se pueden tener dos imprimiendo. */}
      {confirmReplace && (
        <Card variant="flat" className="p-3.5" style={{ borderColor: 'color-mix(in srgb, var(--c-warn, #f59e0b) 35%, transparent)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--u-text)' }}>
            ¿Que la PC principal sea esta computadora?
          </div>
          <p style={{ fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.6, margin: '6px 0 10px' }}>
            {otherName} dejará de serlo en el momento en que confirmes: solo puede haber una,
            y la anterior deja de imprimir y de recibir pedidos. Si esa computadora sigue
            encendida, ciérrale el programa Leogin cuando puedas.
            {!inDesktop && ' Como no estás en Leogin Desktop, te daremos el código para instalar el servicio a mano en esta PC.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type="button" onClick={turnOn} disabled={busy} size="sm">
              Sí, que sea esta
            </Button>
            <Button type="button" onClick={() => setConfirmReplace(false)} size="sm" variant="secondary">
              Cancelar
            </Button>
          </div>
        </Card>
      )}

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
