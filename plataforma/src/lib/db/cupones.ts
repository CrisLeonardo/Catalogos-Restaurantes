import { createServiceClient } from '@/lib/supabase/service';

export type DiscountType = 'PERCENT' | 'FIXED';

export interface Coupon {
  id: string;
  restaurant_id: string;
  code: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_order: number | null;
  max_uses: number | null;
  uses: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getCoupons(restaurantId: string): Promise<Coupon[]> {
  const db = createServiceClient();
  const { data } = await db
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Coupon[];
}

export async function getCouponByCode(restaurantId: string, code: string): Promise<Coupon | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .maybeSingle();
  return data as Coupon | null;
}
