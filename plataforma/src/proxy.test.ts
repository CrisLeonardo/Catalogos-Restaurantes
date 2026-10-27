import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('el code aterriza en un host que no es nuestro', () => {
  // La Site URL de Supabase apunta a la URL cruda de Render. GoTrue manda
  // el code ahi, donde el verificador PKCE —escrito en nuestro dominio— no
  // llega ni puede llegar: una cookie no cruza de dominio.
  const AJENO = 'https://catalogos-restaurantes.onrender.com/?code=abc123';

  it('lo devuelve al dominio de verdad, conservando ruta y parámetros', async () => {
    const res = await proxy(new NextRequest(AJENO, {
      headers: { host: 'catalogos-restaurantes.onrender.com', 'x-forwarded-proto': 'https' },
    }));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://distleogin.com/?code=abc123');
  });

  it('también si cae directamente en el callback', async () => {
    const res = await proxy(
      new NextRequest('https://catalogos-restaurantes.onrender.com/admin/auth/google/callback?code=abc&intent=signup', {
        headers: { host: 'catalogos-restaurantes.onrender.com', 'x-forwarded-proto': 'https' },
      }),
    );
    expect(res.headers.get('location')).toBe(
      'https://distleogin.com/admin/auth/google/callback?code=abc&intent=signup',
    );
  });

  it('no rebota nada en nuestro propio dominio', async () => {
    // Si no, sería un bucle: llega, rebota, vuelve a llegar.
    const res = await proxy(
      new NextRequest('https://distleogin.com/?code=abc123', { headers: { host: 'distleogin.com' } }),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('no toca una visita normal al host de Render, sin code', async () => {
    const res = await proxy(
      new NextRequest('https://catalogos-restaurantes.onrender.com/planes', {
        headers: { host: 'catalogos-restaurantes.onrender.com' },
      }),
    );
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('Supabase devuelve el code a la portada', () => {
  // Cuando el `redirect_to` no esta en la lista blanca de Supabase, GoTrue
  // no da error: manda el code a la Site URL a secas. La persona acaba en
  // la portada, sin sesion, y en los logs no aparece NADA porque el
  // callback ni se ejecuta.
  const PORTADA = 'https://distleogin.com/?code=abc123&intent=signup';

  it('reenvia el code al callback del panel si hay verificador del personal', async () => {
    const res = await proxy(
      new NextRequest(PORTADA, {
        headers: { cookie: `${STAFF}-code-verifier=VERIFICADOR`, 'x-forwarded-proto': 'https' },
      }),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://distleogin.com/admin/auth/google/callback?code=abc123&intent=signup',
    );
  });

  it('no toca la portada normal, sin code', async () => {
    const res = await proxy(
      new NextRequest('https://distleogin.com/', {
        headers: { cookie: `${STAFF}-code-verifier=VERIFICADOR` },
      }),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('sin verificador del personal no reenvia nada', async () => {
    // Un `code` suelto en la portada no basta: sin la cookie que lo ata a
    // este navegador, reenviarlo seria seguir a ciegas un parametro ajeno.
    const res = await proxy(
      new NextRequest(PORTADA, { headers: { cookie: 'tema=oscuro' } }),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('el verificador del COMENSAL no dispara el reenvio al panel', async () => {
    const res = await proxy(
      new NextRequest(PORTADA, {
        headers: { cookie: 'sb-leogin-diner-v2-code-verifier=OTRO' },
      }),
    );
    expect(res.headers.get('location')).toBeNull();
  });

  it('el verificador de la BILLETERA lo reenvia a su propio callback, no al del panel', async () => {
    const res = await proxy(
      new NextRequest(PORTADA, {
        headers: { cookie: 'sb-leogin-cuenta-code-verifier=CUENTA', 'x-forwarded-proto': 'https' },
      }),
    );
    expect(res.headers.get('location')).toBe(
      'https://distleogin.com/billetera/auth/callback?code=abc123&intent=signup',
    );
  });

  it('con los dos verificadores manda el panel, como hasta ahora', async () => {
    const res = await proxy(
      new NextRequest(PORTADA, {
        headers: {
          cookie: `sb-leogin-cuenta-code-verifier=CUENTA; ${STAFF}-code-verifier=VERIFICADOR`,
          'x-forwarded-proto': 'https',
        },
      }),
    );
    expect(res.headers.get('location')).toContain('/admin/auth/google/callback');
  });
});

describe('la sesión de la cuenta Leogin (billetera)', () => {
  const WALLET = 'sb-leogin-cuenta';

  it('no se toma por una cookie del personal: una sesión muerta del panel no la borra', async () => {
    // Muerta SOLO la del personal (el cliente sin nombre de cookie propio).
    h.behaviour = async (opts) => {
      const nombre = (opts as { cookieOptions?: { name?: string } }).cookieOptions?.name;
      return nombre ? { error: null } : sesionMuerta(opts);
    };
    const res = await proxy(
      new NextRequest('https://distleogin.com/billetera', { headers: { cookie: `${STAFF}=MUERTO; ${WALLET}=CUENTA` } }),
    );
    expect(setCookies(res).some((c) => c.startsWith(`${WALLET}=;`))).toBe(false);
    expect(cookiesQueVeElRender(res)).toContain(`${WALLET}=CUENTA`);
  });

  it('se refresca en /billetera, con su nombre y sin dominio ancho', async () => {
    h.behaviour = async (opts) => {
      const nombres = opts.cookies.getAll().map(({ name }) => name);
      if (nombres.includes(WALLET)) {
        opts.cookies.setAll([{ name: WALLET, value: 'CUENTA-NUEVA', options: { path: '/' } }]);
      }
      return { error: null };
    };
    const res = await proxy(
      new NextRequest('https://distleogin.com/billetera/puente?r=demo', { headers: { cookie: `${WALLET}=CUENTA` } }),
    );
    const escrita = setCookies(res).find((c) => c.startsWith(`${WALLET}=CUENTA-NUEVA`));
    expect(escrita).toBeDefined();
    expect(escrita).not.toMatch(/domain=/i);
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

/* ============================================================
   EL PANEL POR RUTA (§2a) — la base del origen único
   ------------------------------------------------------------
   `distleogin.com/panel/<slug>/menu` tiene que resolverse igual que lo hacía
   `<slug>-admin.distleogin.com/menu`: mismo rewrite a `/admin/menu`, mismo
   `x-tenant-slug`. Es lo que permite que los 54 archivos que resuelven el
   restaurante no se enteren del cambio de arquitectura.

   Verificado a mano el 2026-09-02 contra el entorno local (el panel se pinta
   entero en `/panel/rincon502`); esto lo fija para que no se caiga solo.
   ============================================================ */

/** Destino del rewrite que pidió el proxy, o null si no reescribió. */
function rewriteA(res: Response): string | null {
  const raw = res.headers.get('x-middleware-rewrite');
  return raw ? new URL(raw).pathname : null;
}

/** El `x-tenant-slug` que verá el render. */
function tenantQueVeElRender(res: Response): string | null {
  return res.headers.get('x-middleware-request-x-tenant-slug');
}

describe('el panel por ruta (origen único)', () => {
  beforeEach(() => {
    h.behaviour = async () => ({ error: null });
  });

  const raiz = (path: string) => new NextRequest(`https://distleogin.com${path}`);

  it('/panel/<slug> → /admin, con el restaurante resuelto', async () => {
    const res = await proxy(raiz('/panel/rincon502'));

    expect(rewriteA(res)).toBe('/admin');
    expect(tenantQueVeElRender(res)).toBe('rincon502');
  });

  it('/panel/<slug>/<seccion> conserva la sección', async () => {
    const res = await proxy(raiz('/panel/rincon502/menu/productos/new'));

    expect(rewriteA(res)).toBe('/admin/menu/productos/new');
    expect(tenantQueVeElRender(res)).toBe('rincon502');
  });

  it('marca área de personal: el panel usa sus 2 temas fijos, no el del restaurante', async () => {
    const res = await proxy(raiz('/panel/rincon502/caja'));

    expect(res.headers.get('x-middleware-request-x-admin-area')).toBe('1');
  });

  it('/panel a secas no es de nadie: no resuelve restaurante ni reescribe', async () => {
    const res = await proxy(raiz('/panel'));

    expect(rewriteA(res)).toBe(null);
    expect(tenantQueVeElRender(res)).toBe(null);
  });

  it('Mi cuenta NO se toca: es de la persona, no de un restaurante', async () => {
    const res = await proxy(raiz('/mi-cuenta'));

    expect(rewriteA(res)).toBe(null);
    expect(tenantQueVeElRender(res)).toBe(null);
  });

  it('un `x-tenant-slug` mandado por el cliente no elige el restaurante', async () => {
    // Mismo candado que ya cubre tenant-guard.test.ts, ahora por la ruta: la
    // cabecera interna se borra SIEMPRE antes de escribirla, así que lo único
    // que decide el tenant es `/panel/<slug>`.
    const res = await proxy(
      new NextRequest('https://distleogin.com/panel/rincon502/caja', {
        headers: { 'x-tenant-slug': 'otro-restaurante' },
      }),
    );

    expect(tenantQueVeElRender(res)).toBe('rincon502');
  });
});

/* ============================================================
   EL SUBDOMINIO VIEJO DEL PANEL (§1d) — fase 5 del origen único
   ------------------------------------------------------------
   `<slug>-admin.<raíz>` dejó de ser a donde apunta nadie, pero NO puede dejar
   de funcionar: hay íconos ya instalados en teléfonos, marcadores guardados y
   Leogin Desktop apuntando ahí. Este bloque fija el 308 y, sobre todo, las
   tres exclusiones — que son las que evitan romper cosas que hoy funcionan.
   ============================================================ */

/** Petición al subdominio viejo. El `host` va explícito: es lo que mira §1d. */
function subdominioViejo(path: string, method = 'GET') {
  return new NextRequest(`https://demo-admin.distleogin.com${path}`, {
    method,
    headers: { host: 'demo-admin.distleogin.com' },
  });
}

describe('el subdominio viejo del panel redirige al origen único', () => {
  beforeEach(() => {
    h.behaviour = async () => ({ error: null });
  });

  it('la raíz del panel → /panel/<slug>', async () => {
    const res = await proxy(subdominioViejo('/'));

    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://distleogin.com/panel/demo');
  });

  it('una sección, con y sin el prefijo /admin, llega al mismo sitio', async () => {
    // El proxy viejo (§3) reescribía `/menu` a `/admin/menu`, así que los dos
    // están por ahí en marcadores y en enlaces de correos antiguos.
    for (const ruta of ['/menu', '/admin/menu']) {
      const res = await proxy(subdominioViejo(ruta));
      expect(res.headers.get('location')).toBe('https://distleogin.com/panel/demo/menu');
    }
  });

  it('conserva la query', async () => {
    const res = await proxy(subdominioViejo('/menu/productos/new?cat=postres'));

    expect(res.headers.get('location'))
      .toBe('https://distleogin.com/panel/demo/menu/productos/new?cat=postres');
  });

  it('Mi cuenta NO se cuelga del restaurante: es de la persona', async () => {
    const res = await proxy(subdominioViejo('/mi-cuenta'));

    expect(res.headers.get('location')).toBe('https://distleogin.com/mi-cuenta');
  });

  it('la vista previa tampoco lleva slug', async () => {
    const res = await proxy(subdominioViejo('/preview/abc-123'));

    expect(res.headers.get('location')).toBe('https://distleogin.com/preview/abc-123');
  });

  /* ── Las tres exclusiones ─────────────────────────────────────────── */

  it('un POST NO se redirige: llegaría con el Origin viejo y Next lo rechazaría', async () => {
    // Una pestaña que ya estaba abierta sigue trabajando por §3 hasta que la
    // persona navegue. Redirigir aquí rompería su Server Action a media faena.
    const res = await proxy(subdominioViejo('/menu', 'POST'));

    expect(res.status).not.toBe(308);
  });

  it('/api/* NO se redirige: el agente de impresión tiene esa URL fija', async () => {
    const res = await proxy(subdominioViejo('/api/agent/shell-heartbeat'));

    expect(res.status).not.toBe(308);
  });

  it('/auth/* NO se redirige: no se toca el canje del code de Google', async () => {
    const res = await proxy(subdominioViejo('/admin/auth/google/callback?code=xyz'));

    expect(res.status).not.toBe(308);
  });

  /* ── El bucle ────────────────────────────────────────────────────── */

  it('el Location va ABSOLUTO: un relativo se resolvía contra el subdominio viejo', async () => {
    // Este es el bug que apareció al probarlo con `curl -L`: NextResponse
    // .redirect acorta el destino a ruta relativa cuando le parece del mismo
    // origen, el navegador lo resolvía contra `<slug>-admin.…` y la petición
    // volvía a caer en §1d apilando el prefijo, sin fin.
    const res = await proxy(subdominioViejo('/menu'));

    expect(res.headers.get('location')).toMatch(/^https:\/\/distleogin\.com\//);
  });

  it('una ruta ya traducida no se vuelve a prefijar (idempotente)', async () => {
    const res = await proxy(subdominioViejo('/panel/demo/menu'));

    expect(res.headers.get('location')).toBe('https://distleogin.com/panel/demo/menu');
  });

  it('el dominio raíz no se toca (no es el subdominio viejo)', async () => {
    const res = await proxy(
      new NextRequest('https://distleogin.com/panel/demo/menu', {
        headers: { host: 'distleogin.com' },
      }),
    );

    expect(res.status).not.toBe(308);
  });
});

/* ============================================================
   LA COOKIE DEL COMENSAL BAJO EL LINK ESTABLE (BIL-03)
   ------------------------------------------------------------
   Se escribía con `Path=/m/<ref>/`, y Next hace 308 de `/m/<ref>/` a
   `/m/<ref>`: en la portada del QR general la sesión del comensal no
   llegaba. Ahora va en `/m/<ref>`, y el proxy muda la vieja la primera vez
   que la ve (solo llega en las subpáginas) sin dejar una fantasma.
   ============================================================ */

describe('la cookie del comensal bajo el link estable', () => {
  const DINER = 'sb-leogin-diner-v2';
  const MARCA = 'leogin-diner-ruta';

  beforeEach(() => {
    h.behaviour = async () => ({ error: null });
    vi.stubGlobal('fetch', async () => Response.json([{ slug: 'rincon502', status: 'active' }]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const estable = (path: string, cookie = '') =>
    new NextRequest(`https://distleogin.com${path}`, { headers: cookie ? { cookie } : {} });
  const delComensal = (res: Response) => setCookies(res).filter((c) => c.startsWith(DINER) || c.startsWith(MARCA));

  it('el token rotado se escribe en /m/<ref>, sin barra final', async () => {
    h.behaviour = async (opts) => {
      const o = opts as unknown as { cookieOptions?: { name?: string } };
      if (o.cookieOptions?.name === DINER) {
        opts.cookies.setAll([{ name: DINER, value: 'TOKEN-NUEVO', options: { path: '/' } }]);
      }
      return { error: null };
    };
    const res = await proxy(estable('/m/rincon502', `${DINER}=TOKEN-VIEJO`));

    expect(delComensal(res)).toEqual([expect.stringMatching(/^sb-leogin-diner-v2=TOKEN-NUEVO; Path=\/m\/rincon502(;|$)/)]);
  });

  it('en la portada no hay nada que mudar: la vieja ni siquiera llega ahí', async () => {
    const res = await proxy(estable('/m/rincon502', `${DINER}=SESION`));

    expect(delComensal(res)).toEqual([]);
    expect(cookiesQueVeElRender(res)).toContain(`${DINER}=SESION`);
  });

  it('en una subpágina, sin la marca, muda la sesión a /m/<ref> y borra la de /m/<ref>/', async () => {
    const res = await proxy(estable('/m/rincon502/4', `${DINER}.0=TROZO0; ${DINER}.1=TROZO1`));
    const escritas = delComensal(res);

    for (const [name, value] of [[`${DINER}.0`, 'TROZO0'], [`${DINER}.1`, 'TROZO1']]) {
      expect(escritas).toContainEqual(expect.stringMatching(new RegExp(`^${name.replace('.', '\.')}=; Path=/m/rincon502/; Max-Age=0`)));
      expect(escritas).toContainEqual(expect.stringMatching(new RegExp(`^${name.replace('.', '\.')}=${value}; Path=/m/rincon502;`)));
    }
    expect(escritas).toContainEqual(expect.stringMatching(/^leogin-diner-ruta=1; Path=\/m\/rincon502;/));
    // El render de esta misma petición sigue viendo la sesión.
    expect(cookiesQueVeElRender(res)).toContain(`${DINER}.0=TROZO0`);
  });

  it('con la marca no reescribe nada: la mudanza es una sola vez', async () => {
    const res = await proxy(estable('/m/rincon502/4', `${DINER}=SESION; ${MARCA}=1`));
    expect(delComensal(res)).toEqual([]);
  });

  it('si el refresco rotó el token, se muda el token NUEVO, no el que llegó', async () => {
    h.behaviour = async (opts) => {
      const o = opts as unknown as { cookieOptions?: { name?: string } };
      if (o.cookieOptions?.name === DINER) {
        opts.cookies.setAll([{ name: DINER, value: 'TOKEN-NUEVO', options: { path: '/' } }]);
      }
      return { error: null };
    };
    const res = await proxy(estable('/m/rincon502/checkout', `${DINER}=TOKEN-VIEJO`));
    const escritas = delComensal(res);

    expect(escritas.filter((c) => c.includes('TOKEN-VIEJO'))).toEqual([]);
    expect(escritas).toContainEqual(expect.stringMatching(/^sb-leogin-diner-v2=TOKEN-NUEVO; Path=\/m\/rincon502(;|$)/));
    expect(escritas).toContainEqual(expect.stringMatching(/^sb-leogin-diner-v2=; Path=\/m\/rincon502\/; Max-Age=0/));
  });

  it('con las dos rutas a la vez (fantasma) borra la vieja y no arma una sesión mezclada', async () => {
    let vioSesion = false;
    h.behaviour = async (opts) => {
      const o = opts as unknown as { cookieOptions?: { name?: string } };
      if (o.cookieOptions?.name === DINER) {
        vioSesion = opts.cookies.getAll().some(({ name }) => name.startsWith(DINER));
      }
      return { error: null };
    };
    // El navegador manda primero la de ruta más larga: la vieja.
    const res = await proxy(estable('/m/rincon502/4', `${DINER}=VIEJA; ${DINER}=NUEVA; ${MARCA}=1`));
    const escritas = delComensal(res);

    expect(escritas).toContainEqual(expect.stringMatching(/^sb-leogin-diner-v2=; Path=\/m\/rincon502\/; Max-Age=0/));
    // La buena (la de /m/<ref>) no se toca.
    expect(escritas.filter((c) => /Path=\/m\/rincon502(;|$)/.test(c) && c.startsWith(`${DINER}=`))).toEqual([]);
    expect(vioSesion).toBe(false);
    expect(cookiesQueVeElRender(res) ?? '').not.toContain(DINER);
  });

  it('sin sesión del comensal no escribe nada (ni la marca)', async () => {
    const res = await proxy(estable('/m/rincon502/4', 'tema=oscuro'));
    expect(delComensal(res)).toEqual([]);
  });
});
