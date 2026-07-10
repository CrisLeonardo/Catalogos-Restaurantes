'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

/**
 * Leogin Desktop hoy solo compila para Windows (bundle.targets: ["nsis"] en
 * leogin-desktop/src-tauri/tauri.conf.json). En vez de fingir que el botón
 * sirve para cualquiera, avisamos con antelación a quien claramente no está
 * en Windows — mismo espíritu que la detección de SO de las páginas de
 * descarga "serias" (Chrome, Claude Desktop), aunque aquí solo haya un
 * destino real por ahora.
 */
export function DesktopPlatformNotice() {
  const [platform, setPlatform] = useState<'windows' | 'other' | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    if (/Windows/i.test(ua)) {
      setPlatform('windows');
    } else if (/Mac|iPhone|iPad|Android|Linux/i.test(ua)) {
      setPlatform('other');
    }
  }, []);

  if (platform !== 'other') return null;

  return (
    <div
      className="glass-quiet"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
        padding: '9px 15px', borderRadius: 99, fontSize: 12.5, color: 'var(--u-text-3)',
      }}
    >
      <Icon name="alertCircle" size={14} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
      Parece que no estás en Windows — Leogin Desktop todavía es solo para Windows. En tu equipo, usa tu panel desde el navegador normalmente.
    </div>
  );
}
