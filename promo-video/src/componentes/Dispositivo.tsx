// Un teléfono (o tableta) con las capturas reales de la app, y una «cámara»
// que se acerca al elemento clave, lo resalta y muestra el dedo que toca.
import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { captura, type Caja } from '../capturas';
import { color } from '../marca';

export type Paso = {
  /** Cuadro (dentro de la escena) en que aparece esta captura. */
  en: number;
  captura: string;
  /** Caja hacia la que se acerca la cámara. Sin foco: se ve la parte de arriba. */
  foco?: string;
  zoom?: number;
  /** Caja que el dedo toca al final de este paso (justo antes del siguiente). */
  toque?: string;
  /** Cuadro (dentro de la escena) del toque; por defecto 8 antes del siguiente paso. */
  toqueEn?: number;
  /** Caja que se resalta (se oscurece el resto). */
  resalte?: string;
  resalteEn?: number;
};

type Props = {
  pasos: Paso[];
  tipo?: 'telefono' | 'tableta';
  /** Altura (px del video) donde queda el centro de la cámara. */
  centroY?: number;
  /** Desplazamiento horizontal del centro (para pantallas partidas). */
  centroX?: number;
  escala?: number;
  /** El dispositivo solo se ve debajo de esta altura: arriba queda el titular. */
  recorte?: number;
};

const GEOM = {
  telefono: { pantalla: 780, bisel: 18, radio: 78, radioPantalla: 62 },
  tableta: { pantalla: 1000, bisel: 22, radio: 44, radioPantalla: 26 },
};

const mezcla = (a: number, b: number, t: number) => a + (b - a) * t;

export const Dispositivo: React.FC<Props> = ({ pasos, tipo = 'telefono', centroY = 1180, centroX = 540, escala = 1, recorte = 560 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = GEOM[tipo];
  const primera = captura(pasos[0].captura);
  const k = (g.pantalla * escala) / primera.ancho; // px de captura → px de video
  const SW = primera.ancho * k;
  const SH = primera.alto * k;
  const B = g.bisel * escala;

  // estado de la cámara de cada paso: punto enfocado (px de captura) y zoom
  const camara = (p: Paso) => {
    const c = captura(p.captura);
    if (p.foco) {
      const b = c.cajas[p.foco];
      // En el teléfono la cámara solo sube o baja: el teléfono queda centrado.
      if (b) return { x: tipo === 'telefono' ? c.ancho / 2 : b.x + b.w / 2, y: b.y + b.h / 2, z: p.zoom ?? 1.35 };
    }
    return { x: c.ancho / 2, y: tipo === 'telefono' ? c.alto * 0.36 : c.alto / 2, z: p.zoom ?? 1 };
  };

  let i = 0;
  for (let j = 0; j < pasos.length; j++) if (frame >= pasos[j].en) i = j;
  const actual = camara(pasos[i]);
  const previa = i > 0 ? camara(pasos[i - 1]) : { ...actual, z: actual.z * 0.94 };
  const t = spring({ frame: frame - pasos[i].en, fps, config: { damping: 200 }, durationInFrames: i === 0 ? 45 : 16 });
  // leve empuje continuo: la imagen nunca está muerta
  const vida = interpolate(frame - pasos[i].en, [0, 90], [0, 0.03], { extrapolateRight: 'clamp' });
  const cam = { x: mezcla(previa.x, actual.x, t), y: mezcla(previa.y, actual.y, t), z: mezcla(previa.z, actual.z, t) + vida };

  const tx = centroX - cam.z * (B + cam.x * k);
  let ty = centroY - cam.z * (B + cam.y * k);
  // Sin hueco abajo: si el borde inferior del aparato queda arriba del final
  // del cuadro, se baja (como mucho 300 px, para no esconder lo enfocado).
  const fondo = ty + cam.z * (SH + 2 * B);
  if (fondo < 1900) ty += Math.min(300, 1900 - fondo);
  const aVideo = (b: Caja, centro = true) => ({
    x: tx + cam.z * (B + (b.x + (centro ? b.w / 2 : 0)) * k),
    y: ty + cam.z * (B + (b.y + (centro ? b.h / 2 : 0)) * k),
  });

  // dedo
  const toques = pasos
    .map((p, j) => ({ p, j }))
    .filter(({ p }) => p.toque)
    .map(({ p, j }) => ({
      caja: captura(p.captura).cajas[p.toque as string],
      en: p.toqueEn ?? (pasos[j + 1] ? pasos[j + 1].en - 8 : p.en + 20),
    }))
    .filter((x) => x.caja);
  const proximo = toques.find((x) => frame <= x.en + 10);
  let dedo: React.ReactNode = null;
  if (proximo) {
    const destino = aVideo(proximo.caja);
    const anterior = toques[toques.indexOf(proximo) - 1];
    const origen = anterior ? aVideo(anterior.caja) : { x: destino.x + 160, y: destino.y + 260 };
    const llegar = spring({ frame: frame - (proximo.en - 16), fps, config: { damping: 18, mass: 0.8 }, durationInFrames: 16 });
    const x = mezcla(origen.x, destino.x, llegar);
    const y = mezcla(origen.y, destino.y, llegar);
    const presion = interpolate(frame - proximo.en, [-3, 0, 4], [1, 0.78, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const onda = interpolate(frame - proximo.en, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const visible = interpolate(frame - (proximo.en - 18), [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      * interpolate(frame - proximo.en, [6, 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    dedo = (
      <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: visible }}>
        {frame >= proximo.en ? (
          <div style={{
            position: 'absolute', left: destino.x - 90, top: destino.y - 90, width: 180, height: 180, borderRadius: '50%',
            border: `6px solid ${color.mango}`, opacity: 1 - onda, transform: `scale(${0.3 + onda * 0.9})`,
          }} />
        ) : null}
        <div style={{
          position: 'absolute', left: x - 42, top: y - 42, width: 84, height: 84, borderRadius: '50%',
          background: 'rgba(255,255,255,.28)', border: '5px solid #FFFFFF',
          boxShadow: '0 10px 30px rgba(0,0,0,.45)', transform: `scale(${presion})`,
        }} />
      </div>
    );
  }

  // resaltado
  const pasoR = pasos[i].resalte ? pasos[i] : null;
  const cajaR = pasoR ? captura(pasoR.captura).cajas[pasoR.resalte as string] : null;
  const rEn = pasoR ? (pasoR.resalteEn ?? pasoR.en + 8) : 0;
  const rT = pasoR ? spring({ frame: frame - rEn, fps, config: { damping: 200 }, durationInFrames: 12 }) : 0;

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: recorte, bottom: 0, overflow: 'hidden',
      maskImage: 'linear-gradient(to bottom, transparent 0, #000 46px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 46px)',
    }}>
    <div style={{ position: 'absolute', left: 0, top: -recorte, width: 1080, height: 1920 }}>
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: SW + 2 * B, height: SH + 2 * B,
        transform: `translate(${tx}px, ${ty}px) scale(${cam.z})`, transformOrigin: '0 0',
        borderRadius: g.radio * escala, background: '#0B0B0C',
        boxShadow: `0 0 0 ${2 * escala}px #2E2E33, 0 60px 120px rgba(0,0,0,.55)`,
      }}>
        <div style={{ position: 'absolute', left: B, top: B, width: SW, height: SH, borderRadius: g.radioPantalla * escala, overflow: 'hidden', background: '#000' }}>
          {pasos.slice(0, i + 1).map((p, j) => {
            const op = j === 0 ? 1 : interpolate(frame - p.en, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <Img key={p.en} src={staticFile(`capturas/${captura(p.captura).archivo}`)}
                style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, opacity: op }} />
            );
          })}
          {cajaR ? (
            <div style={{
              position: 'absolute',
              left: cajaR.x * k - 10, top: cajaR.y * k - 10, width: cajaR.w * k + 20, height: cajaR.h * k + 20,
              borderRadius: 18, border: `${5 / cam.z}px solid ${color.mango}`,
              boxShadow: `0 0 0 4000px rgba(12,12,14,${0.55 * rT}), 0 0 40px rgba(245,160,48,${0.6 * rT})`,
              opacity: rT, transform: `scale(${mezcla(1.15, 1, rT)})`,
            }} />
          ) : null}
        </div>
      </div>
      {dedo}
    </div>
    </div>
  );
};
