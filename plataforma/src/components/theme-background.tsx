import type { ThemeConfig } from '@/lib/theme/defaults';

/* Capas de fondo del tenant según config.backgroundType (asphalt / solid /
   gradient / image) + grano + watermark. Compartido entre el layout raíz y
   la vista previa en vivo del Super Admin. Sin estado: usable en server y cliente. */
export default function ThemeBackground({ config }: { config?: ThemeConfig }) {
  if (!config) return <div className="asphalt" aria-hidden />;

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
      {config.backgroundType === 'image' && config.backgroundImage && (
        <div
          className="bg-layer bg-image"
          aria-hidden
          style={{ backgroundImage: `url("${config.backgroundImage}")` }}
        />
      )}

      {config.grain && <div className="asphalt-grain" aria-hidden />}
      {config.watermark && (config.markUrl || config.logoUrl) && (
        <div
          className="asphalt-mark"
          aria-hidden
          style={{ backgroundImage: `url("${config.markUrl ?? config.logoUrl}")` }}
        />
      )}
    </>
  );
}
