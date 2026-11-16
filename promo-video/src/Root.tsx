import React from 'react';
import { Composition } from 'remotion';
import { DURACION, PROPS_BASE } from './datos';
import { SoloGancho, VideoLeogin } from './Video';
import { OtraVez } from './otra-vez/OtraVez';
import { T } from './otra-vez/base';
import { UnSoloLugar } from './un-lugar/UnSoloLugar';
import { U } from './un-lugar/guion';

// «Otra vez»: un video por tipo de negocio, en vertical (redes) y horizontal (PC).
const PUBLICOS = ['meseros', 'comedor', 'domicilio'] as const;

// Video principal (gancho A, el recomendado) y sus dos variantes completas,
// más los tres ganchos sueltos de 3 s para pruebas A/B.
export const RemotionRoot: React.FC = () => (
  <>
    {PUBLICOS.map((publico) => (
      <React.Fragment key={publico}>
        <Composition id={`OtraVez-${publico}-vertical`} component={OtraVez} durationInFrames={T.fin} fps={30} width={1080} height={1920} defaultProps={{ publico }} />
        <Composition id={`OtraVez-${publico}-horizontal`} component={OtraVez} durationInFrames={T.fin} fps={30} width={1920} height={1080} defaultProps={{ publico }} />
      </React.Fragment>
    ))}
    {/* «Un solo lugar»: el video general de Leogin */}
    <Composition id="UnSoloLugar-vertical" component={UnSoloLugar} durationInFrames={U.fin} fps={30} width={1080} height={1920} />
    <Composition id="UnSoloLugar-horizontal" component={UnSoloLugar} durationInFrames={U.fin} fps={30} width={1920} height={1080} />
    <Composition id="Leogin-40s-A"component={VideoLeogin} durationInFrames={DURACION} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'dolor' as const }} />
    <Composition id="Leogin-40s-B" component={VideoLeogin} durationInFrames={DURACION} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'resultado' as const }} />
    <Composition id="Leogin-40s-C" component={VideoLeogin} durationInFrames={DURACION} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'cronometro' as const }} />
    <Composition id="Gancho-A-dolor" component={SoloGancho} durationInFrames={90} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'dolor' as const }} />
    <Composition id="Gancho-B-resultado" component={SoloGancho} durationInFrames={90} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'resultado' as const }} />
    <Composition id="Gancho-C-cronometro" component={SoloGancho} durationInFrames={90} fps={30} width={1080} height={1920}
      defaultProps={{ ...PROPS_BASE, gancho: 'cronometro' as const }} />
  </>
);
