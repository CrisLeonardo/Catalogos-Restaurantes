import React from 'react';
import { Composition } from 'remotion';
import { DURACION, PROPS_BASE } from './datos';
import { SoloGancho, VideoLeogin } from './Video';
import { PROPS_UNA_TOMA, UnaToma } from './una-toma/UnaToma';
import TIEMPOS from './una-toma/tiempos.json';

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
    {/* «Una sola toma» (2026-11-15): vertical para redes y horizontal para PC */}
    <Composition id="UnaToma-Vertical" component={UnaToma} durationInFrames={TIEMPOS.total} fps={30} width={1080} height={1920}
      defaultProps={PROPS_UNA_TOMA} />
    <Composition id="UnaToma-Horizontal" component={UnaToma} durationInFrames={TIEMPOS.total} fps={30} width={1920} height={1080}
      defaultProps={PROPS_UNA_TOMA} />
  </>
);
