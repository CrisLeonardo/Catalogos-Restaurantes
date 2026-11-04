import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { lecturaDe, type EstadoLectura, type Lectura } from '@/lib/db/lectura';
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
 *  `datos: null` si no hay ninguno; el estado dice si se pudo consultar
 *  (antes un error también devolvía null, como si nunca hubiera mandado uno). */
export async function ultimoComprobante(restaurantId: string): Promise<Lectura<Comprobante | null>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('payment_proofs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return lecturaDe(error, data ? norm(data as Record<string, unknown>) : null, null, { contexto: 'ultimoComprobante' });
}

export interface ComprobantePorRevisar extends Comprobante {
  restaurantName: string;
  restaurantSlug: string;
  /** Enlace firmado de corta vida; null si el archivo ya no está. */
  url: string | null;
  esPdf: boolean;
}

/** Bandeja del super admin: lo que espera revisión, el más viejo primero.
 *  `estado: 'falta-migracion'` cuando la 148 todavía no corrió; `'error'` si
 *  la consulta falló (antes eso se pintaba «No hay comprobantes por
 *  revisar», auditoría 2026-11-03, N13). */
export async function comprobantesPorRevisar(): Promise<{ estado: EstadoLectura; items: ComprobantePorRevisar[] }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('payment_proofs')
    .select('*, restaurants(name, slug)')
    .eq('status', 'SUBMITTED')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) return { estado: lecturaDe(error, null, null, { contexto: 'comprobantesPorRevisar' }).estado, items: [] };

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
  return { estado: 'ok', items };
}

/** Cuántos esperan revisión (para el aviso en Cobranza). Un error no es un 0. */
export async function contarComprobantesPorRevisar(): Promise<Lectura<number>> {
  const db = createServiceClient();
  const { count, error } = await db
    .from('payment_proofs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'SUBMITTED');
  return lecturaDe(error, count ?? 0, 0, { contexto: 'contarComprobantesPorRevisar' });
}
