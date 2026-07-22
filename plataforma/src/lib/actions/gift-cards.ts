'use server';

/* ============================================================
   TARJETAS DE REGALO / VALES DE CONSUMO (Fase 2 auditoría de lanzamiento)
   ------------------------------------------------------------
   · issueGiftCard:   emite un vale con saldo (venta o regalo al cliente).
   · listGiftCards:   listado con saldo/estado para el panel admin.
   · cancelGiftCard:  desactiva un vale (no se puede volver a redimir).
   · findOrderForRedeem: busca un pedido por número para aplicarle un vale.
   · redeemGiftCard:  aplica el vale a UN pedido (RPC atómico, migración 082).
   ============================================================ */

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveGroupBranchId } from '@/lib/db/admin';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/permissions';
import { logActivity } from '@/lib/activity';

const UUID_RE = /^[0-9a-f-]{36}$/i;
// Sin caracteres ambiguos (0/O, 1/I/L) para que sea legible al dictarlo por teléfono.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len = 6): string {
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

type Ctx = { db: ReturnType<typeof createServiceClient>; restaurantId: string; userId: string };

async function adminCtx(restaurantIdFromForm?: string | null): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id, role, permissions')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const restaurantId = profile.role === 'SUPER_ADMIN'
    ? (restaurantIdFromForm ?? '')
    : profile.role === 'GROUP_OWNER'
      ? ((await resolveGroupBranchId()) ?? '')
      : (profile.restaurant_id ?? '');
  if (!restaurantId) return null;

  if (!can(profile.role, profile.permissions as string[] | null, 'vales')) return null;

  return { db: createServiceClient(), restaurantId, userId: user.id };
}

export type GiftCardState = { error: string } | { ok: true; code: string } | null;

export async function issueGiftCard(prevState: GiftCardState, formData: FormData): Promise<GiftCardState> {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const amount = Math.round((parseFloat(String(formData.get('initial_balance') ?? '')) || 0) * 100) / 100;
  if (!amount || amount <= 0) return { error: 'El saldo debe ser mayor a 0.' };
  if (amount > 100000) return { error: 'Ese saldo parece demasiado alto — revisa el monto.' };

  const recipientName = (formData.get('recipient_name') as string)?.trim() || null;
  const note = (formData.get('note') as string)?.trim() || null;
  const expiresRaw = (formData.get('expires_at') as string)?.trim() || null;
  const expiresAt = expiresRaw ? new Date(`${expiresRaw}T23:59:59`).toISOString() : null;
  if (expiresRaw && Number.isNaN(new Date(expiresAt as string).getTime())) return { error: 'Fecha de vencimiento inválida.' };

  // Reintenta con otro código en el raro caso de choque (índice único por restaurante).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `REGALO-${randomCode()}`;
    const { data, error } = await ctx.db.rpc('issue_gift_card', {
      p_restaurant_id: ctx.restaurantId,
      p_code: code,
      p_initial_balance: amount,
      p_recipient_name: recipientName,
      p_note: note,
      p_expires_at: expiresAt,
      p_created_by: ctx.userId,
    });
    if (!error) {
      await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'vale', entity: code, meta: { amount } });
      revalidatePath('/admin/vales');
      return { ok: true, code };
    }
    if (!error.message.includes('unique') && !error.message.includes('duplicate')) {
      return { error: error.message };
    }
    void data;
  }
  return { error: 'No se pudo generar un código único, intenta de nuevo.' };
}

export type GiftCard = {
  id: string;
  code: string;
  initial_balance: number;
  balance: number;
  recipient_name: string | null;
  note: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  expires_at: string | null;
  created_at: string;
};

export async function listGiftCards(restaurantId: string, limit = 100): Promise<GiftCard[]> {
  const ctx = await adminCtx(restaurantId);
  if (!ctx) return [];
  const { data } = await ctx.db
    .from('gift_cards')
    .select('id, code, initial_balance, balance, recipient_name, note, status, expires_at, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 300));
  return (data ?? []) as GiftCard[];
}

export async function cancelGiftCard(formData: FormData): Promise<void> {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return;
  const id = (formData.get('id') as string)?.trim();
  if (!id || !UUID_RE.test(id)) return;

  await ctx.db.from('gift_cards').update({ status: 'CANCELLED' }).eq('id', id).eq('restaurant_id', ctx.restaurantId);
  revalidatePath('/admin/vales');
}

export type OrderLookup = {
  id: string;
  order_number: string;
  total: number;
  gift_card_amount: number;
  status: string;
  customer_name: string;
  created_at: string;
};

/** Busca pedidos por número (coincidencia parcial) para aplicarles un vale. */
export async function findOrdersForRedeem(restaurantId: string, query: string): Promise<OrderLookup[]> {
  const ctx = await adminCtx(restaurantId);
  if (!ctx) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const { data } = await ctx.db
    .from('orders')
    .select('id, order_number, total, gift_card_amount, status, customer_name, created_at')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'CANCEL')
    .ilike('order_number', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  return (data ?? []) as OrderLookup[];
}

export type RedeemState = { error: string } | { ok: true; newBalance: number } | null;

export async function redeemGiftCard(prevState: RedeemState, formData: FormData): Promise<RedeemState> {
  const ctx = await adminCtx(formData.get('restaurantId') as string | null);
  if (!ctx) return { error: 'No autorizado.' };

  const code = (formData.get('code') as string)?.trim().toUpperCase();
  const orderId = (formData.get('orderId') as string)?.trim();
  const amount = Math.round((parseFloat(String(formData.get('amount') ?? '')) || 0) * 100) / 100;

  if (!code) return { error: 'Escribe el código del vale.' };
  if (!orderId || !UUID_RE.test(orderId)) return { error: 'Selecciona un pedido válido.' };
  if (!amount || amount <= 0) return { error: 'El monto debe ser mayor a 0.' };

  const { data: card } = await ctx.db
    .from('gift_cards')
    .select('id')
    .eq('restaurant_id', ctx.restaurantId)
    .ilike('code', code)
    .maybeSingle();
  if (!card) return { error: 'No existe un vale con ese código en este restaurante.' };

  const { data: newBalance, error } = await ctx.db.rpc('redeem_gift_card', {
    p_gift_card_id: card.id,
    p_order_id: orderId,
    p_amount: amount,
    p_created_by: ctx.userId,
  });
  if (error) return { error: error.message.replace(/^.*P0001[:\s]*/i, '') || 'No se pudo aplicar el vale.' };

  await logActivity({ restaurantId: ctx.restaurantId, actorId: ctx.userId, action: 'vale', entity: code, meta: { redeemed: amount, orderId } });
  revalidatePath('/admin/vales');
  revalidatePath('/admin/pedidos');
  return { ok: true, newBalance: Number(newBalance) };
}
