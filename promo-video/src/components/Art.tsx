import type {CSSProperties, ReactNode} from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

export function progress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
}

export function Brand({large = false}: {large?: boolean}) {
  return <div className={'brand' + (large ? ' brand-large' : '')}>
    <Img src={staticFile('logo-mark.svg')} /><span>Leogin</span>
  </div>;
}

export function Photo({style}: {style?: CSSProperties}) {
  const f = useCurrentFrame();
  return <div className="photo" style={style}><Img src={staticFile('limonada.jpg')} style={{
    transform: 'scale(' + (1.035 + f * .00036) + ') translateY(' + (Math.sin(f / 100) * .7) + '%)',
  }} /></div>;
}

export function Label({children}: {children: ReactNode}) {
  return <div className="label"><i />{children}</div>;
}

export function Lift({children, at = 0, tilt = 0, className = ''}: {children: ReactNode; at?: number; tilt?: number; className?: string}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = spring({frame: Math.max(0, frame - at), fps, config: {damping: 17, stiffness: 170, mass: .75}});
  return <div className={className} style={{
    opacity: Math.min(1, v * 3),
    transform: 'perspective(900px) translate(' + ((1-v)*40) + 'px,' + ((1-v)*34 + Math.sin(frame/63)*2) + 'px) rotateY(' + ((1-v)*8) + 'deg) rotate(' + (tilt + (1-v)*4) + 'deg)',
  }}>{children}</div>;
}

export function Frame({children, theme = ''}: {children: ReactNode; theme?: string}) {
  return <div className={'scene ' + theme}>{children}</div>;
}

export function Tick({done = false}: {done?: boolean}) {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d={done ? 'm4 12 5 5L20 6' : 'M4 12h15m-6-6 6 6-6 6'} />
  </svg>;
}

export function Barcode() {
  return <div className="barcode" aria-hidden="true" />;
}
