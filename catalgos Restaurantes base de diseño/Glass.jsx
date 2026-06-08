// Glass.jsx — glass panels, brand pattern art, buttons, marks. Shared by client + admin.
const { useRef: useRefG, useState: useStateG } = React;

// ── Glass panel with pointer-tracked specular sheen ──
function Glass({ variant = 'default', interactive = false, sheen = true, className = '', style = {}, children, onClick, ...rest }) {
  const ref = useRefG(null);
  const cls = variant === 'quiet' ? 'glass-quiet' : variant === 'solid' ? 'glass-solid' : 'glass';
  const move = (e) => {
    if (!sheen || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    ref.current.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  };
  return (
    <div ref={ref} className={`${cls} ${interactive ? 'press' : ''} ${className}`} onClick={onClick}
      onMouseMove={variant === 'default' ? move : undefined}
      style={{ borderRadius: 20, ...style }} {...rest}>
      {children}
    </div>
  );
}

// ── Brand pattern: concentric "cup spiral" motif + centered food icon ──
// Deterministic from seed. White line art on transparent (sits on glass).
function BrandPattern({ icon = 'coffee', seed = 0, size = '100%', iconScale = 1, faint = 0.16 }) {
  const rnd = (n) => { const x = Math.sin(seed * 99.7 + n * 12.3) * 1e4; return x - Math.floor(x); };
  const clusters = [
    { cx: 18 + rnd(1) * 14, cy: 70 + rnd(2) * 18, n: 3 + Math.floor(rnd(3) * 2) },
    { cx: 74 + rnd(4) * 16, cy: 24 + rnd(5) * 18, n: 2 + Math.floor(rnd(6) * 3) },
    { cx: 82 + rnd(7) * 10, cy: 78 + rnd(8) * 14, n: 2 + Math.floor(rnd(9) * 2) },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
      style={{ width: size, height: size, display: 'block' }}>
      <g stroke="#F5F3EF" strokeOpacity={faint} fill="none" strokeWidth="1.1">
        {clusters.map((c, ci) => (
          <g key={ci}>
            {Array.from({ length: c.n }).map((_, ri) => (
              <circle key={ri} cx={c.cx} cy={c.cy} r={3 + ri * 5.5} />
            ))}
            <circle cx={c.cx} cy={c.cy} r="1.4" fill="#F5F3EF" fillOpacity={faint + 0.1} stroke="none" />
          </g>
        ))}
      </g>
      {/* centered icon, drawn as foreground */}
      <g transform={`translate(50 50) scale(${1.7 * iconScale}) translate(-12 -12)`}
         stroke="#F5F3EF" strokeOpacity="0.92" strokeWidth="1.5" fill="none"
         strokeLinecap="round" strokeLinejoin="round">
        <BrandIconPath name={icon} />
      </g>
    </svg>
  );
}
function BrandIconPath({ name }) {
  // reuse the Icon registry by rendering its inner paths
  const tmp = Icon({ name, size: 24 });
  return tmp ? tmp.props.children : null;
}

// ── Buttons ──
function Btn({ variant = 'white', size = 'md', icon, iconRight, full, disabled, onClick, children, style = {} }) {
  const sizes = {
    sm: { padding: '8px 13px', fontSize: 13, borderRadius: 11, gap: 7 },
    md: { padding: '12px 18px', fontSize: 14, borderRadius: 13, gap: 8 },
    lg: { padding: '15px 22px', fontSize: 15, borderRadius: 15, gap: 9 },
  };
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '-0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    width: full ? '100%' : undefined, opacity: disabled ? 0.4 : 1,
    transition: 'transform 90ms var(--ease-out), background 150ms, border-color 150ms',
    WebkitTapHighlightColor: 'transparent', ...sizes[size],
  };
  const variants = {
    white: { className: 'btn-white' },
    glass: { className: 'glass-quiet', style: { color: 'var(--u-text)' } },
    ghost: { style: { background: 'transparent', color: 'var(--u-text-2)' } },
    outline: { style: { background: 'transparent', color: 'var(--u-text)', border: '1px solid var(--u-hair-2)' } },
    danger: { style: { background: 'transparent', color: '#F5F3EF', border: '1px solid var(--u-hair-2)' } },
  };
  const v = variants[variant] || variants.white;
  return (
    <button className={`press ${v.className || ''}`} disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...(v.style || {}), ...style }}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 18 : 16} />}
    </button>
  );
}

// ── Tag / Pill ──
function Tag({ kind, small }) {
  const label = AZ.TAG_LABEL[kind] || kind;
  const icon = AZ.TAG_ICON[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '2px 7px' : '3px 9px', borderRadius: 999,
      background: 'rgba(255,255,255,0.10)', border: '1px solid var(--u-hair-2)',
      color: 'var(--u-text)', fontFamily: 'var(--font-sans)', fontWeight: 600,
      fontSize: small ? 9.5 : 10.5, letterSpacing: '0.02em',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      {icon && <Icon name={icon} size={small ? 9 : 10} />}
      {label}
    </span>
  );
}

// ── Brand marks ──
function Mark({ size = 40, style = {} }) {
  return <img src="assets/mark-white.png" alt="Azúcar Negra"
    style={{ width: size, height: 'auto', display: 'block', ...style }} />;
}
function FullMark({ size = 120, style = {} }) {
  return <img src="assets/azucar-white.png" alt="Azúcar Negra"
    style={{ width: size, height: 'auto', display: 'block', ...style }} />;
}
function Wordmark({ size = 20, style = {} }) {
  return (
    <span style={{
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: size,
      letterSpacing: '-0.01em', color: 'var(--u-text)', lineHeight: 1, ...style,
    }}>Azúcar Negra</span>
  );
}

// ── Price ──
function Price({ amount, size = 16, muted, style = {} }) {
  return (
    <span className="t-mono" style={{ fontSize: size, fontWeight: 600, color: muted ? 'var(--u-text-3)' : 'var(--u-text)', whiteSpace: 'nowrap', ...style }}>
      <span style={{ fontSize: size * 0.66, opacity: 0.6, marginRight: 1 }}>Q</span>
      {amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

window.G = { Glass, BrandPattern, Btn, Tag, Mark, FullMark, Wordmark, Price };
