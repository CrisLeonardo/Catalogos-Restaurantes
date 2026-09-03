import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveStaffDestination } from '@/lib/auth/destination';
import { writeSessionActivity } from '@/lib/auth/session-activity';
import { publicUrl } from '@/lib/public-origin';

/**
 * Aterrizaje del enlace "confirma tu correo" (ver lib/auth/email-verification.ts).
 *
 * Canjear el enlace demuestra dos cosas a la vez: que el buzón existe y que
 * quien lo abre tiene acceso a él. Se anota `email_verified_at` y se deja al
 * dueño dentro de SU panel — llegó hasta aquí desde su correo, mandarlo a
 * escribir la contraseña otra vez sería fricción sin ganancia.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  // El origen sale de las cabeceras del proxy, no de `request.nextUrl.origin`:
  // en Render esa propiedad resuelve al host interno del contenedor y el
  // enlace del correo terminaba en `localhost:10000`. Ver lib/public-origin.ts.
  const failed = NextResponse.redirect(
    publicUrl(request, '/admin/login?correo=no-verificado'),
  );
  if (!token) return failed;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: token });
  if (error || !data.user) return failed;

  // Arranca el reloj de inactividad (checklist 2026-08-25 §2).
  await writeSessionActivity(data.user.id);

  const db = createServiceClient();
  await db
    .from('profiles')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', data.user.id);

  const { data: profile } = await db
    .from('profiles')
    .select('role, permissions, restaurant_id')
    .eq('id', data.user.id)
    .maybeSingle();

  const destination = profile
    ? await resolveStaffDestination(
        supabase,
        profile as { role: string; permissions: string[] | null; restaurant_id: string | null },
        null,
        '?correo=verificado',
      )
    : '/admin/login';

  // `resolveStaffDestination` devuelve una ruta relativa ("/mi-cuenta") o ya
  // una URL absoluta al panel de otro subdominio (adminUrl); solo la primera
  // necesita que le pongamos el origen delante.
  return NextResponse.redirect(
    destination.startsWith('/') ? publicUrl(request, destination) : destination,
  );
}

export const dynamic = 'force-dynamic';
