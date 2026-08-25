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

export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  const store = await cookies();
  store.delete(OPERATOR_COOKIE);
  store.delete(SESSION_SEEN_COOKIE);
  return NextResponse.redirect(new URL('/admin/login', req.url));
}
