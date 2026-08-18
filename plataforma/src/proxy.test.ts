import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/* ============================================================
   EL PROXY Y LA SESIÓN DEL PERSONAL
   ------------------------------------------------------------
   Estas pruebas cubren el fallo que llenaba los logs de producción de
   `Invalid Refresh Token: Refresh Token Not Found` en cada petición:

    · La causa: una cookie fantasma —la misma clave, host-only, de antes de
      compartir la sesión entre subdominios— llega junto a la buena. El
      servidor solo se queda con un valor por nombre, así que arma la sesión
      con trozos de dos generaciones distintas; y cuando la da por muerta la
      borra con `Domain=`, que a la host-only no la toca. Vuelve a llegar en
      la petición siguiente. Y en la siguiente.
    · De paso: el proxy le pasaba al render la cabecera `cookie` de ANTES de
      rotar el token, dejando dos versiones distintas de las mismas cookies
      dentro de una sola petición.

   Se prueba contra los objetos de verdad de Next (NextRequest/NextResponse)
   porque justo lo que falla es cómo Next transporta las cookies del proxy
   al render — un doble de prueba habría dado por bueno el código roto.
   ============================================================ */

const h = vi.hoisted(() => ({
  /** Qué hace `getUser()` en cada escenario. La pone cada prueba. */
  behaviour: null as unknown as (
    opts: { cookies: { getAll: () => { name: string; value: string }[]; setAll: (c: unknown[]) => void } },
  ) => Promise<{ error: { code: string } | null }>,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: Parameters<typeof h.behaviour>[0]) => ({
    auth: { getUser: () => h.behaviour(opts) },
  }),
}));

process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'distleogin.com';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

const { proxy } = await import('./proxy');

const STAFF = 'sb-proyecto-auth-token';
/** Un panel de restaurante: solo se refresca la sesión del PERSONAL. */
const PANEL = 'https://demo-admin.distleogin.com/admin/pedidos';

function panelRequest(cookie: string, url = PANEL) {
  return new NextRequest(url, { headers: { cookie } });
}

/** La cabecera `cookie` que verá el render en `headers()`. */
function cookiesQueVeElRender(res: Response): string | null {
  return res.headers.get('x-middleware-request-cookie');
}

/** Los Set-Cookie de la respuesta, ya separados. */
function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

/** getUser() que rota el token, como hace Supabase cuando el acceso caducó. */
const rotaElToken = async (opts: Parameters<typeof h.behaviour>[0]) => {
  opts.cookies.setAll([{ name: STAFF, value: 'TOKEN-NUEVO', options: { path: '/' } }]);
  return { error: null };
};

/** getUser() con un refresh token que Supabase ya no reconoce. */
const sesionMuerta = async (opts: Parameters<typeof h.behaviour>[0]) => {
  // auth-js borra la sesión (y el verificador PKCE) cuando el refresco falla.
  opts.cookies.setAll([
    { name: STAFF, value: '', options: { path: '/', maxAge: 0 } },
    { name: `${STAFF}-code-verifier`, value: '', options: { path: '/', maxAge: 0 } },
  ]);
  return { error: { code: 'refresh_token_not_found' } };
};

beforeEach(() => {
  h.behaviour = async () => ({ error: null });
});

describe('el token recién rotado llega al render', () => {
  it('la cabecera cookie del render lleva el token NUEVO, no el que el proxy acaba de gastar', async () => {
    // `requestHeaders` es una copia sacada antes del refresco, y el token
    // nuevo solo se escribía en `request.cookies`. `cookies()` se salvaba
    // porque Next le mezcla las Set-Cookie del proxy, pero `headers()`
    // seguía sirviendo el token viejo: dos versiones de las mismas cookies
    // en la misma petición, y la cruda con un refresh token ya consumido.
    h.behaviour = rotaElToken;
    const res = await proxy(panelRequest(`${STAFF}=TOKEN-VIEJO; tema=oscuro`));

    expect(cookiesQueVeElRender(res)).toContain(`${STAFF}=TOKEN-NUEVO`);
    expect(cookiesQueVeElRender(res)).not.toContain('TOKEN-VIEJO');
  });

  it('y el navegador también se lo lleva', async () => {
    h.behaviour = rotaElToken;
    const res = await proxy(panelRequest(`${STAFF}=TOKEN-VIEJO`));

    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=TOKEN-NUEVO`))).toBe(true);
  });

  it('las demás cookies siguen intactas', async () => {
    h.behaviour = rotaElToken;
    const res = await proxy(panelRequest(`${STAFF}=TOKEN-VIEJO; tema=oscuro`));

    expect(cookiesQueVeElRender(res)).toContain('tema=oscuro');
  });

  it('sin sesión que rotar, el render recibe las cookies tal cual', async () => {
    const res = await proxy(panelRequest('tema=oscuro'));
    expect(cookiesQueVeElRender(res)).toBe('tema=oscuro');
  });
});

describe('el verificador PKCE de un login con Google en vuelo', () => {
  it('sobrevive aunque la sesión anterior esté muerta', async () => {
    // Alguien con una sesión caducada pulsa "Continuar con Google": el
    // navegador guarda el verificador y se va a Google. Al volver, el proxy
    // corre ANTES que el callback. Si deja pasar el borrado que pide
    // auth-js, el callback ya no tiene con qué canjear el `code`.
    h.behaviour = sesionMuerta;
    const res = await proxy(
      panelRequest(
        `${STAFF}=MUERTO; ${STAFF}-code-verifier=VERIFICADOR`,
        'https://demo-admin.distleogin.com/admin/auth/google/callback?code=abc',
      ),
    );

    expect(cookiesQueVeElRender(res)).toContain(`${STAFF}-code-verifier=VERIFICADOR`);
    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}-code-verifier=;`))).toBe(false);
  });
});

describe('sesion muerta: el proxy suelta la cookie por su cuenta', () => {
  /** getUser() falla y auth-js NO alcanza a pedir el borrado (promesa suelta). */
  const muertaSinLimpiar = async () => ({ error: { code: 'refresh_token_not_found' } });

  it('expira la cookie aunque auth-js no haya pedido borrarla', async () => {
    // auth-js sí llama a _removeSession cuando el refresco falla, pero por el
    // camino de onAuthStateChange -> _emitInitialSession, que corre en una
    // promesa que nadie espera. Si ese borrado llega despues de armada la
    // respuesta, el navegador conserva la cookie muerta y la vuelve a mandar
    // en la peticion siguiente. Para siempre. Aqui la soltamos nosotros.
    h.behaviour = muertaSinLimpiar;
    const res = await proxy(panelRequest(`${STAFF}=MUERTO; ${STAFF}.0=A; tema=oscuro`));

    const borrados = setCookies(res).filter((c) => /max-age=0/i.test(c));
    expect(borrados.some((c) => c.startsWith(`${STAFF}=;`))).toBe(true);
    expect(borrados.some((c) => c.startsWith(`${STAFF}.0=;`))).toBe(true);
  });

  it('no arrastra cookies ajenas ni el verificador PKCE', async () => {
    h.behaviour = muertaSinLimpiar;
    const res = await proxy(
      panelRequest(`${STAFF}=MUERTO; ${STAFF}-code-verifier=VERIFICADOR; tema=oscuro`),
    );

    const borrados = setCookies(res).filter((c) => /max-age=0/i.test(c));
    expect(borrados.some((c) => c.startsWith('tema=;'))).toBe(false);
    expect(borrados.some((c) => c.startsWith(`${STAFF}-code-verifier=;`))).toBe(false);
  });

  it('en la MISMA peticion el render ya no ve la sesion muerta', async () => {
    // Si no se quita tambien del request, el layout del panel vuelve a
    // intentar el mismo refresh token muerto antes de que el navegador
    // reciba el Set-Cookie que lo limpia.
    h.behaviour = muertaSinLimpiar;
    const res = await proxy(panelRequest(`${STAFF}=MUERTO; tema=oscuro`));

    expect(cookiesQueVeElRender(res)).not.toContain('MUERTO');
    expect(cookiesQueVeElRender(res)).toContain('tema=oscuro');
  });

  it('una sesion sana no se suelta', async () => {
    h.behaviour = rotaElToken;
    const res = await proxy(panelRequest(`${STAFF}=TOKEN-VIEJO`));
    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=;`))).toBe(false);
  });
});

describe('cookie fantasma del personal', () => {
  const conFantasma = `${STAFF}=FANTASMA-VIEJA; tema=oscuro; ${STAFF}=LA-BUENA`;

  it('expira la copia host-only, que es la única forma de quitarla de en medio', async () => {
    h.behaviour = sesionMuerta;
    const res = await proxy(panelRequest(conFantasma));

    // Sin `Domain=`: el borrado va contra la cookie host-only. Con `Domain=`
    // el navegador solo tocaría la de dominio ancho y la fantasma seguiría
    // llegando en cada petición, para siempre.
    const borrado = setCookies(res).find(
      (c) => c.startsWith(`${STAFF}=;`) && !/domain=/i.test(c),
    );
    expect(borrado).toBeDefined();
    expect(borrado).toMatch(/max-age=0/i);
  });

  it('no da por perdida la sesión buena con el veredicto de una lectura mezclada', async () => {
    // Lo que se leyó son trozos de dos cookies distintas: que Supabase diga
    // "esto no vale" no prueba que la sesión buena esté muerta. Se expira la
    // fantasma y se deja que la siguiente petición lo diga leyendo una sola.
    h.behaviour = sesionMuerta;
    const res = await proxy(panelRequest(conFantasma));

    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=;`) && /domain=/i.test(c))).toBe(false);
  });

  it('sin fantasma, una sesión muerta sí se limpia con normalidad', async () => {
    h.behaviour = sesionMuerta;
    const res = await proxy(panelRequest(`${STAFF}=MUERTO`));

    // auth-js la borra con el dominio ancho...
    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=;`) && /domain=\.distleogin\.com/i.test(c))).toBe(true);
    // ...y además se expira la posible copia host-only, que puede ser ya la
    // única que queda (y entonces no hay nombre repetido que delate nada).
    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=;`) && !/domain=/i.test(c))).toBe(true);
  });

  it('una sesión sana no se toca', async () => {
    h.behaviour = rotaElToken;
    const res = await proxy(panelRequest(`${STAFF}=TOKEN-VIEJO`));

    expect(setCookies(res).some((c) => c.startsWith(`${STAFF}=;`))).toBe(false);
  });
});
