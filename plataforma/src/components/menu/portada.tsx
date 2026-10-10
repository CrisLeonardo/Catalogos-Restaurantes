'use client';

/* Portada del cliente — 3 variantes (spotlight / poster / stack), o ninguna.
   Todo sale del motor: logo, marca, tagline, zona, textos y CTA. Portado de
   ClientApp.jsx, adaptado a un hero web que hace scroll al menú. */

import AssetImage from '@/components/asset-image';
import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/icons';
import { PrimaryButton } from '@/components/menu/ui';
import { useThemeConfig, useThemeContent, useText } from '@/lib/theme/context';

/* El botón de la portada BAJA a la carta; no navega a ninguna parte. Su flecha
   apuntaba a la derecha, que es el gesto de "siguiente pantalla". En un hero
   que ocupa el 100 % del alto y donde nada más insinúa que haya contenido
   debajo, la flecha es la única pista de hacia dónde hay que ir. */
function scrollToMenu() {
  document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Marca: usa el logo subido o, si no hay, un monograma con la inicial.

   `cssSize` existe por el teléfono EN HORIZONTAL: un logo de 168 px fijos se
   come casi la mitad de una pantalla de 390 px de alto y empuja el botón
   «Ver el menú» fuera de la vista. Con una medida en `min(..., svh)` el logo
   cede altura cuando no la hay y conserva su tamaño cuando sí. `size` sigue
   siendo el tamaño INTRÍNSECO que necesita next/image para pedir el archivo
   a la resolución correcta. */
function BrandMark({ size = 96, cssSize }: { size?: number; cssSize?: string }) {
  const config = useThemeConfig();
  const box = cssSize ?? `${size}px`;
  if (config.logoUrl) {
    return (
      /* Es lo PRIMERO que ve el comensal (el elemento más grande de la
         portada): sin prioridad salía con `loading="lazy"` como cualquier
         foto de la carta, y el navegador lo ponía a la cola detrás del CSS
         y las fuentes. */
      <AssetImage
        src={config.logoUrl}
        alt={config.brandName}
        width={size}
        height={size}
        loading="eager"
        fetchPriority="high"
        style={{ width: box, maxWidth: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
      />
    );
  }
  const initial = config.brandName.trim().charAt(0).toUpperCase() || '·';
  /* Era un `.glass` con su desenfoque y su brillo. Un monograma ES la marca del
     restaurante: no es un panel que flota sobre nada, y el vidrio lo dejaba
     pareciendo un botón gigante. Superficie mate de la misma paleta. */
  return (
    <div
      className="m-surface"
      style={{
        width: box, height: box, borderRadius: '28%', display: 'grid', placeItems: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: `calc(${box} * 0.42)`, color: 'var(--u-text)',
      }}
    >
      {initial}
    </div>
  );
}

/** `onDark`: sobre una foto a sangre el velo es siempre oscuro, así que los
    tokens del tema (que se invierten con la paleta clara) dejarían el badge
    ilegible. Ahí se fuerza blanco sobre translúcido. */
function OpenBadge({ isOpen, onDark = false }: { isOpen: boolean; onDark?: boolean }) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const label = isOpen ? content.portada.badgeOpen : content.portada.badgeClosed;
  const text = [label, config.zone].filter(Boolean).join(' · ');
  const dotColor = isOpen ? (onDark ? '#fff' : 'var(--u-text)') : 'var(--c-danger, #f87171)';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 'var(--m-r-pill)',
        background: onDark ? 'rgba(255,255,255,0.16)' : 'var(--surface-3)',
        border: `1px solid ${onDark ? 'rgba(255,255,255,0.26)' : 'var(--u-hair-2)'}`,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        fontSize: 'var(--m-fs-xs)', fontWeight: 600, color: onDark ? 'rgba(255,255,255,0.92)' : 'var(--u-text-2)',
      }}
    >
      {config.portadaShowStatus && (
        <span style={{ width: 7, height: 7, borderRadius: 'var(--m-r-pill)', background: dotColor, boxShadow: `0 0 8px ${dotColor}`, animation: config.animations && isOpen ? 'pulse-ring 2.2s infinite' : undefined }} />
      )}
      {text}
    </span>
  );
}

/* El alto, el hueco y el relleno los lleva `.menu-hero` (globals.css): una
   pantalla entera en el teléfono, lo que dé de sí el contenido cuando la
   pantalla es baja (móvil en horizontal) y un tope en escritorio, donde 900 px
   de héroe para un logo y un botón dejaban la carta entera bajo el pliegue.
   No están aquí porque un estilo en línea le gana a la media query. */
/* OJO: aquí NO va `display` ni `flexDirection`. Un estilo en línea le gana a
   cualquier media query, y mientras estuvieron aquí la regla que recoloca el
   héroe a dos columnas en horizontal no tenía forma de aplicarse (el navegador
   seguía diciendo `display: flex`). Viven en `.menu-hero` en globals.css.
   Es la misma trampa que ya mordió con `.admin-brand` en el panel y con el
   tamaño del logo de esta misma portada. */
const heroWrap: CSSProperties = {
  position: 'relative',
  alignItems: 'center', justifyContent: 'center', textAlign: 'center',
};

/* ── Tamaño del titular del héroe ─────────────────────────────
   El tamaño por ancho de ventana (`vw`) es el de siempre; lo nuevo es el
   segundo techo, en ALTO de ventana (`svh`). Sin él, un teléfono EN
   HORIZONTAL (844 x 390) calculaba el titular con sus 844 px de ancho y lo
   sacaba enorme en una pantalla de 390 px de alto: sumado al logo, empujaba
   el botón «Ver el menú» por debajo del borde inferior, sin nada que
   insinuara que había que seguir bajando. Un titular no puede comerse la
   altura que necesita el resto del héroe.

   En vertical y en escritorio el `svh` nunca es el que manda, así que el
   resultado es exactamente el de antes. */
function heroSize(vw: number, min: number, max: number, svh: number): string {
  return `clamp(${min}px, min(${vw}vw, ${svh}svh), ${max}px)`;
}

/* ── Cuenta regresiva del lanzamiento ─────────────────────────
   La hora de cierre se guarda sin zona ('2026-10-18T18:00') y se lee en la
   hora del aparato del comensal, que en la práctica es la del restaurante.
   En el servidor no se pinta ningún número: el reloj del servidor y el del
   teléfono no coinciden al segundo y la hidratación protestaría. */
function partesRestantes(ms: number): Array<[string, string]> {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return [[two(d), 'días'], [two(h), 'hrs'], [two(m), 'min'], [two(s % 60), 'seg']];
}

function CuentaRegresiva({ endsAt }: { endsAt: string }) {
  const content = useThemeContent();
  const end = new Date(endsAt).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (Number.isNaN(end)) return null;

  if (now !== null && now >= end) {
    return (
      <div className="m-vitrina-closed" role="status">{content.vitrina.launchClosed}</div>
    );
  }
  const partes = now === null ? partesRestantes(0).map(([, l]) => ['--', l] as [string, string]) : partesRestantes(end - now);
  return (
    <div className="m-vitrina-count" role="timer" aria-label="Tiempo para que cierre esta edición">
      {partes.map(([n, l]) => (
        <div key={l}><b>{n}</b><span>{l}</span></div>
      ))}
    </div>
  );
}

/* El titular de la Vitrina va a tamaño de cartel y en ANCHO DEL LIENZO, no de
   la ventana (`cqi`: la caja que lo contiene declara `container-type`). En
   escritorio con la columna de móvil, 26vw daban 370 px de letra dentro de
   una columna de 460.

   Y se achica según la palabra más larga, porque en un cartel no se parte
   una palabra: «DROP» llena la línea a 26cqi, pero «PASTELERÍA» a ese tamaño
   se salía por el canto. Una letra condensada mide ~0,5 em de ancho. */
function tamañoCartel(texto: string): number {
  const larga = Math.max(1, ...texto.split(/\s+/).map((w) => w.length));
  return Math.min(26, 90 / (larga * 0.5));
}

export default function Portada({ isOpen = true, fallbackImage = null }: {
  isOpen?: boolean;
  /** Foto para la portada Vitrina si el dueño no subió imagen de fondo: la de
      un producto de su carta (la elige MenuShell). */
  fallbackImage?: string | null;
}) {
  const config = useThemeConfig();
  const content = useThemeContent();
  const titleT = useText('heading', 'portadaTitle');
  const subT = useText('serif', 'portadaSubtitle');
  if (config.portadaVariant === 'none') return null;

  const title = content.portada.title || config.brandName;
  const subtitle = content.portada.subtitle || config.tagline;
  const anim = config.animations;
  // El lienzo ancho (tablet/escritorio/revista) pide un titular mayor; la
  // columna de texto sale de `.menu-canvas`, la misma clase que usa el <main>
  // de la carta, para que la portada y los platillos arranquen en la misma
  // vertical sin que este componente tenga que saber cuánto mide.
  const wideCanvas = config.layoutWidth !== 'movil';

  /* ── Spotlight ── */
  if (config.portadaVariant === 'spotlight') {
    return (
      /* Las tres piezas llevan clase propia para que el teléfono EN HORIZONTAL
         pueda recolocarlas a dos columnas (ver `.menu-hero.is-spotlight` en
         globals.css). Con `nth-child` no valdría: el logo es opcional, así que
         el orden de los hijos cambia según la configuración del dueño. */
      <section className="menu-hero is-spotlight" style={heroWrap}>
        <div
          aria-hidden
          style={{
            position: 'absolute', top: '18%', width: 280, height: 280, borderRadius: '50%',
            background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-accent) 20%, transparent), transparent 65%)',
            filter: 'blur(8px)', pointerEvents: 'none',
          }}
        />
        {config.portadaShowLogo && (
          <div className={`menu-hero-mark ${anim ? 'anim-pop' : ''}`} style={{ animation: anim ? 'bob 5s ease-in-out infinite' : undefined }}>
            <BrandMark size={168} cssSize="min(var(--m-hero-logo, 168px), 26svh)" />
          </div>
        )}
        <div className={`menu-hero-text ${anim ? 'anim-fade-up' : ''}`}>
          <h1 className="t-display" style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * ${heroSize(12, 40, 60, 13)})` }}>{title}</h1>
          {subtitle && (
            <p className="t-serif" style={{ ...subT.vars, fontSize: `calc(var(--m-fs-xl) * ${subT.size})`, marginTop: 'var(--m-sp-3)' }}>{subtitle}</p>
          )}
        </div>
        <div className={`menu-hero-cta ${anim ? 'anim-fade-up' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--m-sp-3)', alignItems: 'center', width: '100%', maxWidth: 320 }}>
          {config.portadaShowBadge && <OpenBadge isOpen={isOpen} />}
          <PrimaryButton size="lg" full iconRight="arrowDown" onClick={scrollToMenu} elementKey="portadaCta" style={{ marginTop: 4 }}>
            {content.portada.cta}
          </PrimaryButton>
        </div>
      </section>
    );
  }

  /* ── Poster ── */
  if (config.portadaVariant === 'poster') {
    return (
      <section className="menu-hero" style={{ ...heroWrap, alignItems: 'stretch', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {config.portadaShowBadge ? <OpenBadge isOpen={isOpen} /> : <span />}
          {config.portadaShowLogo && <BrandMark size={46} />}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="t-poster" style={{ fontSize: 'var(--m-fs-sm)', letterSpacing: '0.3em', color: 'var(--u-text-3)' }}>{content.portada.posterKicker}</div>
          <div className="t-poster" style={{ fontSize: heroSize(22, 56, 104, 24), lineHeight: 0.84, marginTop: 6 }}>{title}</div>
          {subtitle && (
            <p className="t-serif" style={{ fontStyle: 'italic', fontSize: 'var(--m-fs-xl)', color: 'var(--u-text-2)', marginTop: 'var(--m-sp-4)' }}>{subtitle}</p>
          )}
        </div>
        <PrimaryButton size="lg" full iconRight="arrowDown" onClick={scrollToMenu} elementKey="portadaCta">{content.portada.cta}</PrimaryButton>
      </section>
    );
  }

  /* ── Fullbleed ──
     Foto a sangre ocupando la pantalla entera, con el nombre abajo sobre un
     degradado. Es la portada de quien vende con la imagen del plato: la carta
     no empieza hasta que el comensal decide bajar. Si no hay imagen de fondo
     cargada, el arte lo pone un degradado con el color de acento. */
  if (config.portadaVariant === 'fullbleed') {
    return (
      <section
        // `menu-bleed` la lleva hasta el borde de la VENTANA. Antes solo se
        // salía del padding del <main>, así que en un lienzo ancho (revista) la
        // foto "a sangre" era una franja centrada con el fondo de la página
        // asomando a los lados: justo lo contrario de lo que promete.
        className="menu-bleed menu-hero menu-hero-bleed"
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', overflow: 'hidden', padding: '0 0 36px',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', inset: 0 }}>
          {config.backgroundImage ? (
            <AssetImage src={config.backgroundImage} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" style={{ objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(130% 80% at 50% 18%, color-mix(in srgb, var(--brand-accent) 55%, transparent), transparent 68%), linear-gradient(180deg, var(--brand-bg-2), var(--brand-bg))',
              }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.34) 46%, rgba(0,0,0,0.10) 100%)' }} />
        </div>

        {/* El texto sí respeta la columna de lectura: a sangre va la imagen, no
            el titular — si no, el nombre acaba pegado al canto de la pantalla. */}
        <div className="menu-canvas" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 13 }}>
          {config.portadaShowLogo && (
            <div className={anim ? 'anim-pop' : ''}><BrandMark size={74} cssSize="min(var(--m-hero-logo, 74px), 16svh)" /></div>
          )}
          <div className={anim ? 'anim-fade-up' : ''}>
            <h1
              className="t-display"
              style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * ${heroSize(13, 42, wideCanvas ? 96 : 68, 15)})`, color: '#fff', textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="t-serif" style={{ ...subT.vars, fontSize: `calc(var(--m-fs-${wideCanvas ? 'xl' : 'lg'}) * ${subT.size})`, color: 'rgba(255,255,255,0.88)', marginTop: 'var(--m-sp-3)', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                {subtitle}
              </p>
            )}
          </div>
          {config.portadaShowBadge && <OpenBadge isOpen={isOpen} onDark />}
          <div style={{ width: '100%', maxWidth: 340, marginTop: 4 }}>
            <PrimaryButton size="lg" full iconRight="arrowDown" onClick={scrollToMenu} elementKey="portadaCta">
              {content.portada.cta}
            </PrimaryButton>
          </div>
        </div>
      </section>
    );
  }

  /* ── Vitrina ──
     La portada como anuncio de lanzamiento: foto a sangre, el nombre (o el
     título de la edición) a tamaño de cartel con la última palabra en el
     color de acento, y —en modo lanzamiento— la cuenta regresiva. Sin foto de
     fondo usa la de un producto de la carta: esta estructura vende con la
     imagen, y un degradado no vende nada. */
  if (config.portadaVariant === 'vitrina') {
    const launch = config.launchMode;
    const cartel = (launch ? content.vitrina.launchTitle : '') || title;
    const palabras = cartel.trim().split(/\s+/);
    const remate = palabras.length > 1 ? palabras.pop()! : null;
    const kicker = launch
      ? content.vitrina.launchKicker
      : config.portadaShowBadge
        ? [isOpen ? content.portada.badgeOpen : content.portada.badgeClosed, config.zone].filter(Boolean).join(' · ')
        : '';
    const foto = config.backgroundImage || fallbackImage;
    return (
      <section
        className="menu-bleed menu-hero menu-hero-bleed is-vitrina"
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', overflow: 'hidden', padding: '0 0 32px',
        }}
      >
        <div aria-hidden style={{ position: 'absolute', inset: 0 }}>
          {foto ? (
            <AssetImage src={foto} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" style={{ objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(130% 80% at 50% 18%, color-mix(in srgb, var(--brand-accent) 55%, transparent), transparent 68%), linear-gradient(180deg, var(--brand-bg-2), var(--brand-bg))',
              }}
            />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0.30) 48%, rgba(0,0,0,0.04) 100%)' }} />
        </div>

        <div className="menu-canvas" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14, containerType: 'inline-size' }}>
          {config.portadaShowLogo && config.logoUrl && (
            <div className={anim ? 'anim-pop' : ''}><BrandMark size={56} cssSize="min(56px, 12svh)" /></div>
          )}
          {kicker && <div className="m-vitrina-kicker">{kicker}</div>}
          <h1
            className={`t-display m-vitrina-title ${anim ? 'anim-fade-up' : ''}`}
            style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * clamp(52px, min(${tamañoCartel(cartel).toFixed(2)}cqi, 24svh), 190px))` }}
          >
            {palabras.join(' ')}
            {remate && <><br /><em>{remate}</em></>}
          </h1>
          {subtitle && (
            <p className="m-vitrina-sub" style={{ ...subT.vars }}>{subtitle}</p>
          )}
          {launch && config.launchEndsAt && <CuentaRegresiva endsAt={config.launchEndsAt} />}
          {/* Píldora de acento a la medida de su texto, como en la maqueta: el
              botón ancho de las otras portadas aquí competía con el titular. */}
          <button type="button" className="press m-vitrina-cta" onClick={scrollToMenu}>
            {content.portada.cta} <span aria-hidden>↓</span>
          </button>
        </div>
      </section>
    );
  }

  /* ── Ticket ──
     La portada como una comanda: papel angosto, bordes dentados, mono y
     filetes punteados. Encaja con cafeterías, food trucks y bares donde el
     recibo ES parte de la identidad. */
  if (config.portadaVariant === 'ticket') {
    // El dentado se dibuja con círculos del color del fondo mordiendo el borde.
    const notch = (edge: 'top' | 'bottom'): CSSProperties => ({
      position: 'absolute', left: 0, right: 0, height: 14,
      top: edge === 'top' ? -7 : undefined,
      bottom: edge === 'bottom' ? -7 : undefined,
      background: 'radial-gradient(circle at 7px 7px, var(--brand-bg) 7px, transparent 7.5px)',
      backgroundSize: '16px 14px', backgroundRepeat: 'repeat-x',
      pointerEvents: 'none',
    });
    const rule: CSSProperties = { borderTop: '1px dashed var(--u-hair-2)', margin: '14px 0' };
    return (
      <section className="menu-hero is-ticket" style={heroWrap}>
        <div
          className={anim ? 'anim-pop' : ''}
          style={{
            // La comanda es angosta por definición: un recibo de un metro deja
            // de leerse como un recibo. Solo se le da algo de aire en pantalla
            // grande para que no quede como un sello perdido en medio.
            position: 'relative', width: '100%', maxWidth: 330,
            background: 'var(--surface-2)', border: '1px solid var(--u-hair)',
            padding: '26px 22px 24px', borderRadius: 'var(--m-r-xs)',
            boxShadow: '0 20px 44px rgba(0,0,0,0.26)',
          }}
        >
          <div aria-hidden style={notch('top')} />
          <div aria-hidden style={notch('bottom')} />

          <div className="t-mono" style={{ fontSize: 'var(--m-fs-xs)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--u-text-3)', textAlign: 'center' }}>
            {content.portada.posterKicker}
          </div>

          <div style={rule} />

          {config.portadaShowLogo && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <BrandMark size={56} />
            </div>
          )}
          <h1
            className="t-display"
            style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * clamp(26px, 8vw, 34px))`, textAlign: 'center' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="t-serif" style={{ ...subT.vars, fontSize: `calc(var(--m-fs-md) * ${subT.size})`, textAlign: 'center', marginTop: 'var(--m-sp-2)' }}>
              {subtitle}
            </p>
          )}

          <div style={rule} />

          {config.portadaShowBadge && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <OpenBadge isOpen={isOpen} />
            </div>
          )}
          <PrimaryButton size="lg" full iconRight="arrowDown" onClick={scrollToMenu} elementKey="portadaCta">
            {content.portada.cta}
          </PrimaryButton>

          {/* Guiño de código de barras: puro adorno, sin significado. */}
          <div
            aria-hidden
            style={{
              height: 26, marginTop: 18, opacity: 0.55,
              background: 'repeating-linear-gradient(90deg, var(--u-text) 0 2px, transparent 2px 4px, var(--u-text) 4px 5px, transparent 5px 9px)',
            }}
          />
        </div>
      </section>
    );
  }

  /* ── Directo ──
     Sin héroe: un encabezado compacto y el menú empieza de inmediato. Es lo
     que quiere quien pone el QR en la mesa y no soporta que el comensal tenga
     que deslizar una pantalla entera antes de ver un solo platillo.
     Distinto de 'none', que deja la carta huérfana y sin ninguna identidad. */
  if (config.portadaVariant === 'directo') {
    return (
      <section style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '24px 0 2px' }}>
        {config.portadaShowLogo && <BrandMark size={54} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="t-display" style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * clamp(22px, 6.5vw, 30px))` }}>{title}</h1>
          {subtitle && (
            <p className="t-serif" style={{ ...subT.vars, fontSize: `calc(var(--m-fs-sm) * ${subT.size})`, marginTop: 3 }}>{subtitle}</p>
          )}
          {config.portadaShowBadge && (
            <div style={{ marginTop: 9 }}><OpenBadge isOpen={isOpen} /></div>
          )}
        </div>
      </section>
    );
  }

  /* ── Stack ── */
  const feats = [
    { t: subtitle, i: 'sparkle' },
    { t: config.zone ? `Pedidos en ${config.zone}` : 'Pide en línea', i: 'truck' },
    { t: 'Hecho al momento', i: 'flame' },
  ].filter((f) => f.t);
  return (
    <section className="menu-hero is-stack" style={{ ...heroWrap, justifyContent: 'flex-start' }}>
      <div className={anim ? 'anim-fade-up' : ''} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 6 }}>
        {config.portadaShowLogo && <BrandMark size={92} cssSize="min(var(--m-hero-logo, 92px), 16svh)" />}
        <h1 className="t-display" style={{ ...titleT.vars, fontSize: `calc(${titleT.size} * ${heroSize(9, 30, 40, 11)})` }}>{title}</h1>
        {subtitle && <p className="t-serif" style={{ ...subT.vars, fontSize: `calc(var(--m-fs-lg) * ${subT.size})` }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360, flex: 1, justifyContent: 'center' }}>
        {feats.map((f, i) => (
          <div key={i} className="m-surface" style={{ padding: 'var(--m-sp-4)', borderRadius: 'var(--m-r-lg)', display: 'flex', alignItems: 'center', gap: 'var(--m-sp-3)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--m-r-sm)', display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)', flexShrink: 0 }}>
              <Icon name={f.i} size={20} />
            </div>
            <span style={{ fontSize: 'var(--m-fs-md)', fontWeight: 500, color: 'var(--u-text)', textAlign: 'left' }}>{f.t}</span>
          </div>
        ))}
      </div>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {config.portadaShowBadge && <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><OpenBadge isOpen={isOpen} /></div>}
        <PrimaryButton size="lg" full iconRight="arrowDown" onClick={scrollToMenu} elementKey="portadaCta">{content.portada.cta}</PrimaryButton>
      </div>
    </section>
  );
}
