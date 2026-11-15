// Pantallas de los videos «comedor» y «a domicilio»: la carta del cliente
// (tema oscuro de Rincón 502, como la real), su carrito, el seguimiento en
// vivo y el «En vivo» del mostrador. Reproducen la app, con datos de ejemplo.
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { loadFont as cargarBebas } from '@remotion/google-fonts/BebasNeue';
import { app, clamp, dinero, easeIO, easeOut, lerp, pop, prog } from './base';
import { Check, Toque } from './dispositivos';
import { mono } from './pantallas';
import { fuente } from '../marca';

const bebas = cargarBebas('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }).fontFamily;

// Colores de la carta de Rincón 502 (tema oscuro)
const c = { fondo: '#141312', tarjeta: '#232120', borde: 'rgba(255,255,255,.12)', texto: '#F5F2EC', texto2: 'rgba(245,242,236,.66)', marca: '#E8573A', boton: '#F5F2EC' };

export type Plato = { id: string; n: string; d: string; p: number };
export const PLATOS_CARTA: Plato[] = [
  { id: 'rincon-clasica', n: 'Rincón Clásica', d: 'Carne 150 g, queso cheddar, lechuga, tomate.', p: 52 },
  { id: 'pizza-pepperoni', n: 'Pepperoni (mediana)', d: 'Salsa de la casa, mozzarella y pepperoni.', p: 85 },
  { id: 'limonada-con-menta', n: 'Limonada con Menta', d: 'Natural, con hierbabuena fresca.', p: 18 },
  { id: 'alitas-bbq', n: 'Alitas BBQ', d: '8 alitas con salsa BBQ y aderezo.', p: 58 },
];

export type GuionCliente = {
  modo: 'mesa' | 'domicilio';
  /** Platos que se agregan: [índice en la carta, cuadro del toque]. */
  agrega: [number, number][];
  tapCarrito: number;
  hoja: number;
  pin?: number;
  tapEnviar: number;
  /** Cuadros en que el seguimiento marca cada paso (llegan con la chispa). */
  aceptado: number;
  ultimo: number;
};

const Encabezado: React.FC<{ modo: GuionCliente['modo'] }> = ({ modo }) => (
  <div style={{ position: 'absolute', top: 56, left: 14, right: 14, height: 44, borderRadius: 99, border: `1px solid ${c.borde}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', fontSize: 15, color: c.texto }}>
    {modo === 'mesa'
      ? <><b>Mesa 2</b><span style={{ color: c.texto2 }}>· tu pedido llega a esta mesa</span></>
      : <><b>A domicilio</b><span style={{ color: c.texto2 }}>· Rincón 502 te lo lleva</span></>}
  </div>
);

const TarjetaPlato: React.FC<{ plato: Plato; y: number; cuenta: number; tapEn?: number }> = ({ plato, y, cuenta, tapEn }) => {
  const f = useCurrentFrame();
  const presion = tapEn !== undefined && f >= tapEn && f < tapEn + 4 ? 0.94 : 1;
  return (
    <div style={{ position: 'absolute', left: 14, right: 14, top: y, height: 150, borderRadius: 22, overflow: 'hidden', border: `1px solid ${c.borde}`, background: c.tarjeta }}>
      <Img src={staticFile(`una-toma/platos/${plato.id}.webp`)} style={{ position: 'absolute', right: -20, top: -10, width: 210, height: 210, objectFit: 'cover', opacity: 0.95 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(20,19,18,.96) 40%, rgba(20,19,18,.2) 100%)' }} />
      <div style={{ position: 'absolute', left: 18, top: 18, right: 120 }}>
        <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: 20, color: c.texto, letterSpacing: -0.5 }}>{plato.n}</div>
        <div style={{ fontSize: 13, color: c.texto2, marginTop: 6, lineHeight: 1.35 }}>{plato.d}</div>
        <div style={{ ...mono, fontSize: 19, fontWeight: 700, color: c.texto, marginTop: 10 }}>{dinero(plato.p)}</div>
      </div>
      <div style={{ position: 'absolute', right: 14, bottom: 14, height: 42, minWidth: 42, padding: cuenta ? '0 12px' : 0, borderRadius: 14, background: c.boton, color: '#141312', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: cuenta ? 17 : 26, fontWeight: 700, transform: `scale(${presion})` }}>
        {cuenta ? <><Check size={16} color="#141312" /> {cuenta}</> : '+'}
      </div>
    </div>
  );
};

/** Mapa ilustrado (calles), con la casa del cliente y el restaurante. */
const Mapa: React.FC<{ alto: number; pin: number; ruta?: number }> = ({ alto, pin, ruta = 0 }) => (
  <div style={{ position: 'relative', height: alto, borderRadius: 16, overflow: 'hidden', background: '#2A2826' }}>
    <svg width="100%" height="100%" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
      <g stroke="#3B3835" strokeWidth="10" fill="none">
        <path d="M-10 40 H380 M-10 120 H380 M-10 180 H380 M60 -10 V220 M170 -10 V220 M290 -10 V220" />
      </g>
      <g stroke="#45413D" strokeWidth="4" fill="none"><path d="M-10 80 L380 150 M110 -10 L240 220" /></g>
      <rect x="196" y="58" width="70" height="44" rx="6" fill="#2F3B2C" />
      {ruta > 0 && <path d="M60 40 H170 V120 H290" stroke={c.marca} strokeWidth="5" fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - ruta} />}
      <circle cx="60" cy="40" r="9" fill="#F5F2EC" />
      <text x="74" y="34" fontSize="12" fill="#F5F2EC" fontFamily="sans-serif" fontWeight="700">Rincón 502</text>
    </svg>
    <div style={{ position: 'absolute', left: '80.5%', top: `${lerp(-10, 60, pin)}%`, transform: 'translate(-50%,-100%)', opacity: clamp(pin * 3) }}>
      <svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 43 C17 43 2 26 2 16 A15 15 0 0 1 32 16 C32 26 17 43 17 43Z" fill={c.marca} stroke="#fff" strokeWidth="2" /><circle cx="17" cy="16" r="6" fill="#fff" /></svg>
    </div>
  </div>
);

/** Carta → carrito → enviado → seguimiento en vivo. */
export const PantallaCliente: React.FC<{ g: GuionCliente }> = ({ g }) => {
  const f = useCurrentFrame();
  const enviado = f >= g.tapEnviar + 6;
  const cuentas = PLATOS_CARTA.map((_, i) => g.agrega.filter(([j, en]) => j === i && f >= en).length);
  const total = PLATOS_CARTA.reduce((s, p, i) => s + p.p * cuentas[i], 0);
  const piezas = cuentas.reduce((a, b) => a + b, 0);
  const envio = g.modo === 'domicilio' ? 15 : 0;
  const hoja = enviado ? 1 - easeIO(prog(f, g.tapEnviar + 6, g.tapEnviar + 14)) : easeOut(prog(f, g.hoja, g.hoja + 10));
  const seg = easeOut(prog(f, g.tapEnviar + 8, g.tapEnviar + 18));
  const pin = g.pin ? easeOut(prog(f, g.pin, g.pin + 10)) : 0;
  const barra = pop(prog(f, g.agrega[0][1], g.agrega[0][1] + 10));
  const lineas = PLATOS_CARTA.map((p, i) => ({ p, n: cuentas[i] })).filter((l) => l.n > 0);

  const pasos = g.modo === 'mesa'
    ? ['Recibido', 'Aceptado', 'En preparación', 'Listo', 'Comida servida']
    : ['Recibido', 'Aceptado', 'En preparación', 'En camino', 'Entregado'];
  const hecho = (i: number) => (i === 0 ? f >= g.tapEnviar : i <= 2 ? f >= g.aceptado : i === 3 ? f >= g.ultimo : false);
  const actual = f >= g.ultimo ? 3 : f >= g.aceptado ? 2 : 0;
  const golpeUltimo = f >= g.ultimo ? pop(prog(f, g.ultimo, g.ultimo + 12)) : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: c.fondo, color: c.texto }}>
      {/* Carta */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-seg * 30}%)`, opacity: 1 - seg }}>
        <Encabezado modo={g.modo} />
        <div style={{ position: 'absolute', top: 108, left: 16, fontFamily: bebas, fontSize: 64, lineHeight: 1, letterSpacing: 0.5 }}>EL MENÚ</div>
        <div style={{ position: 'absolute', top: 178, left: 14, display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
          {['Todo', 'Hamburguesas', 'Pizzas', 'Bebidas'].map((x, i) => (
            <div key={x} style={{ height: 38, padding: '0 15px', borderRadius: 99, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, background: i === 0 ? c.boton : 'transparent', color: i === 0 ? '#141312' : c.texto, border: i === 0 ? 'none' : `1px solid ${c.borde}` }}>{x}</div>
          ))}
        </div>
        {PLATOS_CARTA.map((p, i) => (
          <TarjetaPlato key={p.id} plato={p} y={230 + i * 162} cuenta={cuentas[i]} tapEn={g.agrega.find(([j]) => j === i)?.[1]} />
        ))}
        {piezas > 0 && (
          <div style={{ position: 'absolute', left: 12, right: 12, top: 690, height: 62, borderRadius: 99, background: c.boton, color: '#141312', display: 'flex', alignItems: 'center', padding: '0 8px', gap: 12, fontSize: 18, fontWeight: 700, transform: `translateY(${(1 - barra) * 120}px) scale(${f >= g.tapCarrito && f < g.tapCarrito + 4 ? 0.97 : 1})`, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
            <span style={{ width: 46, height: 46, borderRadius: 99, background: '#DEDAD3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{piezas}</span>
            <span style={{ flex: 1 }}>Ver carrito</span>
            <span style={{ ...mono, marginRight: 14 }}>{dinero(total)}</span>
          </div>
        )}
        {/* navegación inferior del comensal */}
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 12, height: 64, borderRadius: 26, background: '#1E1C1B', border: `1px solid ${c.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'space-around', fontSize: 13, color: c.texto2 }}>
          {['Menú', 'Pedidos', 'Mis puntos', 'Cuenta'].map((x, i) => (
            <span key={x} style={i === 0 ? { background: c.boton, color: '#141312', padding: '8px 18px', borderRadius: 16, fontWeight: 700 } : {}}>{x}</span>
          ))}
        </div>
      </div>

      {/* Carrito / checkout */}
      {hoja > 0 && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.5 * hoja})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: g.modo === 'mesa' ? 360 : 210, background: '#1E1C1B', borderRadius: '28px 28px 0 0', borderTop: `1px solid ${c.borde}`, transform: `translateY(${(1 - hoja) * 640}px)`, padding: '0 18px' }}>
            <div style={{ width: 40, height: 5, borderRadius: 9, background: 'rgba(255,255,255,.2)', margin: '10px auto 0' }} />
            <div style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: 24, marginTop: 14, letterSpacing: -0.5 }}>Tu pedido</div>
            <div style={{ fontSize: 14, color: c.texto2, marginTop: 2 }}>{g.modo === 'mesa' ? 'Para la Mesa 2' : 'A domicilio'}</div>
            {g.modo === 'domicilio' && (
              <div style={{ marginTop: 14 }}>
                <Mapa alto={150} pin={pin} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 10 }}>
                  <span><b>Entregar en</b> <span style={{ color: c.texto2 }}>4a avenida 12-30, zona 10</span></span>
                </div>
              </div>
            )}
            <div style={{ marginTop: 14, borderTop: `1px solid ${c.borde}` }}>
              {lineas.map((l) => (
                <div key={l.p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${c.borde}`, fontSize: 16 }}>
                  <span>{l.n}× {l.p.n}</span><span style={mono}>{dinero(l.p.p * l.n)}</span>
                </div>
              ))}
              {envio > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${c.borde}`, fontSize: 16, color: c.texto2 }}>
                  <span>Envío · zona 10</span><span style={mono}>{dinero(envio)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', fontSize: 17, fontWeight: 700 }}>
                <span>Total</span><span style={{ ...mono, fontSize: 26 }}>{dinero(total + envio)}</span>
              </div>
            </div>
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 26, height: 58, borderRadius: 18, background: f >= g.tapEnviar ? app.ok : c.boton, color: f >= g.tapEnviar ? '#fff' : '#141312', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 18, fontWeight: 700, transform: `scale(${f >= g.tapEnviar && f < g.tapEnviar + 4 ? 0.97 : 1})` }}>
              {f >= g.tapEnviar ? <><Check size={20} color="#fff" /> Pedido enviado</> : <>Enviar pedido · <span style={mono}>{dinero(total + envio)}</span></>}
            </div>
          </div>
        </>
      )}

      {/* Seguimiento en vivo */}
      {seg > 0 && (
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - seg) * 30}%)`, opacity: seg }}>
          <div style={{ position: 'absolute', top: 62, left: 18, display: 'flex', alignItems: 'center', gap: 6, color: c.texto2, fontSize: 15 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.texto2} strokeWidth="2.4" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg> Volver al menú
          </div>
          <div style={{ position: 'absolute', top: 96, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: fuente.titular, fontWeight: 800, fontSize: 38, letterSpacing: -1.5 }}>Tu pedido</span>
            <span style={{ ...mono, fontSize: 13, color: c.texto2 }}>#{g.modo === 'mesa' ? 488 : 491}</span>
          </div>
          <div style={{ position: 'absolute', top: 146, left: 18, fontSize: 15, color: c.texto2, fontStyle: 'italic' }}>El estado se actualiza solo, en vivo.</div>
          <div style={{ position: 'absolute', top: 186, left: 14, right: 14, borderRadius: 22, border: `1px solid ${c.borde}`, background: '#1E1C1B', padding: '14px 18px' }}>
            {pasos.map((p, i) => {
              const ok = hecho(i);
              const esActual = i === actual;
              const brilla = i === 3 && golpeUltimo > 0;
              return (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 62, opacity: ok || esActual ? 1 : 0.4 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: esActual ? c.boton : ok ? '#3A3836' : '#151413', border: `1px solid ${c.borde}`, transform: brilla ? `scale(${lerp(1.5, 1, golpeUltimo)})` : undefined, boxShadow: brilla ? `0 0 ${30 * (1 - prog(f, g.ultimo, g.ultimo + 40))}px ${c.marca}` : undefined }}>
                    {ok || esActual ? <Check size={20} color={esActual ? '#141312' : c.texto} /> : null}
                  </div>
                  <span style={{ flex: 1, fontSize: 18, fontWeight: esActual ? 800 : 600 }}>{p}</span>
                  {ok && <span style={{ ...mono, fontSize: 14, color: c.texto2 }}>8:{String(12 + Math.min(i, 3) * 2).padStart(2, '0')}</span>}
                </div>
              );
            })}
          </div>
          {g.modo === 'domicilio' ? (
            <div style={{ position: 'absolute', top: 534, left: 14, right: 14 }}>
              <Mapa alto={190} pin={1} ruta={f >= g.ultimo ? easeIO(prog(f, g.ultimo, g.ultimo + 40)) : 0} />
              <div style={{ fontSize: 15, color: c.texto2, marginTop: 10 }}>{f >= g.ultimo ? 'Tu pedido va en camino a zona 10.' : 'Te avisamos cuando salga.'}</div>
            </div>
          ) : (
            <div style={{ position: 'absolute', top: 534, left: 14, right: 14, borderRadius: 22, border: `1px solid ${c.borde}`, background: '#1E1C1B', padding: '6px 18px' }}>
              {lineas.map((l) => (
                <div key={l.p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${c.borde}`, fontSize: 16 }}>
                  <span>{l.n}× {l.p.n}</span><span style={mono}>{dinero(l.p.p * l.n)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 17, fontWeight: 700 }}><span>Total</span><span style={{ ...mono, fontSize: 22 }}>{dinero(total)}</span></div>
            </div>
          )}
        </div>
      )}

      {g.agrega.map(([j, en]) => <Toque key={en} en={en} x={341} y={230 + j * 162 + 115} />)}
      <Toque en={g.tapCarrito} x={200} y={721} />
      <Toque en={g.tapEnviar} x={195} y={789} />
    </div>
  );
};

// ── «En vivo» del mostrador (tableta) ────────────────────────────────────
export type GuionMostrador = {
  modo: 'mesa' | 'domicilio';
  llega: number;
  tapCocina: number;
  tapFinal: number;
  final: number;
  lineas: string[];
  total: number;
};

const TarjetaVivo: React.FC<{ num: number; etiqueta: string; estado: string; tono: 'nuevo' | 'cocina' | 'listo'; lineas: string[]; total: number; boton?: string; tapEn?: number; detalle: string; min: number }> = ({ num, etiqueta, estado, tono, lineas, total, boton, tapEn, detalle, min }) => {
  const f = useCurrentFrame();
  const colores = {
    nuevo: { bg: '#E3ECFB', fg: '#1F4FB0', bd: '#B9CCF2' },
    cocina: { bg: '#FBEBD9', fg: '#8A4B0E', bd: '#F0CDA6' },
    listo: { bg: app.okSuave, fg: app.ok, bd: '#B6DEC6' },
  }[tono];
  return (
    <div style={{ background: app.tarjeta, borderRadius: 20, border: `1px solid ${app.borde}`, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: app.coral, textDecoration: 'underline', textUnderlineOffset: 4 }}>#{num}</span>
        <span style={{ height: 32, padding: '0 12px', borderRadius: 99, background: colores.bg, color: colores.fg, border: `1px solid ${colores.bd}`, display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 700 }}>{tono === 'listo' && <Check size={14} color={colores.fg} />}{estado}</span>
        <span style={{ flex: 1 }} />
        <span style={{ height: 32, padding: '0 12px', borderRadius: 99, background: app.okSuave, color: app.ok, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>{min} min</span>
      </div>
      <div style={{ fontSize: 15, color: app.tinta2, marginTop: 8 }}>{etiqueta} · {detalle}</div>
      <div style={{ marginTop: 8, borderTop: `1px solid ${app.borde}` }}>
        {lineas.map((l) => <div key={l} style={{ fontSize: 18, padding: '7px 0', borderBottom: `1px solid ${app.borde}` }}>{l}</div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <span style={{ fontSize: 16, color: app.tinta2 }}>Total</span><span style={{ ...mono, fontSize: 22, fontWeight: 700 }}>{dinero(total)}</span>
      </div>
      {boton && (
        <div style={{ marginTop: 12, height: 54, borderRadius: 14, background: app.coral, color: '#fff', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${tapEn !== undefined && f >= tapEn && f < tapEn + 4 ? 0.97 : 1})` }}>{boton}</div>
      )}
    </div>
  );
};

export const PantallaMostrador: React.FC<{ g: GuionMostrador }> = ({ g }) => {
  const f = useCurrentFrame();
  const entra = pop(prog(f, g.llega, g.llega + 12));
  const anillo = 1 - prog(f, g.llega + 6, g.llega + 70);
  const mueve = easeIO(prog(f, g.tapCocina + 2, g.tapCocina + 16));
  const enCocina = f >= g.tapCocina + 2;
  const fin = f >= g.final;
  const etiqueta = g.modo === 'mesa' ? 'En local · QR en mesa' : 'A domicilio · zona 10';
  const detalle = g.modo === 'mesa' ? 'Mesa 2' : 'Andrea M.';
  const num = g.modo === 'mesa' ? 488 : 491;
  const min = Math.max(0, Math.floor((f - g.llega) / 30));
  const ultimo = g.modo === 'mesa' ? 'Marcar listo' : 'Salió a entregar';
  const finTexto = g.modo === 'mesa' ? 'Listo' : 'En camino';
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 76, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, background: app.tarjeta, borderBottom: `1px solid ${app.borde}` }}>
        <div style={{ fontFamily: fuente.titular, fontSize: 26, fontWeight: 800, marginRight: 12 }}>Pedidos</div>
        {['En vivo', 'Cocina'].map((e, i) => (
          <div key={e} style={{ height: 42, padding: '0 16px', borderRadius: 12, display: 'flex', alignItems: 'center', fontSize: 17, background: i === 0 ? app.tinta : app.tarjeta, color: i === 0 ? '#fff' : app.tinta, border: i ? `1px solid ${app.borde}` : 'none' }}>{e}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 18, color: app.tinta2, ...mono }}>8:12 p. m.</div>
      </div>
      {/* columnas */}
      <div style={{ position: 'absolute', top: 96, left: 24, width: 554, fontSize: 20, fontWeight: 700 }}>Por enviar a cocina <span style={{ color: app.tinta3 }}>{f >= g.llega && !enCocina ? 1 : 0}</span></div>
      <div style={{ position: 'absolute', top: 96, left: 602, width: 554, fontSize: 20, fontWeight: 700 }}>{g.modo === 'mesa' ? 'En cocina' : 'En cocina y en camino'} <span style={{ color: app.tinta3 }}>{enCocina ? 3 : 2}</span></div>
      {f < g.llega && (
        <div style={{ position: 'absolute', top: 136, left: 24, width: 554, height: 300, borderRadius: 20, border: `2px dashed ${app.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: app.tinta3, fontSize: 18 }}>Aquí aparecen los pedidos nuevos</div>
      )}
      {/* los de siempre, en la columna derecha (se recorren cuando llega el nuevo) */}
      <div style={{ position: 'absolute', top: 136 + mueve * 330, left: 602, width: 554, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TarjetaVivo num={486} tono="cocina" estado="En cocina" etiqueta={g.modo === 'mesa' ? 'En local · QR en mesa' : 'Para llevar'} detalle={g.modo === 'mesa' ? 'Mesa 5' : 'Carlos'} lineas={['1× Lasaña de la Casa', '1× Cheesecake de Fresa']} total={98} min={6} />
      </div>
      {f >= g.llega && (
        <div style={{ position: 'absolute', top: lerp(136, 136, mueve), left: lerp(24, 602, mueve), width: 554, transform: `scale(${0.86 + 0.14 * entra})`, opacity: clamp(entra * 1.5), borderRadius: 22, boxShadow: anillo > 0 ? `0 0 0 ${5 * anillo}px rgba(232,83,74,${anillo}), 0 0 ${50 * anillo}px rgba(245,160,48,${0.8 * anillo})` : undefined }}>
          <TarjetaVivo
            num={num}
            tono={fin ? 'listo' : enCocina ? 'cocina' : 'nuevo'}
            estado={fin ? finTexto : enCocina ? 'En cocina' : 'Sin enviar a cocina'}
            etiqueta={etiqueta}
            detalle={detalle}
            lineas={g.lineas}
            total={g.total}
            min={min}
            boton={fin ? undefined : enCocina ? ultimo : 'Enviar a cocina'}
            tapEn={enCocina ? g.tapFinal : g.tapCocina}
          />
        </div>
      )}
      <Toque en={g.tapCocina} x={301} y={376} />
      <Toque en={g.tapFinal} x={879} y={376} />
    </div>
  );
};
