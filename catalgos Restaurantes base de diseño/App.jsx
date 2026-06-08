// App.jsx — root: shared order store, client↔admin realtime, view toggle, tweaks.
const { useState: useRS, useRef: useRRef, useEffect: useRE } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "portada": "spotlight",
  "catalogo": "grid",
  "glass": "esmerilado"
}/*EDITMODE-END*/;

const GLASS_PRESETS = {
  translucido: { '--glass-blur': '13px', '--glass-fill': 'rgba(255,255,255,0.045)', '--glass-fill-2': 'rgba(255,255,255,0.085)', '--glass-sat': '150%' },
  esmerilado:  { '--glass-blur': '22px', '--glass-fill': 'rgba(255,255,255,0.065)', '--glass-fill-2': 'rgba(255,255,255,0.11)', '--glass-sat': '135%' },
  solido:      { '--glass-blur': '30px', '--glass-fill': 'rgba(255,255,255,0.10)', '--glass-fill-2': 'rgba(255,255,255,0.17)', '--glass-sat': '120%' },
};

function ViewToggle({ view, setView, unread }) {
  return (
    <div className="glass" style={{ display: 'inline-flex', padding: 5, borderRadius: 15, gap: 4, pointerEvents: 'auto' }}>
      {[{ id: 'client', t: 'Cliente', i: 'user' }, { id: 'admin', t: 'Admin', i: 'dashboard' }].map(o => {
        const on = view === o.id;
        return (
          <button key={o.id} className="press" onClick={() => setView(o.id)}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 11, border: 'none', cursor: 'pointer',
              background: on ? '#F5F3EF' : 'transparent', color: on ? '#0b0b0c' : 'var(--u-text-2)',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14, transition: 'all 200ms var(--ease-out)' }}>
            <Icon name={o.i} size={16} />{o.t}
            {o.id === 'admin' && unread > 0 && !on && <span style={{ position: 'absolute', top: 4, right: 6, width: 9, height: 9, borderRadius: 99, background: '#F5F3EF', boxShadow: '0 0 8px #fff', animation: 'pulse-ring 1.6s infinite' }} />}
          </button>
        );
      })}
    </div>
  );
}

function Toast({ toast, onGo }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 90, pointerEvents: 'auto', animation: 'toast-in 420ms var(--ease-entry)' }}>
      <G.Glass style={{ borderRadius: 15, padding: '12px 14px 12px 16px', display: 'flex', alignItems: 'center', gap: 13, minWidth: 320, boxShadow: '0 0 0 1px rgba(255,255,255,0.4), 0 20px 50px rgba(0,0,0,0.5)' }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: '#F5F3EF', color: '#0b0b0c', display: 'grid', placeItems: 'center', animation: 'bob 1.3s ease-in-out infinite' }}><Icon name="bell" size={19} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--u-text)' }}>Pedido en el panel</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--u-text-3)' }}>{toast.id} · notificado al instante</div>
        </div>
        <G.Btn variant="white" size="sm" iconRight="arrowRight" onClick={onGo}>Ver panel</G.Btn>
      </G.Glass>
      <style>{`@keyframes toast-in { from { transform: translate(-50%, 26px); } to { transform: translate(-50%, 0); } }`}</style>
    </div>
  );
}

function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [orders, setOrders] = useRS(AZ.SEED_ORDERS);
  const [view, setView] = useRS('client');
  const [newOrderId, setNewOrderId] = useRS(null);
  const [unread, setUnread] = useRS(0);
  const [toast, setToast] = useRS(null);
  const lastOrder = useRRef(null);
  const seq = useRRef(232);
  const ac = useRRef(null);

  // glass preset → CSS vars
  useRE(() => {
    const p = GLASS_PRESETS[t.glass] || GLASS_PRESETS.esmerilado;
    Object.entries(p).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }, [t.glass]);

  const chime = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!ac.current) ac.current = new Ctx();
      const a = ac.current; if (a.state === 'suspended') a.resume();
      const now = a.currentTime;
      [[880, 0], [1320, 0.12]].forEach(([f, dt]) => {
        const o = a.createOscillator(), g = a.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(g); g.connect(a.destination);
        g.gain.setValueAtTime(0.0001, now + dt);
        g.gain.exponentialRampToValueAtTime(0.18, now + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.34);
        o.start(now + dt); o.stop(now + dt + 0.36);
      });
    } catch (e) {}
  };

  const placeOrder = (payload) => {
    const id = 'ORD-' + String(seq.current++).padStart(5, '0');
    const order = { ...payload, id, status: 'NEW', mins: 0 };
    lastOrder.current = order;
    setOrders(o => [order, ...o]);
    setNewOrderId(id); setUnread(u => u + 1); chime();
    setToast({ id });
    setTimeout(() => setToast(cur => (cur && cur.id === id ? null : cur)), 6500);
  };
  const advanceOrder = (o) => {
    const flow = { NEW: 'PREP', PREP: 'READY', READY: o.tipo === 'Domicilio' ? 'TRANSIT' : 'DELIVERED', TRANSIT: 'DELIVERED' };
    const next = flow[o.status]; if (!next) return;
    setOrders(os => os.map(x => x.id === o.id ? { ...x, status: next, mins: 0 } : x));
    if (o.id === newOrderId) setNewOrderId(null);
  };
  const goView = (v) => { setView(v); if (v === 'admin') { setUnread(0); setToast(null); } };

  const store = { orders, placeOrder, advanceOrder, ackNew: () => setNewOrderId(null), newOrderId, unread, lastOrder: lastOrder.current, view, setView: goView };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <div className="asphalt"><div className="asphalt-mark" /><div className="asphalt-grain" /></div>

      {/* top brand + toggle */}
      <div style={{ position: 'absolute', top: 18, left: 22, zIndex: 70, display: 'flex', alignItems: 'center', gap: 11, pointerEvents: 'none' }}>
        <G.Mark size={34} />
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, color: 'var(--u-text)' }}>Azúcar Negra</div>
          <div className="t-kicker" style={{ fontSize: 8.5, marginTop: 3 }}>Prototipo · menú en línea</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 70, pointerEvents: 'none' }}>
        <ViewToggle view={view} setView={goView} unread={unread} />
      </div>

      {/* stage: both mounted, crossfade */}
      <div style={{ position: 'absolute', inset: 0, top: 0 }}>
        <Layer show={view === 'client'}>
          <ClientApp store={store} tweaks={t} />
        </Layer>
        <Layer show={view === 'admin'}>
          <AdminApp store={store} tweaks={t} />
        </Layer>
      </div>

      {view === 'client' && <Toast toast={toast} onGo={() => goView('admin')} />}

      <TweaksPanel>
        <TweakSection label="Portada (cliente)" />
        <TweakRadio label="Estilo" value={t.portada} options={[{ value: 'spotlight', label: 'Spotlight' }, { value: 'poster', label: 'Cartel' }, { value: 'stack', label: 'Lista' }]} onChange={v => setTweak('portada', v)} />
        <TweakSection label="Catálogo (cliente)" />
        <TweakRadio label="Vista" value={t.catalogo} options={[{ value: 'grid', label: 'Cuadrícula' }, { value: 'list', label: 'Lista' }]} onChange={v => setTweak('catalogo', v)} />
        <TweakSection label="Liquid glass" />
        <TweakRadio label="Intensidad" value={t.glass} options={[{ value: 'translucido', label: 'Translúcido' }, { value: 'esmerilado', label: 'Medio' }, { value: 'solido', label: 'Sólido' }]} onChange={v => setTweak('glass', v)} />
      </TweaksPanel>
    </div>
  );
}

function Layer({ show, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '76px 16px 16px',
      opacity: show ? 1 : 0, transform: show ? 'scale(1)' : 'scale(0.965)', pointerEvents: show ? 'auto' : 'none',
      transition: 'opacity 360ms var(--ease-out), transform 420ms var(--ease-entry)' }}>
      {children}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
