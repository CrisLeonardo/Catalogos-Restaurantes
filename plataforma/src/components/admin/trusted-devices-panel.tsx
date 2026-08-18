'use client';

/* Dispositivos de confianza del local (migración 112).
   El dueño ve qué aparatos reconoce su restaurante, autoriza el que tiene en
   la mano y decide si el PIN del personal vale SOLO en ellos. */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDeviceId, describeThisDevice } from '@/lib/device-id';
import { trustCurrentDevice, forgetDevice, setTrustedDevicePolicy, type DeviceState } from '@/lib/actions/devices';
import type { TrustedDevice } from '@/lib/auth/trusted-device';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export default function TrustedDevicesPanel({ restaurantId, devices, requiresTrusted }: {
  restaurantId: string;
  devices: TrustedDevice[];
  requiresTrusted: boolean;
}) {
  const router = useRouter();
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [thisDeviceLabel, setThisDeviceLabel] = useState('Este dispositivo');

  const [trustState, trustAction, trusting] = useActionState<DeviceState, FormData>(trustCurrentDevice, null);
  const [policyState, policyAction, savingPolicy] = useActionState<DeviceState, FormData>(setTrustedDevicePolicy, null);

  // El id vive en localStorage: solo se puede leer ya montado en el navegador.
  useEffect(() => {
    setThisDeviceId(getDeviceId());
    setThisDeviceLabel(describeThisDevice());
  }, []);

  useEffect(() => { if (trustState && 'ok' in trustState) router.refresh(); }, [trustState, router]);
  useEffect(() => { if (policyState && 'ok' in policyState) router.refresh(); }, [policyState, router]);

  const isThisTrusted = !!thisDeviceId && devices.some((d) => d.device_id === thisDeviceId);
  const error = (trustState && 'error' in trustState && trustState.error)
    || (policyState && 'error' in policyState && policyState.error)
    || null;

  return (
    <Card className="p-4.5 flex flex-col gap-3.5" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="t-kicker" style={{ fontSize: 9.5 }}>Dispositivos del local</div>
        {requiresTrusted && (
          <span className="chip chip-ok" style={{ flexShrink: 0 }}>
            <Icon name="key" size={11} /> PIN protegido
          </span>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', margin: 0, lineHeight: 1.5 }}>
        Estos son los aparatos que tu restaurante reconoce como suyos. Se apuntan solos
        cada vez que alguien entra con su PIN, así que la lista se llena sin que hagas nada.
      </p>

      {/* Este aparato */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '11px 13px', borderRadius: 12,
          border: '1px solid var(--u-hair)',
          background: 'color-mix(in srgb, var(--u-text) 3%, transparent)',
        }}
      >
        <span
          style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
            background: isThisTrusted ? 'var(--c-ok-bg)' : 'color-mix(in srgb, var(--u-text) 7%, transparent)',
            color: isThisTrusted ? 'var(--c-ok)' : 'var(--u-text-3)',
          }}
        >
          <Icon name="monitor" size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--u-text)' }}>{thisDeviceLabel}</div>
          <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
            {thisDeviceId === null
              ? 'Este navegador no permite recordar el aparato'
              : isThisTrusted ? 'Ya está autorizado' : 'Todavía no autorizado'}
          </div>
        </div>
        {!isThisTrusted && thisDeviceId && (
          <form action={trustAction} style={{ flexShrink: 0 }}>
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <input type="hidden" name="label" value={thisDeviceLabel} />
            <Button type="submit" size="sm" disabled={trusting}>
              {trusting ? 'Autorizando…' : 'Autorizar'}
            </Button>
          </form>
        )}
      </div>

      {/* Lista */}
      {devices.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--u-text-4)' }}>
          Todavía no hay ningún aparato reconocido.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {devices.map((d) => (
            <div
              key={d.device_id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 0', borderTop: '1px solid var(--u-hair)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--u-text)', fontWeight: 500 }}>
                  {d.label || 'Dispositivo sin nombre'}
                  {d.device_id === thisDeviceId && (
                    <span style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 400 }}> · este</span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 1 }}>
                  Última vez {timeAgo(d.last_seen_at)}
                  {d.auto ? ' · se apuntó solo al entrar con PIN' : ' · autorizado desde el panel'}
                </div>
              </div>
              <form
                action={forgetDevice}
                onSubmit={(e) => { if (!confirm('¿Quitar este aparato? Si el PIN está protegido, dejará de poder entrar desde ahí.')) e.preventDefault(); }}
                style={{ flexShrink: 0 }}
              >
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="deviceId" value={d.device_id} />
                <input type="hidden" name="label" value={d.label ?? ''} />
                <Button type="submit" variant="ghost" size="sm" aria-label="Quitar dispositivo">
                  <Icon name="x" size={15} />
                </Button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* El candado */}
      <form action={policyAction} style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 13 }}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <input type="hidden" name="enabled" value={requiresTrusted ? 'false' : 'true'} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>
              El PIN solo funciona en estos aparatos
            </div>
            <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: '3px 0 0', lineHeight: 1.5 }}>
              {requiresTrusted
                ? 'Encendido. Desde cualquier otro aparato hay que entrar con correo, y la lista de nombres de tu personal deja de verse fuera del local.'
                : 'Apagado. Hoy tu personal puede entrar con su PIN desde cualquier lugar del mundo, y la lista con sus nombres se ve sin iniciar sesión.'}
            </p>
          </div>
          <Button
            type="submit"
            size="sm"
            variant={requiresTrusted ? 'secondary' : 'primary'}
            disabled={savingPolicy}
            className="whitespace-nowrap"
          >
            {savingPolicy ? 'Guardando…' : requiresTrusted ? 'Apagar' : 'Encender'}
          </Button>
        </div>
      </form>

      {error && <div style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</div>}
    </Card>
  );
}
