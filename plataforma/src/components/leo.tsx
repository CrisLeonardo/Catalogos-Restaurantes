/* Leo, la mascota de Leogin (v3: docs/diseno/marca/leo-v3-propuesta.html y
   leo-v3-variantes.html, silueta S2 con ojos E1). Es la L del logo con cara:
   ojos con brillo, ceja derecha siempre alzada, sonrisa con dientes, cachetes,
   moño de mesero, dos brazos y una campanita en la punta del pie, el «ding» de
   pedido nuevo hecho dibujo. El brazo y el parpadeo los mueve globals.css
   (.leo-brazo, .leo-ojos, .leo-feliz) y se quedan quietos con «reducir
   movimiento».

   Cuatro expresiones, las mismas de la intro (docs/diseno/intro-animada):
     saluda — ojos abiertos, el brazo izquierdo que saluda y el derecho en la
              campana (la web, la bienvenida).
     senala — el brazo derecho arriba y la mirada de lado: «este es el paso que
              sigue» (la guía de primeros pasos, las pantallas vacías).
     feliz  — ojos de media luna, los dos brazos arriba y destellos: un logro
              de verdad (primer pedido, récord, hito).
     duerme — ojos cerrados y «zzz»: no hay nada que hacer por ahora.

   Tres niveles de detalle, porque un dibujo encogido no es un dibujo chico:
     completo — brazos, campana, cachetes, dientes y degradado (64 px o más).
     compacto — la L con ojos, cejas, sonrisa y moño, en color plano (28 a 63).
     minimo   — la L y dos ojos, para favicon y avatares (menos de 28).
   Sin `size` (el tamaño lo pone el CSS de quien lo usa) se dibuja completo; con
   `nivel` se fuerza.

   Leo vive en Leogin (la web, el panel, la billetera), NUNCA dentro del menú
   de un restaurante: ahí la marca es la del restaurante.

   `id` hace únicos los degradados y recortes del SVG; con dos Leos en la
   misma página cada uno lleva el suyo. */

export type LeoExpresion = 'saluda' | 'senala' | 'feliz' | 'duerme';
export type LeoNivel = 'completo' | 'compacto' | 'minimo';

const CUERPO = 'M34 6h6a14 14 0 0 1 14 14v38a6 6 0 0 0 6 6h20a12 12 0 0 1 0 24H32a12 12 0 0 1-12-12V20A14 14 0 0 1 34 6Z';
const TINTA = '#1C1C1E';
const LABIO = '#4A1A12';
const PLANO = '#EE6B3F';
const CAMPANA = '#F5C03A';
const CAMPANA_SOMBRA = '#D49A1E';

type Brazo = { d: string; x: number; y: number };
const BRAZO_REPOSO: Brazo = { d: 'M20.5 47Q14 49 12.2 56', x: 12, y: 57.6 };
const BRAZO_ARRIBA: Brazo = { d: 'M20.5 47Q11 46.5 9.4 36', x: 9.2, y: 33.4 };
const BRAZO_CAMPANA: Brazo = { d: 'M53 46Q67 40.5 78 49.6', x: 79.6, y: 51.6 };
const BRAZO_SENALA: Brazo = { d: 'M53 46Q63 44 68 33', x: 68.8, y: 30.6 };
const BRAZO_FELIZ: Brazo = { d: 'M53 46Q64 45 66 34', x: 66.4, y: 31.6 };

function nivelPorTamano(size?: number): LeoNivel {
  if (size === undefined || size >= 64) return 'completo';
  return size >= 28 ? 'compacto' : 'minimo';
}

function destello(x: number, y: number, r: number) {
  return `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
}

export function Leo({
  id = 'leo',
  className,
  expresion = 'saluda',
  size,
  nivel,
}: {
  id?: string;
  className?: string;
  expresion?: LeoExpresion;
  /** Lado en px. Sin él, el tamaño lo pone el CSS de quien lo usa. */
  size?: number;
  /** Nivel de detalle; por defecto sale del tamaño. */
  nivel?: LeoNivel;
}) {
  const g = `${id}-g`;
  const c = `${id}-c`;
  const lv = nivel ?? nivelPorTamano(size);
  const completo = lv === 'completo';
  const minimo = lv === 'minimo';
  // El degradado brasa → mango solo se ve bien grande; chico, color plano.
  const cuerpo = completo ? `url(#${g})` : PLANO;
  const abiertos = expresion === 'saluda' || expresion === 'senala';
  // Con «señala» mira hacia donde apunta el brazo.
  const pupilas = expresion === 'senala' ? 'translate(1.4 -1.2)' : undefined;
  const izquierdo = expresion === 'feliz' ? BRAZO_ARRIBA : BRAZO_REPOSO;
  const derecho = expresion === 'senala' ? BRAZO_SENALA : expresion === 'feliz' ? BRAZO_FELIZ : BRAZO_CAMPANA;

  const brazo = (b: Brazo, clase?: string) => (
    <g className={clase}>
      <path d={b.d} stroke={cuerpo} strokeWidth="5.6" fill="none" strokeLinecap="round" />
      <circle cx={b.x} cy={b.y} r="4" fill={cuerpo} />
    </g>
  );

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
        <linearGradient id={g} x1="20" y1="6" x2="92" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8534A" />
          <stop offset="1" stopColor="#F5A030" />
        </linearGradient>
        <clipPath id={c}><path d={CUERPO} /></clipPath>
      </defs>
      {!minimo && <ellipse cx="56" cy="90.8" rx="36" ry="2.8" fill="#000" opacity=".28" />}
      <g className="leo-cuerpo">
        <ellipse cx="30" cy="87.2" rx="5.2" ry="3" fill="#B9402F" />
        <ellipse cx="44" cy="87.2" rx="5.2" ry="3" fill="#B9402F" />
        <path d={CUERPO} fill={cuerpo} />
        {!minimo && (
          <g clipPath={`url(#${c})`}>
            <ellipse cx="27" cy="17" rx="7" ry="11" fill="#fff" opacity=".2" />
            <rect x="14" y="81" width="86" height="12" fill="#8F2A22" opacity=".22" />
            <rect x="48" y="4" width="7" height="56" fill="#8F2A22" opacity=".12" />
          </g>
        )}
        {completo && (
          <>
            <g>
              <rect x="72.5" y="61.6" width="15" height="3" rx="1.5" fill={CAMPANA_SOMBRA} />
              <path d="M73.5 61.6a6.5 6.5 0 0 1 13 0Z" fill={CAMPANA} />
              <path d="M75.6 59.2a4.8 4.8 0 0 1 2.2-3.2" stroke="#fff" opacity=".6" strokeWidth="1.4" fill="none" strokeLinecap="round" />
              <circle cx="80" cy="54.4" r="1.5" fill={CAMPANA_SOMBRA} />
            </g>
            {/* Saludando, el brazo izquierdo se dibuja en reposo y el CSS lo levanta y lo mueve. */}
            {brazo(izquierdo, expresion === 'saluda' ? 'leo-brazo' : undefined)}
            {brazo(derecho)}
          </>
        )}
        {!minimo && (
          <>
            <path d="M37 56L27.6 51Q26.2 50.3 26.2 51.9V60.1Q26.2 61.7 27.6 61ZM37 56L46.4 51Q47.8 50.3 47.8 51.9V60.1Q47.8 61.7 46.4 61Z" fill={TINTA} />
            <rect x="34.8" y="52.6" width="4.4" height="6.8" rx="1.6" fill="#3A3A40" />
          </>
        )}
        {completo && (
          <g fill="#FF8E8E" opacity=".55">
            <ellipse cx="24.6" cy="37.6" rx="2.8" ry="1.8" />
            <ellipse cx="50.4" cy="36" rx="2.8" ry="1.8" />
          </g>
        )}
        {abiertos && (
          <g className="leo-ojos">
            <ellipse cx="28.4" cy="27" rx="7" ry="9" fill="#fff" />
            <ellipse cx="45.6" cy="27" rx="7" ry="9" fill="#fff" />
            <g transform={pupilas}>
              <circle cx="29.6" cy="28.4" r={minimo ? 5 : 4.3} fill={TINTA} />
              <circle cx="46.8" cy="28.4" r={minimo ? 5 : 4.3} fill={TINTA} />
              {!minimo && (
                <>
                  <circle cx="31" cy="26.2" r="1.6" fill="#fff" />
                  <circle cx="48.2" cy="26.2" r="1.6" fill="#fff" />
                </>
              )}
            </g>
          </g>
        )}
        {expresion === 'feliz' && (
          <path d="M22.2 30q6.2-8.6 12.4 0M39.8 30q6.2-8.6 12.4 0" stroke={TINTA} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        )}
        {expresion === 'duerme' && (
          <path d="M22.2 27q6.2 4.8 12.4 0M39.8 27q6.2 4.8 12.4 0" stroke={TINTA} strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {!minimo && (
          <g
            transform={expresion === 'duerme' ? 'translate(0 3.4)' : undefined}
            stroke={TINTA} strokeWidth="3.4" fill="none" strokeLinecap="round"
          >
            <path d="M22 15.5q5.6-3.2 11.4-.6" />
            <path d="M40.4 11.5q5.8-4.6 11.8 1.2" />
          </g>
        )}
        {!minimo && (completo ? (
          expresion === 'duerme' ? (
            <path d="M31 41q6 4.4 12 0" stroke={LABIO} strokeWidth="2.6" fill="none" strokeLinecap="round" />
          ) : (
            <>
              <path
                d={expresion === 'feliz'
                  ? 'M26.6 37Q37.5 40.6 47.6 35.6Q46.6 49.4 37.4 49.4Q27.6 49.4 26.6 37Z'
                  : 'M28 38.4Q37.5 41.2 46.4 36.8Q45.6 47.8 37.6 47.8Q29.4 47.8 28 38.4Z'}
                fill={LABIO}
              />
              <path d="M28.8 38.7Q37.5 41.2 46 37.4L45.6 41.2Q37.5 43.4 29.2 41.4Z" fill="#fff" />
            </>
          )
        ) : (
          <path
            d={expresion === 'duerme' ? 'M31 41q6 3.4 12 0' : 'M29 39q8.6 7.2 17-1.4'}
            stroke={TINTA} strokeWidth="3" fill="none" strokeLinecap="round"
          />
        ))}
        {expresion === 'feliz' && !minimo && (
          <g className="leo-destellos" fill="#F5A030">
            <path d={destello(9, 16, 5)} />
            <path d={destello(64, 5, 4)} />
            <path d={destello(90, 36, 4.4)} />
          </g>
        )}
        {expresion === 'duerme' && !minimo && (
          <g className="leo-zzz" fill="#F5A030" fontFamily="var(--font-display, 'Arial Black'), sans-serif" fontWeight="800">
            <text x="60" y="15" fontSize="9">z</text>
            <text x="67" y="8" fontSize="7">z</text>
            <text x="72" y="2" fontSize="5">z</text>
          </g>
        )}
      </g>
    </svg>
  );
}
