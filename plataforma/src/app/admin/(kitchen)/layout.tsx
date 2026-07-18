import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
import { isOperatorSessionStale, OPERATOR_COOKIE } from '@/lib/auth/operator-session';
import OfflineSupport from '@/components/offline-support';
import OperatorHeartbeat from '@/components/admin/operator-heartbeat';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cocina (KDS)' };

/**
 * Layout full-screen para la pantalla de cocina (KDS). A propósito NO usa
 * AdminShell: es una pantalla táctil dedicada para el cocinero, sin sidebar
 * ni chrome del panel. Solo verifica sesión + permiso "cocina".
 */
export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .single();

  if (!profile || !can(profile.role as string, profile.permissions as string[] | null, 'cocina')) {
    redirect('/admin/login');
  }

  const opCookie = (await cookies()).get(OPERATOR_COOKIE)?.value;
  const isOperatorSession = !!opCookie;
  if (isOperatorSessionStale(opCookie, profile.role as string, user.id)) {
    redirect('/admin/logout-operator');
  }

  return (
    <>
      <OfflineSupport />
      {isOperatorSession && <OperatorHeartbeat profileId={user.id} />}
      {children}
    </>
  );
}
