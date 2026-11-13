import {useCurrentFrame} from 'remotion';
import {Frame, Label, Photo, progress} from '../components/Art';
import {KineticText} from '../components/KineticText';

export function Hook() {
  const f = useCurrentFrame();
  return <Frame theme="hook">
    <div className="photo-cell"><Photo />
      <div className="price-tag" style={{transform: 'rotate(' + (-7 + 2*Math.sin(f/32)) + 'deg)'}}><span>MESA 04</span><b>Q18</b></div>
    </div>
    <div className="copy"><Label>Hora pico · Mesa 04</Label>
      <KineticText lines={['¿Cobraste', 'la limonada?']} instant />
      <div className="copy-rule" style={{transform: 'scaleX(' + (.2 + .8*progress(f, 5, 53)) + ')'}} />
      <p>Una bebida fuera de la cuenta.<br/><strong>Q18 que se quedan en la mesa.</strong></p>
    </div>
  </Frame>;
}
