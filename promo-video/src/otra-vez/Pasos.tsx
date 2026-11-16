// El mismo domingo, con Leogin: cinco pasos con las pantallas reales.
import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { color, degradado, fuente } from '../marca';
import { av, captura, PASO, salto } from './base';
import { Reloj } from './Caos';
import type { Guion, PasoGuion, Toma } from './guiones';

const ENTRA = 12; // cuadros que tarda el aparato en llegar

/** Reparte los cuadros del paso entre sus tomas según el peso. */
function repartir(tomas: Toma[], dur = PASO): { desde: number; hasta: number }[] {
  const total = tomas.reduce((s, t) => s + (t.peso ?? 1), 0);
  const util = dur - ENTRA - 4;
  let c = ENTRA;
  return tomas.map((t) => {
    const d = (util * (t.peso ?? 1)) / total;
    const r = { desde: Math.round(c), hasta: Math.round(c + d) };
    c += d;
    return r;
  });
}

const Pantalla: React.FC<{ paso: PasoGuion; ancho: number; dur?: number }> = ({ paso, ancho, dur }) => {
  const f = useCurrentFrame();
  const tramos = repartir(paso.tomas, dur);
  const k = ancho / captura(paso.tomas[0].captura).ancho;
  const centro = (t: Toma, nombre?: string) => {
    const b = nombre ? captura(t.captura).cajas[nombre] : undefined;
    const m = nombre === t.resalta && t.ampliar ? t.ampliar : [0, 0, 0, 0];
    const c = b ? { x: b.x - m[0], y: b.y - m[1], w: b.w + m[0] + m[2], h: b.h + m[1] + m[3] } : undefined;
    return c ? { x: (c.x + c.w / 2) * k, y: (c.y + c.h / 2) * k, w: c.w * k, h: c.h * k } : undefined;
  };
  // toma activa
  let n = tramos.findIndex((t) => f < t.hasta);
  if (n < 0) n = tramos.length - 1;
  const toma = paso.tomas[n];
  const tramo = tramos[n];
  const foco = centro(toma, toma.resalta);
  // Lo resaltado queda nítido y el resto de la pantalla se desenfoca y se
  // apaga un poco. Sin acercar: la pantalla se ve entera, como en el aparato.
  const destaca = foco ? av(f, tramo.desde + 8, tramo.desde + 24) : 0;
  const M = 10; // aire alrededor de lo resaltado
  const alto = (ancho * captura(paso.tomas[0].captura).alto) / captura(paso.tomas[0].captura).ancho;

  // el dedo viaja hacia lo que toca y aprieta justo antes del cambio
  const toque = centro(toma, toma.toca);
  const aprieta = tramo.hasta - 7;
  const viaje = av(f, tramo.desde + 6, aprieta - 4);
  const previo = n > 0 ? centro(paso.tomas[n - 1], paso.tomas[n - 1].toca) : undefined;
  const origen = previo ?? { x: ancho * 0.78, y: ancho * 1.9 };
  const dedo = toque ? { x: origen.x + (toque.x - origen.x) * viaje, y: origen.y + (toque.y - origen.y) * viaje } : undefined;
  const presion = toque ? av(f, aprieta, aprieta + 3) * (1 - av(f, aprieta + 3, aprieta + 7)) : 0;
  const onda = toque ? av(f, aprieta + 1, aprieta + 12) : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
      <div style={{ position: 'absolute', inset: 0, filter: destaca ? `blur(${destaca * 3.5}px) brightness(${1 - destaca * 0.28})` : undefined }}>
        {paso.tomas.map((t, i) => {
          if (i > n || i < n - 1) return null;
          const entra = i === 0 ? 1 : av(f, tramos[i].desde - 2, tramos[i].desde + 5);
          return <Img key={t.captura} src={staticFile(`otra-vez/capturas/${captura(t.captura).archivo}`)} style={{ position: 'absolute', left: 0, top: 0, width: ancho, opacity: i === n ? entra : 1 }} />;
        })}
      </div>
      {foco ? (
        <>
          {/* la misma pantalla, nítida, recortada a lo resaltado */}
          <Img
            src={staticFile(`otra-vez/capturas/${captura(toma.captura).archivo}`)}
            style={{ position: 'absolute', left: 0, top: 0, width: ancho, opacity: destaca, clipPath: `inset(${Math.max(0, foco.y - foco.h / 2 - M)}px ${Math.max(0, ancho - foco.x - foco.w / 2 - M)}px ${Math.max(0, alto - foco.y - foco.h / 2 - M)}px ${Math.max(0, foco.x - foco.w / 2 - M)}px round 18px)` }}
          />
          <div style={{ position: 'absolute', left: foco.x - foco.w / 2 - M, top: foco.y - foco.h / 2 - M, width: foco.w + M * 2, height: foco.h + M * 2, borderRadius: 18, boxSizing: 'border-box', border: `5px solid ${color.brasa}`, boxShadow: `0 0 0 ${6 + 6 * Math.sin(f / 4)}px rgba(232,83,74,.25)`, opacity: av(f, tramo.desde + 8, tramo.desde + 18) }} />
        </>
      ) : null}
      {toque && dedo ? (
        <>
          <div style={{ position: 'absolute', left: toque.x, top: toque.y, width: 150, height: 150, margin: -75, borderRadius: '50%', border: `5px solid ${color.brasa}`, scale: String(0.3 + onda), opacity: onda > 0 ? 1 - onda : 0 }} />
          <div style={{ position: 'absolute', left: dedo.x, top: dedo.y, width: 62, height: 62, margin: -31, borderRadius: '50%', background: 'rgba(232,83,74,.55)', border: '4px solid rgba(255,255,255,.95)', boxShadow: '0 6px 18px rgba(0,0,0,.45)', scale: String(1 - presion * 0.28), opacity: av(f, tramo.desde + 4, tramo.desde + 10) }} />
        </>
      ) : null}
    </div>
  );
};

/** Cuánto sube el aparato para que lo que se toca o resalta quede a la vista. */
export function seguir(paso: PasoGuion, ancho: number, ventana: number, f: number, dur?: number): number {
  const tramos = repartir(paso.tomas, dur);
  const c0 = captura(paso.tomas[0].captura);
  const k = ancho / c0.ancho;
  const maximo = Math.max(0, (ancho * c0.alto) / c0.ancho + 40 - ventana);
  const sube = paso.tomas.map((t) => {
    const b = captura(t.captura).cajas[t.toca ?? t.resalta ?? ''];
    if (!b) return 0;
    return Math.min(maximo, Math.max(0, (b.y + b.h / 2) * k - (ventana - 300)));
  });
  let n = tramos.findIndex((t) => f < t.hasta);
  if (n < 0) n = tramos.length - 1;
  const antes = n > 0 ? sube[n - 1] : 0;
  return antes + (sube[n] - antes) * av(f, tramos[n].desde - 2, tramos[n].desde + 14);
}

/** `dur`: cuadros que dura el paso (por omisión, los de «Otra vez»). */
export const Aparato: React.FC<{ paso: PasoGuion; ancho: number; dur?: number }> = ({ paso, ancho, dur }) => {
  const c = captura(paso.tomas[0].captura);
  const alto = (ancho * c.alto) / c.ancho;
  const marco = paso.aparato === 'telefono' ? 16 : 20;
  const radio = paso.aparato === 'telefono' ? 62 : 40;
  return (
    <div style={{ width: ancho + marco * 2, height: alto + marco * 2, borderRadius: radio, background: '#0B0B0D', padding: marco, boxShadow: '0 40px 90px rgba(60,30,10,.35), 0 0 0 2px #2A2A2E inset' }}>
      <div style={{ position: 'relative', width: ancho, height: alto, borderRadius: radio - marco, overflow: 'hidden' }}>
        <Pantalla paso={paso} ancho={ancho} dur={dur} />
      </div>
    </div>
  );
};

const Paso: React.FC<{ paso: PasoGuion; numero: number; anterior: number }> = ({ paso, numero, anterior }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const tel = paso.aparato === 'telefono';
  const llega = av(f, 0, ENTRA + 4);
  const sale = av(f, PASO - 6, PASO);
  // tamaño y sitio del aparato
  const ancho = vertical ? (tel ? 610 : 980) : tel ? 540 : 1000;
  const arriba = vertical ? (tel ? 570 : 760) : tel ? 56 : 180;
  const sube = tel ? seguir(paso, ancho, height - arriba - 30, f) : 0;
  const sitio: React.CSSProperties = vertical
    ? { left: '50%', top: arriba, translate: `-50% ${(1 - llega) * 260 - sale * 80 - sube}px` }
    : { right: tel ? 200 : 70, top: arriba, translate: `${(1 - llega) * 260 + sale * 80}px ${-sube}px` };
  const texto: React.CSSProperties = vertical
    ? { left: 70, right: 70, top: 280 }
    : { left: 100, width: tel ? 960 : 670, top: tel ? 330 : 300 };
  // el reloj avanza hasta la hora del paso
  const minutos = anterior + (paso.minutos - anterior) * av(f, 0, 16);
  return (
    <AbsoluteFill style={{ opacity: 1 - sale }}>
      <div style={{ position: 'absolute', left: vertical ? 70 : 100, top: vertical ? 120 : 110, display: 'flex', alignItems: 'center', gap: 30 }}>
        <Reloj minutos={minutos} claro tam={vertical ? 110 : 96} dia={false} />
      </div>
      <div style={{ position: 'absolute', right: vertical ? 70 : undefined, left: vertical ? undefined : 100, top: vertical ? 150 : undefined, bottom: vertical ? undefined : 110, display: 'flex', gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ width: i === numero ? 64 : 22, height: 12, borderRadius: 6, background: i <= numero ? color.brasa : '#D9CFC2' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', ...texto }}>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: vertical ? 70 : tel ? 78 : 64, lineHeight: 1.08, color: color.carbon, opacity: av(f, 2, 12), translate: `0px ${(1 - av(f, 2, 14)) * 40}px` }}>
          {paso.titulo}
        </div>
        <div style={{ fontFamily: fuente.texto, fontWeight: 500, fontSize: vertical ? 40 : 40, lineHeight: 1.25, color: '#5B524A', marginTop: 22, opacity: av(f, 12, 24), translate: `0px ${(1 - av(f, 12, 26)) * 30}px` }}>
          {paso.detalle}
        </div>
      </div>
      <div style={{ position: 'absolute', ...sitio, opacity: llega, scale: String(0.94 + 0.06 * salto(f, 0, ENTRA + 4)) }}>
        <Aparato paso={paso} ancho={ancho} />
      </div>
    </AbsoluteFill>
  );
};

export const Pasos: React.FC<{ guion: Guion }> = ({ guion }) => (
  <AbsoluteFill style={{ background: color.masa }}>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 80% 100%, rgba(245,160,48,.22), transparent 60%)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, background: degradado }} />
    {guion.pasos.map((p, i) => (
      <Sequence key={i} from={i * PASO} durationInFrames={PASO} name={`Paso ${i + 1}`}>
        <Paso paso={p} numero={i} anterior={i === 0 ? 107 : guion.pasos[i - 1].minutos} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
