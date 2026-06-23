import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { can } from '@/lib/permissions';
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

  return <>{children}</>;
}
