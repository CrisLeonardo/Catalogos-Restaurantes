import {Sequence, useCurrentFrame} from 'remotion';
import {Barcode, Frame, Label, Lift} from '../components/Art';
import {KineticText} from '../components/KineticText';

function Paper({second}: {second: boolean}) {
  const f = useCurrentFrame();
  return <Frame theme="agitation">
    <div className="copy"><Label>Hora pico · Mesa 04</Label>
      <KineticText lines={second ? ['¿Y la', 'bebida?'] : ['Salió de', 'la barra.']} accentLast />
      <p>{second ? 'En el papel solo aparece la hamburguesa.' : 'Alguien la pidió de palabra.'}</p>
    </div>
    <div className="art paper-art">
      <div className={'back-slip sheet' + (second ? '' : ' bar-first')} style={{transform: 'rotate(' + (-8 + 2*Math.sin(f/50)) + 'deg)'}}>
        <span>NOTA DE BARRA · 04</span><hr/><em>1 limonada<br/>con menta</em>
        <div className="bar-mark">SERVIDA</div>
      </div>
      <Lift tilt={second ? 3 : 5}><div className="sheet front-slip" style={{transform: second ? undefined : 'translate(15px,20px) rotate(5deg)'}}>
        <div className="ticket-head"><span>NOTA DE MESA</span><b>04</b></div>
        <div className="dash" /><div className="ledger"><span>1 × Clásica</span><b>Q52</b></div>
        <div className="empty-line"><i/><i/></div><div className="dash"/>
        <div className="label-small">TOTAL ANOTADO</div><div className="paper-total">Q52<span>.00</span></div>
        {second && <div className="stamp" style={{scale: 1 + .11*Math.exp(-f/15)}}>FALTAN Q18</div>}<Barcode/>
      </div></Lift>
    </div>
  </Frame>;
}

export function Agitation() {
  return <><Sequence durationInFrames={168} name="Pedido de palabra"><Paper second={false}/></Sequence>
    <Sequence from={168} durationInFrames={192} name="Faltan Q18"><Paper second/></Sequence></>;
}
