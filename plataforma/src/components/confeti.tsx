/* Confeti de celebración (estrategia §5.2: «Confeti solo en récords
   reales»). Puro CSS: cada pieza lleva su destino en variables y la
   animación (globals.css, .fiesta-confeti) solo mueve transform y opacity.
   Lo usan el panel (primer pedido, hitos, caja) y Mi cuenta (el
   restaurante recién creado).
   Con «reducir movimiento» no se pinta.

   Las posiciones salen del ángulo áureo, no de Math.random: el servidor y
   el navegador pintan lo mismo y no hay desajuste al hidratar. */

const COLORES = ['#E8534A', '#F5A030', '#2F9E6B', '#FBF6EE', '#4C7DF0', '#F7C873'];

export function Confeti({ piezas = 36, alcance = 1 }: { piezas?: number; alcance?: number }) {
  return (
    <div className="fiesta-confeti" aria-hidden>
      {Array.from({ length: piezas }, (_, i) => {
        const ang = (i * 137.508 * Math.PI) / 180;
        const dist = (110 + ((i * 53) % 170)) * alcance;
        const x = Math.round(Math.cos(ang) * dist);
        const y = Math.round(Math.sin(ang) * dist * 0.65 - 70 * alcance);
        const r = ((i * 97) % 540) - 270;
        return (
          <i
            key={i}
            style={{
              '--x': `${x}px`,
              '--y': `${y}px`,
              '--r': `${r}deg`,
              '--d': `${(i % 9) * 22}ms`,
              background: COLORES[i % COLORES.length],
              width: i % 3 === 0 ? 7 : 9,
              height: i % 3 === 0 ? 7 : 13,
              borderRadius: i % 3 === 0 ? '50%' : 2,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
