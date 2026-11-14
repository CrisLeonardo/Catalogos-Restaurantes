import React from 'react';
import { Composition } from 'remotion';
import { DURACION, PROPS_BASE } from './datos';
import { SoloGancho, VideoLeogin } from './Video';

// Video principal (gancho A, el recomendado) y sus dos variantes completas,
// más los tres ganchos sueltos de 3 s para pruebas A/B.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Leogin-40s-A" component={VideoLeogin} durationInFrames={DURACION} fps={30} width={1080} height={1920}
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
