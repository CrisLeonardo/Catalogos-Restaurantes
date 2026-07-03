/* ============================================================
   GET /api/agent/menu — snapshot del menú para el HUB DE EMERGENCIA
   ------------------------------------------------------------
   El Agente Leogin del local lo descarga periódicamente mientras hay
   internet. Si el internet se cae, el hub sirve este snapshot en la
   LAN para que el mesero siga tomando pedidos (Fase 2 del plan offline).
   Autenticación: Authorization: Bearer <token-del-agente>.
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const db = createServiceClient();
  const [{ data: restaurant }, { data: themeRow }, { data: categories }, { data: products }] =
    await Promise.all([
      db.from('restaurants').select('id, name, slug').eq('id', agent.restaurantId).single(),
      db.from('restaurant_themes').select('*').eq('restaurant_id', agent.restaurantId).maybeSingle(),
      db.from('categories')
        .select('id, name, icon, sort_order')
        .eq('restaurant_id', agent.restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      db.from('products')
        // Solo lo que el hub necesita para tomar pedidos (sin costos ni stock).
        .select('id, category_id, name, description, price, options, is_available, sort_order')
        .eq('restaurant_id', agent.restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
    ]);

  if (!restaurant) return new NextResponse('Restaurante no encontrado.', { status: 404 });

  const config = resolveTheme((themeRow as ThemeRow) ?? null).config;

  return NextResponse.json({
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    currencySymbol: config.currencySymbol,
    fetchedAt: new Date().toISOString(),
    categories: categories ?? [],
    products: (products ?? []).filter((p) => p.is_available !== false),
  });
}
