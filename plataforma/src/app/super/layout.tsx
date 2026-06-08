import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SuperNav from '@/components/super/nav';

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'SUPER_ADMIN') redirect('/admin/menu');

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column' }}>
      <SuperNav />
      <div
        style={{
          flex: 1,
          padding: '28px 16px',
          maxWidth: 800,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
