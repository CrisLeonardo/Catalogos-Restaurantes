'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isMeseroOnly } from '@/lib/permissions';

export type AuthState = { error: string } | null;

export async function login(prevState: AuthState, formData: FormData): Promise<AuthState> {
  const email = (formData.get('email') as string)?.trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email y contraseña son requeridos.' };
  }

  const supabase = await createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: 'Email o contraseña incorrectos.' };

  // Redirigir según rol
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', signInData.user.id)
    .single();

  if (profile?.role === 'SUPER_ADMIN') {
    redirect('/super/restaurantes');
  }

  // El jefe de grupo entra a su panel consolidado (host slug-central.dominio).
  if (profile?.role === 'GROUP_OWNER') {
    redirect('/central');
  }

  // El mesero puro entra directo a su panel de toma de pedidos.
  if (isMeseroOnly(profile?.role, profile?.permissions as string[] | null)) {
    redirect('/admin/mesero');
  }

  redirect('/admin/menu');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/admin/login');
}

/** Logout desde el panel de grupo (vuelve al login del grupo). */
export async function logoutGroup() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/central/login');
}
