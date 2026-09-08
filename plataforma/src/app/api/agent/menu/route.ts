/* ============================================================
   GET /api/agent/menu
   El hub local sondea esto cada tanto (best-effort) para refrescar su
   snapshot de menú y poder tomar pedidos sin conexión. Autenticación:
   Authorization: Bearer <token-del-agente> (igual que /poll y /ack).
   Respuesta: { categories, products, restaurantName, kitchenTarget,
   stations } — categories/products son las mismas columnas públicas que
   el catálogo del comensal (sin cost/stock, ver lib/db/menu.ts).

   `kitchenTarget` es el destino de cocina que el hub cachea para poder
   imprimir sin nube (sin ella no puede resolverlo al vuelo). Desde la
   migración 130 es el ESPEJO del destino de la estación principal, así
   que un agente viejo —que solo conoce esta columna— sigue imprimiendo
   por donde toca.

   `stations` + el `station_id` de categorías y productos son lo que
   permite al agente ≥0.8.0 partir la comanda por estación también sin
   internet (M-07, fase 5). Un agente anterior los ignora.
   ============================================================ */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { authenticateAgent } from '@/lib/print-agent';
import { PUBLIC_PRODUCT_COLUMNS } from '@/lib/db/menu';
import { hayEstaciones } from '@/lib/db/print-stations';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const agent = await authenticateAgent(req);
  if (!agent) return new NextResponse('Token de agente inválido.', { status: 401 });

  const db = createServiceClient();

  /* Sin la migración 130, `station_id` no existe: pedirla tumbaría la
     consulta entera y el hub se quedaría SIN MENÚ, o sea sin poder tomar
     pedidos durante un corte. Eso es muchísimo peor que quedarse sin
     estaciones, así que la columna solo se nombra cuando existe. */
  const conEstaciones = await hayEstaciones();
  const columnasProducto = conEstaciones
    ? `${PUBLIC_PRODUCT_COLUMNS}, station_id`
    : PUBLIC_PRODUCT_COLUMNS;
  const columnasCategoria = conEstaciones
    ? 'id, name, icon, sort_order, availability, station_id'
    : 'id, name, icon, sort_order, availability';

  const [{ data: categories }, { data: products }, { data: restaurant }, { data: printAgent }, { data: stations }] =
    await Promise.all([
      db
        .from('categories')
        .select(columnasCategoria)
        .eq('restaurant_id', agent.restaurantId)
        .eq('is_active', true)
        .order('sort_order'),
      db
        .from('products')
        .select(columnasProducto)
        .eq('restaurant_id', agent.restaurantId)
        .order('sort_order'),
      db.from('restaurants').select('name').eq('id', agent.restaurantId).single(),
      db.from('print_agents').select('kitchen_target').eq('id', agent.agentId).single(),
      conEstaciones
        ? db.from('print_stations')
            .select('id, name, target, sort_order, is_default')
            .eq('restaurant_id', agent.restaurantId)
            .order('sort_order')
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  return NextResponse.json({
    categories: categories ?? [],
    products: products ?? [],
    restaurantName: (restaurant?.name as string | null) ?? 'Restaurante',
    kitchenTarget: (printAgent?.kitchen_target as string | null) ?? null,
    stations: stations ?? [],
  });
}
