/* ============================================================
   ENTRAR AL PANEL EN LOCAL, SIN CONTRASEÑA
   ------------------------------------------------------------
   Herramienta de DESARROLLO. Abre una sesión real de Supabase para
   un usuario de prueba por el mismo camino que el login por PIN
   (`lib/actions/staff-pin.ts`): `auth.admin.generateLink` +
   `verifyOtp`. No hay contraseñas de por medio en ningún momento.

   Existe porque revisar el panel en local obligaba a teclear una
   contraseña en el formulario de acceso una y otra vez, y porque las
   credenciales de prueba de GUIA_ENTORNO_LOCAL.md son fixtures, no
   secretos: escribirlas a mano no protege nada y se pierde tiempo.

   ── DOS CANDADOS, Y LOS DOS TIENEN QUE ESTAR ABIERTOS ──────────

     1. `DEV_LOGIN=1` en el entorno. No es `NEXT_PUBLIC_`: no viaja al
        navegador y no se puede encender desde fuera.

     2. El Supabase configurado tiene que ser LOCAL (127.0.0.1,
        localhost o ::1). Este es el candado que de verdad importa: si
        la bandera se colara en un despliegue real, la ruta seguiría
        negándose, porque ahí `NEXT_PUBLIC_SUPABASE_URL` apunta a la
        nube. Una bandera se enciende por error; un host no.

   Con cualquiera de los dos cerrado responde 404 —no 403— para que la
   ruta no exista siquiera como pista.

   Uso:
     /api/dev-login                       → dueño de prueba, a /admin
     /api/dev-login?email=otro@test       → otro usuario
     /api/dev-login?next=/admin/caja      → a dónde ir después
     /api/dev-login?cuenta=1&email=x@test → sesión de la CUENTA LEOGIN
                                            (billetera), a /billetera
   ============================================================ */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient, createWalletClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Correo por defecto: el dueño de prueba de GUIA_ENTORNO_LOCAL.md. */
const POR_DEFECTO = process.env.DEV_LOGIN_EMAIL || 'dueno@azucarnegra.test';

/** El Supabase configurado, ¿es el de esta máquina? */
function supabaseEsLocal(): boolean {
  try {
    const { hostname } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

const NO_EXISTE = () => new NextResponse('Not found', { status: 404 });

/**
 * ¿Existe ya esa cuenta?
 *
 * Hay que preguntarlo ANTES de generar el enlace: `generateLink` con
 * `magiclink` CREA el usuario si no lo encuentra (comprobado — un dedazo
 * en el correo dejaba una cuenta huérfana en `auth.users`, sin perfil y
 * sin restaurante). El login por PIN no tiene este problema porque parte
 * de un perfil que ya existe; aquí el correo lo escribe una persona.
 *
 * `listUsers` va paginado y no filtra por correo, así que se recorre —
 * con tope. Es una base de desarrollo: son decenas de cuentas, no miles.
 */
async function cuentaExiste(
  db: ReturnType<typeof createServiceClient>,
  email: string,
): Promise<boolean> {
  const POR_PAGINA = 200;
  const MAX_PAGINAS = 10;
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error || !data) return false;
    if (data.users.some((u) => u.email?.toLowerCase() === email)) return true;
    if (data.users.length < POR_PAGINA) return false;
  }
  return false;
}

export async function GET(request: NextRequest) {
  if (process.env.DEV_LOGIN !== '1' || !supabaseEsLocal()) return NO_EXISTE();

  const params = request.nextUrl.searchParams;
  const email = (params.get('email') || POR_DEFECTO).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    return new NextResponse('Correo inválido.', { status: 400 });
  }

  // Solo rutas relativas del mismo origen: sin esto la ruta sería una
  // redirección abierta con sesión recién creada encima.
  // `cuenta=1`: la sesión de la billetera (cookie propia), no la del panel.
  const cuenta = params.get('cuenta') === '1';
  const inicio = cuenta ? '/billetera' : '/admin';
  const rawNext = params.get('next') || inicio;
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : inicio;

  const db = createServiceClient();

  if (!(await cuentaExiste(db, email))) {
    return new NextResponse(
      `No existe una cuenta con ${email} en el Supabase local.\n\n`
      + `Créala primero:\n`
      + `  node scripts/crear-super-admin.mjs ${email} UnaContrasena123\n\n`
      + `(No se crea sola a propósito: así un dedazo no deja cuentas huérfanas.)\n`,
      { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) {
    return new NextResponse(`No se pudo generar el enlace: ${error?.message ?? 'sin token'}`, { status: 500 });
  }

  const supabase = cuenta ? await createWalletClient() : await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (otpErr) return new NextResponse(`No se pudo abrir la sesión: ${otpErr.message}`, { status: 500 });

  console.warn(`[dev-login] sesión abierta como ${email} (solo desarrollo)`);
  return NextResponse.redirect(new URL(next, request.url));
}
