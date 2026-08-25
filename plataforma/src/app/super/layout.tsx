import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isSessionStale, SESSION_SEEN_COOKIE } from '@/lib/auth/session-activity';
import SessionHeartbeat from '@/components/admin/session-heartbeat';
import SuperShell from '@/components/super/shell';

export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Checklist 2026-08-25 §2 — ver /admin/(protected)/layout.tsx. El super
  // admin no tenía NINGÚN candado de inactividad hasta ahora.
  const cookieStore = await cookies();
  if (isSessionStale(cookieStore.get(SESSION_SEEN_COOKIE)?.value, user.id)) {
    redirect('/admin/logout-operator');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'SUPER_ADMIN') redirect('/admin');

  return (
    <SuperShell>
      <SessionHeartbeat />
      {children}
    </SuperShell>
  );
}
