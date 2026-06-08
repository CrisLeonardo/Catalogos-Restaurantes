// AdminApp.jsx — Azúcar Negra distributor/owner panel (desktop). window.AdminApp
const { useState: useAS, useEffect: useAE, useMemo: useAM, useRef: useARef } = React;

// ── window chrome ──
function DeskWindow({ children }) {
  return (
    <div className="glass-solid" style={{ width: 'min(1280px, 95vw)', height: 'min(820px, 92vh)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ height: 46, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', borderBottom: '1px solid var(--u-hair)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>{['#3a3a3e', '#3a3a3e', '#3a3a3e'].map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: c, border: '1px solid rgba(255,255,255,0.08)' }} />)}</div>
        <div className="glass-quiet" style={{ flex: 1, maxWidth: 360, margin: '0 auto', height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: 'var(--u-text-3)', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
          <Icon name="eye" size={12} /> panel.azucarnegra.gt
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
    </div>
  );
}

const NAV = [
  { id: 'pedidos', name: 'Pedidos', icon: 'list' },
  { id: 'catalogo', name: 'Catálogo', icon: 'bag' },
  { id: 'categorias', name: 'Categorías', icon: 'tag' },
];

function Sidebar({ active, setActive, unread }) {
  return (
    <div style={{ width: 232, flexShrink: 0, borderRight: '1px solid var(--u-hair)', display: 'flex', flexDirection: 'column', padding: '20px 14px', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px 18px' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', border: '1px solid var(--u-hair)' }}><G.Mark size={30} /></div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5, color: 'var(--u-text)', lineHeight: 1 }}>Azúcar Negra</div>
          <div className="t-kicker" style={{ fontSize: 9.5, marginTop: 3 }}>Panel · Zona 1</div>
        </div>
      </div>
      <div className="t-kicker" style={{ fontSize: 9.5, padding: '6px 10px' }}>Operación</div>
      {NAV.map(n => {
        const on = active === n.id;
        return (
          <button key={n.id} className="press" onClick={() => setActive(n.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
              background: on ? 'rgba(255,255,255,0.09)' : 'transparent', color: on ? 'var(--u-text)' : 'var(--u-text-3)',
              fontFamily: 'var(--font-sans)', fontWeight: on ? 600 : 500, fontSize: 14, transition: 'all 140ms' }}>
            <Icon name={n.icon} size={18} />
            <span style={{ flex: 1 }}>{n.name}</span>
            {n.id === 'pedidos' && unread > 0 && <span className="t-mono" style={{ minWidth: 20, height: 20, padding: '0 5px', borderRadius: 99, background: '#F5F3EF', color: '#0b0b0c', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{unread}</span>}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div className="glass-quiet" style={{ borderRadius: 13, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 99, background: 'rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}><Icon name="user" size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12.5, color: 'var(--u-text)' }}>Leo · Barra</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--u-text-3)' }}>Administrador</div>
        </div>
        <Icon name="logOut" size={16} style={{ color: 'var(--u-text-3)' }} />
      </div>
    </div>
  );
}

function StatusPill({ status, big }) {
  const c = AZ.ORDER_STATUS[status];
  const map = {
    alert: { bg: 'rgba(255,255,255,0.92)', fg: '#0b0b0c', dot: '#0b0b0c' },
    open:  { bg: 'rgba(255,255,255,0.10)', fg: 'var(--u-text)', dot: '#fff' },
    mid:   { bg: 'rgba(255,255,255,0.06)', fg: 'var(--u-text-2)', dot: 'rgba(255,255,255,0.7)' },
    done:  { bg: 'transparent', fg: 'var(--u-text-3)', dot: 'var(--u-text-4)', border: '1px solid var(--u-hair)' },
    off:   { bg: 'transparent', fg: 'var(--u-text-4)', dot: 'var(--u-text-4)', border: '1px solid var(--u-hair)' },
  }[c.tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: big ? '6px 12px' : '4px 9px', borderRadius: 99, background: map.bg, color: map.fg, border: map.border || 'none', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: big ? 12.5 : 11 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: map.dot, boxShadow: c.tone === 'alert' ? '0 0 6px rgba(0,0,0,0.4)' : 'none' }} />
      {c.label}
    </span>
  );
}

// ── KPI ──
function Kpi({ label, value, sub, hero }) {
  return (
    <G.Glass style={{ borderRadius: 16, padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div style={{ fontFamily: hero ? 'var(--font-display)' : 'var(--font-mono)', fontWeight: hero ? 800 : 600, fontSize: hero ? 30 : 26, color: 'var(--u-text)', lineHeight: 1, letterSpacing: hero ? '-0.02em' : '-0.01em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </G.Glass>
  );
}

// ─────────────────────────────────────────────────────────────
// PEDIDOS — realtime board
// ─────────────────────────────────────────────────────────────
function OrderCard({ o, onAdvance, isNew }) {
  const items = o.items.map(it => ({ p: AZ.getProduct(it.id), q: it.q }));
  const nextLabel = { NEW: 'Confirmar', PREP: 'Marcar listo', READY: o.tipo === 'Domicilio' ? 'Enviar' : 'Entregar', TRANSIT: 'Entregado' }[o.status];
  return (
    <G.Glass style={{ borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative',
      animation: isNew ? 'pulse-ring 1.8s ease-out 3' : undefined, boxShadow: isNew ? '0 0 0 1px rgba(255,255,255,0.5), 0 14px 40px rgba(0,0,0,0.5)' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="t-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text)' }}>{o.id}</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--u-text-2)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name={o.tipo === 'Domicilio' ? 'truck' : 'bag'} size={13} />{o.cliente} · {o.tipo}
          </div>
        </div>
        <StatusPill status={o.status} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 0', borderTop: '1px solid var(--u-hair)', borderBottom: '1px solid var(--u-hair)' }}>
        {items.map(({ p, q }) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: 'var(--font-sans)', fontSize: 13 }}>
            <span className="t-mono" style={{ color: 'var(--u-text-2)', minWidth: 24 }}>{q}×</span>
            <span style={{ flex: 1, color: 'var(--u-text)' }}>{p.name}</span>
            <G.Price amount={p.price * q} size={12.5} muted />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-3)' }}>
            <Icon name="clock" size={12} />{o.mins === 0 ? 'ahora' : `hace ${o.mins} min`} · {o.pago}
          </div>
          <G.Price amount={o.total} size={17} style={{ marginTop: 4 }} />
        </div>
        {nextLabel && <G.Btn variant={o.status === 'NEW' ? 'white' : 'glass'} size="sm" iconRight={o.status === 'NEW' ? 'check' : 'arrowRight'} onClick={() => onAdvance(o)}>{nextLabel}</G.Btn>}
      </div>
    </G.Glass>
  );
}

function Pedidos({ store }) {
  const orders = store.orders;
  const active = orders.filter(o => ['NEW', 'PREP', 'READY', 'TRANSIT'].includes(o.status));
  const done = orders.filter(o => ['DELIVERED', 'CANCEL'].includes(o.status));
  const ventasHoy = orders.reduce((t, o) => t + o.total, 0);
  const ticket = orders.length ? ventasHoy / orders.length : 0;
  const maxSale = Math.max(...AZ.SALES_SERIES);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* alert banner */}
      {store.newOrderId && (
        <G.Glass style={{ borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 13, animation: 'fade-up 320ms var(--ease-entry), pulse-ring 1.8s ease-out 2', boxShadow: '0 0 0 1px rgba(255,255,255,0.5), 0 14px 40px rgba(0,0,0,0.5)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: '#F5F3EF', color: '#0b0b0c', display: 'grid', placeItems: 'center', animation: 'bob 1.4s ease-in-out infinite' }}><Icon name="bell" size={19} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--u-text)' }}>¡Nuevo pedido!</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--u-text-3)' }}>Se notificó al WhatsApp del local · {store.orders.find(o => o.id === store.newOrderId)?.cliente}</div>
          </div>
          <span className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 10, fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-2)' }}><Icon name="whatsapp" size={14} /> Enviado</span>
          <G.Btn variant="white" size="sm" onClick={() => store.ackNew()}>Visto</G.Btn>
        </G.Glass>
      )}
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Kpi label="Ventas hoy" value={AZ.fmtQ(ventasHoy)} sub="↑ 18% vs ayer" hero />
        <Kpi label="Pedidos hoy" value={orders.length} sub={`${active.length} activos`} />
        <Kpi label="Ticket promedio" value={AZ.fmtQ(ticket)} sub="por pedido" />
        <Kpi label="En preparación" value={active.filter(o => o.status === 'PREP' || o.status === 'NEW').length} sub="en la barra" />
      </div>
      {/* board + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="t-poster" style={{ fontSize: 20 }}>En curso</div>
            <span className="t-kicker" style={{ fontSize: 10 }}>{active.length} pedidos</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {active.map(o => <OrderCard key={o.id} o={o} isNew={o.id === store.newOrderId} onAdvance={store.advanceOrder} />)}
          </div>
          {active.length === 0 && <G.Glass style={{ borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--u-text-3)', fontFamily: 'var(--font-sans)' }}>Todo al día. No hay pedidos en curso.</G.Glass>}
          {done.length > 0 && <>
            <div className="t-poster" style={{ fontSize: 20, marginTop: 6 }}>Cerrados hoy</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, opacity: 0.62 }}>
              {done.map(o => <OrderCard key={o.id} o={o} onAdvance={() => {}} />)}
            </div>
          </>}
        </div>
        {/* sales chart */}
        <G.Glass style={{ borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="t-kicker" style={{ fontSize: 9.5 }}>Ventas · 14 días</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--u-text)', marginTop: 4 }}>Q 7,840</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 120 }}>
            {AZ.SALES_SERIES.map((v, i) => {
              const today = i === AZ.SALES_SERIES.length - 1;
              return <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{ width: '100%', height: `${(v / maxSale) * 100}%`, minHeight: 4, borderRadius: '4px 4px 0 0', background: today ? '#F5F3EF' : 'rgba(255,255,255,0.14)', transition: 'height 400ms var(--ease-entry)' }} />
                <span className="t-mono" style={{ fontSize: 8.5, color: today ? 'var(--u-text)' : 'var(--u-text-4)', fontWeight: today ? 700 : 500 }}>{AZ.SALES_LABELS[i]}</span>
              </div>;
            })}
          </div>
          <div style={{ height: 1, background: 'var(--u-hair)' }} />
          <div className="t-poster" style={{ fontSize: 15 }}>Top de hoy</div>
          {[1, 7, 11, 14].map((id, i) => { const p = AZ.getProduct(id); return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="t-mono" style={{ width: 18, color: 'var(--u-text-4)', fontSize: 12 }}>{i + 1}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }}><G.BrandPattern icon={p.icon} seed={p.seed} iconScale={0.8} /></div>
              <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--u-text)' }}>{p.name}</span>
              <span className="t-mono" style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{12 - i * 2}×</span>
            </div>
          ); })}
        </G.Glass>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CATALOGO (management)
// ─────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button className="press" onClick={() => onChange(!on)} style={{ width: 42, height: 25, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3, background: on ? '#F5F3EF' : 'rgba(255,255,255,0.12)', transition: 'background 180ms', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 19, height: 19, borderRadius: 99, background: on ? '#0b0b0c' : '#F5F3EF', transition: 'all 180ms' }} />
    </button>
  );
}

function CatalogoAdmin({ products, setAvail, openEditor }) {
  const [cat, setCat] = useAS('todos');
  const cats = [{ id: 'todos', name: 'Todas' }, ...AZ.CATEGORIES];
  const list = products.filter(p => cat === 'todos' || p.cat === cat);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="u-noscroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1 }}>
          {cats.map(c => { const on = c.id === cat; return (
            <button key={c.id} className="press" onClick={() => setCat(c.id)} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 99, cursor: 'pointer', background: on ? '#F5F3EF' : 'rgba(255,255,255,0.05)', color: on ? '#0b0b0c' : 'var(--u-text-2)', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13 }}>{c.name}</button>
          ); })}
        </div>
        <G.Btn variant="white" icon="plus" onClick={() => openEditor(null)}>Nuevo platillo</G.Btn>
      </div>
      <G.Glass style={{ borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 90px', padding: '12px 18px', borderBottom: '1px solid var(--u-hair)' }}>
          {['Platillo', 'Precio', 'Disponible', ''].map((h, i) => <div key={i} className="t-kicker" style={{ fontSize: 9.5, textAlign: i === 1 ? 'right' : 'left' }}>{h}</div>)}
        </div>
        {list.map((p, i) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px 90px', alignItems: 'center', padding: '12px 18px', borderBottom: i < list.length - 1 ? '1px solid var(--u-hair)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', flexShrink: 0 }}><G.BrandPattern icon={p.icon} seed={p.seed} iconScale={0.85} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)', display: 'flex', alignItems: 'center', gap: 7 }}>{p.name}{p.tags.slice(0, 1).map(t => <G.Tag key={t} kind={t} small />)}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{p.desc}</div>
              </div>
            </div>
            <G.Price amount={p.price} size={14} style={{ textAlign: 'right', justifySelf: 'end' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Toggle on={p.avail} onChange={(v) => setAvail(p.id, v)} />
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: p.avail ? 'var(--u-text-2)' : 'var(--u-text-4)' }}>{p.avail ? 'Activo' : 'Agotado'}</span>
            </div>
            <div style={{ justifySelf: 'end' }}>
              <G.Btn variant="glass" size="sm" icon="edit" onClick={() => openEditor(p)}>Editar</G.Btn>
            </div>
          </div>
        ))}
      </G.Glass>
    </div>
  );
}

// ── editor modal ──
function Editor({ product, categories, onClose, onSave }) {
  const isNew = !product;
  const [f, setF] = useAS(product || { name: '', cat: categories[0].id, price: '', desc: '', icon: 'coffee', avail: true, tags: [], seed: Math.floor(Math.random() * 10) });
  const [photo, setPhoto] = useAS(null);
  const fileRef = useARef(null);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const onFile = (e) => { const file = e.target.files[0]; if (file) { const r = new FileReader(); r.onload = ev => setPhoto(ev.target.result); r.readAsDataURL(file); } };
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'rgba(7,7,8,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'fade-in 200ms' }}>
      <G.Glass variant="solid" onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '92%', maxHeight: '88%', borderRadius: 22, display: 'flex', flexDirection: 'column', animation: 'pop-in 280ms var(--ease-entry)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--u-hair)' }}>
          <div className="t-display" style={{ fontSize: 22 }}>{isNew ? 'Nuevo platillo' : 'Editar platillo'}</div>
          <button className="press glass-quiet" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}><Icon name="x" size={18} /></button>
        </div>
        <div className="u-scroll" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* photo */}
          <div style={{ display: 'flex', gap: 14 }}>
            <button className="press" onClick={() => fileRef.current?.click()} style={{ width: 120, height: 120, borderRadius: 16, border: '1.5px dashed var(--u-hair-2)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', display: 'grid', placeItems: 'center', overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
              {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ position: 'absolute', inset: 0 }}><G.BrandPattern icon={f.icon} seed={f.seed} iconScale={1.1} /></div>}
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <G.Btn variant="glass" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>Subir foto</G.Btn>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.4 }}>JPG o PNG. Si no subís foto, se usa el patrón de la marca.</div>
            </div>
          </div>
          <Field2 label="Nombre" value={f.name} onChange={v => set('name', v)} placeholder="Ej. Negra Brava" />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="t-kicker" style={{ fontSize: 10.5 }}>Categoría</label>
              <div className="u-noscroll" style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {categories.map(c => { const on = f.cat === c.id; return <button key={c.id} className="press" onClick={() => set('cat', c.id)} style={{ padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? '#F5F3EF' : 'rgba(255,255,255,0.04)', color: on ? '#0b0b0c' : 'var(--u-text-2)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12.5 }}>{c.name}</button>; })}
              </div>
            </div>
            <div style={{ width: 130 }}>
              <Field2 label="Precio (Q)" value={f.price} onChange={v => set('price', v.replace(/[^0-9.]/g, ''))} placeholder="0.00" mono />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Descripción</label>
            <textarea value={f.desc} onChange={e => set('desc', e.target.value)} rows={3} placeholder="Contá qué lleva…"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 13, color: 'var(--u-text)', fontSize: 14, outline: 'none', resize: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--u-hair)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="t-kicker" style={{ fontSize: 10.5 }}>Etiquetas</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['hot', 'new', 'fav', 'veg'].map(t => { const on = f.tags.includes(t); return (
                <button key={t} className="press" onClick={() => set('tags', on ? f.tags.filter(x => x !== t) : [...f.tags, t])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? '#F5F3EF' : 'rgba(255,255,255,0.04)', color: on ? '#0b0b0c' : 'var(--u-text-3)', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 12 }}><Icon name={AZ.TAG_ICON[t]} size={12} />{AZ.TAG_LABEL[t]}</button>
              ); })}
            </div>
          </div>
          <G.Glass variant="quiet" style={{ borderRadius: 13, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, color: 'var(--u-text)' }}>Disponible ahora</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-3)' }}>Si lo apagás, sale como "Agotado" en el menú</div>
            </div>
            <Toggle on={f.avail} onChange={v => set('avail', v)} />
          </G.Glass>
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '16px 22px', borderTop: '1px solid var(--u-hair)' }}>
          <G.Btn variant="ghost" full onClick={onClose}>Cancelar</G.Btn>
          <G.Btn variant="white" full icon="check" disabled={!f.name || !f.price} onClick={() => onSave({ ...f, price: parseFloat(f.price) || 0 })}>{isNew ? 'Crear platillo' : 'Guardar cambios'}</G.Btn>
        </div>
      </G.Glass>
    </div>
  );
}
function Field2({ label, value, onChange, placeholder, mono }) {
  const [foc, setFoc] = useAS(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="t-kicker" style={{ fontSize: 10.5 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        className={mono ? 't-mono' : ''} style={{ width: '100%', padding: '12px 14px', borderRadius: 13, color: 'var(--u-text)', fontSize: 14.5, outline: 'none', background: 'rgba(255,255,255,0.05)', border: `1px solid ${foc ? 'rgba(255,255,255,0.45)' : 'var(--u-hair)'}`, boxShadow: foc ? '0 0 0 4px rgba(255,255,255,0.06)' : 'none', transition: 'all 150ms' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────────────────────
function Categorias({ products }) {
  const [cats, setCats] = useAS(AZ.CATEGORIES.map(c => ({ ...c, on: true })));
  const count = (id) => products.filter(p => p.cat === id).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="t-poster" style={{ fontSize: 20 }}>Categorías del menú</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--u-text-3)', marginTop: 3 }}>Ordená cómo aparecen en la app del cliente.</div>
        </div>
        <G.Btn variant="white" icon="plus">Nueva</G.Btn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cats.map((c, i) => (
          <G.Glass key={c.id} style={{ borderRadius: 15, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--u-text-4)', cursor: 'grab' }}><Icon name="more" size={14} /><Icon name="more" size={14} style={{ marginTop: -8 }} /></div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', color: 'var(--u-text)' }}><Icon name={c.icon} size={21} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--u-text)' }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--u-text-3)' }}>{count(c.id)} platillos</div>
            </div>
            <Toggle on={c.on} onChange={(v) => setCats(cs => cs.map(x => x.id === c.id ? { ...x, on: v } : x))} />
            <button className="press glass-quiet" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text-2)', cursor: 'pointer' }}><Icon name="edit" size={16} /></button>
          </G.Glass>
        ))}
      </div>
    </div>
  );
}

// ── root ──
function AdminApp({ store, tweaks }) {
  const [active, setActive] = useAS('pedidos');
  const [products, setProducts] = useAS(AZ.PRODUCTS.map(p => ({ ...p })));
  const [editor, setEditor] = useAS({ open: false, product: null });
  const setAvail = (id, v) => setProducts(ps => ps.map(p => p.id === id ? { ...p, avail: v } : p));
  const saveProduct = (data) => {
    setProducts(ps => data.id ? ps.map(p => p.id === data.id ? { ...p, ...data } : p) : [{ ...data, id: Math.max(...ps.map(p => p.id)) + 1 }, ...ps]);
    setEditor({ open: false, product: null });
  };
  const titles = { pedidos: 'Pedidos en vivo', catalogo: 'Catálogo', categorias: 'Categorías' };

  return (
    <DeskWindow>
      <Sidebar active={active} setActive={setActive} unread={store.unread} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        {/* topbar */}
        <div style={{ height: 64, display: 'flex', alignItems: 'center', gap: 14, padding: '0 26px', borderBottom: '1px solid var(--u-hair)', flexShrink: 0 }}>
          <div className="t-display" style={{ fontSize: 22, flex: 1 }}>{titles[active]}</div>
          <div className="glass-quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--u-text-2)' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: '#fff', boxShadow: '0 0 8px #fff', animation: 'pulse-ring 2s infinite' }} /> En vivo
          </div>
          <button className="press glass-quiet" style={{ position: 'relative', width: 42, height: 42, borderRadius: 12, border: 'none', display: 'grid', placeItems: 'center', color: 'var(--u-text)', cursor: 'pointer' }}>
            <Icon name="bell" size={19} />
            {store.unread > 0 && <span style={{ position: 'absolute', top: 8, right: 9, width: 9, height: 9, borderRadius: 99, background: '#F5F3EF', border: '2px solid #16161a' }} />}
          </button>
        </div>
        {/* content */}
        <div key={active} className="u-scroll anim-fade-in" style={{ flex: 1, overflowY: 'auto', padding: 26 }}>
          {active === 'pedidos' && <Pedidos store={store} />}
          {active === 'catalogo' && <CatalogoAdmin products={products} setAvail={setAvail} openEditor={(p) => setEditor({ open: true, product: p })} />}
          {active === 'categorias' && <Categorias products={products} />}
        </div>
        {editor.open && <Editor product={editor.product} categories={AZ.CATEGORIES} onClose={() => setEditor({ open: false, product: null })} onSave={saveProduct} />}
      </div>
    </DeskWindow>
  );
}

window.AdminApp = AdminApp;
