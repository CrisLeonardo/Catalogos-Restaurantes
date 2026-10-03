'use client';

/* Pantalla "¿Quién eres?" — login rápido de personal por PIN de 4 dígitos.
   Grilla de nombres → pad numérico → auto-envía al 4º dígito. verifyStaffPin
   deja una sesión REAL de Supabase (no una identidad paralela) y devuelve la
   URL de destino; la navegación la hace ESTE componente con
   `window.location.assign` — no un `redirect()` del servidor, que se
   resuelve por dentro sin pasar por proxy.ts cuando el destino comparte host
   con esta pantalla (ver la nota en lib/actions/mi-cuenta.ts).

   Fallback offline (hub local, agente-impresion): si el envío falla por
   conectividad, se valida el PIN directo contra el hub para identificar al
   operador — pero el hub NO puede abrir una sesión de Supabase (imposible
   sin internet). En ese caso solo se avisa y se reintenta solo en cuanto
   vuelva la señal (evento 'online'), completando el login real entonces. */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import { listStaffForPin, verifyStaffPin, isPinAllowedHere, type PinStaffMember } from '@/lib/actions/staff-pin';
import { tryHubPinStaffList, tryHubPinVerify } from '@/lib/hub-fallback';

const PIN_LEN = 4;

interface Props {
  restaurantId: string;
  onBack: () => void;
  hubUrl?: string | null;
  hubToken?: string | null;
}

export default function StaffPinLogin({ restaurantId, onBack, hubUrl = null, hubToken = null }: Props) {
  const [members, setMembers] = useState<PinStaffMember[] | null>(null);
  /** Lista vacía porque este aparato no está autorizado, no porque falte personal. */
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [selected, setSelected] = useState<PinStaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [waitingForReconnect, setWaitingForReconnect] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pendingPinRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStaffForPin(restaurantId)
      .then(async (m) => {
        if (cancelled) return;
        setMembers(m);
        // Una lista vacía tiene dos causas muy distintas y el mensaje cambia:
        // no hay nadie con PIN, o este aparato no está autorizado.
        if (m.length === 0) {
          try {
            const allowed = await isPinAllowedHere(restaurantId);
            if (!cancelled) setDeviceBlocked(!allowed);
          } catch {
            /* sin respuesta → se deja el mensaje genérico */
          }
        }
      })
      .catch(async () => {
        if (cancelled) return;
        if (hubUrl) {
          const staff = await tryHubPinStaffList(hubUrl, hubToken);
          if (!cancelled) setMembers((staff ?? []).map((s) => ({ id: s.profileId, full_name: s.fullName })));
        } else if (!cancelled) {
          setMembers([]);
        }
      });
    return () => { cancelled = true; };
  }, [restaurantId, hubUrl, hubToken]);

  // Se identificó al operador vía hub mientras no había señal: en cuanto
  // vuelva, se reintenta el mismo PIN por el camino real (abre la sesión).
  useEffect(() => {
    if (!waitingForReconnect) return;
    function onOnline() {
      const p = pendingPinRef.current;
      if (p) submit(p);
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForReconnect]);

  function submit(fullPin: string) {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('restaurantId', restaurantId);
        fd.set('profileId', selected.id);
        fd.set('pin', fullPin);
        const result = await verifyStaffPin(null, fd);
        if (result && 'error' in result) {
          setError(result.error);
          setPin('');
        } else if (result && 'url' in result) {
          // Navegación de DOCUMENTO, no un `redirect()` del servidor: mismo
          // motivo que `enterRestaurant` (lib/actions/mi-cuenta.ts) — el
          // destino comparte host con esta pantalla.
          window.location.assign(result.url);
          return;
        }
        setWaitingForReconnect(false);
        pendingPinRef.current = null;
      } catch {
        // Fallo de red de verdad (no un PIN incorrecto): intentar identificar
        // contra el hub local, si hay uno vinculado a este restaurante.
        if (!hubUrl) {
          setError('Sin conexión. Inténtalo de nuevo.');
          setPin('');
          return;
        }
        const hubResult = await tryHubPinVerify(hubUrl, hubToken, selected.id, fullPin);
        if (!hubResult.ok) {
          setError(hubResult.error);
          setPin('');
          return;
        }
        pendingPinRef.current = fullPin;
        setWaitingForReconnect(true);
      }
    });
  }

  function pressDigit(d: string) {
    if (isPending || pin.length >= PIN_LEN) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LEN) submit(next);
  }

  function backspace() {
    if (isPending) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  }

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--u-text-3)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14,
  };

  if (!selected) {
    return (
      <Glass style={{ padding: '24px 22px' }}>
        <button type="button" onClick={onBack} style={linkStyle}>
          <Icon name="chevronLeft" size={14} /> Entrar con correo
        </button>
        <p className="t-display" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>¿Quién eres?</p>
        <p className="t-mute" style={{ fontSize: 12.5, marginBottom: 16 }}>Toca tu nombre para entrar con tu PIN.</p>

        {members === null ? (
          <p style={{ fontSize: 13, color: 'var(--u-text-3)' }}>Cargando…</p>
        ) : members.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', lineHeight: 1.55 }}>
            {deviceBlocked
              ? 'Este dispositivo no está autorizado para entrar con PIN. Entra con tu correo, o pídele al dueño que lo autorice desde Personal → Dispositivos del local.'
              : 'Todavía no hay personal con PIN configurado. El dueño puede asignarlo desde Personal.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelected(m)}
                className="press glass-quiet"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '16px 8px', borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-full)', background: 'color-mix(in srgb, var(--u-text) 10%, transparent)', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}>
                  <Icon name="user" size={19} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--u-text)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {m.full_name || 'Sin nombre'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Glass>
    );
  }

  function backToGrid() {
    setSelected(null);
    setPin('');
    setError(null);
    setWaitingForReconnect(false);
    pendingPinRef.current = null;
  }

  if (waitingForReconnect) {
    return (
      <Glass style={{ padding: '24px 22px', textAlign: 'center' }}>
        <button type="button" onClick={backToGrid} style={{ ...linkStyle, marginBottom: 10 }}>
          <Icon name="chevronLeft" size={14} /> Atrás
        </button>
        <Icon name="alertCircle" size={22} style={{ color: 'var(--c-warn)', marginBottom: 10 }} />
        <p className="t-display" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          {selected.full_name || 'Identificado'} — sin conexión
        </p>
        <p className="t-mute" style={{ fontSize: 12.5 }}>
          Te reconocimos con tu PIN, pero hace falta señal para entrar. Se completará solo en cuanto vuelva la conexión.
        </p>
      </Glass>
    );
  }

  return (
    <Glass style={{ padding: '24px 22px', textAlign: 'center' }}>
      <button type="button" onClick={backToGrid} style={{ ...linkStyle, marginBottom: 10 }}>
        <Icon name="chevronLeft" size={14} /> Atrás
      </button>
      <p className="t-display" style={{ fontSize: 17, fontWeight: 700, marginBottom: 18 }}>
        {selected.full_name || 'Tu PIN'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 14, height: 14, borderRadius: 'var(--radius-full)',
              background: i < pin.length ? 'var(--u-text)' : 'transparent',
              border: '1.5px solid var(--u-hair-2)',
            }}
          />
        ))}
      </div>

      <div style={{ minHeight: 18, marginBottom: 10 }}>
        {error && <span style={{ fontSize: 13, color: 'var(--c-danger)' }}>{error}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 64px)', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            disabled={isPending}
            onClick={() => pressDigit(d)}
            className="press glass-quiet"
            style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontSize: 22, fontWeight: 700, color: 'var(--u-text)' }}
          >
            {d}
          </button>
        ))}
        <span />
        <button
          type="button"
          disabled={isPending}
          onClick={() => pressDigit('0')}
          className="press glass-quiet"
          style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', fontSize: 22, fontWeight: 700, color: 'var(--u-text)' }}
        >
          0
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={backspace}
          className="press glass-quiet"
          style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)' }}
          aria-label="Borrar"
        >
          <Icon name="x" size={18} />
        </button>
      </div>
    </Glass>
  );
}
