// Leo, la mascota: la «L» del logo con ojos, moño y bandeja.
// Trazos tomados de docs/diseno/intro-animada/intro.html (leoV3), en React.
import React from 'react';

type Props = {
  tam: number;
  ojos?: 'abiertos' | 'guino' | 'felices';
  /** Ángulo del brazo izquierdo en grados (0 abajo, 100 saludando). */
  brazo?: number;
  mirada?: { x: number; y: number };
};

const CUERPO = 'M34 6h6a14 14 0 0 1 14 14v38a6 6 0 0 0 6 6h27a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H32a12 12 0 0 1-12-12V20A14 14 0 0 1 34 6Z';
const BOCA = 'M28 38.4Q37.5 41.2 46.4 36.8Q45.6 47.8 37.6 47.8Q29.4 47.8 28 38.4Z';
const DIENTES = 'M28.8 38.7Q37.5 41.2 46 37.4L45.6 41.2Q37.5 43.4 29.2 41.4Z';
const TINTA = '#1C1C1E';
const LABIO = '#4A1A12';

export const Leo: React.FC<Props> = ({ tam, ojos = 'abiertos', brazo = 0, mirada = { x: 0, y: 0 } }) => {
  const id = 'leo';
  const pupila = `translate(${mirada.x} ${mirada.y})`;
  return (
    <svg viewBox="0 0 100 100" width={tam} height={tam} overflow="visible" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="20" y1="6" x2="92" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8534A" />
          <stop offset="1" stopColor="#F5A030" />
        </linearGradient>
        <clipPath id={`${id}c`}><path d={CUERPO} /></clipPath>
      </defs>
      <ellipse cx="56" cy="90.8" rx="36" ry="2.8" fill="#000" opacity="0.28" />
      <g>
        <ellipse cx="30" cy="87.2" rx="5.2" ry="3" fill="#B9402F" />
        <ellipse cx="44" cy="87.2" rx="5.2" ry="3" fill="#B9402F" />
      </g>
      <g>
        <rect x="75" y="47.2" width="2.8" height="16.8" rx="1.4" fill="#F7B451" />
        <rect x="62.4" y="44.4" width="28.4" height="3.8" rx="1.9" fill="#EEE8DE" />
        <rect x="63.6" y="47.5" width="26" height="1.2" rx=".6" fill="#C9C0B2" />
        <g transform="translate(.4 .8)">
          <path d="M67 30h17v12.6l-2.1 1-2.1-1-2.1 1-2.1-1-2.1 1-2.1-1-2.1 1-2.3-1Z" fill="#FFFDF6" />
          <rect x="69" y="33" width="9" height="1.8" rx=".9" fill="#2B2622" />
          <rect x="69" y="36.5" width="12" height="1.3" rx=".65" fill="#9C958C" />
          <rect x="69" y="39.3" width="7" height="1.3" rx=".65" fill="#9C958C" />
        </g>
      </g>
      <path d={CUERPO} fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <ellipse cx="27" cy="17" rx="7" ry="11" fill="#fff" opacity=".2" />
        <rect x="14" y="81" width="86" height="12" fill="#8F2A22" opacity=".22" />
        <rect x="48" y="4" width="7" height="56" fill="#8F2A22" opacity=".12" />
      </g>
      <g transform={`rotate(${brazo} 20.5 47)`}>
        <path d="M20.5 47Q14 49 12.2 56" stroke={`url(#${id}g)`} strokeWidth="5.6" fill="none" strokeLinecap="round" />
        <circle cx="12" cy="57.6" r="4" fill={`url(#${id}g)`} />
      </g>
      <g>
        <rect x="72.5" y="61.6" width="15" height="3" rx="1.5" fill="#D49A1E" />
        <path d="M73.5 61.6a6.5 6.5 0 0 1 13 0Z" fill="#F5C03A" />
        <circle cx="80" cy="54.4" r="1.5" fill="#D49A1E" />
      </g>
      <g>
        <path d="M53 46Q67 40.5 78 49.6" stroke={`url(#${id}g)`} strokeWidth="5.6" fill="none" strokeLinecap="round" />
        <circle cx="79.6" cy="51.6" r="4" fill={`url(#${id}g)`} />
      </g>
      <g>
        <path d="M37 56L27.6 51Q26.2 50.3 26.2 51.9V60.1Q26.2 61.7 27.6 61ZM37 56L46.4 51Q47.8 50.3 47.8 51.9V60.1Q47.8 61.7 46.4 61Z" fill={TINTA} />
        <rect x="34.8" y="52.6" width="4.4" height="6.8" rx="1.6" fill="#3A3A40" />
      </g>
      <g fill="#FF8E8E" opacity=".5">
        <ellipse cx="24.6" cy="37.6" rx="2.8" ry="1.8" />
        <ellipse cx="50.4" cy="36" rx="2.8" ry="1.8" />
      </g>
      {ojos === 'felices' ? (
        <>
          <path d="M22.2 30q6.2-8.6 12.4 0" stroke={TINTA} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M39.8 30q6.2-8.6 12.4 0" stroke={TINTA} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <g>
            <ellipse cx="28.4" cy="27" rx="7" ry="9" fill="#fff" />
            <g transform={pupila}>
              <circle cx="29.6" cy="28.4" r="4.3" fill={TINTA} />
              <circle cx="31" cy="26.2" r="1.6" fill="#fff" />
            </g>
          </g>
          {ojos === 'guino' ? (
            <path d="M39.8 30q6.2-8.6 12.4 0" stroke={TINTA} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          ) : (
            <g>
              <ellipse cx="45.6" cy="27" rx="7" ry="9" fill="#fff" />
              <g transform={pupila}>
                <circle cx="46.8" cy="28.4" r="4.3" fill={TINTA} />
                <circle cx="48.2" cy="26.2" r="1.6" fill="#fff" />
              </g>
            </g>
          )}
        </>
      )}
      <path d="M22 15.5q5.6-3.2 11.4-.6" stroke={TINTA} strokeWidth="3.4" fill="none" strokeLinecap="round" transform="translate(0 -2.6)" />
      <path d="M40.4 11.5q5.8-4.6 11.8 1.2" stroke={TINTA} strokeWidth="3.4" fill="none" strokeLinecap="round" transform="translate(0 -2.6)" />
      <path d={BOCA} fill={LABIO} />
      <path d={DIENTES} fill="#fff" />
    </svg>
  );
};

export const Logo: React.FC<{ tam: number }> = ({ tam }) => (
  <svg viewBox="0 0 100 100" width={tam} height={tam} aria-hidden="true">
    <defs>
      <linearGradient id="logog" x1="27" y1="19" x2="72" y2="81" gradientUnits="userSpaceOnUse">
        <stop stopColor="#E8534A" />
        <stop offset="1" stopColor="#F5A030" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="22" fill="#1C1C1E" />
    <path d="M27 19h18v44h27v18H27Z" fill="url(#logog)" />
  </svg>
);
