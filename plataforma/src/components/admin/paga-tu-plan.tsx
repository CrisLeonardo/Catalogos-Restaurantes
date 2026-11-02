'use client';

import { useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/components/admin/image-upload';
import { prepararSubidaComprobante, enviarComprobante } from '@/lib/actions/pago-plan';
import { COMPROBANTE_MAX_BYTES, COMPROBANTE_TIPOS, hayCuenta, type DatosBancarios, type EstadoComprobante } from '@/lib/pago-plan';
import { fmtMoney } from '@/lib/money';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';

/* ============================================================
   «Paga tu mensualidad» — Mi suscripción (plan §3)
   ------------------------------------------------------------
   Antes la pantalla decía cuánto se debía, un texto libre y un botón de
   WhatsApp; el dueño no sabía qué hacer ni dónde hacer clic. Ahora son
   tres pasos con la cuenta para copiar, un código de pago fijo y la
   subida del comprobante, que queda «en revisión» hasta que Leogin lo
   aprueba. El WhatsApp sigue como segunda vía.
   ============================================================ */

interface Props {
  restaurantId: string;
  amount: number;
  currency: string;
  vencido: boolean;
  codigo: string;
  cuenta: DatosBancarios;
  notas: string;
  waHref: string | null;
  ultimo: { status: EstadoComprobante; createdAt: string; reviewNote: string | null } | null;
}

const ACEPTA = Object.keys(COMPROBANTE_TIPOS).join(',');

export default function PagaTuPlan({ restaurantId, amount, currency, vencido, codigo, cuenta, notas, waHref, ultimo }: Props) {
  const enRevision = ultimo?.status === 'SUBMITTED';
  const rechazado = ultimo?.status === 'REJECTED';
  const [mostrarForm, setMostrarForm] = useState(!enRevision);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function elegir(f: File | null) {
    setError(null);
    if (!f) return setArchivo(null);
    if (!COMPROBANTE_TIPOS[f.type]) return setError('Sube una foto (JPG, PNG o WebP) o un PDF.');
    setArchivo(f);
  }

  function enviar() {
    if (!archivo) return setError('Elige la foto o el PDF de tu comprobante.');
    start(async () => {
      setError(null);
      const listo = archivo.type === 'application/pdf' ? archivo : await compressImage(archivo, 1800, 0.85);
      if (listo.size > COMPROBANTE_MAX_BYTES) return setError('El archivo pesa más de 5 MB. Prueba con una foto o un PDF más liviano.');

      const prep = await prepararSubidaComprobante(restaurantId, listo.type);
      if ('error' in prep) return setError(prep.error);

      const supabase = createClient();
      const { error: errSubida } = await supabase.storage
        .from('payment-proofs')
        .uploadToSignedUrl(prep.ruta, prep.token, listo, { contentType: listo.type });
      if (errSubida) return setError('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');

      const res = await enviarComprobante(restaurantId, prep.ruta, referencia);
      if (res && 'error' in res) return setError(res.error);
      setEnviado(true);
      setMostrarForm(false);
      setArchivo(null);
      setReferencia('');
    });
  }

  const revisando = enviado || enRevision;

  return (
    <Card
      className="p-5"
      style={{ border: vencido && !revisando ? '1px solid var(--c-danger-line)' : '1px solid var(--c-warn-line)' }}
    >
      <div className="adm-label" style={{ color: vencido && !revisando ? 'var(--c-danger)' : 'var(--c-warn)' }}>
        {revisando ? 'Pago en revisión' : vencido ? 'Pago vencido' : 'Paga tu mensualidad'}
      </div>
      <div className="t-mono" style={{ fontWeight: 600, fontSize: 28, color: 'var(--u-text)', lineHeight: 1.05, marginTop: 4 }}>
        {fmtMoney(amount, currency)}
      </div>

      {revisando && (
        <div
          role="status"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--c-ok-bg)', border: '1px solid var(--c-ok-line)' }}
        >
          <Icon name="clock" size={18} style={{ color: 'var(--c-ok)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>Comprobante enviado</div>
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>
              Lo revisamos en menos de 24 horas. Cuando lo aprobemos, tu cobro aparecerá como pagado aquí mismo.
            </div>
            {!mostrarForm && (
              <button
                type="button"
                onClick={() => setMostrarForm(true)}
                className="adm-action-link"
                style={{ marginTop: 6, fontSize: 12, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              >
                ¿Te equivocaste de archivo? Envía otro
              </button>
            )}
          </div>
        </div>
      )}

      {rechazado && !enviado && (
        <div
          role="alert"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)' }}
        >
          <Icon name="alertCircle" size={18} style={{ color: 'var(--c-danger)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)' }}>No pudimos confirmar tu pago</div>
            {ultimo?.reviewNote && (
              <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2, lineHeight: 1.5 }}>{ultimo.reviewNote}</div>
            )}
            <div style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 2 }}>Envía otro comprobante abajo.</div>
          </div>
        </div>
      )}

      {mostrarForm && (
        <ol style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Paso n={1} titulo={`Transfiere ${fmtMoney(amount, currency)}`}>
            {hayCuenta(cuenta) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--adm-bg-2)', border: '1px solid var(--u-hair)' }}>
                <Dato label="Banco" valor={cuenta.banco} />
                {cuenta.tipoCuenta && <Dato label="Tipo de cuenta" valor={cuenta.tipoCuenta} />}
                <Dato label="Número de cuenta" valor={cuenta.numeroCuenta} copiable mono />
                {cuenta.titular && <Dato label="A nombre de" valor={cuenta.titular} />}
              </div>
            ) : !notas ? (
              <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '4px 0 0', lineHeight: 1.5 }}>
                Escríbenos por WhatsApp y te mandamos los datos de la cuenta.
              </p>
            ) : null}
            {notas && (
              <p style={{ fontSize: 12, color: 'var(--u-text-3)', margin: '8px 0 0', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{notas}</p>
            )}
          </Paso>

          <Paso n={2} titulo="Escribe tu código en la descripción">
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '2px 0 8px', lineHeight: 1.5 }}>
              Así sabemos que el pago es tuyo. Es el mismo todos los meses.
            </p>
            <Dato label="Tu código de pago" valor={codigo} copiable mono grande />
          </Paso>

          <Paso n={3} titulo="Sube tu comprobante">
            <p style={{ fontSize: 13, color: 'var(--u-text-3)', margin: '2px 0 8px', lineHeight: 1.5 }}>
              Una foto o captura de la transferencia, o el PDF del banco.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACEPTA}
              className="sr-only"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              className="w-full justify-start"
              style={{ minHeight: 44 }}
            >
              <Icon name={archivo ? 'checkCircle' : 'upload'} size={16} style={{ color: archivo ? 'var(--c-ok)' : undefined }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {archivo ? archivo.name : 'Elegir foto o PDF'}
              </span>
            </Button>
            <label htmlFor="pago-referencia" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--u-text-3)', margin: '10px 0 4px' }}>
              Número de boleta o referencia <span style={{ fontWeight: 400, color: 'var(--u-text-4)' }}>(opcional)</span>
            </label>
            <Input
              id="pago-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={40}
              placeholder="Ej. 123456789"
              inputMode="text"
            />
          </Paso>
        </ol>
      )}

      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--c-danger)', margin: '12px 0 0', lineHeight: 1.45 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 16 }}>
        {mostrarForm && (
          <Button type="button" onClick={enviar} disabled={pending || !archivo} size="lg" className="rounded-adm-full">
            <Icon name="upload" size={16} />
            {pending ? 'Enviando…' : 'Enviar comprobante'}
          </Button>
        )}
        {waHref && (
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="adm-action-link" style={{ fontSize: 13 }}>
            <Icon name="whatsapp" size={14} /> {mostrarForm ? 'O mándalo por WhatsApp' : 'Escríbenos por WhatsApp'}
          </a>
        )}
      </div>
    </Card>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12 }}>
      <span
        aria-hidden
        style={{ width: 28, height: 28, borderRadius: 'var(--radius-full)', display: 'grid', placeItems: 'center', background: 'var(--u-text)', color: 'var(--adm-card)', fontSize: 13, fontWeight: 800 }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--u-text)', lineHeight: 1.3, paddingTop: 3 }}>
          <span className="sr-only">Paso {n}: </span>{titulo}
        </div>
        {children}
      </div>
    </li>
  );
}

function Dato({ label, valor, copiable, mono, grande }: { label: string; valor: string; copiable?: boolean; mono?: boolean; grande?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      /* sin portapapeles (http o permiso negado): el dato sigue a la vista */
    }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--u-text-4)', fontWeight: 600 }}>{label}</div>
        <div
          style={{
            fontSize: grande ? 20 : 14, fontWeight: grande ? 800 : 600, color: 'var(--u-text)',
            fontFamily: mono ? 'var(--ui-font-mono)' : undefined, letterSpacing: grande ? '0.04em' : undefined,
            overflowWrap: 'anywhere',
          }}
        >
          {valor}
        </div>
      </div>
      {copiable && (
        <Button type="button" variant="outline" size="sm" onClick={copiar} aria-label={`Copiar ${label.toLowerCase()}`}>
          <Icon name={copiado ? 'check' : 'receipt'} size={14} />
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      )}
    </div>
  );
}
