'use client';

import { getStableLinkPrefix } from '@/lib/tenant-client';
import { urlDelPuente } from '@/lib/cuenta/puente';

/**
 * «Entrar con mi cuenta Leogin» — la puerta del menú hacia el puente de
 * sesión (PLAN_BILLETERA_COMENSAL_2026-10-25, BIL-02 paso 1).
 *
 * La URL se arma AL TOCAR: depende de `window.location` (¿link estable o
 * subdominio? ¿en qué página estoy?) y leerla en el render rompería la
 * hidratación. Vuelve a esta misma página con «Mi cuenta» abierta.
 */
export default function LeoginCuentaLink({ restaurantId }: { restaurantId: string }) {
  function ir() {
    const prefijo = getStableLinkPrefix();
    const url = new URL(window.location.href);
    url.searchParams.set('openTab', 'cuenta');
    const ruta = url.pathname + url.search;
    // La vuelta es DENTRO del restaurante: sin el prefijo `/m/<ref>`, que el
    // canje vuelve a poner.
    const vuelta = prefijo && ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) || '/' : ruta;
    window.location.assign(urlDelPuente(restaurantId, prefijo ? 'm' : 'sub', vuelta));
  }

  return (
    <button
      type="button"
      onClick={ir}
      className="press"
      style={{
        width: '100%', marginTop: 10, padding: '11px 18px', borderRadius: 'var(--radius-full)',
        background: 'transparent', color: 'var(--u-text)', fontWeight: 600, fontSize: 'var(--m-fs-md)',
        border: '1px solid var(--u-hair)', cursor: 'pointer',
      }}
    >
      Entrar con mi cuenta Leogin
    </button>
  );
}
