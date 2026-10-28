'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/components/admin/image-upload';
import { prepararComprobantePedido, registrarComprobantePedido } from '@/lib/actions/pago-transferencia';
import { COMPROBANTE_MAX_BYTES, COMPROBANTE_TIPOS, type DatosBancarios } from '@/lib/pago-plan';
import type { EstadoTransferencia } from '@/lib/pago-transferencia';
import { useThemeConfig } from '@/lib/theme/context';
import { formatPrice } from '@/lib/theme/resolve';

/* ============================================================
   PAGA TU PEDIDO POR TRANSFERENCIA — en el seguimiento (mig. 149)
   ------------------------------------------------------------
   La cuenta del restaurante con botón de copiar, el monto exacto y
   la subida del comprobante. Sin cuenta ni contraseña: el token del
   pedido es la llave. Después el comensal ve «lo están revisando» y,
   cuando el restaurante lo confirma, «pago confirmado».
   ============================================================ */

interface Props {
  token: string;
  restaurantId: string;
  total: number;
  cuenta: DatosBancarios;
  estadoInicial: EstadoTransferencia | null;
}

const ACEPTA = Object.keys(COMPROBANTE_TIPOS).join(',');

export default function TrackerTransferencia({ token, restaurantId, total, cuenta, estadoInicial }: Props) {
  const config = useThemeConfig();
  const [estado, setEstado] = useState<EstadoTransferencia | null>(estadoInicial);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // El seguimiento consulta el pedido cada pocos segundos: cuando el
  // restaurante confirma, el estado nuevo llega por aquí.
  useEffect(() => { if (estadoInicial) setEstado(estadoInicial); }, [estadoInicial]);

  if (estado === 'CONFIRMADO') {
    return (
      <div style={{ background: 'var(--brand-bg)', border: '1px solid var(--u-hair)', borderRadius: 'var(--m-r-lg)', padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <Icon name="checkCircle" size={20} style={{ color: 'var(--c-ok)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)' }}>Pago confirmado. ¡Gracias!</span>
      </div>
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(cuenta.numeroCuenta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch { /* el número sigue a la vista */ }
  }

  function subir(f: File | null) {
    if (!f) return;
    setError(null);
    if (!COMPROBANTE_TIPOS[f.type]) return setError('Sube una foto (JPG, PNG o WebP) o un PDF.');
    start(async () => {
      const listo = f.type === 'application/pdf' ? f : await compressImage(f, 1800, 0.85);
      if (listo.size > COMPROBANTE_MAX_BYTES) return setError('El archivo pesa más de 5 MB. Prueba con una captura de pantalla.');
      const prep = await prepararComprobantePedido(token, restaurantId, listo.type);
      if ('error' in prep) return setError(prep.error);
      const { error: e } = await createClient().storage
        .from('payment-proofs')
        .uploadToSignedUrl(prep.ruta, prep.token, listo, { contentType: listo.type });
      if (e) return setError('No se pudo subir. Revisa tu conexión e inténtalo de nuevo.');
      const r = await registrarComprobantePedido(token, restaurantId, prep.ruta);
      if ('error' in r) return setError(r.error);
      setEstado('POR_CONFIRMAR');
    });
  }

  const enviado = estado === 'POR_CONFIRMAR';

  return (
    <section
      aria-label="Pago por transferencia"
      style={{ background: 'var(--brand-bg)', border: '1px solid var(--u-hair)', borderRadius: 'var(--m-r-lg)', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}
    >
      <div>
        <div className="t-kicker" style={{ fontSize: 'var(--m-fs-xs)' }}>Pago por transferencia</div>
        <div style={{ fontSize: 'var(--m-fs-xl)', fontWeight: 800, color: 'var(--u-text)', marginTop: 2 }}>{formatPrice(total, config)}</div>
      </div>

      {estado === 'RECHAZADO' && (
        <p role="alert" style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger)', lineHeight: 1.5 }}>
          El restaurante no encontró tu transferencia. Revisa el monto y vuelve a mandar el comprobante.
        </p>
      )}

      {enviado ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Icon name="clock" size={18} style={{ color: 'var(--c-ok)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 'var(--m-fs-md)', fontWeight: 700, color: 'var(--u-text)' }}>Comprobante enviado</div>
            <div style={{ fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>
              El restaurante lo está revisando. Aquí verás cuando lo confirme.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--m-fs-sm)', color: 'var(--u-text-2)' }}>
            <span>{cuenta.banco}{cuenta.tipoCuenta ? ` · ${cuenta.tipoCuenta}` : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <strong className="t-mono" style={{ fontSize: 'var(--m-fs-lg)', color: 'var(--u-text)' }}>{cuenta.numeroCuenta}</strong>
              <button
                type="button" onClick={copiar} className="press btn-outline"
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--m-fs-sm)', fontWeight: 700, cursor: 'pointer', minHeight: 'var(--m-tap)' }}
              >
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </span>
            {cuenta.titular && <span>A nombre de {cuenta.titular}</span>}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className={`press ${enviado ? 'btn-outline' : 'btn-accent'}`}
        style={{ padding: '13px 18px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--m-fs-md)', fontWeight: 700, cursor: 'pointer', minHeight: 'var(--m-tap)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Icon name="upload" size={17} />
        {pending ? 'Subiendo…' : enviado ? 'Mandar otro comprobante' : 'Ya transferí: subir comprobante'}
      </button>
      <input ref={inputRef} type="file" accept={ACEPTA} className="sr-only" onChange={(e) => subir(e.target.files?.[0] ?? null)} />
      {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--m-fs-sm)', color: 'var(--c-danger)' }}>{error}</p>}
    </section>
  );
}
