'use client';

/* Sección colapsable reutilizable para las páginas del admin.
   Reduce el ruido visual: cada bloque se puede plegar y el estado se recuerda
   por `storageKey`. No agrega fondo glass propio para no chocar con el estilo
   de los editores que envuelve. */

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons';

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
  defaultOpen?: boolean;
  /** Si se pasa, recuerda abierto/cerrado en localStorage. */
  storageKey?: string;
  children: ReactNode;
}

export default function CollapsibleCard({ title, subtitle, icon, defaultOpen = true, storageKey, children }: Props) {
  const key = storageKey ? `admin-collapse:${storageKey}` : null;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!key) return;
    const stored = localStorage.getItem(key);

    if (stored !== null) setOpen(stored === '1');
  }, [key]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (key) { try { localStorage.setItem(key, next ? '1' : '0'); } catch {} }
      return next;
    });
  }

  return (
    <div style={{ borderTop: '1px solid var(--u-hair)', marginTop: 24, paddingTop: 8 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="press"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          padding: '8px 0', color: 'inherit',
        }}
      >
        {icon && (
          <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--surface-3)', color: 'var(--u-text)' }}>
            <Icon name={icon} size={17} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--u-text)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: 'var(--u-text-3)', marginTop: 3, lineHeight: 1.45 }}>{subtitle}</div>}
        </div>
        <Icon name="chevronDown" size={18} style={{ color: 'var(--u-text-3)', flexShrink: 0, transition: 'transform 180ms var(--ease-out)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}
