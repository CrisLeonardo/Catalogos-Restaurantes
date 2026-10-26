/* Leo, la mascota de Leogin (v2: docs/diseno/marca/leo-y-color.html). Es la
   L del logo con cara: ojos con brillo, cejas, boca con lengua, cachetes,
   moño de mesero, brazo y pies. Aquí va saludando: el brazo y el parpadeo
   los mueve globals.css (.leo-brazo, .leo-ojos) y se quedan quietos con
   «reducir movimiento».

   Leo vive en Leogin (la web, el panel, la billetera), NUNCA dentro del menú
   de un restaurante: ahí la marca es la del restaurante.

   `id` hace únicos los degradados y recortes del SVG; con dos Leos en la
   misma página cada uno lleva el suyo. */

const CUERPO = 'M36 9h4a13 13 0 0 1 13 13v32a5 5 0 0 0 5 5h18a7 7 0 0 1 7 7v12a7 7 0 0 1-7 7H33a10 10 0 0 1-10-10V22a13 13 0 0 1 13-13Z';
const BOCA = 'M30.8 37.4Q38 39.3 45.2 37.4Q44.7 46.6 38 46.6Q31.3 46.6 30.8 37.4Z';
const TINTA = '#1C1C1E';
const LABIO = '#4A1A12';

export function Leo({ id = 'leo', className }: { id?: string; className?: string }) {
  const g = `${id}-g`;
  const c = `${id}-c`;
  const m = `${id}-m`;
  return (
    <svg viewBox="0 0 100 100" overflow="visible" aria-hidden className={className}>
      <defs>
        <linearGradient id={g} x1="23" y1="9" x2="83" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8534A" />
          <stop offset="1" stopColor="#F5A030" />
        </linearGradient>
        <clipPath id={c}><path d={CUERPO} /></clipPath>
        <clipPath id={m}><path d={BOCA} /></clipPath>
      </defs>
      <ellipse cx="52" cy="89.6" rx="31" ry="2.8" fill="#000" opacity=".28" />
      <g>
        <ellipse cx="31" cy="86.4" rx="5.4" ry="3" fill="#B9402F" />
        <ellipse cx="45" cy="86.4" rx="5.4" ry="3" fill="#B9402F" />
        <path d={CUERPO} fill={`url(#${g})`} />
        <g clipPath={`url(#${c})`}>
          <ellipse cx="28.5" cy="17" rx="9" ry="15" fill="#fff" opacity=".2" />
          <rect x="18" y="79.4" width="70" height="8" fill="#8F2A22" opacity=".22" />
          <rect x="49.5" y="6" width="6" height="50" fill="#8F2A22" opacity=".12" />
        </g>
        <g className="leo-brazo">
          <path d="M25 49.6C19 50.6 16.4 53.6 15.6 58.2" stroke={`url(#${g})`} strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="15.4" cy="59" r="3.7" fill={`url(#${g})`} />
        </g>
        <path d="M38 52.4L31.4 48.8Q29.8 48.1 29.8 49.8V55Q29.8 56.7 31.4 56ZM38 52.4L44.6 48.8Q46.2 48.1 46.2 49.8V55Q46.2 56.7 44.6 56Z" fill={TINTA} />
        <rect x="36" y="50.5" width="4" height="3.8" rx="1.3" fill="#3A3A40" />
        <g fill="#FF8E8E" opacity=".5">
          <ellipse cx="26.4" cy="37.6" rx="2.6" ry="1.7" />
          <ellipse cx="49.8" cy="37.6" rx="2.4" ry="1.7" />
        </g>
        <g className="leo-ojos">
          <ellipse cx="31.2" cy="25" rx="6.8" ry="8.2" fill="#fff" />
          <circle cx="32.2" cy="26.3" r="4" fill={TINTA} />
          <circle cx="33.7" cy="24.3" r="1.5" fill="#fff" />
          <circle cx="31" cy="28.2" r=".65" fill="#fff" />
          <ellipse cx="44.8" cy="25" rx="6.8" ry="8.2" fill="#fff" />
          <circle cx="45.8" cy="26.3" r="4" fill={TINTA} />
          <circle cx="47.3" cy="24.3" r="1.5" fill="#fff" />
          <circle cx="44.6" cy="28.2" r=".65" fill="#fff" />
        </g>
        <g transform="translate(0 -2.6)" stroke={TINTA} strokeWidth="2.4" fill="none" strokeLinecap="round">
          <path d="M26.6 14.4q4.6-2.8 9.2-.8" />
          <path d="M40.2 13.6q4.6-2 9.2.8" />
        </g>
        <path d={BOCA} fill={LABIO} />
        <ellipse cx="38" cy="46" rx="4.4" ry="3" fill="#F07C6C" clipPath={`url(#${m})`} />
      </g>
    </svg>
  );
}
