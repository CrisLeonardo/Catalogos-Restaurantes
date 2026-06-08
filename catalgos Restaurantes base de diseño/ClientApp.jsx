// ClientApp.jsx — Azúcar Negra mobile ordering app (client side).
const { useState: useCS, useReducer: useCR, useRef: useCRef, useEffect: useCE, useMemo: useCM } = React;

// ─────────────────────────────────────────────────────────────
// Phone frame
// ─────────────────────────────────────────────────────────────
function Phone({ children }) {
  return (
    <div style={{
      width: 392, height: 800, maxHeight: '92vh', position: 'relative', flexShrink: 0,
      borderRadius: 54, padding: 11,
      background: 'linear-gradient(150deg, #34343a, #0e0e10 55%, #2a2a30)',
      boxShadow: '0 40px 90px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.25), 0 0 0 1px rgba(0,0,0,0.6)',
    }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden',
        background: '#0b0b0c', boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.8)',
      }}>
        {/* dynamic island */}
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 108, height: 30, background: '#000', borderRadius: 99, zIndex: 50,
        }} />
        {children}
      </div>
    </div>
  );
}

function StatusBar({ dark }) {
  const c = dark ? '#0b0b0c' : 'var(--u-text)';
  return (
    <div style={{
      height: 50, padding: '0 28px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0, position: 'relative', zIndex: 40,
    }}>
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, color: c }}>9:41</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: c }}>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="4.5" width="3" height="7.5" rx="1"/><rect x="9" y="2" width="3" height="10" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.4"/></svg>
        <svg width="22" height="12" viewBox="0 0 22 12" fill="none"><rect x="1" y="1" width="18" height="10" rx="2.5" stroke="currentColor" strokeOpacity="0.5"/><rect x="2.5" y="2.5" width="13" height="7" rx="1.3" fill="currentColor"/><rect x="20" y="4" width="1.5" height="4" rx="0.75" fill="currentColor"/></svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────
function cartReducer(state, a) {
  switch (a.type) {
    case 'nav':    return { ...state, screen: a.screen, sel: a.sel ?? state.sel, dir: a.dir || 'fwd' };
    case 'add':    return { ...state, cart: { ...state.cart, [a.id]: (state.cart[a.id] || 0) + (a.q || 1) } };
    case 'set': {  const c = { ...state.cart }; if (a.q <= 0) delete c[a.id]; else c[a.id] = a.q; return { ...state, cart: c }; }
    case 'field':  return { ...state, form: { ...state.form, [a.k]: a.v } };
    case 'reset':  return { ...state, cart: {}, screen: 'catalogo' };
    default: return state;
  }
}
const initCart = {
  screen: 'portada', sel: null, dir: 'fwd', cart: {},
  form: { nombre: '', tel: '', tipo: 'domicilio', dir: '', notas: '' },
};

// ─────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────
function ClientApp({ store, tweaks }) {
  const [s, dispatch] = useCR(cartReducer, initCart);
  const cartIconRef = useCRef(null);
  const count = Object.values(s.cart).reduce((a, b) => a + b, 0);
  const subtotal = Object.entries(s.cart).reduce((t, [id, q]) => t + AZ.getProduct(+id).price * q, 0);

  // flying add-to-cart dot
  const fly = (fromEl) => {
    const target = cartIconRef.current;
    if (!fromEl || !target) return;
    const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: a.left + a.width / 2 - 9 + 'px', top: a.top + a.height / 2 - 9 + 'px',
      width: '18px', height: '18px', borderRadius: '50%', zIndex: 9999, pointerEvents: 'none',
      background: 'radial-gradient(circle at 35% 30%, #fff, #cbc8c0)', boxShadow: '0 4px 14px rgba(255,255,255,0.4)',
    });
    document.body.appendChild(dot);
    dot.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${(b.left + b.width / 2 - a.left - a.width / 2) * 0.5}px, ${(a.top - b.top) * -0.3 - 60}px) scale(1.3)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(0.2)`, opacity: 0.5 },
    ], { duration: 620, easing: 'cubic-bezier(0.5,0,0.3,1)' }).onfinish = () => dot.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(0.16,1,0.3,1)' });
  };

  const addToCart = (id, fromEl, q = 1) => { dispatch({ type: 'add', id, q }); fly(fromEl); };

  const CS = window.CS;
  const screens = {
    portada:      <Portada dispatch={dispatch} tweaks={tweaks} />,
    catalogo:     <CS.Catalogo s={s} dispatch={dispatch} addToCart={addToCart} cartIconRef={cartIconRef} count={count} subtotal={subtotal} tweaks={tweaks} />,
    detalle:      <CS.Detalle s={s} dispatch={dispatch} addToCart={addToCart} />,
    carrito:      <CS.Carrito s={s} dispatch={dispatch} subtotal={subtotal} />,
    checkout:     <CS.Checkout s={s} dispatch={dispatch} subtotal={subtotal} store={store} />,
    confirmacion: <CS.Confirmacion s={s} dispatch={dispatch} store={store} />,
  };

  return (
    <Phone>
      <StatusBar dark={false} />
      <div key={s.screen} className="u-scroll"
        style={{ position: 'absolute', inset: 0, top: 50, overflowY: 'auto', overflowX: 'hidden',
          animation: `${s.dir === 'back' ? 'cl-slide-back' : 'cl-slide-fwd'} 360ms var(--ease-entry)` }}>
        {screens[s.screen]}
      </div>
      <style>{`
        @keyframes cl-slide-fwd { from { transform: translateX(24px); } to { transform: translateX(0); } }
        @keyframes cl-slide-back { from { transform: translateX(-24px); } to { transform: translateX(0); } }
      `}</style>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Portada (3 variants via tweaks.portada)
// ─────────────────────────────────────────────────────────────
function Portada({ dispatch, tweaks }) {
  const go = () => dispatch({ type: 'nav', screen: 'catalogo' });
  const variant = tweaks.portada || 'spotlight';
  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="asphalt" style={{ position: 'absolute' }} />
      {variant === 'spotlight' && <PortadaSpotlight go={go} />}
      {variant === 'poster' && <PortadaPoster go={go} />}
      {variant === 'stack' && <PortadaStack go={go} />}
    </div>
  );
}

function OpenBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
      background: 'rgba(255,255,255,0.08)', border: '1px solid var(--u-hair-2)', backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: '#fff', boxShadow: '0 0 8px #fff', animation: 'pulse-ring 2.2s infinite' }} />
      Abierto ahora · Zona 1
    </span>
  );
}

function PortadaSpotlight({ go }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 30px 40px', textAlign: 'center', gap: 20 }}>
      <div style={{ position: 'absolute', top: '20%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.16), transparent 65%)', filter: 'blur(8px)' }} />
      <div className="anim-pop" style={{ position: 'relative', animation: 'bob 5s ease-in-out infinite' }}>
        <G.Mark size={186} />
      </div>
      <div className="anim-fade-up" style={{ animationDelay: '120ms' }}>
        <div className="t-display" style={{ fontSize: 46, lineHeight: 0.92 }}>AZÚCAR<br/>NEGRA</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--u-text-2)', marginTop: 12 }}>Cafetería con sabor a calle</div>
      </div>
      <div className="anim-fade-up" style={{ animationDelay: '240ms', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', width: '100%' }}>
        <OpenBadge />
        <G.Btn variant="white" size="lg" full iconRight="arrowRight" onClick={go} style={{ marginTop: 4 }}>Ver el menú</G.Btn>
      </div>
    </div>
  );
}

function PortadaPoster({ go }) {
  return (
    <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 24px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="anim-fade-in">
        <OpenBadge />
        <G.Mark size={46} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="t-poster anim-fade-up" style={{ fontSize: 15, letterSpacing: '0.3em', color: 'var(--u-text-3)' }}>EST · GUATEMALA</div>
        <div className="t-poster anim-fade-up" style={{ animationDelay: '80ms', fontSize: 96, lineHeight: 0.84, marginTop: 6, marginLeft: -3 }}>AZÚ<br/>CAR<br/>NE<br/>GRA</div>
        <div className="anim-fade-up" style={{ animationDelay: '180ms', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--u-text-2)', marginTop: 18 }}>Bagels, café de barrio<br/>y sabor a calle.</div>
      </div>
      <G.Btn variant="white" size="lg" full iconRight="arrowRight" onClick={go} className="anim-fade-up" style={{ animationDelay: '260ms' }}>Empezar pedido</G.Btn>
    </div>
  );
}

function PortadaStack({ go }) {
  const feats = [
    { t: 'Bagels horneados al momento', i: 'bagel' },
    { t: 'Café de especialidad', i: 'coffee' },
    { t: 'Domicilio en Zona 1', i: 'truck' },
  ];
  return (
    <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 24px 34px', gap: 18 }}>
      <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <G.Mark size={96} style={{ animation: 'bob 6s ease-in-out infinite' }} />
        <div className="t-display" style={{ fontSize: 34, textAlign: 'center' }}>AZÚCAR NEGRA</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--u-text-2)' }}>Cafetería con sabor a calle</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, justifyContent: 'center' }}>
        {feats.map((f, i) => (
          <G.Glass key={i} className="anim-fade-up" style={{ animationDelay: `${120 + i * 90}ms`, padding: '15px 16px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)', color: 'var(--u-text)' }}><Icon name={f.i} size={20} /></div>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--u-text)' }}>{f.t}</span>
          </G.Glass>
        ))}
      </div>
      <G.Btn variant="white" size="lg" full iconRight="arrowRight" onClick={go} className="anim-fade-up" style={{ animationDelay: '420ms' }}>Ver el menú</G.Btn>
    </div>
  );
}

window.ClientApp = ClientApp;
window.ClientPieces = { Phone, StatusBar };
