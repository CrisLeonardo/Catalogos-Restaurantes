'use client';

/* ============================================================
   VISTA PREVIA DEL PANEL ADMIN — lado del "panel" (en /preview/admin/[id])
   ------------------------------------------------------------
   Igual que preview-client.tsx pero para el panel del dueño:
   escucha el mismo BroadcastChannel del editor y aplica el TEMA
   (colores, fuentes, glass, redondeo, marca, logo, zona) AL
   INSTANTE. El contenido del dashboard (KPIs, productos) llega
   como children server-rendered y no cambia con el tema.
   ============================================================ */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import AdminShell from '@/components/admin/shell';
import { buildThemeVars, buildFontsHref } from '@/lib/theme/resolve';
import type { ThemeConfig } from '@/lib/theme/defaults';
import { previewChannelName, type ThemePreviewState } from '@/components/super/preview-client';

interface Props {
  previewId: string;
  initialConfig: ThemeConfig;
  ordersEnabled: boolean;
  /** Nombre del restaurante (tabla restaurants) por si el tema no define marca. */
  fallbackName: string;
  children: ReactNode;
}

export default function AdminPreviewClient({
  previewId,
  initialConfig,
  ordersEnabled,
  fallbackName,
  children,
}: Props) {
  const [config, setConfig] = useState<ThemeConfig>(initialConfig);

  /* Canal con el editor: pedimos el estado actual al conectar ("hello")
     y aplicamos cada tema que llegue, sin guardar. */
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(previewChannelName(previewId));
    ch.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string } & Partial<ThemePreviewState>;
      if (msg?.type === 'state' && msg.config) setConfig(msg.config);
    };
    ch.postMessage({ type: 'hello' });
    return () => ch.close();
  }, [previewId]);

  const vars = useMemo(() => buildThemeVars(config), [config]);
  const fontsHref = useMemo(() => buildFontsHref(config), [config]);
  const name = config.brandName?.trim() || fallbackName;

  return (
    <div
      data-glass={config.glassIntensity}
      data-scheme={config.scheme}
      style={{
        ...(vars as CSSProperties),
        minHeight: '100svh',
        background: 'var(--brand-bg)',
        color: 'var(--u-text)',
        fontFamily: 'var(--ui-font-sans)',
      }}
    >
      {fontsHref && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontsHref} />
        </>
      )}

      <AdminShell
        restaurantName={name}
        ordersEnabled={ordersEnabled}
        logoUrl={config.logoUrl}
        zone={config.zone}
        preview
      >
        {children}
      </AdminShell>
    </div>
  );
}
