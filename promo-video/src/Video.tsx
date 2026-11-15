// El video completo: gancho + cuerpo + cierre, con música y efectos.
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { Audio } from '@remotion/media';
import { DURACION, T, type Gancho, type PropsVideo } from './datos';
import { GanchoCronometro, GanchoDolor, GanchoResultado } from './escenas/Ganchos';
import { CADA, Chats, Comandas, MENSAJES } from './escenas/ElCaos';
import { Caja, Cocina, Hoy, Pide, Seguimiento, Suena } from './escenas/LaDemo';
import { AntesDespues, Cierre } from './escenas/Cierre';
import { grabacion } from './capturas';

const GANCHOS: Record<Gancho, React.FC> = { dolor: GanchoDolor, resultado: GanchoResultado, cronometro: GanchoCronometro };

// Empujón de entrada en cada corte: el video nunca se queda quieto.
const Corte: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  const s = interpolate(f, [0, 7], [1.05, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

const tramo = ([a, b]: readonly [number, number]) => ({ from: a, durationInFrames: b - a });

const Efecto: React.FC<{ en: number; src: string; volumen?: number }> = ({ en, src, volumen = 1 }) => (
  <Sequence from={en} durationInFrames={75} layout="none">
    <Audio src={staticFile(`audio/${src}`)} volume={volumen} />
  </Sequence>
);

export const VideoLeogin: React.FC<PropsVideo> = (props) => {
  const G = GANCHOS[props.gancho];
  return (
    <AbsoluteFill style={{ background: '#121214' }}>
      <Sequence {...tramo(T.gancho)} name="Gancho"><G /></Sequence>
      <Sequence {...tramo(T.caos)} name="Chats"><Corte><Chats /></Corte></Sequence>
      <Sequence {...tramo(T.comanda)} name="Comandas"><Corte><Comandas /></Corte></Sequence>
      <Sequence {...tramo(T.pide)} name="Pide"><Corte><Pide /></Corte></Sequence>
      <Sequence {...tramo(T.panel)} name="Suena"><Corte><Suena /></Corte></Sequence>
      <Sequence {...tramo(T.cocina)} name="Cocina"><Corte><Cocina /></Corte></Sequence>
      <Sequence {...tramo(T.seguimiento)} name="Seguimiento"><Corte><Seguimiento /></Corte></Sequence>
      <Sequence {...tramo(T.caja)} name="Caja"><Corte><Caja /></Corte></Sequence>
      <Sequence {...tramo(T.antesDespues)} name="Antes y después"><Corte><AntesDespues /></Corte></Sequence>
      <Sequence {...tramo(T.hoy)} name="Hoy"><Corte><Hoy /></Corte></Sequence>
      <Sequence {...tramo(T.cierre)} name="Cierre"><Corte><Cierre {...props} /></Corte></Sequence>

      {props.musica ? (
        <Audio src={staticFile(props.musica)} volume={(f) => props.volumenMusica * interpolate(f, [DURACION - 20, DURACION], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      ) : null}
      {MENSAJES.map((_, n) => <Efecto key={n} en={T.caos[0] + n * CADA} src="pop.wav" volumen={0.5} />)}
      {props.gancho === 'resultado' ? <Efecto en={20} src="sello.wav" volumen={0.9} /> : null}
      {props.gancho === 'cronometro' ? <Efecto en={16 + Math.round(grabacion.latencia * 30)} src="ding.wav" volumen={0.8} /> : null}
      <Efecto en={T.comanda[1] - 14} src="barrido.wav" volumen={0.7} />
      <Efecto en={T.panel[0] + 10} src="ding.wav" volumen={0.9} />
      <Efecto en={T.caja[0] + 75} src="sello.wav" volumen={0.9} />
      <Efecto en={T.cierre[0] - 6} src="barrido.wav" volumen={0.5} />
    </AbsoluteFill>
  );
};

// Solo los primeros 3 s, para pruebas A/B del gancho.
export const SoloGancho: React.FC<PropsVideo> = (props) => {
  const G = GANCHOS[props.gancho];
  return (
    <AbsoluteFill>
      <G />
      {props.musica ? <Audio src={staticFile(props.musica)} volume={props.volumenMusica} /> : null}
      {props.gancho === 'resultado' ? <Efecto en={20} src="sello.wav" volumen={0.9} /> : null}
      {props.gancho === 'cronometro' ? <Efecto en={16 + Math.round(grabacion.latencia * 30)} src="ding.wav" volumen={0.8} /> : null}
    </AbsoluteFill>
  );
};
