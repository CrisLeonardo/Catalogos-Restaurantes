'use client';

import { useThemeConfig } from '@/lib/theme/context';
import { assetSrc } from '@/lib/asset-image';

/**
 * Replica el fondo del restaurante dentro de overlays fullscreen.
 * Al ser hijos con z-index: -1 dentro del stacking context del overlay,
 * pintan encima del color base del overlay pero debajo del contenido scrollable.
 */
export default function OverlayBackground() {
  const config = useThemeConfig();

  return (
    <>
      {config.backgroundType === 'asphalt' && (
        <div className="asphalt" data-glow={config.ambientGlow ? '1' : '0'} aria-hidden />
      )}
      {config.backgroundType === 'solid' && (
        <div className="bg-layer" aria-hidden style={{ background: 'var(--brand-bg)' }} />
      )}
      {config.backgroundType === 'gradient' && (
        <div
          className="bg-layer"
          aria-hidden
          style={{ background: config.backgroundGradient ?? 'var(--brand-bg)' }}
        />
      )}
      {config.backgroundType === 'image' && (
        <div
          className={config.backgroundImage ? 'bg-layer bg-image' : 'bg-layer'}
          aria-hidden
          style={
            config.backgroundImage
              ? { backgroundImage: `url("${assetSrc(config.backgroundImage, 1920)}")` }
              : { background: 'var(--brand-bg)' }
          }
        />
      )}
      {config.ambientGlow && config.backgroundType !== 'asphalt' && (
        <div className="ambient-glow" aria-hidden />
      )}

      {config.grain && <div className="asphalt-grain" data-style={config.grainStyle} aria-hidden />}
      {config.watermark && (config.markUrl || config.logoUrl) && (
        <div
          className="asphalt-mark"
          aria-hidden
          style={{ backgroundImage: `url("${assetSrc(config.markUrl ?? config.logoUrl, 828)}")` }}
        />
      )}
    </>
  );
}
