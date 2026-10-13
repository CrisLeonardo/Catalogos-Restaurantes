'use client';

/* La firma del encargado en las correcciones de caja (migración 145).

   Mismo trato que la anulación de un plato ya cocinado: si quien corrige
   es dueño o encargado, firma él y no se le pide nada; si no, le pasa la
   tablet a alguien de la lista y esa persona teclea su PIN. La lista y la
   comprobación del PIN las decide el servidor (`getCajaApproval`,
   `lib/auth/firma-encargado.ts`). */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { getCajaApproval } from '@/lib/actions/finanzas';
import { PIN_LENGTH } from '@/lib/staff-pin-constants';
import type { Aprobador } from '@/lib/void-approval';

export interface FirmaValor {
  approverId: string | null;
  approverPin: string | null;
  /** La firma está completa (o no hace falta). */
  lista: boolean;
  /** Nadie puede firmar desde aquí. */
  bloqueada: boolean;
}

export function useFirmaEncargado(restaurantId: string, selfApproves: boolean) {
  const [approvers, setApprovers] = useState<Aprobador[] | null>(selfApproves ? [] : null);
  const [firmante, setFirmante] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (selfApproves) return;
    let vivo = true;
    getCajaApproval(restaurantId)
      .then((r) => { if (vivo) setApprovers(r.approvers); })
      .catch(() => { if (vivo) setApprovers([]); });
    return () => { vivo = false; };
  }, [restaurantId, selfApproves]);

  const valor: FirmaValor = selfApproves
    ? { approverId: null, approverPin: null, lista: true, bloqueada: false }
    : {
        approverId: firmante,
        approverPin: pin || null,
        lista: !!firmante && pin.length === PIN_LENGTH,
        bloqueada: approvers != null && approvers.length === 0,
      };

  return {
    valor,
    /** El PIN no se queda escrito tras un fallo: en una tablet compartida
        eso es dejarlo a la vista del siguiente que la agarre. */
    limpiarPin: () => setPin(''),
    bloque: selfApproves ? (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.45 }}>
        Queda firmado a tu nombre en la bitácora.
      </p>
    ) : approvers == null ? (
      <p style={{ margin: 0, fontSize: 12, color: 'var(--u-text-4)' }}>Buscando quién puede autorizar…</p>
    ) : approvers.length === 0 ? (
      <div className="note note-danger">
        <Icon name="alertCircle" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Esto lo autoriza un encargado y nadie con ese cargo tiene PIN puesto. Pídeselo al encargado
          desde su propia sesión, o que el dueño le asigne un PIN en Personal.
        </span>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="caja-campo-label">¿Quién autoriza?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {approvers.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setFirmante(a.id); setPin(''); }}
                className="press caja-opcion"
                data-on={firmante === a.id ? '1' : '0'}
                aria-pressed={firmante === a.id}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                <span style={{ fontSize: 11, opacity: 0.75 }}>{a.role}</span>
              </button>
            ))}
          </div>
        </div>
        {firmante && (
          <div>
            <label htmlFor="caja-firma-pin" className="caja-campo-label">Su PIN</label>
            <input
              id="caja-firma-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              placeholder={'•'.repeat(PIN_LENGTH)}
              className="adm-field adm-field-mono"
              style={{ width: 132, fontSize: 18, letterSpacing: '0.3em', textAlign: 'center' }}
            />
          </div>
        )}
      </div>
    ),
  };
}
