// Destino de redirect cuando un layout detecta una sesión vencida por
// inactividad — la de operador/PIN (ver isOperatorSessionStale) o, desde el
// checklist 2026-08-25 §2, también la de correo/Google (ver isSessionStale).
// Un route handler SÍ puede escribir cookies (a diferencia del Server
// Component que redirige aquí), así que es donde se cierra la sesión de
// verdad, sea cual sea la marca que venció.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import { SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import { publicUrl } from '@/lib/public-origin';
import { authPathFor } from '@/lib/tenant';

export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  const store = await cookies();
  store.delete(OPERATOR_COOKIE);
  store.delete(SESSION_SEEN_COOKIE);
  // `req.url` NO sirve para esto: detrás del proxy de Render devolvía
  // `https://localhost:10000/admin/login`. Ver lib/public-origin.ts — esta
  // ruta era la que rompía "Continuar como {nombre}".
  //
  // El slug sale del header que puso el proxy al reescribir la petición que
  // llegó aquí (`/panel/<slug>/logout-operator` — ver los layouts que
  // redirigen a esta ruta con authPathFor()). Sin esto, la sesión vencida por
  // inactividad devolvía siempre a un login genérico sin PIN ni marca del
  // local, aunque la persona llevara un segundo antes en su propio panel.
  const tenantSlug = req.headers.get('x-tenant-slug');
  return NextResponse.redirect(publicUrl(req, authPathFor('/admin/login', tenantSlug)));
}
