import { describe, it, expect, vi } from 'vitest';
import { publicOrigin, publicUrl } from './public-origin';

/* ── Contexto ─────────────────────────────────────────────────────
   2026-09-02: el dueño pulsaba "Continuar como {nombre}" y el navegador
   abría `https://localhost:10000/admin/login`. Comprobado contra
   producción antes de tocar nada:

     GET https://distleogin.com/admin/logout-operator
     → 307  location: https://localhost:10000/admin/login

   El origen salía de `request.url` / `request.nextUrl.origin`, que detrás
   del proxy de Render son el host INTERNO del contenedor (10000 es el
   puerto por defecto de Render), no el dominio por el que entró la
   persona. Este archivo fija la regla para que no vuelva. */

vi.mock('@/lib/tenant', () => ({ rootDomainForUrls: () => 'distleogin.com' }));

/** Petición con las cabeceras que pondría el proxy de delante. */
function pedir(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe('publicOrigin', () => {
  it('el caso del bug: URL interna de Render → el dominio configurado', () => {
    // Lo que Next veía de verdad en producción: la petición ya reenviada al
    // puerto interno, sin cabecera `x-forwarded-host` que la salve.
    expect(publicOrigin(pedir('https://localhost:10000/admin/logout-operator')))
      .toBe('https://distleogin.com');
  });

  it('manda `x-forwarded-host`, que es lo que escribió el navegador', () => {
    expect(
      publicOrigin(
        pedir('https://localhost:10000/x', {
          host: 'localhost:10000',
          'x-forwarded-host': 'azucar-negra-demo-admin.distleogin.com',
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toBe('https://azucar-negra-demo-admin.distleogin.com');
  });

  it('con varios saltos se queda con el primero', () => {
    expect(
      publicOrigin(
        pedir('https://localhost:10000/x', {
          'x-forwarded-host': 'distleogin.com, interno.render.internal',
          'x-forwarded-proto': 'https, http',
        }),
      ),
    ).toBe('https://distleogin.com');
  });

  it('el subdominio del panel se conserva: no se colapsa al dominio raíz', () => {
    // Si esto se rompiera, un dueño en el panel de su restaurante saldría
    // disparado al dominio raíz en cada redirect de estas rutas.
    expect(
      publicOrigin(
        pedir('https://localhost:10000/admin/logout-operator', {
          host: 'mi-resto-admin.distleogin.com',
        }),
      ),
    ).toBe('https://mi-resto-admin.distleogin.com');
  });

  it('el subdominio del tenant en local se conserva, y habla http', () => {
    // `azucarnegra.localhost` NO es el host interno del contenedor: es donde
    // trabaja el desarrollador. Colapsarlo al dominio configurado (o servirlo
    // por https) rompería el entorno local de GUIA_ENTORNO_LOCAL.md.
    expect(publicOrigin(pedir('http://azucarnegra.localhost:3000/x', {
      host: 'azucarnegra.localhost:3000',
    }))).toBe('http://azucarnegra.localhost:3000');
  });

  it('nombre de servicio sin punto (red privada) → el dominio configurado', () => {
    expect(publicOrigin(pedir('http://menuvivo:10000/x', { host: 'menuvivo:10000' })))
      .toBe('https://distleogin.com');
  });
});

describe('publicUrl', () => {
  it('pega la ruta al origen público', () => {
    expect(publicUrl(pedir('https://localhost:10000/x'), '/admin/login?correo=no-verificado'))
      .toBe('https://distleogin.com/admin/login?correo=no-verificado');
  });
});
