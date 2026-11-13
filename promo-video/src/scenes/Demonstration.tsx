import {Img, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Brand, Frame, Label, Lift, Tick} from '../components/Art';
import {KineticText} from '../components/KineticText';

type Station = 'mesa' | 'cocina' | 'caja';
const beats = {
  mesa: {label: 'Tomar pedido', lines: ['Anótala', 'en la mesa.'], detail: 'La bebida entra en la misma comanda.'},
  cocina: {label: 'Cocina', lines: ['Cocina sabe', 'qué sale.'], detail: 'El equipo ve cuándo está listo el pedido.'},
  caja: {label: 'Cobro', lines: ['Cobra la', 'cuenta entera.'], detail: 'Platos y bebidas llegan juntos a caja.'},
} as const;

function Item({drink = false, photos = false}: {drink?: boolean; photos?: boolean}) {
  return <div className="item">
    {photos && <Img src={staticFile(drink ? 'limonada-con-menta.webp' : 'rincon-clasica.webp')}/>}
    <div><strong>{drink ? 'Limonada con Menta' : 'Rincón Clásica'}</strong><small>1 unidad</small></div>
    {photos && <b>{drink ? 'Q18.00' : 'Q52.00'}</b>}
  </div>;
}

function OrderPanel({station}: {station: Station}) {
  const f = useCurrentFrame();
  const cooking = station === 'cocina';
  const cash = station === 'caja';
  const added = station !== 'mesa' || f >= 45;
  const done = f >= (cash ? 152 : cooking ? 121 : 164);
  const label = cash ? (done ? 'Cobrado' : 'Cobrar Q70.00') : cooking ? (done ? 'Listo' : 'Marcar listo') : (done ? 'En cocina' : 'Enviar a cocina');
  return <div className="panel">
    <div className="panel-nav"><Img className="nav-logo" src={staticFile('logo-mark.svg')}/>{cash ? 'Caja' : cooking ? 'Cocina' : 'Servicio'}<div className="live"><i/>En línea</div></div>
    <div className="panel-body">
      <div className="panel-title"><strong>Mesa 04</strong><span className={'pill ' + (cooking && done || cash && done ? 'ok' : '')}>{cash ? 'Efectivo' : cooking ? done ? 'Listo' : 'En cocina' : done ? 'En cocina' : 'Sin enviar'}</span></div>
      {cash ? <>
        <div className="balance"><small>Por cobrar</small><b>{done ? 'Q0.00' : 'Q70.00'}</b></div>
        <div className="ledger"><span>Efectivo recibido</span><b>{f < 52 ? '—' : 'Q100.00'}</b></div>
        <div className="ledger"><span>Vuelto</span><b>{f < 52 ? '—' : 'Q30.00'}</b></div>
      </> : <><Item photos={!cooking}/><div className="drink-slot">{added && <Lift at={station === 'mesa' ? 45 : 0}><Item drink photos={!cooking}/></Lift>}</div>
        <div className="subtotal"><span>{cooking ? 'Unidades' : 'Total'}</span><b>{cooking ? '2' : added ? 'Q70.00' : 'Q52.00'}</b></div></>}
      <div className={'action ' + (done ? 'complete' : '')}><span>{label}</span><Tick done={done}/></div>
    </div>
  </div>;
}

function Beat({station}: {station: Station}) {
  const f = useCurrentFrame();
  const data = beats[station];
  return <Frame theme={'demo ' + station}>
    <div className="copy"><Brand/><Label>{data.label} · Mesa 04</Label>
      <KineticText lines={data.lines} accentLast/><p>{data.detail}</p></div>
    <div className="art demo-art"><div className="echo-ring ring-one"/><div className="echo-ring ring-two"/>
      <Lift tilt={station === 'caja' ? -1 : 1}><OrderPanel station={station}/></Lift>
      <div className="station-rail">{(['mesa','cocina','caja'] as const).map((id) =>
        <span className={station === id ? 'active' : ''} key={id}>{id}</span>)}</div>
      <div className="sweep" style={{transform: 'translateX(' + (Math.min(f/12,1)*200 - 100) + '%)', opacity: f > 12 ? 0 : 1}}/>
    </div>
  </Frame>;
}

export function Demonstration() {
  return <>
    <Sequence name="Tomar pedido" durationInFrames={252}><Beat station="mesa"/></Sequence>
    <Sequence name="Marcar listo" from={252} durationInFrames={240}><Beat station="cocina"/></Sequence>
    <Sequence name="Cobrar" from={492} durationInFrames={288}><Beat station="caja"/></Sequence>
  </>;
}
