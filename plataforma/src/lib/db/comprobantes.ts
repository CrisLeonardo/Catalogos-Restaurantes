import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import type { EstadoComprobante } from '@/lib/pago-plan';

/* ============================================================
   COMPROBANTES DE PAGO — lectura (migración 148)
   ------------------------------------------------------------
   Capa de datos con service role; quien llama ya validó la sesión
   (el dueño por usuarioDelCobro, el super admin por su layout).
   ============================================================ */

export const BUCKET_COMPROBANTES = 'payment-proofs';

/** Cuánto vive el enlace firmado para ver un comprobante. */
const FIRMA_SEGUNDOS = 10 * 60;

export interface Comprobante {
  id: string;
  restaurantId: string;
  invoiceIds: string[];
  amount: number;
  currency: string;
  filePath: string;
  bankReference: string | null;
  status: EstadoComprobante;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function norm(row: Record<string, unknown>): Comprobante {
  return {
    id: row.id as string,
    restaurantId: row.restaurant_id as string,
    invoiceIds: (row.invoice_ids as string[] | null) ?? [],
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'GTQ',
    filePath: row.file_path as string,
    bankReference: (row.bank_reference as string | null) ?? null,
    status: (row.status as EstadoComprobante) ?? 'SUBMITTED',
    reviewNote: (row.review_note as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** El último comprobante del restaurante (para pintar «en revisión» o «rechazado»).
 *  null si no hay ninguno o si la migración 148 aún no corrió aquí. */
export async function ultimoComprobante(restaurantId: string): Promise<Comprobante | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('payment_proofs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return norm(data as Record<string, unknown>);
}

export interface ComprobantePorRevisar extends Comprobante {
  restaurantName: string;
  restaurantSlug: string;
  /** Enlace firmado de corta vida; null si el archivo ya no está. */
  url: string | null;
  esPdf: boolean;
}

/** Bandeja del super admin: lo que espera revisión, el más viejo primero.
 *  `disponible: false` cuando la migración 148 todavía no corrió. */
export async function comprobantesPorRevisar(): Promise<{ disponible: boolean; items: ComprobantePorRevisar[] }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('payment_proofs')
    .select('*, restaurants(name, slug)')
    .eq('status', 'SUBMITTED')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return { disponible: !faltaLaTabla(error), items: [] };

  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const c = norm(row as Record<string, unknown>);
      const r = (row as { restaurants?: { name?: string; slug?: string } | null }).restaurants;
      const { data: firmado } = await db.storage
        .from(BUCKET_COMPROBANTES)
        .createSignedUrl(c.filePath, FIRMA_SEGUNDOS);
      return {
        ...c,
        restaurantName: r?.name ?? '—',
        restaurantSlug: r?.slug ?? '',
        url: firmado?.signedUrl ?? null,
        esPdf: c.filePath.toLowerCase().endsWith('.pdf'),
      };
    }),
  );
  return { disponible: true, items };
}

/** Cuántos esperan revisión (para el aviso en Cobranza). 0 si no hay tabla. */
export async function contarComprobantesPorRevisar(): Promise<number> {
  const db = createServiceClient();
  const { count, error } = await db
    .from('payment_proofs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'SUBMITTED');
  return error ? 0 : count ?? 0;
}
