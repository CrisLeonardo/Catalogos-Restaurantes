import { ImageResponse } from 'next/og';

/* Icono para iOS (apple-touch-icon). Next lo genera como PNG real.
   iOS aplica su propia máscara redondeada, así que va a sangre completa. */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #E8917A 0%, #C75D3E 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: 116,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          L
        </div>
      </div>
    ),
    { ...size },
  );
}
