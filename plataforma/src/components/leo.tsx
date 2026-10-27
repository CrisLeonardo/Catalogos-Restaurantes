/* Leo, la mascota de Leogin (v2: docs/diseno/marca/leo-y-color.html). Es la
   L del logo con cara: ojos con brillo, cejas, boca con lengua, cachetes,
   moño de mesero, brazo y pies. El brazo, el parpadeo y el brinco los mueve
   globals.css (.leo-brazo*, .leo-ojos, .leo-feliz) y se quedan quietos con
   «reducir movimiento».

   Cuatro expresiones, las mismas de la intro (docs/diseno/intro-animada):
     saluda — ojos abiertos y el brazo que se mueve (la web, la bienvenida).
     senala — el brazo arriba y la mirada de lado: «este es el paso que
              sigue» (la guía de primeros pasos, las pantallas vacías).
     feliz  — ojos de media luna, brazo arriba y destellos: un logro de
              verdad (primer pedido, récord, hito).
     duerme — ojos cerrados y «zzz»: no hay nada que hacer por ahora.

   Leo vive en Leogin (la web, el panel, la billetera), NUNCA dentro del menú
   de un restaurante: ahí la marca es la del restaurante.

   `id` hace únicos los degradados y recortes del SVG; con dos Leos en la
   misma página cada uno lleva el suyo. */

export type LeoExpresion = 'saluda' | 'senala' | 'feliz' | 'duerme';

const CUERPO = 'M36 9h4a13 13 0 0 1 13 13v32a5 5 0 0 0 5 5h18a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H33a10 10 0 0 1-10-10V22a13 13 0 0 1 13-13Z';
const BOCA = 'M30.8 37.4Q38 39.3 45.2 37.4Q44.7 46.6 38 46.6Q31.3 46.6 30.8 37.4Z';
const TINTA = '#1C1C1E';
const LABIO = '#4A1A12';
const BRAZO_CLASE: Record<LeoExpresion, string | undefined> = {
  saluda: 'leo-brazo',
  senala: 'leo-brazo-arriba',
  feliz: 'leo-brazo-arriba',
  duerme: undefined,
};

export function Leo({
  id = 'leo',
  className,
  expresion = 'saluda',
  size,
}: {
  id?: string;
  className?: string;
  expresion?: LeoExpresion;
  /** Lado en px. Sin él, el tamaño lo pone el CSS de quien lo usa. */
  size?: number;
}) {
  const g = `${id}-g`;
  const c = `${id}-c`;
  const m = `${id}-m`;
  const abiertos = expresion === 'saluda' || expresion === 'senala';
  // Con «señala» mira hacia donde apunta el brazo.
  const pupilas = expresion === 'senala' ? 'translate(-1.4 -0.8)' : undefined;
  return (
    <svg
      viewBox="0 0 100 100"
      overflow="visible"
      aria-hidden
      width={size}
      height={size}
      className={[className, expresion === 'feliz' ? 'leo-feliz' : null].filter(Boolean).join(' ') || undefined}
    >
      <defs>
        <linearGradient id={g} x1="23" y1="9" x2="83" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8534A" />
          <stop offset="1" stopColor="#F5A030" />
        </linearGradient>
        <clipPath id={c}><path d={CUERPO} /></clipPath>
        <clipPath id={m}><path d={BOCA} /></clipPath>
      </defs>
      <ellipse cx="52" cy="89.6" rx="31" ry="2.8" fill="#000" opacity=".28" />
      <g className="leo-cuerpo">
        <ellipse cx="31" cy="86.4" rx="5.4" ry="3" fill="#B9402F" />
        <ellipse cx="45" cy="86.4" rx="5.4" ry="3" fill="#B9402F" />
        <path d={CUERPO} fill={`url(#${g})`} />
        <g clipPath={`url(#${c})`}>
          <ellipse cx="28.5" cy="17" rx="9" ry="15" fill="#fff" opacity=".2" />
          <rect x="18" y="79.4" width="70" height="8" fill="#8F2A22" opacity=".22" />
          <rect x="49.5" y="6" width="6" height="50" fill="#8F2A22" opacity=".12" />
        </g>
        <g className={BRAZO_CLASE[expresion]}>
          <path d="M25 49.6C19 50.6 16.4 53.6 15.6 58.2" stroke={`url(#${g})`} strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="15.4" cy="59" r="3.7" fill={`url(#${g})`} />
        </g>
        <path d="M38 52.4L31.4 48.8Q29.8 48.1 29.8 49.8V55Q29.8 56.7 31.4 56ZM38 52.4L44.6 48.8Q46.2 48.1 46.2 49.8V55Q46.2 56.7 44.6 56Z" fill={TINTA} />
        <rect x="36" y="50.5" width="4" height="3.8" rx="1.3" fill="#3A3A40" />
        <g fill="#FF8E8E" opacity=".5">
          <ellipse cx="26.4" cy="37.6" rx="2.6" ry="1.7" />
          <ellipse cx="49.8" cy="37.6" rx="2.4" ry="1.7" />
        </g>
        {abiertos && (
          <g className="leo-ojos">
            <ellipse cx="31.2" cy="25" rx="6.8" ry="8.2" fill="#fff" />
            <ellipse cx="44.8" cy="25" rx="6.8" ry="8.2" fill="#fff" />
            <g transform={pupilas}>
              <circle cx="32.2" cy="26.3" r="4" fill={TINTA} />
              <circle cx="33.7" cy="24.3" r="1.5" fill="#fff" />
              <circle cx="31" cy="28.2" r=".65" fill="#fff" />
              <circle cx="45.8" cy="26.3" r="4" fill={TINTA} />
              <circle cx="47.3" cy="24.3" r="1.5" fill="#fff" />
              <circle cx="44.6" cy="28.2" r=".65" fill="#fff" />
            </g>
          </g>
        )}
        {expresion === 'feliz' && (
          <path d="M26.6 28q4.6-6.6 9.2 0M40.2 28q4.6-6.6 9.2 0" stroke={TINTA} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        )}
        {expresion === 'duerme' && (
          <path d="M26.8 25.6q4.4 3.8 8.8 0M40.4 25.6q4.4 3.8 8.8 0" stroke={TINTA} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        <g
          transform={expresion === 'duerme' ? undefined : 'translate(0 -2.6)'}
          stroke={TINTA} strokeWidth="2.4" fill="none" strokeLinecap="round"
        >
          <path d="M26.6 14.4q4.6-2.8 9.2-.8" />
          <path d="M40.2 13.6q4.6-2 9.2.8" />
        </g>
        {expresion === 'duerme' ? (
          <path d="M32.8 39.8q5.2 4.4 10.4 0" stroke={LABIO} strokeWidth="2.1" fill="none" strokeLinecap="round" />
        ) : (
          <>
            <path d={BOCA} fill={LABIO} />
            <ellipse cx="38" cy="46" rx="4.4" ry="3" fill="#F07C6C" clipPath={`url(#${m})`} />
          </>
        )}
        {expresion === 'feliz' && (
          <g className="leo-destellos">
            <path d="M10 18l1.3 3.7L15 23l-3.7 1.3L10 28l-1.3-3.7L5 23l3.7-1.3Z" fill="#F5A030" />
            <path d="M60 4l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1Z" fill="#F5A030" />
            <path d="M88 30l1.2 3.4 3.4 1.2-3.4 1.2-1.2 3.4-1.2-3.4-3.4-1.2 3.4-1.2Z" fill="#F5A030" />
          </g>
        )}
        {expresion === 'duerme' && (
          <g className="leo-zzz" fill="#F5A030" fontFamily="var(--font-display, 'Arial Black'), sans-serif" fontWeight="800">
            <text x="55" y="12" fontSize="8">z</text>
            <text x="62" y="5" fontSize="6">z</text>
            <text x="67.5" y="0" fontSize="4.5">z</text>
          </g>
        )}
      </g>
    </svg>
  );
}
