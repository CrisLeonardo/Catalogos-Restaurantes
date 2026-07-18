// Destino de redirect cuando un layout detecta una sesión de operador (PIN)
// vencida por inactividad (ver isOperatorSessionStale). Un route handler SÍ
// puede escribir cookies (a diferencia del Server Component que redirige
// aquí), así que es donde se cierra la sesión de verdad.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { OPERATOR_COOKIE } from '@/lib/auth/operator-session';

export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  (await cookies()).delete(OPERATOR_COOKIE);
  return NextResponse.redirect(new URL('/admin/login', req.url));
}
