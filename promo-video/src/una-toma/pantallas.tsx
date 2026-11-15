// Las cuatro pantallas por las que pasa el pedido. Reproducen la app real
// (panel claro, Geist, coral de acción) con los datos de Rincón 502.
import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { app, clamp, dinero, easeIO, easeOut, lerp, pop, prog, T } from './base';
import { Check, Toque } from './dispositivos';
import { fuente } from '../marca';

const mono: React.CSSProperties = { fontFamily: fuente.cifras, fontVariantNumeric: 'tabular-nums' };

const Chevron: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={app.tinta} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
);

// ── 1 · Mesero: Tomar pedido de la Mesa 4 ────────────────────────────────
const PLATOS = [
  { id: 'rincon-clasica', n: 'Rincón Clásica', p: 52 },
  { id: 'doble-bacon', n: 'Doble Bacon', p: 68 },
  { id: 'pizza-pepperoni', n: 'Pepperoni (mediana)', p: 85 },
  { id: 'alitas-bbq', n: 'Alitas BBQ', p: 58 },
  { id: 'papas-con-queso', n: 'Papas con queso', p: 32 },
  { id: 'limonada-con-menta', n: 'Limonada con Menta', p: 18 },
];

export const PantallaMesero: React.FC = () => {
  const f = useCurrentFrame();
  const m = T.mesero;
  const hoja = f < m.tapAgregar + 2 ? easeOut(prog(f, m.hoja, m.hoja + 10)) : 1 - easeIO(prog(f, m.tapAgregar + 2, m.tapAgregar + 11));
  const medio = f >= m.tapMedio;
  const nota = 'Sin cebolla'.slice(0, Math.floor(clamp((f - m.notaDesde) / (m.notaHasta - m.notaDesde)) * 11));
  const cant = f >= m.tapMas ? 2 : 1;
  const barra = pop(prog(f, m.barra, m.barra + 10));
  const enviado = f >= m.tapEnviar + 4;
  const flash = f >= m.tapEnviar ? 1 - prog(f, m.tapEnviar, m.tapEnviar + 14) : 0;
  const tocado = f >= m.tapPlato && f < m.tapPlato + 5 ? 0.96 : 1;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Encabezado */}
      <div style={{ position: 'absolute', top: 58, left: 14, right: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Chevron size={26} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Mesa 4</div>
          <div style={{ fontSize: 14, color: app.tinta2, marginTop: 1 }}>Comer aquí · 2 personas</div>
        </div>
        <div style={{ height: 36, padding: '0 12px', borderRadius: 99, background: app.tarjeta, border: `1px solid ${app.borde}`, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>Ana</div>
      </div>
      {/* Categorías */}
      <div style={{ position: 'absolute', top: 136, left: 16, display: 'flex', gap: 8, whiteSpace: 'nowrap' }}>
        {['Hamburguesas', 'Pizzas', 'Bebidas', 'Entradas'].map((c, i) => (
          <div key={c} style={{ height: 38, padding: '0 15px', borderRadius: 99, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600, background: i === 0 ? app.tinta : app.tarjeta, color: i === 0 ? '#fff' : app.tinta, border: i === 0 ? 'none' : `1px solid ${app.borde}` }}>{c}</div>
        ))}
      </div>
      {/* Carta con fotos */}
      <div style={{ position: 'absolute', top: 190, left: 16, width: 358, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {PLATOS.map((p, i) => (
          <div key={p.id} style={{ background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, overflow: 'hidden', position: 'relative', transform: i === 0 ? `scale(${tocado})` : undefined, boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
            <Img src={staticFile(`una-toma/platos/${p.id}.webp`)} style={{ width: '100%', height: 118, objectFit: 'cover', display: 'block', background: '#2a2522' }} />
            <div style={{ padding: '9px 12px 11px' }}>
              <div style={{ fontSize: 15, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n}</div>
              <div style={{ ...mono, fontSize: 14, color: app.tinta2, marginTop: 2 }}>{dinero(p.p)}</div>
            </div>
            {i === 0 && f >= m.barra && (
              <div style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 99, background: app.coral, color: '#fff', fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${barra})` }}>2</div>
            )}
          </div>
        ))}
      </div>
      {/* Barra del pedido */}
      {f >= m.barra && (
        <div style={{ position: 'absolute', left: 16, right: 16, top: 764, height: 58, borderRadius: 16, background: enviado ? app.ok : app.coral, color: '#fff', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 12, fontSize: 18, fontWeight: 700, transform: `translateY(${(1 - barra) * 90}px) scale(${f >= m.tapEnviar && f < m.tapEnviar + 4 ? 0.97 : 1})`, boxShadow: `0 10px 26px rgba(194,84,47,.35), 0 0 0 ${10 * flash}px rgba(245,160,48,${0.5 * flash})` }}>
          {enviado ? (
            <><Check size={22} color="#fff" /> <span style={{ flex: 1 }}>Enviado a cocina</span></>
          ) : (
            <>
              <span style={{ width: 28, height: 28, borderRadius: 99, background: 'rgba(255,255,255,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>2</span>
              <span style={{ flex: 1 }}>Enviar a cocina</span>
              <span style={{ ...mono, fontSize: 17 }}>Q104.00</span>
            </>
          )}
        </div>
      )}
      {/* Hoja de opciones del plato */}
      {hoja > 0 && (
        <>
          <div style={{ position: 'absolute', inset: 0, background: `rgba(10,10,12,${0.38 * hoja})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: 318, bottom: 0, background: app.tarjeta, borderRadius: '28px 28px 0 0', transform: `translateY(${(1 - hoja) * 540}px)`, padding: '0 16px', boxShadow: '0 -10px 30px rgba(0,0,0,.15)' }}>
            <div style={{ width: 40, height: 5, borderRadius: 9, background: app.borde, margin: '10px auto 0' }} />
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 16 }}>
              <Img src={staticFile('una-toma/platos/rincon-clasica.webp')} style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }} />
              <div>
                <div style={{ fontSize: 21, fontWeight: 800 }}>Rincón Clásica</div>
                <div style={{ ...mono, fontSize: 15, color: app.tinta2 }}>Q52.00</div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: app.tinta2, marginTop: 20 }}>Término</div>
            <div style={{ display: 'flex', marginTop: 8, background: app.fondo, borderRadius: 14, padding: 4, gap: 4 }}>
              {['Tres cuartos', 'Medio', 'Bien cocido'].map((o) => {
                const sel = o === 'Medio' && medio;
                return (
                  <div key={o} style={{ flex: 1, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 15, fontWeight: sel ? 700 : 500, background: sel ? app.tarjeta : 'transparent', color: sel ? app.coral : app.tinta2, boxShadow: sel ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>
                    {sel && <Check size={16} color={app.coral} />}{o}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: app.tinta2, marginTop: 18 }}>Nota para cocina</div>
            <div style={{ marginTop: 8, height: 48, borderRadius: 12, border: `1.5px solid ${f >= m.notaDesde - 4 ? app.coral : app.borde}`, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 17, fontWeight: 600 }}>
              {nota || <span style={{ color: app.tinta3, fontWeight: 400 }}>Ej.: sin cebolla</span>}
              {f >= m.notaDesde - 4 && f < m.tapMas && Math.floor(f / 8) % 2 === 0 && <span style={{ width: 2, height: 22, background: app.coral, marginLeft: 1 }} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
              <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>Cantidad</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 44, height: 44, borderRadius: 99, border: `1px solid ${app.borde}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: app.tinta2 }}>–</div>
                <div style={{ ...mono, width: 40, textAlign: 'center', fontSize: 22, fontWeight: 700, transform: `scale(${f >= m.tapMas ? 1 + 0.35 * (1 - prog(f, m.tapMas, m.tapMas + 8)) : 1})` }}>{cant}</div>
                <div style={{ width: 44, height: 44, borderRadius: 99, background: app.coralSuave, color: app.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 600 }}>+</div>
              </div>
            </div>
            <div style={{ position: 'absolute', left: 16, right: 16, top: 442, height: 56, borderRadius: 16, background: app.coral, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, transform: `scale(${f >= m.tapAgregar && f < m.tapAgregar + 4 ? 0.97 : 1})` }}>
              Agregar {cant} · <span style={{ ...mono, marginLeft: 6 }}>{dinero(52 * cant)}</span>
            </div>
          </div>
        </>
      )}
      <Toque en={m.tapPlato} x={102} y={258} />
      <Toque en={m.tapMedio} x={195} y={484} />
      <Toque en={m.tapMas} x={352} y={641} />
      <Toque en={m.tapAgregar} x={195} y={788} />
      <Toque en={m.tapEnviar} x={210} y={793} />
    </div>
  );
};

// ── 2 · Cocina: la tableta del pase ──────────────────────────────────────
type Linea = { c: number; n: string; extra?: string[]; nota?: string };
const TarjetaCocina: React.FC<{ mesa: string; num: number; min: number; lineas: Linea[]; x: number; y: number; nueva?: boolean }> = ({ mesa, num, min, lineas, x, y, nueva }) => {
  const f = useCurrentFrame();
  const c = T.cocina;
  const seg = nueva ? Math.max(0, Math.floor((f - c.llega) / 30)) : min * 60 + 56 + Math.floor((f - c.llega) / 30);
  const reloj = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  const listo = nueva && f >= c.listo;
  const entra = nueva ? pop(prog(f, c.llega, c.llega + 12)) : 1;
  const anillo = nueva ? 1 - prog(f, c.llega + 6, c.llega + 70) : 0;
  if (nueva && f < c.llega) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 554, height: 320, background: app.tarjeta, borderRadius: 20, border: `1px solid ${app.borde}`, overflow: 'hidden', transform: `scale(${0.86 + 0.14 * entra})`, opacity: clamp(entra * 1.5), boxShadow: `0 1px 3px rgba(0,0,0,.06), 0 0 0 ${5 * anillo}px rgba(232,83,74,${anillo}), 0 0 ${50 * anillo}px rgba(245,160,48,${0.8 * anillo})` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 22px 14px', borderBottom: `1px solid ${app.borde}`, background: listo ? app.okSuave : app.tarjeta }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 500, letterSpacing: -0.5 }}>{mesa}</div>
          <div style={{ fontSize: 16, color: app.tinta3 }}>#{num}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 800, ...mono, color: listo ? app.ok : app.tinta }}>{reloj}</div>
          <div style={{ fontSize: 15, color: listo ? app.ok : app.tinta2, fontWeight: listo ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>{listo && <Check size={16} color={app.ok} />}{listo ? 'Listo' : 'En preparación'}</div>
        </div>
      </div>
      <div style={{ padding: '12px 22px' }}>
        {lineas.map((l, i) => (
          <div key={i} style={{ padding: '7px 0', borderTop: i ? `1px solid ${app.borde}` : 'none' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}><span style={{ color: app.coral }}>{l.c}×</span> {l.n}</div>
            {l.extra?.map((e) => <div key={e} style={{ fontSize: 17, color: app.tinta2, marginLeft: 36 }}>{e}</div>)}
            {l.nota && <div style={{ fontSize: 18, color: app.aviso, fontWeight: 800, marginLeft: 36, marginTop: 2 }}>Nota · {l.nota}</div>}
          </div>
        ))}
      </div>
      {nueva && (
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, height: 56, borderRadius: 14, background: listo ? app.ok : app.coral, color: '#fff', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transform: `scale(${f >= c.tapListo && f < c.tapListo + 4 ? 0.97 : 1})` }}>
          {listo ? <><Check size={20} color="#fff" /> Listo para servir</> : 'Marcar listo'}
        </div>
      )}
    </div>
  );
};

export const PantallaCocina: React.FC = () => {
  const c = T.cocina;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 76, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, background: app.tarjeta, borderBottom: `1px solid ${app.borde}` }}>
        <div style={{ fontFamily: fuente.titular, fontSize: 26, fontWeight: 800, marginRight: 12 }}>Cocina</div>
        {['Pase · 4', 'Cocina caliente · 4', 'Barra'].map((e, i) => (
          <div key={e} style={{ height: 42, padding: '0 16px', borderRadius: 12, display: 'flex', alignItems: 'center', fontSize: 17, background: i === 0 ? app.tinta : app.tarjeta, color: i === 0 ? '#fff' : app.tinta, border: i ? `1px solid ${app.borde}` : 'none' }}>{e}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 18, color: app.tinta2, ...mono }}>8:15 p. m.</div>
      </div>
      <TarjetaCocina mesa="Mesa 7" num={485} min={7} x={24} y={96} lineas={[{ c: 2, n: 'Malteada varios sabores' }, { c: 2, n: 'Doble Bacon' }, { c: 1, n: 'Papas con queso' }]} />
      <TarjetaCocina mesa="Para llevar" num={484} min={5} x={602} y={96} lineas={[{ c: 1, n: 'Pepperoni (mediana)' }, { c: 2, n: 'Limonada con Menta' }]} />
      <TarjetaCocina mesa="Domicilio" num={486} min={3} x={24} y={440} lineas={[{ c: 1, n: 'Lasaña de la Casa' }, { c: 1, n: 'Cheesecake de Fresa' }]} />
      <TarjetaCocina nueva mesa="Mesa 4" num={487} min={0} x={602} y={440} lineas={[{ c: 2, n: 'Rincón Clásica', extra: ['Término · Medio'], nota: 'Sin cebolla' }]} />
      <Toque en={c.tapListo} x={879} y={716} />
    </div>
  );
};

// ── 3 · Caja: cobrar y cuadrar ───────────────────────────────────────────
export const PantallaCaja: React.FC = () => {
  const f = useCurrentFrame();
  const c = T.caja;
  const paso = easeIO(prog(f, c.corte, c.corte + 12));
  const cobrado = f >= c.cobrado;
  const contado = 1847.5 * easeOut(prog(f, c.cuentaDesde, c.cuentaHasta));
  const sello = pop(prog(f, c.cuadra, c.cuadra + 12));
  const fila = (a: string, b: React.ReactNode, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '13px 0', borderTop: `1px solid ${app.borde}` }}>
      <span style={{ fontSize: 16, color: fuerte ? app.tinta : app.tinta2, fontWeight: fuerte ? 700 : 400 }}>{a}</span>
      <span style={{ ...mono, fontSize: fuerte ? 22 : 18, fontWeight: 700 }}>{b}</span>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {/* A · Cobrar */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-paso * 100}%)` }}>
        <div style={{ position: 'absolute', top: 60, left: 14, right: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Chevron size={26} />
          <div style={{ flex: 1, fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Cobrar</div>
          <div style={{ height: 36, padding: '0 12px', borderRadius: 99, background: app.tarjeta, border: `1px solid ${app.borde}`, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>Mesa 4</div>
        </div>
        <div style={{ position: 'absolute', top: 124, left: 16, right: 16, background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 600 }}><span>2× Rincón Clásica</span><span style={mono}>Q104.00</span></div>
          <div style={{ fontSize: 14, color: app.tinta2, marginTop: 2 }}>Medio · Sin cebolla</div>
          <div style={{ height: 1, background: app.borde, margin: '14px 0' }} />
          <div style={{ fontSize: 15, color: app.tinta2 }}>Total</div>
          <div style={{ ...mono, fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>Q104.00</div>
        </div>
        <div style={{ position: 'absolute', top: 330, left: 16, right: 16, display: 'flex', background: '#E9E7E3', borderRadius: 14, padding: 4, gap: 4 }}>
          {['Efectivo', 'Tarjeta', 'Transferencia'].map((o, i) => (
            <div key={o} style={{ flex: 1, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: i === 0 ? 700 : 500, background: i === 0 ? app.tarjeta : 'transparent', color: i === 0 ? app.tinta : app.tinta2, boxShadow: i === 0 ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>{o}</div>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 400, left: 16, right: 16, background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, padding: '4px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '13px 0' }}><span style={{ fontSize: 16, color: app.tinta2 }}>Recibe</span><span style={{ ...mono, fontSize: 18, fontWeight: 700 }}>Q200.00</span></div>
          {fila('Vuelto', <span style={{ color: app.ok }}>Q96.00</span>, true)}
        </div>
        <div style={{ position: 'absolute', left: 16, right: 16, top: 760, height: 58, borderRadius: 16, background: cobrado ? app.ok : app.coral, color: '#fff', fontSize: 19, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transform: `scale(${f >= c.tapCobrar && f < c.tapCobrar + 4 ? 0.97 : 1})` }}>
          {cobrado ? <><Check size={22} color="#fff" /> Cobrado</> : <>Cobrar <span style={mono}>Q104.00</span></>}
        </div>
        <Toque en={c.tapCobrar} x={195} y={789} />
      </div>
      {/* B · Corte de caja */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(1 - paso) * 100}%)` }}>
        <div style={{ position: 'absolute', top: 62, left: 18, right: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Corte de caja</div>
          <div style={{ fontSize: 14, color: app.tinta2, marginTop: 2 }}>Turno de la noche · Ana</div>
        </div>
        <div style={{ position: 'absolute', top: 140, left: 16, right: 16, background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, padding: '4px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '13px 0' }}><span style={{ fontSize: 16, color: app.tinta2 }}>Efectivo esperado</span><span style={{ ...mono, fontSize: 18, fontWeight: 700 }}>Q1,847.50</span></div>
          {fila('Contaste', dinero(contado))}
          {fila('Diferencia', <span style={{ color: f >= c.cuadra ? app.ok : app.tinta3 }}>{dinero(Math.max(0, 1847.5 - contado))}</span>, true)}
        </div>
        <div style={{ position: 'absolute', top: 360, left: 16, right: 16, background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, padding: '10px 18px' }}>
          {[['Q200', 8], ['Q100', 2], ['Q20', 2], ['Q5', 1], ['Monedas', '—']].map(([b, n], i) => (
            <div key={String(b)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? `1px solid ${app.borde}` : 'none', fontSize: 16, opacity: clamp((f - c.cuentaDesde - i * 4) / 6) }}>
              <span style={{ fontWeight: 700 }}>{b}</span><span style={{ ...mono, color: app.tinta2 }}>{n === '—' ? 'Q2.50' : `× ${n}`}</span>
            </div>
          ))}
        </div>
        {f >= c.cuadra && (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', justifyContent: 'center' }}>
            <div style={{ height: 82, padding: '0 34px', borderRadius: 99, background: app.okSuave, color: app.ok, border: `3px solid ${app.ok}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: 36, fontWeight: 800, transform: `scale(${lerp(1.9, 1, sello)}) rotate(${lerp(-12, -4, sello)}deg)`, opacity: clamp(sello * 2) }}>
              <Check size={36} color={app.ok} grosor={3.2} /> Cuadra
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 4 · Dueño: Hoy ───────────────────────────────────────────────────────
export const PantallaDuenio: React.FC = () => {
  const f = useCurrentFrame();
  const d = T.duenio;
  const s = easeOut(prog(f, d.suma, d.suma + 22));
  const ventas = 2501.5 + 104 * s;
  const sube = prog(f, d.suma, d.suma + 40);
  const golpe = f >= d.suma ? 1 + 0.06 * Math.sin(Math.PI * prog(f, d.suma, d.suma + 10)) : 1;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 58, left: 22, fontFamily: fuente.titular, fontSize: 30, fontWeight: 800 }}>Hoy</div>
      <div style={{ position: 'absolute', top: 118, left: 22, right: 22, display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
        <span style={{ color: app.tinta2 }}>Sábado, 14 de noviembre</span>
        <span style={{ color: app.coral, fontWeight: 700 }}>Ver mi menú</span>
      </div>
      <div style={{ position: 'absolute', top: 164, left: 22, fontSize: 15, fontWeight: 600, color: app.tinta2 }}>Resumen del día</div>
      <div style={{ position: 'absolute', top: 196, left: 16, right: 16, background: app.tarjeta, borderRadius: 20, border: `1px solid ${app.borde}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
        <div style={{ padding: '18px 20px 16px' }}>
          <div style={{ fontSize: 16, color: app.tinta2 }}>Ventas</div>
          <div style={{ ...mono, fontSize: 42, fontWeight: 600, letterSpacing: -1, marginTop: 4, transformOrigin: 'left center', transform: `scale(${golpe})`, color: f >= d.suma && sube < 0.6 ? app.ok : app.tinta }}>{dinero(ventas)}</div>
          <div style={{ fontSize: 16, marginTop: 4 }}><span style={{ color: app.ok, fontWeight: 700 }}>↑ 30 %</span> <span style={{ color: app.tinta2 }}>vs. un sábado normal</span></div>
        </div>
        <div style={{ display: 'flex', borderTop: `1px solid ${app.borde}` }}>
          <div style={{ flex: 1, padding: '14px 20px', borderRight: `1px solid ${app.borde}` }}>
            <div style={{ fontSize: 15, color: app.tinta2 }}>Pedidos</div>
            <div style={{ ...mono, fontSize: 24, fontWeight: 600, marginTop: 2 }}>{f >= d.suma + 6 ? 23 : 22}</div>
          </div>
          <div style={{ flex: 1, padding: '14px 20px' }}>
            <div style={{ fontSize: 15, color: app.tinta2 }}>Ticket promedio</div>
            <div style={{ ...mono, fontSize: 24, fontWeight: 600, marginTop: 2 }}>{f >= d.suma + 6 ? 'Q113.28' : 'Q113.70'}</div>
          </div>
        </div>
      </div>
      {f >= d.suma && sube < 1 && (
        <div style={{ position: 'absolute', top: 236 - 40 * easeOut(sube), right: 30, height: 34, padding: '0 12px', borderRadius: 99, background: app.okSuave, color: app.ok, fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', opacity: 1 - prog(sube, 0.7, 1), ...mono }}>+Q104.00</div>
      )}
      <div style={{ position: 'absolute', top: 468, left: 16, right: 16, height: 58, background: app.tarjeta, borderRadius: 99, border: `1px solid ${app.borde}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, fontSize: 16 }}>
        <span style={{ color: app.coral, fontSize: 18 }}>★</span> Plato estrella: <b>Rincón Clásica</b>
      </div>
      <div style={{ position: 'absolute', top: 540, left: 16, height: 52, background: app.tarjeta, borderRadius: 99, border: `1px solid ${app.borde}`, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, fontSize: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={app.tinta2} strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> Hora pico: de 7 a 8 p. m.
      </div>
      <div style={{ position: 'absolute', top: 618, left: 22, fontSize: 15, fontWeight: 600, color: app.tinta2 }}>Ahora mismo</div>
      <div style={{ position: 'absolute', top: 650, left: 16, right: 16, background: app.tarjeta, borderRadius: 18, border: `1px solid ${app.borde}`, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
        <span><b>6</b> mesas ocupadas</span><span><b>3</b> en cocina</span>
      </div>
      {/* Navegación inferior del panel */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 82, background: app.tarjeta, borderTop: `1px solid ${app.borde}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 12, fontSize: 11 }}>
        {['Hoy', 'Pedidos', 'Menú', '+', 'Clientes', 'Negocio', 'Ajustes'].map((n, i) =>
          n === '+' ? (
            <div key={n} style={{ width: 52, height: 52, marginTop: -24, borderRadius: 99, background: app.coral, color: '#fff', fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(194,84,47,.35)' }}>+</div>
          ) : (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: i === 0 ? app.coral : app.tinta2, fontWeight: i === 0 ? 700 : 500 }}>
              <div style={{ width: 20, height: 20, borderRadius: i === 0 ? 99 : 5, border: `2px solid ${i === 0 ? app.coral : app.tinta2}` }} />{n}
            </div>
          ),
        )}
      </div>
    </div>
  );
};
