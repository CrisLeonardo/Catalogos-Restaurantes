'use client';

/* ============================================================
   AVISO DE LECTURA — «no pudimos consultarlo» ≠ «no hay nada»
   ------------------------------------------------------------
   Auditoría 2026-11-03, ficha 0.3 (E02, X20). Va arriba de una pantalla
   cuya consulta falló o salió incompleta. Con `estado: 'error'` la
   pantalla NO debe pintar su estado vacío («Aún no tienes…»): por eso
   `sinDatos` dibuja un hueco neutro en su lugar.
   Maqueta aprobada: https://claude.ai/artifact/FxT8MLXqic1YJk3xvuE7xF
   ============================================================ */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { EstadoLectura } from '@/lib/db/lectura';

interface Props {
  estado: EstadoLectura;
  /** Qué se intentó leer, para el título: «tus cupones», «la lista de espera». */
  que: string;
  /** Qué NO hay que concluir: «No significa que no tengas cupones.» */
  noConcluir?: string;
  /** Texto del aviso de lectura incompleta (estado `parcial`). */
  parcial?: string;
  /** Cuándo se intentó (ISO). Se muestra en la hora del aparato. */
  leidoEn?: string;
  /** No hay nada que enseñar debajo: pinta un hueco neutro en vez del estado vacío. */
  sinDatos?: boolean;
}

export default function AvisoLectura({ estado, que, noConcluir, parcial, leidoEn, sinDatos }: Props) {
  const router = useRouter();
  const [reintentando, start] = useTransition();
  // La hora se pinta después de montar: el servidor no conoce la zona del aparato.
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    if (!leidoEn) return;
    setHora(new Date(leidoEn).toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit', hour12: true }));
  }, [leidoEn]);

  if (estado === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          role="alert"
          style={{
            display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap',
            padding: '12px 14px', borderRadius: 'var(--radius-md)',
            background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-line)',
            fontSize: 13, lineHeight: 1.45, color: 'var(--u-text-2)',
          }}
        >
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 14, color: 'var(--c-danger)', marginBottom: 2 }}>
              No pudimos consultar {que}
            </strong>
            Lo que ves aquí puede estar incompleto.{noConcluir ? ` ${noConcluir}` : ''}
            {hora && (
              <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                Intento de la{hora.startsWith('1:') ? '' : 's'} {hora}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={reintentando}
            onClick={() => start(() => router.refresh())}
          >
            {reintentando ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
        {sinDatos && (
          <div style={{ border: '1px dashed var(--u-hair)', borderRadius: 'var(--radius-md)', padding: 18, textAlign: 'center', fontSize: 13, color: 'var(--u-text-3)' }}>
            Los datos aparecen en cuanto la consulta responda.
          </div>
        )}
      </div>
    );
  }

  if (estado === 'parcial') {
    return (
      <div
        role="status"
        style={{
          padding: '12px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--c-warn-bg)', border: '1px solid var(--c-warn-line)',
          fontSize: 13, lineHeight: 1.45, color: 'var(--u-text-2)',
        }}
      >
        <strong style={{ display: 'block', fontSize: 14, color: 'var(--c-warn)', marginBottom: 2 }}>Cifras incompletas</strong>
        {parcial ?? `Hay más ${que} de los que esta pantalla alcanza a mostrar.`}
      </div>
    );
  }

  return null;
}
