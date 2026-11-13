import {spring, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = { lines: readonly string[]; instant?: boolean; accentLast?: boolean };

export function KineticText({lines, instant = false, accentLast = false}: Props) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  let index = 0;
  return <h1 className="headline">{lines.map((line, row) =>
    <span className={'type-line' + (accentLast && row === lines.length - 1 ? ' accent' : '')} key={line}>
      {line.split(' ').map((word, column) => {
        const delay = index++ * 9;
        const reveal = spring({frame: Math.max(0, frame - delay), fps, config: {damping: 16, stiffness: 230, mass: .7}});
        return <span key={column} className="word" style={{
          marginLeft: column ? '.15em' : 0,
          opacity: instant ? 1 : Math.min(1, reveal * 3),
          transform: 'translateY(' + ((1 - reveal) * (instant ? -3 : 30)) + '%)',
        }}>{word}</span>;
      })}
    </span>)}</h1>;
}
