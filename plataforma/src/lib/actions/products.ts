'use server';

import { createClient, getStaffUser } from '@/lib/supabase/server';
import { puedeEnSeccion } from '@/lib/auth/seccion';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId, canActOnGroupBranch, getAdminMenu } from '@/lib/db/admin';
import { resolveOwnRestaurantId, resolveEffectiveRole } from '@/lib/db/membership';
import { can } from '@/lib/permissions';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { resolveRestaurantBranding } from '@/lib/documents/branding';
import {
  createBrandedWorkbook, addBrandedHeader, writeStyledTable, freezeHeaderRow, autoFitColumns, workbookToBase64,
} from '@/lib/documents/excel';
import { longDate } from '@/lib/documents/format';
import type { DocumentBranding } from '@/lib/documents/types';
import { sanitizeDietaryTags } from '@/lib/dietary-tags';
import { PLANS, type PlanCode } from '@/lib/plans';
import type { Category, Product, ProductOptionGroup } from '@/types';
import { panelLink } from '@/lib/panel-links-server';
import { registrarEvento } from '@/lib/analytics-server';
import { EVENTOS } from '@/lib/analytics';
import { logActivity } from '@/lib/activity';
import { cambiosDePrecio, hayCambioDePrecio } from '@/lib/activity-diff';
import { validarPrecio, separarSellos, problemaDeGrupo, type CambioDePrecio } from '@/lib/catalogo/reglas';

export type ProductState = { error: string } | null;

async function resolveContext(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // Quien administra un grupo trabaja sobre una sucursal suya (subdominio verificado);
  // SUPER_ADMIN, cualquiera por el id del form. Ambos usan el cliente elevado.
  // Quien administra un grupo entra a la sucursal del subdominio (verificada
  // contra su organización); el resto, al suyo. `resolveGroupBranchId`
  // devuelve null si no administra ninguno, así que sirve de las dos cosas:
  // de comprobación y de id. Ver la migración 116.
  const groupBranchId = profile.role === 'SUPER_ADMIN' ? null : await resolveGroupBranchId();
  const elevated = profile.role === 'SUPER_ADMIN' || groupBranchId !== null;
  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (formData.get('restaurantId') as string)
    : (groupBranchId ?? (await resolveOwnRestaurantId(profile.restaurant_id)));

  if (!restaurantId) return null;
  if (!(await puedeEnSeccion(restaurantId, 'catalogo'))) return null;

  const db = elevated ? createServiceClient() : supabase;
  return { db, restaurantId, role: profile.role, userId: user.id };
}

/**
 * Tope de productos del plan gratuito (BASICO, ver PLANS.maxProducts en
 * plans.ts). Devuelve un mensaje de error si el restaurante ya llegó al
 * tope, o null si puede seguir creando productos.
 */
async function checkProductLimit(
  ctx: NonNullable<Awaited<ReturnType<typeof resolveContext>>>,
): Promise<string | null> {
  const { data: restaurant } = await ctx.db
    .from('restaurants')
    .select('plan_actual')
    .eq('id', ctx.restaurantId)
    .single();

  const maxProducts = restaurant?.plan_actual
    ? PLANS[restaurant.plan_actual as PlanCode]?.maxProducts
    : undefined;
  if (!maxProducts) return null;

  const { count } = await ctx.db
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', ctx.restaurantId);

  if ((count ?? 0) >= maxProducts) {
    return `Llegaste al límite de ${maxProducts} productos de tu plan. Sube de plan para agregar productos ilimitados.`;
  }
  return null;
}

/** Los errores que la base explica (candados LGD01) se dicen tal cual; el resto, genérico. */
function mensajeDeError(error: { code?: string; message: string }): string {
  return error.code === 'LGD01' ? error.message : 'No se pudo guardar el platillo. Intenta de nuevo.';
}

function parseTags(raw: string | null): string[] | null {
  if (!raw?.trim()) return null;
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Alérgenos/dietas: lista separada por coma de claves del vocabulario fijo. */
function parseDietaryTags(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return sanitizeDietaryTags(raw.split(',').map((t) => t.trim()));
}

/** Costo del producto: numérico ≥ 0, o null si viene vacío/ inválido. */
function parseCost(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseFloat(raw);
  return isNaN(n) || n < 0 ? null : n;
}

/**
 * Puntos de lealtad por unidad del producto (migración 058). Vacío = null
 * (usar la regla general del restaurante); número ≥ 0 = puntos fijos.
 */
function parseLoyaltyPoints(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

/**
 * Valida los grupos de variantes/extras que manda el editor del admin.
 * Estructura final: [{ id, name, type, required?, max?, choices: [{ id, name, priceDelta, variants? }] }]
 * `variants` (solo tiene efecto en choices de un grupo 'combo') son las
 * sub-opciones del componente (ej. sabor de bebida): [{ id, name, priceDelta }].
 * Devuelve null si no hay grupos válidos (producto simple).
 */
function parseOptions(raw: string | null): ProductOptionGroup[] | null | { error: string } {
  if (!raw?.trim() || raw.trim() === '[]') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: 'Variantes inválidas.' };
  }
  if (!Array.isArray(data)) return { error: 'Variantes inválidas.' };
  if (data.length > 10) return { error: 'Máximo 10 grupos de opciones.' };

  const out: ProductOptionGroup[] = [];
  for (const g of data as Record<string, unknown>[]) {
    const name = typeof g.name === 'string' ? g.name.trim().slice(0, 60) : '';
    const type = g.type === 'multi' ? 'multi' : g.type === 'combo' ? 'combo' : 'single';
    const id = typeof g.id === 'string' && g.id ? g.id.slice(0, 60) : Math.random().toString(36).slice(2, 9);
    if (!name || !Array.isArray(g.choices)) continue;
    if (g.choices.length > 20) return { error: 'Máximo 20 opciones por grupo.' };

    const choices = (g.choices as Record<string, unknown>[])
      .map((c) => {
        const rawVariants = Array.isArray(c.variants) ? (c.variants as Record<string, unknown>[]).slice(0, 20) : [];
        const variants = rawVariants
          .map((v) => ({
            id: typeof v.id === 'string' && v.id ? v.id.slice(0, 60) : Math.random().toString(36).slice(2, 9),
            name: typeof v.name === 'string' ? v.name.trim().slice(0, 60) : '',
            priceDelta: Math.max(-100_000, Math.min(100_000, Number(v.priceDelta) || 0)),
          }))
          .filter((v) => v.name.length > 0);
        return {
          id: typeof c.id === 'string' && c.id ? c.id.slice(0, 60) : Math.random().toString(36).slice(2, 9),
          name: typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '',
          priceDelta: Math.max(-100_000, Math.min(100_000, Number(c.priceDelta) || 0)),
          ...(variants.length > 0 ? { variants } : {}),
        };
      })
      .filter((c) => c.name.length > 0);
    if (choices.length === 0) continue;

    const grupo: ProductOptionGroup = {
      id,
      name,
      type,
      ...(type === 'single' ? { required: g.required === true } : {}),
      ...(type === 'multi' ? { max: Math.max(0, Math.min(20, Number(g.max) || 0)) } : {}),
      // Auditoría 1.9 (M03): mínimo en «varios» y predeterminada explícita en «elegir 1».
      ...(type === 'multi' && Number(g.min) > 0 ? { min: Math.min(20, Math.floor(Number(g.min))) } : {}),
      ...(type === 'single' && typeof g.defaultChoiceId === 'string' && g.defaultChoiceId ? { defaultChoiceId: g.defaultChoiceId.slice(0, 60) } : {}),
      choices,
    };
    const problema = problemaDeGrupo(grupo);
    if (problema) return { error: problema };
    out.push(grupo);
  }
  return out.length > 0 ? out : null;
}

export async function createProduct(prevState: ProductState, formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const limitError = await checkProductLimit(ctx);
  if (limitError) return { error: limitError };

  const name = (formData.get('name') as string)?.trim().slice(0, 120);
  if (!name) return { error: 'Escribe el nombre del platillo.' };
  const precio = validarPrecio(formData.get('price'));
  if ('error' in precio) return { error: precio.error };
  const marcas = separarSellos(parseTags(formData.get('tags') as string) ?? [], parseDietaryTags(formData.get('dietary_tags') as string));

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  const { data: existing } = await ctx.db
    .from('products')
    .select('sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const sort_order = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const { data: created, error } = await ctx.db.from('products').insert({
    restaurant_id: ctx.restaurantId,
    category_id: (formData.get('category_id') as string) || null,
    name,
    description: (formData.get('description') as string)?.trim() || null,
    name_en: (formData.get('name_en') as string)?.trim() || null,
    description_en: (formData.get('description_en') as string)?.trim() || null,
    price: precio.valor,
    cost: parseCost(formData.get('cost') as string),
    loyalty_points: parseLoyaltyPoints(formData.get('loyalty_points') as string),
    image_url: (formData.get('image_url') as string) || null,
    icon: (formData.get('icon') as string) || null,
    tags: marcas.sellos.length ? marcas.sellos : null,
    dietary_tags: marcas.dietas,
    options,
    is_available: formData.get('is_available') === 'true',
    is_active: formData.get('is_active') !== 'false',
    sort_order,
  }).select('id').single();

  if (error) return { error: mensajeDeError(error) };

  // Embudo de la web (WEB-01): el primer platillo es la señal de que el
  // alta se convirtió en un restaurante de verdad. Sin datos del platillo.
  if (!existing?.length) await registrarEvento(EVENTOS.primerPlatillo, '/admin/menu/productos/new');

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  // «Crear y agregar otro» (E10): vuelve a un alta vacía con la misma categoría.
  if (formData.get('siguiente') === 'otro') {
    const cat = (formData.get('category_id') as string) || '';
    redirect(await panelLink(`/admin/menu/productos/new?creado=${encodeURIComponent(name)}${cat ? `&cat=${cat}` : ''}`));
  }
  redirect(await panelLink(`/admin/menu/productos/${created.id}`));
}

export async function updateProduct(prevState: ProductState, formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim().slice(0, 120);
  if (!name) return { error: 'Escribe el nombre del platillo.' };
  const precio = validarPrecio(formData.get('price'));
  if ('error' in precio) return { error: precio.error };
  const priceRaw = String(precio.valor);
  const marcas = separarSellos(parseTags(formData.get('tags') as string) ?? [], parseDietaryTags(formData.get('dietary_tags') as string));

  const options = parseOptions(formData.get('options') as string | null);
  if (options && 'error' in options) return options;

  // El precio de antes, para la bitácora (PROD-10): «¿quién bajó el precio?».
  const { data: previo } = await ctx.db
    .from('products')
    .select('price, options')
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .maybeSingle();

  const newAvailable = formData.get('is_available') === 'true';
  const { error } = await ctx.db
    .from('products')
    .update({
      category_id: (formData.get('category_id') as string) || null,
      name,
      description: (formData.get('description') as string)?.trim() || null,
    name_en: (formData.get('name_en') as string)?.trim() || null,
    description_en: (formData.get('description_en') as string)?.trim() || null,
      price: parseFloat(priceRaw),
      cost: parseCost(formData.get('cost') as string),
    loyalty_points: parseLoyaltyPoints(formData.get('loyalty_points') as string),
      image_url: (formData.get('image_url') as string) || null,
      icon: (formData.get('icon') as string) || null,
      tags: marcas.sellos.length ? marcas.sellos : null,
      dietary_tags: marcas.dietas,
      options,
      is_available: newAvailable,
      unavailable_at: newAvailable ? null : new Date().toISOString(),
      is_active: formData.get('is_active') !== 'false',
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  if (error) return { error: mensajeDeError(error) };

  if (previo) {
    const cambios = cambiosDePrecio(
      { price: previo.price, options: previo.options as ProductOptionGroup[] | null },
      { price: parseFloat(priceRaw), options },
    );
    if (hayCambioDePrecio(cambios)) {
      await logActivity({
        restaurantId: ctx.restaurantId,
        actorId: ctx.userId,
        action: 'precio',
        entity: name,
        meta: { productId: id, ...cambios },
      });
    }
  }

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  // Vuelve a la lista con la búsqueda y filtros con que se abrió (1.9, R06).
  const volver = String(formData.get('volver') ?? '');
  redirect(await panelLink(/^\/admin\/menu(\?[\w\-=&%.,+]*)?$/.test(volver) ? volver : '/admin/menu'));
}

export async function deleteProduct(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;

  const { data: borrados } = await ctx.db
    .from('products')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId)
    .select('name, price');

  // Borrado definitivo: que quede quién y qué (PROD-10).
  const borrado = borrados?.[0];
  if (borrado) {
    await logActivity({
      restaurantId: ctx.restaurantId,
      actorId: ctx.userId,
      action: 'platillo_borrado',
      entity: borrado.name as string,
      meta: { productId: id, precio: Number(borrado.price) },
    });
  }

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
}

export async function toggleProductAvailability(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const is_available = formData.get('is_available') === 'true';

  await ctx.db
    .from('products')
    .update({
      is_available,
      unavailable_at: is_available ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
}

export async function toggleProductActive(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const is_active = formData.get('is_active') === 'true';

  await ctx.db
    .from('products')
    .update({ is_active })
    .eq('id', id)
    .eq('restaurant_id', ctx.restaurantId);

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
}

export async function moveProductUp(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);
  const categoryId = formData.get('category_id') as string | null;

  let query = ctx.db
    .from('products')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .lt('sort_order', currentOrder)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (categoryId) query = query.eq('category_id', categoryId);
  else query = query.is('category_id', null);

  const { data: prev } = await query.single();
  if (!prev) return;

  await Promise.all([
    ctx.db.from('products').update({ sort_order: prev.sort_order }).eq('id', id),
    ctx.db.from('products').update({ sort_order: currentOrder }).eq('id', prev.id),
  ]);

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
}

export async function moveProductDown(formData: FormData) {
  const ctx = await resolveContext(formData);
  if (!ctx) return;

  const id = formData.get('id') as string;
  const currentOrder = parseInt(formData.get('sort_order') as string, 10);
  const categoryId = formData.get('category_id') as string | null;

  let query = ctx.db
    .from('products')
    .select('id, sort_order')
    .eq('restaurant_id', ctx.restaurantId)
    .gt('sort_order', currentOrder)
    .order('sort_order', { ascending: true })
    .limit(1);

  if (categoryId) query = query.eq('category_id', categoryId);
  else query = query.is('category_id', null);

  const { data: next } = await query.single();
  if (!next) return;

  await Promise.all([
    ctx.db.from('products').update({ sort_order: next.sort_order }).eq('id', id),
    ctx.db.from('products').update({ sort_order: currentOrder }).eq('id', next.id),
  ]);

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
}

/* ── Export del catálogo — PDF (cliente) + Excel (servidor) ──── */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface ProductExportRow {
  categoryName: string;
  name: string;
  price: number;
  cost: number | null;
  stock: number | null;
  trackStock: boolean;
  isActive: boolean;
  isAvailable: boolean;
  hasVariants: boolean;
}

type ProductsExportData = {
  rows: ProductExportRow[];
  branding: DocumentBranding;
  slug: string;
};

async function authAndBuildProductsExport(restaurantId: string): Promise<ProductsExportData | { error: string }> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };

  const supabase = await createClient();
  const { data: { user } } = await getStaffUser();
  if (!user) return { error: 'No autorizado.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, restaurant_id, permissions')
    .eq('id', user.id)
    .single();

  // Qué es esta persona EN ESTE restaurante. El perfil solo sabe de uno —y
  // desde el modelo de membresías el dueño lo tiene en null— así que
  // preguntárselo a él dejaba fuera al dueño de su propio negocio.
  const efectivo = await resolveEffectiveRole(
    { role: profile?.role ?? null, permissions: (profile?.permissions as string[] | null) ?? null },
    restaurantId,
  );

  const belongs =
    profile?.role === 'SUPER_ADMIN' ||
    efectivo.isMember ||
    (['RESTAURANT_OWNER', 'RESTAURANT_STAFF'].includes(profile?.role ?? '') &&
      profile?.restaurant_id === restaurantId) ||
    (await canActOnGroupBranch(restaurantId));
  if (!belongs) return { error: 'No autorizado.' };
  if (!can(efectivo.role, efectivo.permissions, 'catalogo')) {
    return { error: 'No autorizado.' };
  }

  const db = createServiceClient();
  const [{ categories, products }, { data: rest }, branding] = await Promise.all([
    getAdminMenu(restaurantId),
    db.from('restaurants').select('slug').eq('id', restaurantId).single(),
    resolveRestaurantBranding(restaurantId),
  ]);

  const categoryName = new Map<string, string>();
  const categoryOrder = new Map<string, number>();
  [...(categories as Category[])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((c, i) => { categoryName.set(c.id, c.name); categoryOrder.set(c.id, i); });

  const rows: ProductExportRow[] = [...(products as Product[])]
    .sort((a, b) => (categoryOrder.get(a.category_id ?? '') ?? 999) - (categoryOrder.get(b.category_id ?? '') ?? 999))
    .map((p) => ({
      categoryName: p.category_id ? (categoryName.get(p.category_id) ?? 'Sin categoría') : 'Sin categoría',
      name: p.name,
      price: Number(p.price),
      cost: p.cost != null ? Number(p.cost) : null,
      stock: p.track_stock ? p.stock : null,
      trackStock: p.track_stock,
      isActive: p.is_active,
      isAvailable: p.is_available,
      hasVariants: (p.options?.length ?? 0) > 0,
    }));

  return { rows, branding, slug: (rest?.slug as string) ?? 'restaurante' };
}

/** Datos ya armados (agrupables por categoría + marca) para dibujar el PDF en el cliente. */
export async function getProductsPdfData(restaurantId: string): Promise<ProductsExportData | { error: string }> {
  return authAndBuildProductsExport(restaurantId);
}

/** Genera el catálogo como .xlsx real, con marca del restaurante. */
export async function exportProductsXlsx(
  restaurantId: string,
): Promise<{ xlsx?: string; filename?: string; error?: string }> {
  const data = await authAndBuildProductsExport(restaurantId);
  if ('error' in data) return data;
  const { rows, branding, slug } = data;

  const subtitle = `${rows.length} producto${rows.length === 1 ? '' : 's'} · Generado el ${longDate(new Date().toISOString())}`;
  const wb = await createBrandedWorkbook();
  const ws = wb.addWorksheet('Productos');
  const headers = ['Categoría', 'Producto', 'Precio', 'Costo', 'Margen', 'Stock', 'Activo', 'Disponible', 'Tiene variantes'];
  addBrandedHeader(ws, { branding, title: 'Catálogo de productos', subtitle, columnsSpan: headers.length });

  const { headerRow } = writeStyledTable(
    ws, branding, headers,
    rows.map((p) => [
      p.categoryName, p.name, p.price, p.cost, p.cost != null ? p.price - p.cost : null,
      p.stock, p.isActive ? 'Sí' : 'No', p.isAvailable ? 'Sí' : 'No', p.hasVariants ? 'Sí' : 'No',
    ]),
    { currencyCols: [3, 4, 5] },
  );
  freezeHeaderRow(ws, headerRow);
  autoFitColumns(ws);

  const xlsx = await workbookToBase64(wb);
  return { xlsx, filename: `productos-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}


/* ── Duplicar (auditoría 1.9, R07.3) ─────────────────────────────────
   Copia opciones, dietas, sellos, foto, ícono, costo y receta. No copia
   existencias: la copia nace disponible y OCULTA hasta revisarla
   (decisión del dueño, 2026-11-09). */
export async function duplicateProduct(formData: FormData): Promise<ProductState> {
  const ctx = await resolveContext(formData);
  if (!ctx) return { error: 'No autorizado.' };
  const limitError = await checkProductLimit(ctx);
  if (limitError) return { error: limitError };

  const id = formData.get('id') as string;
  const { data: o, error: errLeer } = await ctx.db.from('products').select('*')
    .eq('id', id).eq('restaurant_id', ctx.restaurantId).maybeSingle();
  if (errLeer || !o) return { error: 'Ese platillo ya no existe.' };

  const { data: ultimo } = await ctx.db.from('products').select('sort_order')
    .eq('restaurant_id', ctx.restaurantId).order('sort_order', { ascending: false }).limit(1);
  const { data: copia, error } = await ctx.db.from('products').insert({
    restaurant_id: ctx.restaurantId,
    category_id: o.category_id,
    name: `${String(o.name).slice(0, 110)} (copia)`,
    description: o.description, name_en: o.name_en, description_en: o.description_en,
    price: o.price, cost: o.cost, loyalty_points: o.loyalty_points,
    image_url: o.image_url, icon: o.icon, tags: o.tags, dietary_tags: o.dietary_tags, options: o.options,
    station_id: o.station_id,
    is_available: true, is_active: false, track_stock: false, stock: null,
    sort_order: (ultimo?.[0]?.sort_order ?? 0) + 1,
  }).select('id').single();
  if (error || !copia) return { error: 'No se pudo duplicar el platillo.' };

  // La receta, con la misma operación atómica que la ficha (0.7, migración 156).
  const service = createServiceClient();
  const { data: receta } = await service.from('recipe_items').select('ingredient_id, quantity').eq('product_id', id);
  if (receta?.length) {
    await service.rpc('leogin_reemplazar_receta', {
      p_restaurant: ctx.restaurantId, p_product: copia.id,
      p_items: receta.map((r) => ({ ingredient_id: r.ingredient_id, quantity: r.quantity })),
    });
  }
  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'platillo_duplicado', entity: String(o.name), meta: { desde: id, copia: copia.id } });

  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  redirect(await panelLink(`/admin/menu/productos/${copia.id}?duplicado=1`));
}

/* ── Cambios en lote (auditoría 1.9, R06.4) ──────────────────────────
   Todo o nada en `leogin_aplicar_lote_catalogo` (migración 179). */
export type LoteCambio = { disponible?: boolean; visible?: boolean; categoria?: string; precio?: CambioDePrecio };
export type LoteResult = { ok?: true; cambiados?: number; error?: string };

export async function aplicarLoteCatalogo(restaurantIdForm: string, ids: string[], cambio: LoteCambio): Promise<LoteResult> {
  const fd = new FormData();
  fd.set('restaurantId', restaurantIdForm);
  const ctx = await resolveContext(fd);
  if (!ctx) return { error: 'No autorizado.' };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return { error: 'Elige entre 1 y 500 platillos.' };
  if (!ids.every((x) => /^[0-9a-f-]{36}$/i.test(x))) return { error: 'Selección inválida.' };
  const limpio: LoteCambio = {};
  if (typeof cambio.disponible === 'boolean') limpio.disponible = cambio.disponible;
  if (typeof cambio.visible === 'boolean') limpio.visible = cambio.visible;
  if (typeof cambio.categoria === 'string' && cambio.categoria) limpio.categoria = cambio.categoria;
  if (cambio.precio && (cambio.precio.modo === 'porcentaje' || cambio.precio.modo === 'monto') && Number.isFinite(cambio.precio.valor)) {
    limpio.precio = { modo: cambio.precio.modo, valor: Number(cambio.precio.valor) };
  }
  if (Object.keys(limpio).length === 0) return { error: 'No hay nada que cambiar.' };

  const { data, error } = await createServiceClient().rpc('leogin_aplicar_lote_catalogo', {
    p_restaurant: ctx.restaurantId, p_ids: ids, p_cambio: limpio, p_actor: ctx.userId,
  });
  if (error) return { error: /LGD01|22023/.test(error.code ?? '') ? error.message : 'No se pudieron aplicar los cambios. No se cambió ninguno.' };
  revalidatePath('/admin/menu');
  updateTag(`menu:${ctx.restaurantId}`);
  return { ok: true, cambiados: (data as { cambiados?: number })?.cambiados ?? ids.length };
}
