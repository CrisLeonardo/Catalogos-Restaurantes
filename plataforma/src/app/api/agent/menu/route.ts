/* ============================================================
   GET /api/agent/menu
   El hub local sondea esto cada tanto (best-effort) para refrescar su
   snapshot de menú y poder tomar pedidos sin conexión. Autenticación:
   Authorization: Bearer <token-del-agente> (igual que /poll y /ack).
   Respuesta: { categories, products, restaurantName, kitchenTarget } —
   categories/products son las mismas columnas públicas que el catálogo
   del comensal (sin cost/stock, ver lib/db/menu.ts). kitchenTarget es el
   destino de impresión de cocina que el hub necesita cachear para poder
   imprimir sin conexión (sin nube no puede resolverlo al vuelo).
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import { PUBLIC_PRODUCT_COLUMNS } from '@/lib/db/menu';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const db = createServiceClient();

  const [{ data: categories }, { data: products }, { data: restaurant }, { data: printAgent }] = await Promise.all([
    db
      .from('categories')
      .select('id, name, icon, sort_order, availability')
      .eq('restaurant_id', agent.restaurantId)
      .eq('is_active', true)
      .order('sort_order'),
    db
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS)
      .eq('restaurant_id', agent.restaurantId)
      .order('sort_order'),
    db.from('restaurants').select('name').eq('id', agent.restaurantId).single(),
    db.from('print_agents').select('kitchen_target').eq('id', agent.agentId).single(),
  ]);

  return NextResponse.json({
    categories: categories ?? [],
    products: products ?? [],
    restaurantName: (restaurant?.name as string | null) ?? 'Restaurante',
    kitchenTarget: (printAgent?.kitchen_target as string | null) ?? null,
  });
}
