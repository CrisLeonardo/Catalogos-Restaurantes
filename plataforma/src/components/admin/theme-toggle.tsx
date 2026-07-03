'use client';

/* Conmutador claro/oscuro del área de personal (admin y panel de grupo).
   El panel usa 2 temas FIJOS (ver globals.css `html[data-admin-area]`): la
   elección vive en la cookie `admin-theme`, que el layout raíz lee en SSR
   para pintar el tema correcto sin flash. Aquí solo se alterna en vivo. */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

const THEME_COOKIE = 'admin-theme';

export default function AdminThemeToggle() {
  // El SSR ya pintó el tema correcto; aquí solo se sincroniza el botón.
  const [scheme, setScheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    setScheme(document.documentElement.dataset.scheme === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next = scheme === 'light' ? 'dark' : 'light';
    setScheme(next);
    const el = document.documentElement;
    el.dataset.scheme = next;
    // El popup nativo de <select> resuelve su esquema desde el <html> raíz;
    // el SSR lo fija inline y aquí se actualiza al alternar.
    el.style.colorScheme = next;
    // Cookie compartida entre subdominios (admin.slug.* y slug.*/admin) para
    // que el próximo SSR pinte el tema elegido sin flash.
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.split(',')[0].trim() ?? '';
    const domain = root && !root.includes('localhost') ? `; domain=.${root.split(':')[0]}` : '';
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax${domain}`;
  }

  return (
    <button
      onClick={toggle}
      title={scheme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      aria-label={scheme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      className="press glass-quiet"
      style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', color: 'var(--u-text)', border: 'none', cursor: 'pointer', background: 'none', flexShrink: 0 }}
    >
      <Icon name={scheme === 'light' ? 'moon' : 'sun'} size={18} />
    </button>
  );
}
