import type { CSSProperties } from 'react';

/* ============================================================
   RODILLO — la cifra que rueda hasta su valor
   ------------------------------------------------------------
   «La caja cuadra» (estrategia §5.2): al abrir Hoy, Caja o Negocio, los
   números suben solos, como en una caja registradora. Y si el valor cambia
   en vivo, el dígito que cambió rueda hasta el nuevo.

   Solo CSS (admin.css, «Panel vivo»): cada dígito es una tira 0-9 que se
   desplaza hasta el suyo. Sin JavaScript, sin parpadeo al hidratar y sin
   saltos: el HTML del servidor ya trae la tira en su sitio y la animación
   solo la hace llegar. El texto de verdad va para lectores de pantalla; la
   tira, escondida. Con «reducir movimiento» se ve quieta en su valor.

   Lo que no lleva cifras («Sin datos aún», «–») sale tal cual.
   ============================================================ */

const DIGITOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Rodillo({ texto }: { texto: string }) {
  // Un texto larguísimo no es una cifra (y no vale la pena desarmarlo).
  if (!/\d/.test(texto) || texto.length > 18) return <>{texto}</>;
  const chars = [...texto];
  let k = 0;
  return (
    <span className="rodillo">
      <span className="sr-only">{texto}</span>
      <span aria-hidden className="rodillo-cifra">
        {chars.map((c, i) =>
          /\d/.test(c) ? (
            <span key={i} className="rodillo-col">
              <span className="rodillo-tira" style={{ '--d': c, '--k': k++ } as CSSProperties}>
                {DIGITOS.map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          ) : (
            <span key={i}>{c === ' ' ? ' ' : c}</span>
          ),
        )}
      </span>
    </span>
  );
}
