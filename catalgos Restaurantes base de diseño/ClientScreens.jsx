// ClientScreens.jsx — catalog / detail / cart / checkout / confirmation. window.CS
const { useState: useSS, useRef: useSRef } = React;

// ── shared bits ──
function ScreenHead({ title, onBack, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px 6px' }}>
      {onBack && (
        <button className="press glass-quiet" onClick={onBack} style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', color: 'var(--u-text)', border: 'none', cursor: 'pointer' }}>
          <Icon name="chevronLeft" size={20} />
        </button>
      )}
      <div style={{ flex: 1 }}>
        <div className="t-poster" style={{ fontSize: 30, lineHeight: 1 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

function QtyStepper({ value, onMinus, onPlus, size = 'md' }) {
  const d = size === 'lg' ? 40 : 30, r = size === 'lg' ? 13 : 9, ic = size === 'lg' ? 18 : 14;
  return (
    <div className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 4, borderRadius: r + 5 }}>
      <button className="press" onClick={onMinus} style={{ width: d, height: d, borderRadius: r, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="minus" size={ic} /></button>
      <div className="t-mono" style={{ minWidth: size === 'lg' ? 34 : 26, textAlign: 'center', fontSize: size === 'lg' ? 17 : 14, fontWeight: 600, color: 'var(--u-text)' }}>{value}</div>
      <button className="press" onClick={onPlus} style={{ width: d, height: d, borderRadius: r, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={ic} /></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CATALOGO
// ─────────────────────────────────────────────────────────────
function ProductTile({ p, qty, onAdd, onOpen }) {
  return (
    <G.Glass interactive onClick={() => p.avail && onOpen()} style={{ borderRadius: 18, overflow: 'hidden', cursor: p.avail ? 'pointer' : 'default', opacity: p.avail ? 1 : 0.55, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '1.25', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
        <G.BrandPattern icon={p.icon} seed={p.seed} />
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {p.tags.map(t => <G.Tag key={t} kind={t} small />)}
        </div>
        {!p.avail && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,11,12,0.45)', backdropFilter: 'blur(1px)' }}><span className="t-poster" style={{ fontSize: 16, letterSpacing: '0.1em', color: 'var(--u-text-2)' }}>Agotado</span></div>}
      </div>
      <div style={{ padding: '11px 13px 13px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, lineHeight: 1.12, color: 'var(--u-text)', flex: 1 }}>{p.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <G.Price amount={p.price} size={15} />
          {p.avail && (
            qty > 0
              ? <span className="t-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: '#F5F3EF', color: '#0b0b0c', fontWeight: 700, fontSize: 12 }}><Icon name="check" size={11} strokeWidth={3} />{qty}</span>
              : <button className="press btn-white" onClick={(e) => { e.stopPropagation(); onAdd(e.currentTarget); }} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={17} strokeWidth={2.4} /></button>
          )}
        </div>
      </div>
    </G.Glass>
  );
}

function ProductRow({ p, qty, onAdd, onOpen }) {
  return (
    <G.Glass interactive onClick={() => p.avail && onOpen()} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 13, alignItems: 'center', cursor: p.avail ? 'pointer' : 'default', opacity: p.avail ? 1 : 0.55 }}>
      <div style={{ width: 74, height: 74, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.03)', position: 'relative' }}>
        <G.BrandPattern icon={p.icon} seed={p.seed} iconScale={0.9} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--u-text)' }}>{p.name}</div>
          {p.tags.slice(0, 1).map(t => <G.Tag key={t} kind={t} small />)}
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--u-text-3)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.desc}</div>
        <G.Price amount={p.price} size={15} />
      </div>
      {p.avail
        ? (qty > 0
            ? <span className="t-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 11px', borderRadius: 99, background: '#F5F3EF', color: '#0b0b0c', fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}><Icon name="check" size={12} strokeWidth={3} />{qty}</span>
            : <button className="press btn-white" onClick={(e) => { e.stopPropagation(); onAdd(e.currentTarget); }} style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name="plus" size={19} strokeWidth={2.4} /></button>)
        : <span className="t-poster" style={{ fontSize: 12, color: 'var(--u-text-3)', flexShrink: 0, padding: '0 6px' }}>Agotado</span>}
    </G.Glass>
  );
}

function Catalogo({ s, dispatch, addToCart, cartIconRef, count, subtotal, tweaks }) {
  const [cat, setCat] = useSS('todos');
  const [q, setQ] = useSS('');
  const layout = tweaks.catalogo || 'grid';
  const list = AZ.PRODUCTS.filter(p => (cat === 'todos' || p.cat === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const cats = [{ id: 'todos', name: 'Todo', icon: 'grid' }, ...AZ.CATEGORIES];

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <div className="asphalt" style={{ position: 'absolute', opacity: 0.7 }} />
      <div style={{ position: 'relative', zIndex: 2, paddingBottom: count > 0 ? 96 : 24 }}>
        {/* header */}
        <div style={{ padding: '14px 18px 6px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div className="t-kicker" style={{ fontSize: 12 }}>Azúcar Negra · Zona 1</div>
            <div className="t-poster" style={{ fontSize: 40, lineHeight: 0.95, marginTop: 2 }}>El menú</div>
          </div>
          <button ref={cartIconRef} className="press glass" onClick={() => dispatch({ type: 'nav', screen: 'carrito' })} style={{ position: 'relative', width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center', color: 'var(--u-text)', border: 'none', cursor: 'pointer' }}>
            <Icon name="bag" size={21} />
            {count > 0 && <span className="t-mono anim-pop" style={{ position: 'absolute', top: -5, right: -5, minWidth: 21, height: 21, padding: '0 5px', borderRadius: 99, background: '#F5F3EF', color: '#0b0b0c', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', border: '2px solid #0b0b0c' }}>{count}</span>}
          </button>
        </div>
        {/* search */}
        <div style={{ padding: '8px 18px 0', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}><Icon name="search" size={17} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar bagel, café…" className="glass-quiet"
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 13, border: 'none', color: 'var(--u-text)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.05)' }} />
        </div>
        {/* categories */}
        <div className="u-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 18px 6px' }}>
          {cats.map(c => {
            const on = c.id === cat;
            return (
              <button key={c.id} className="press" onClick={() => setCat(c.id)}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 99, cursor: 'pointer',
                  background: on ? '#F5F3EF' : 'rgba(255,255,255,0.05)', color: on ? '#0b0b0c' : 'var(--u-text-2)',
                  border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13.5,
                  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                <Icon name={c.icon} size={15} />{c.name}
              </button>
            );
          })}
        </div>
        {/* grid / list */}
        <div style={{ padding: '12px 18px 0' }}>
          {layout === 'grid'
            ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {list.map((p, i) => <div key={p.id} className="anim-fade-up" style={{ animationDelay: `${i * 35}ms` }}><ProductTile p={p} qty={s.cart[p.id] || 0} onAdd={(el) => addToCart(p.id, el)} onOpen={() => dispatch({ type: 'nav', screen: 'detalle', sel: p.id })} /></div>)}
              </div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {list.map((p, i) => <div key={p.id} className="anim-fade-up" style={{ animationDelay: `${i * 35}ms` }}><ProductRow p={p} qty={s.cart[p.id] || 0} onAdd={(el) => addToCart(p.id, el)} onOpen={() => dispatch({ type: 'nav', screen: 'detalle', sel: p.id })} /></div>)}
              </div>}
          {list.length === 0 && <div style={{ textAlign: 'center', padding: 50, color: 'var(--u-text-3)', fontFamily: 'var(--font-sans)' }}>Nada por aquí. Probá otra cosa.</div>}
        </div>
      </div>
      {/* sticky cart bar */}
      {count > 0 && (
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10, animation: 'cl-bar 360ms var(--ease-entry)' }}>
          <G.Glass onClick={() => dispatch({ type: 'nav', screen: 'carrito' })} interactive style={{ borderRadius: 17, padding: '12px 14px 12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="t-kicker" style={{ fontSize: 10.5 }}>{count} {count === 1 ? 'producto' : 'productos'}</span>
              <G.Price amount={subtotal} size={18} />
            </div>
            <span className="btn-white" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 13, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14 }}>Ver carrito <Icon name="arrowRight" size={16} /></span>
          </G.Glass>
        </div>
      )}
      <style>{`@keyframes cl-bar { from { transform: translateY(22px); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DETALLE
// ─────────────────────────────────────────────────────────────
function Detalle({ s, dispatch, addToCart }) {
  const p = AZ.getProduct(s.sel);
  const [qty, setQty] = useSS(s.cart[p.id] || 1);
  const addRef = useSRef(null);
  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="asphalt" style={{ position: 'absolute', opacity: 0.7 }} />
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 96 }}>
        <ScreenHead title="" onBack={() => dispatch({ type: 'nav', screen: 'catalogo', dir: 'back' })} />
        {/* hero art */}
        <div style={{ margin: '0 18px', borderRadius: 22, overflow: 'hidden', position: 'relative', aspectRatio: '1.3', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--u-hair)' }}>
          <G.BrandPattern icon={p.icon} seed={p.seed} iconScale={1.5} faint={0.2} />
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6 }}>{p.tags.map(t => <G.Tag key={t} kind={t} />)}</div>
        </div>
        <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="t-kicker" style={{ fontSize: 11 }}>{AZ.CATEGORIES.find(c => c.id === p.cat).name}</div>
          <div className="t-display" style={{ fontSize: 30 }}>{p.name}</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontStyle: 'italic', color: 'var(--u-text-2)', lineHeight: 1.4 }}>{p.desc}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {[{ i: 'clock', t: '8–12 min' }, { i: 'flame', t: 'Recién hecho' }].map((x, k) => (
              <G.Glass key={k} variant="quiet" style={{ borderRadius: 12, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Icon name={x.i} size={16} style={{ color: 'var(--u-text-2)' }} />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 500 }}>{x.t}</span>
              </G.Glass>
            ))}
          </div>
        </div>
      </div>
      {/* sticky add */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="glass" style={{ position: 'absolute', inset: 0, borderRadius: '22px 22px 0 0' }} />
        <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
          <QtyStepper value={qty} size="lg" onMinus={() => setQty(Math.max(1, qty - 1))} onPlus={() => setQty(qty + 1)} />
          <button ref={addRef} className="press btn-white" onClick={() => { addToCart(p.id, addRef.current, qty); dispatch({ type: 'nav', screen: 'catalogo', dir: 'back' }); }}
            style={{ flex: 1, border: 'none', borderRadius: 15, padding: '15px 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15 }}>
            Agregar · <span className="t-mono" style={{ fontWeight: 700 }}>{AZ.fmtQ(p.price * qty)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CARRITO
// ─────────────────────────────────────────────────────────────
function Carrito({ s, dispatch, subtotal }) {
  const items = Object.entries(s.cart).map(([id, q]) => ({ p: AZ.getProduct(+id), q })).filter(i => i.p);
  const envio = s.form.tipo === 'domicilio' ? 15 : 0;
  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="asphalt" style={{ position: 'absolute', opacity: 0.7 }} />
      <div style={{ position: 'relative', zIndex: 2, flex: 1, paddingBottom: items.length ? 150 : 24 }}>
        <ScreenHead title="Carrito" onBack={() => dispatch({ type: 'nav', screen: 'catalogo', dir: 'back' })} />
        <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <Icon name="bag" size={52} strokeWidth={1.3} style={{ color: 'var(--u-text-4)' }} />
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--u-text-3)' }}>Tu carrito está vacío</div>
              <G.Btn variant="white" onClick={() => dispatch({ type: 'nav', screen: 'catalogo', dir: 'back' })}>Ver el menú</G.Btn>
            </div>
          )}
          {items.map(({ p, q }) => (
            <G.Glass key={p.id} style={{ borderRadius: 16, padding: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 58, height: 58, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.03)' }}><G.BrandPattern icon={p.icon} seed={p.seed} iconScale={0.85} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{p.name}</div>
                <G.Price amount={p.price * q} size={14} style={{ marginTop: 3 }} />
              </div>
              <QtyStepper value={q} onMinus={() => dispatch({ type: 'set', id: p.id, q: q - 1 })} onPlus={() => dispatch({ type: 'set', id: p.id, q: q + 1 })} />
            </G.Glass>
          ))}
        </div>
      </div>
      {items.length > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: 16 }}>
          <div className="glass" style={{ position: 'absolute', inset: 0, borderRadius: '22px 22px 0 0' }} />
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Row k="Subtotal" v={AZ.fmtQ(subtotal)} />
            <Row k={`Envío · ${s.form.tipo === 'domicilio' ? 'domicilio' : 'para llevar'}`} v={envio ? AZ.fmtQ(envio) : 'Gratis'} />
            <div style={{ height: 1, background: 'var(--u-hair)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>Total</span>
              <G.Price amount={subtotal + envio} size={22} />
            </div>
            <G.Btn variant="white" size="lg" full iconRight="arrowRight" onClick={() => dispatch({ type: 'nav', screen: 'checkout' })} style={{ marginTop: 4 }}>Ir a pagar</G.Btn>
          </div>
        </div>
      )}
    </div>
  );
}
function Row({ k, v }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--u-text-3)' }}><span>{k}</span><span className="t-mono" style={{ color: 'var(--u-text-2)' }}>{v}</span></div>;
}

// ─────────────────────────────────────────────────────────────
// CHECKOUT
// ─────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, icon, error }) {
  const [f, setF] = useSS(false);
  const bd = error ? 'rgba(255,255,255,0.85)' : f ? 'rgba(255,255,255,0.45)' : 'var(--u-hair)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="t-kicker" style={{ fontSize: 10.5 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--u-text-3)' }}><Icon name={icon} size={16} /></span>}
        <input value={value} onChange={onChange} placeholder={placeholder} onFocus={() => setF(true)} onBlur={() => setF(false)}
          style={{ width: '100%', padding: icon ? '13px 14px 13px 40px' : '13px 14px', borderRadius: 13, color: 'var(--u-text)', fontSize: 14.5, outline: 'none',
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${bd}`, transition: 'border-color 150ms', boxShadow: f ? '0 0 0 4px rgba(255,255,255,0.06)' : error ? '0 0 0 3px rgba(255,255,255,0.1)' : 'none' }} />
      </div>
      {error && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-2)' }}><Icon name="alertCircle" size={12} />{error}</div>}
    </div>
  );
}

function Checkout({ s, dispatch, subtotal, store }) {
  const f = s.form;
  const [tried, setTried] = useSS(false);
  const envio = f.tipo === 'domicilio' ? 15 : 0;
  const total = subtotal + envio;
  const errs = {
    nombre: !f.nombre.trim() ? 'Decinos tu nombre' : '',
    tel: !f.tel.trim() ? 'Necesitamos un teléfono' : '',
    dir: (f.tipo === 'domicilio' && !f.dir.trim()) ? '¿A dónde lo llevamos?' : '',
  };
  const valid = !errs.nombre && !errs.tel && !errs.dir;
  const submit = () => {
    if (!valid) { setTried(true); return; }
    const items = Object.entries(s.cart).map(([id, q]) => ({ id: +id, q }));
    store.placeOrder({ cliente: f.nombre, tel: f.tel, tipo: f.tipo === 'domicilio' ? 'Domicilio' : 'Para llevar', dir: f.tipo === 'domicilio' ? f.dir : 'Recoge en barra', notas: f.notas, items, pago: 'Efectivo', total });
    dispatch({ type: 'nav', screen: 'confirmacion' });
  };
  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="asphalt" style={{ position: 'absolute', opacity: 0.7 }} />
      <div className="u-scroll" style={{ position: 'relative', zIndex: 2, flex: 1, paddingBottom: 150 }}>
        <ScreenHead title="Tu pedido" onBack={() => dispatch({ type: 'nav', screen: 'carrito', dir: 'back' })} />
        <div style={{ padding: '8px 18px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* tipo */}
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Tipo de pedido</label>
            <div className="glass-quiet" style={{ display: 'flex', padding: 4, borderRadius: 14, marginTop: 6 }}>
              {[{ id: 'domicilio', t: 'A domicilio', i: 'truck' }, { id: 'llevar', t: 'Para llevar', i: 'bag' }].map(o => {
                const on = f.tipo === o.id;
                return <button key={o.id} className="press" onClick={() => dispatch({ type: 'field', k: 'tipo', v: o.id })}
                  style={{ flex: 1, padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: on ? '#F5F3EF' : 'transparent', color: on ? '#0b0b0c' : 'var(--u-text-2)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13.5, transition: 'all 160ms' }}>
                  <Icon name={o.i} size={16} />{o.t}</button>;
              })}
            </div>
          </div>
          <Field label="Tu nombre" icon="user" value={f.nombre} onChange={e => dispatch({ type: 'field', k: 'nombre', v: e.target.value })} placeholder="¿Cómo te llamás?" error={tried && errs.nombre} />
          <Field label="Teléfono" icon="phone" value={f.tel} onChange={e => dispatch({ type: 'field', k: 'tel', v: e.target.value })} placeholder="5xxx xxxx" error={tried && errs.tel} />
          {f.tipo === 'domicilio' && <Field label="Dirección" icon="mapPin" value={f.dir} onChange={e => dispatch({ type: 'field', k: 'dir', v: e.target.value })} placeholder="Calle, zona, referencia" error={tried && errs.dir} />}
          <Field label="Notas (opcional)" value={f.notas} onChange={e => dispatch({ type: 'field', k: 'notas', v: e.target.value })} placeholder="Sin cebolla, extra picante…" />
          {/* pago */}
          <div>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Pago</label>
            <G.Glass style={{ borderRadius: 14, padding: 15, display: 'flex', alignItems: 'center', gap: 13, marginTop: 6 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.08)', color: 'var(--u-text)' }}><Icon name="receipt" size={20} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14.5, color: 'var(--u-text)' }}>Efectivo contra entrega</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--u-text-3)' }}>Pagás cuando llega tu pedido</div>
              </div>
              <span style={{ width: 22, height: 22, borderRadius: 99, background: '#F5F3EF', color: '#0b0b0c', display: 'grid', placeItems: 'center' }}><Icon name="check" size={14} strokeWidth={3} /></span>
            </G.Glass>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, padding: 16 }}>
        <div className="glass" style={{ position: 'absolute', inset: 0, borderRadius: '22px 22px 0 0' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>Total</span>
            <G.Price amount={total} size={22} />
          </div>
          <G.Btn variant="white" size="lg" full iconRight="arrowRight" onClick={submit}>Confirmar pedido</G.Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONFIRMACION
// ─────────────────────────────────────────────────────────────
function Confirmacion({ s, dispatch, store }) {
  const order = store.lastOrder;
  return (
    <div style={{ position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="asphalt" style={{ position: 'absolute' }} />
      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 28px', textAlign: 'center', gap: 20 }}>
        <div className="anim-pop" style={{ width: 100, height: 100, borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#F5F3EF', color: '#0b0b0c', boxShadow: '0 0 0 0 rgba(255,255,255,0.4)', animation: 'pop-in 420ms var(--ease-entry) both, pulse-ring 2.4s 0.5s infinite' }}>
          <Icon name="check" size={50} strokeWidth={2.6} />
        </div>
        <div className="anim-fade-up" style={{ animationDelay: '160ms' }}>
          <div className="t-display" style={{ fontSize: 34 }}>¡Pedido enviado!</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--u-text-2)', marginTop: 8, maxWidth: 260 }}>Azúcar Negra ya recibió tu pedido y lo está preparando.</div>
        </div>
        <G.Glass className="anim-fade-up" style={{ animationDelay: '260ms', borderRadius: 18, padding: 18, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Row k="Número de pedido" v={order ? order.id : '—'} />
          <Row k="Tipo" v={order ? order.tipo : '—'} />
          <Row k="Tiempo estimado" v="20–30 min" />
          <Row k="Pago" v="Efectivo contra entrega" />
        </G.Glass>
        <div className="anim-fade-up" style={{ animationDelay: '340ms', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--u-text-3)', fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: '#fff', animation: 'pulse-ring 2s infinite' }} />
          El restaurante fue notificado al instante
        </div>
        <G.Btn variant="white" size="lg" full onClick={() => dispatch({ type: 'reset' })} className="anim-fade-up" style={{ animationDelay: '420ms', maxWidth: 320 }}>Hacer otro pedido</G.Btn>
      </div>
    </div>
  );
}

window.CS = { Catalogo, Detalle, Carrito, Checkout, Confirmacion };
