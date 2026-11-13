import {AbsoluteFill, Audio, Composition, Sequence, staticFile, useVideoConfig} from 'remotion';
import '@fontsource-variable/geist';
import '@fontsource-variable/unbounded';
import '@fontsource/anton/latin-400.css';
import './style.css';
import {Hook} from './scenes/Hook';
import {Agitation} from './scenes/Agitation';
import {Demonstration} from './scenes/Demonstration';
import {Proof} from './scenes/Proof';
import {Close} from './scenes/Close';

function Promo() {
  const {height, width, fps} = useVideoConfig();
  const isVertical = height > width;
  // Los dos encuadres se diseñan a media resolución y se rasterizan a tamaño final.
  return <AbsoluteFill style={{backgroundColor: 'var(--ink)'}}>
    <div className={isVertical ? 'stage vertical' : 'stage wide'}
      style={{width: width / 2, height: height / 2, transform: 'scale(2)', transformOrigin: 'top left'}}>
      <Sequence name="¿Cobraste la limonada?" durationInFrames={3 * fps}><Hook /></Sequence>
      <Sequence name="La cuenta incompleta" from={3 * fps} durationInFrames={6 * fps}><Agitation /></Sequence>
      <Sequence name="Mesa · cocina · caja" from={9 * fps} durationInFrames={13 * fps}><Demonstration /></Sequence>
      <Sequence name="La cuenta completa" from={22 * fps} durationInFrames={4 * fps}><Proof /></Sequence>
      <Sequence name="Registro" from={26 * fps} durationInFrames={4 * fps}><Close /></Sequence>
    </div>
    <Audio src={staticFile('mezcla.wav')} />
  </AbsoluteFill>;
}

export function Root() {
  return <>
    <Composition id="LeoginPromoMobile" component={Promo} width={1080} height={1920} fps={60} durationInFrames={1800} />
    <Composition id="LeoginPromoWeb" component={Promo} width={1920} height={1080} fps={60} durationInFrames={1800} />
  </>;
}
