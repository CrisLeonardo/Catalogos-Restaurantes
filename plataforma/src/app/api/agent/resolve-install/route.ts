/* ============================================================
   GET /api/agent/resolve-install?code=...
   El instalador (LeoginAgent~LG2~<dominio>~<código>~.exe) llama a esto UNA
   vez, al momento de instalar, para resolver el código corto del nombre de
   archivo al token real del restaurante (migración 066). El código es de
   un solo uso y expira a las 24h — sin auth adicional porque el código en
   sí es el secreto (igual que el token embebido del esquema anterior, pero
   de vida mucho más corta).
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return new NextResponse('Falta code.', { status: 400 });

  const db = createServiceClient();
  const { data: row } = await db
    .from('agent_install_codes')
    .select('token, used_at, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!row || row.used_at || new Date(row.expires_at as string) < new Date()) {
    return new NextResponse('Código inválido o expirado.', { status: 404 });
  }

  await db.from('agent_install_codes').update({ used_at: new Date().toISOString() }).eq('code', code);

  return NextResponse.json({ token: row.token });
}
