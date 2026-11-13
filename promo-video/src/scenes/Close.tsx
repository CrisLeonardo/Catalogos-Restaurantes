import {Img, staticFile, useCurrentFrame} from 'remotion';
import {Brand, Frame, Photo, Tick} from '../components/Art';
import {KineticText} from '../components/KineticText';

export function Close() {
  const f = useCurrentFrame();
  return <Frame theme="close">
    <div className="photo-cell"><Photo/><div className="qr-ticket"><Img src={staticFile('registro.png')}/><b>Escanea para crear tu menú</b></div></div>
    <div className="copy"><Brand large/>
      <KineticText lines={['Que se cobre', 'lo que sirves.']} />
      <div className="cta" style={{transform: 'scale(' + (1 + .013*Math.sin(f*Math.PI/45)) + ')'}}>
        Crear mi menú gratis <Tick/><i style={{left: ((f % 110)/110 * 180 - 40) + '%'}}/>
      </div>
      <div className="address">distleogin.com/registro</div>
    </div>
  </Frame>;
}
