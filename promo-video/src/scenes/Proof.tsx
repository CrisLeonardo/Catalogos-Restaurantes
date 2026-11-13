import {useCurrentFrame} from 'remotion';
import {Barcode, Frame, Label, Lift, progress} from '../components/Art';
import {KineticText} from '../components/KineticText';

export function Proof() {
  const f = useCurrentFrame();
  const total = Math.round(52 + 18 * progress(f, 24, 88));
  return <Frame theme="proof">
    <div className="copy"><Label>Cuenta de la mesa 04</Label>
      <KineticText lines={['Q18 que sí', 'cobraste.']} accentLast/>
      <p>Hasta la última bebida<br/>queda en la cuenta.</p></div>
    <div className="art proof-art"><Lift tilt={-3}><div className="sheet receipt">
      <div className="ticket-head"><span>RINCÓN 502</span><b>04</b></div><div className="dash"/>
      <div className="ledger"><span>Rincón Clásica</span><b>Q52</b></div><div className="ledger"><span>Limonada</span><b>Q18</b></div>
      <div className="dash"/><div className="label-small">TOTAL COBRADO</div><div className="paper-total">Q{total}<span>.00</span></div>
      <div className="settled" style={{opacity: progress(f, 80, 94)}}>✓ PAGADO</div><Barcode/>
    </div></Lift></div>
  </Frame>;
}
