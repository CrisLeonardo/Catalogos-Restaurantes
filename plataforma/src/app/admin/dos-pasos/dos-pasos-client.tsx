'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { logout } from '@/lib/actions/auth';
import {
  confirmarCodigo,
  empezarInscripcion,
  type CodigoState,
  type Inscripcion,
} from '@/lib/actions/segundo-factor';

const empty: CodigoState = null;

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--u-text-3)', fontWeight: 600, letterSpacing: '0.03em',
  textTransform: 'uppercase', display: 'block', marginBottom: 6,
};

const textoStyle: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.6, color: 'var(--u-text-3)', margin: 0,
};

const errorStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 'var(--radius-md)', margin: 0, fontSize: 13,
  background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.25)',
  color: '#f87171',
};

/** El secreto en grupos de 4, que es como lo piden las apps al teclearlo. */
function agrupar(secreto: string): string {
  return secreto.replace(/(.{4})/g, '$1 ').trim();
}

export default function DosPasosClient({
  paso,
  correo,
}: {
  paso: 'inscribir' | 'verificar';
  correo: string | null;
}) {
  const [state, formAction, isPending] = useActionState(confirmarCodigo, empty);
  // Navegación de DOCUMENTO, no `redirect()` del servidor: mismo motivo que
  // login() (lib/actions/auth.ts).
  const entrando = !!state && 'url' in state;
  useEffect(() => {
    if (state && 'url' in state) window.location.assign(state.url);
  }, [state]);

  const [inscripcion, setInscripcion] = useState<Inscripcion | null>(null);
  const [preparando, startPreparar] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const [codigo, setCodigo] = useState('');

  const lista = inscripcion && 'factorId' in inscripcion ? inscripcion : null;
  const pedirCodigo = paso === 'verificar' || !!lista;
  const completo = codigo.replace(/\s+/g, '').length === 6;

  function preparar() {
    startPreparar(async () => setInscripcion(await empezarInscripcion()));
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: el código sigue a la vista para copiarlo a mano */
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-2)',
            marginBottom: 6,
          }}
        >
          <Icon name="key" size={22} />
        </span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--u-text)', margin: 0 }}>
          {paso === 'verificar' ? 'Escribe tu código' : 'Activa la verificación en dos pasos'}
        </h1>
        <p style={textoStyle}>
          {paso === 'verificar'
            ? 'Abre tu app autenticadora y escribe el código de 6 cifras de Leogin.'
            : 'Tu cuenta tiene acceso a todos los restaurantes, así que además de la contraseña necesita un código que solo sale de tu celular. Se configura una vez.'}
        </p>
        {correo && (
          <p style={{ ...textoStyle, fontSize: 12, color: 'var(--u-text-4)' }}>{correo}</p>
        )}
      </div>

      {paso === 'inscribir' && !lista && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ol style={{ ...textoStyle, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Instala en tu celular Google Authenticator, Microsoft Authenticator, Authy o 1Password.</li>
            <li>Pulsa el botón de abajo y escanea el código QR con esa app.</li>
            <li>Escribe aquí el código de 6 cifras que te muestre.</li>
          </ol>
          {inscripcion && 'error' in inscripcion && <p role="alert" style={errorStyle}>{inscripcion.error}</p>}
          <button
            type="button"
            onClick={preparar}
            disabled={preparando}
            className="press btn-accent"
            style={{
              padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15,
              border: 'none', color: '#fff', cursor: preparando ? 'not-allowed' : 'pointer',
              opacity: preparando ? 0.6 : 1,
            }}
          >
            {preparando ? 'Preparando…' : 'Configurar mi app'}
          </button>
        </div>
      )}

      {lista && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {/* Fondo blanco SIEMPRE: en modo oscuro un QR negro sobre gris no lo
              lee la cámara de todos los celulares. */}
          <div style={{ background: '#fff', padding: 12, borderRadius: 'var(--radius-md)', lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI de Supabase, nada que optimizar */}
            <img src={lista.qr} alt="Código QR para tu app autenticadora" width={184} height={184} />
          </div>
          <div style={{ width: '100%' }}>
            <span style={labelStyle}>¿No puedes escanear? Escribe esta clave</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <code
                className="adm-field adm-field-mono"
                style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: 13, wordBreak: 'break-all', userSelect: 'all' }}
              >
                {agrupar(lista.secreto)}
              </code>
              <button
                type="button"
                onClick={() => copiar(lista.secreto)}
                aria-label="Copiar la clave"
                className="press"
                style={{
                  flexShrink: 0, padding: '0 14px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--u-hair-2)',
                  background: 'color-mix(in srgb, var(--u-text) 5%, transparent)',
                  color: 'var(--u-text-3)', cursor: 'pointer', fontSize: 13,
                }}
              >
                {copiado ? <Icon name="check" size={17} /> : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pedirCodigo && (
        <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lista && <input type="hidden" name="factorId" value={lista.factorId} />}
          <div>
            <label htmlFor="codigo" style={labelStyle}>Código de 6 cifras</label>
            <input
              id="codigo"
              name="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="123 456"
              className="adm-field adm-field-lg adm-field-mono"
              style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
            />
          </div>

          {state && 'error' in state && <p role="alert" style={errorStyle}>{state.error}</p>}

          <button
            type="submit"
            disabled={isPending || entrando || !completo}
            className="press btn-accent"
            style={{
              padding: '13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 15,
              border: 'none', color: '#fff',
              cursor: isPending || entrando || !completo ? 'not-allowed' : 'pointer',
              opacity: isPending || entrando || !completo ? 0.6 : 1,
            }}
          >
            {isPending || entrando ? 'Comprobando…' : paso === 'verificar' ? 'Entrar' : 'Activar y entrar'}
          </button>
        </form>
      )}

      {paso === 'verificar' && (
        <p style={{ ...textoStyle, fontSize: 12 }}>
          ¿Cambiaste o perdiste el celular? La app vieja se borra desde Supabase (SQL de la sección ACC-01
          del plan de acceso) y al volver a entrar se configura otra.
        </p>
      )}

      <form action={logout}>
        <button
          type="submit"
          className="press"
          style={{
            width: '100%', padding: '11px', borderRadius: 'var(--radius-full)', fontSize: 14, fontWeight: 600,
            border: '1px solid var(--u-hair-2)', background: 'transparent', color: 'var(--u-text-3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Icon name="logOut" size={16} />
          Salir y entrar con otra cuenta
        </button>
      </form>
    </div>
  );
}
