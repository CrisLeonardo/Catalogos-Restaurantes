'use server';

/* ============================================================
   PAGA TU PLAN — server actions (migración 148)
   ------------------------------------------------------------
   · El dueño sube su comprobante: primero pide una URL firmada de
     subida (el archivo va directo del navegador al bucket privado, sin
     pasar por el límite de 1 MB de las server actions) y luego registra
     el comprobante contra sus cobros pendientes.
   · El super admin lo aprueba (marca pagadas las facturas que cubre y
     reactiva al restaurante si estaba suspendido) o lo rechaza con un
     motivo que el dueño ve en su pantalla.
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/service';
import { usuarioDelCobro } from '@/lib/auth/acceso-cobro';
import { currentSuperAdmin } from '@/lib/auth/super-admin-guard';
import { logSuper } from '@/lib/super-admin-log';
import { BUCKET_COMPROBANTES } from '@/lib/db/comprobantes';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import { emailEnabled, sendEmail } from '@/lib/email';
import { fmtMoney } from '@/lib/money';
import {
  COMPROBANTE_TIPOS,
  codigoDePago,
  limpiarReferencia,
  rutaDeComprobanteValida,
} from '@/lib/pago-plan';

const UUID_RE = /^[0-9a-f-]{36}$/i;

const SIN_MIGRACION = 'Todavía no se pueden subir comprobantes desde aquí. Mándalo por WhatsApp, por favor.';

export type ComprobanteState = { error: string } | { ok: true; msg?: string } | null;

function revalidarCobro() {
  revalidatePath('/admin/suscripcion');
  revalidatePath('/admin');
  revalidatePath('/super/finanzas', 'layout');
}

/* ── Dueño ─────────────────────────────────────────────────── */

/** Paso 1 de la subida: una URL firmada para mandar el archivo directo al bucket. */
export async function prepararSubidaComprobante(
  restaurantId: string,
  tipo: string,
): Promise<{ ruta: string; token: string } | { error: string }> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };
  if (!(await usuarioDelCobro(restaurantId))) return { error: 'No autorizado.' };
  const ext = COMPROBANTE_TIPOS[tipo];
  if (!ext) return { error: 'Sube una foto (JPG, PNG o WebP) o un PDF.' };

  const ruta = `${restaurantId}/${crypto.randomUUID()}.${ext}`;
  const db = createServiceClient();
  const { data, error } = await db.storage.from(BUCKET_COMPROBANTES).createSignedUploadUrl(ruta);
  if (error || !data) return { error: SIN_MIGRACION };
  return { ruta, token: data.token };
}

/** Paso 2: registra el comprobante ya subido contra lo pendiente. */
export async function enviarComprobante(
  restaurantId: string,
  ruta: string,
  referencia: string,
): Promise<ComprobanteState> {
  if (!UUID_RE.test(restaurantId)) return { error: 'Restaurante inválido.' };
  const userId = await usuarioDelCobro(restaurantId);
  if (!userId) return { error: 'No autorizado.' };
  if (!rutaDeComprobanteValida(restaurantId, ruta)) return { error: 'El archivo no es válido. Vuelve a subirlo.' };

  const db = createServiceClient();

  const { data: pendientes } = await db
    .from('invoices')
    .select('id, amount, currency')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'PENDING');
  if (!pendientes || pendientes.length === 0) return { error: 'No tienes cobros pendientes: ya estás al día.' };

  // Solo vale un comprobante en revisión a la vez: si se equivocó de foto y
  // manda otra, la nueva reemplaza a la anterior (y su archivo se borra).
  const { data: previos, error: errPrevios } = await db
    .from('payment_proofs')
    .select('id, file_path')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'SUBMITTED');
  if (errPrevios) return { error: faltaLaTabla(errPrevios) ? SIN_MIGRACION : errPrevios.message };

  const amount = pendientes.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const currency = (pendientes[0].currency as string) ?? 'GTQ';

  const { error } = await db.from('payment_proofs').insert({
    restaurant_id: restaurantId,
    invoice_ids: pendientes.map((i) => i.id),
    amount,
    currency,
    file_path: ruta,
    bank_reference: limpiarReferencia(referencia),
    submitted_by: userId,
  });
  if (error) return { error: faltaLaTabla(error) ? SIN_MIGRACION : error.message };

  if (previos && previos.length > 0) {
    await db.from('payment_proofs').delete().in('id', previos.map((p) => p.id));
    await db.storage.from(BUCKET_COMPROBANTES).remove(previos.map((p) => p.file_path as string));
  }

  await avisarALeogin(restaurantId, amount, currency);
  revalidarCobro();
  return { ok: true, msg: 'Comprobante enviado. Lo revisamos en menos de 24 horas.' };
}

/** Correo a soporte de Leogin con el aviso. Best-effort: nunca rompe el envío. */
async function avisarALeogin(restaurantId: string, amount: number, currency: string) {
  if (!emailEnabled()) return;
  try {
    const contacto = await getPlatformContactSettings();
    if (!contacto.support_email) return;
    const db = createServiceClient();
    const { data: r } = await db.from('restaurants').select('name').eq('id', restaurantId).maybeSingle();
    const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '').split(',')[0].trim();
    await sendEmail({
      to: contacto.support_email,
      subject: `Comprobante de pago · ${r?.name ?? 'restaurante'}`,
      heading: 'Llegó un comprobante de pago',
      body: [
        `${r?.name ?? 'Un restaurante'} (${codigoDePago(restaurantId)}) subió un comprobante por ${fmtMoney(amount, currency)}.`,
        'Revísalo y apruébalo para marcar sus cobros como pagados.',
      ],
      cta: root && !root.includes('localhost')
        ? { label: 'Revisar comprobante', url: `https://${root}/super/finanzas/comprobantes` }
        : undefined,
    });
  } catch {
    /* el aviso es cortesía: el comprobante ya quedó guardado */
  }
}

/* ── Super admin ───────────────────────────────────────────── */

export async function aprobarComprobante(
  _prev: ComprobanteState,
  formData: FormData,
): Promise<ComprobanteState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const db = sesion.db;
  const id = String(formData.get('id') ?? '');
  if (!UUID_RE.test(id)) return { error: 'Comprobante inválido.' };

  const { data: c } = await db
    .from('payment_proofs')
    .select('id, restaurant_id, invoice_ids, amount, currency, bank_reference, status, restaurants(name)')
    .eq('id', id)
    .maybeSingle();
  if (!c) return { error: 'Ese comprobante ya no existe.' };
  if (c.status !== 'SUBMITTED') return { error: 'Ese comprobante ya se revisó.' };

  // Cada factura queda pagada por su propio monto. Las que se pagaron por
  // otro lado mientras tanto (status ≠ PENDING) no se tocan.
  const ids = (c.invoice_ids as string[] | null) ?? [];
  const { data: facturas } = ids.length
    ? await db.from('invoices').select('id, amount').in('id', ids).eq('status', 'PENDING')
    : { data: [] as { id: string; amount: number }[] };
  const ahora = new Date().toISOString();
  const ref = c.bank_reference ? ` · boleta ${c.bank_reference}` : '';
  for (const f of facturas ?? []) {
    const { error } = await db.from('invoices').update({
      status: 'PAID',
      paid_at: ahora,
      paid_amount: Number(f.amount ?? 0),
      payment_method: `Transferencia${ref}`,
    }).eq('id', f.id);
    if (error) return { error: error.message };
  }

  const { error } = await db
    .from('payment_proofs')
    .update({ status: 'APPROVED', reviewed_at: ahora, review_note: null })
    .eq('id', id);
  if (error) return { error: error.message };

  const { data: estado } = await db.rpc('leogin_sync_restaurant_status', { p_restaurant_id: c.restaurant_id });
  const restaurante = (c as { restaurants?: { name?: string } | null }).restaurants?.name ?? null;
  await logSuper(sesion, {
    action: 'cobro.aprobar',
    targetRestaurantId: c.restaurant_id as string,
    targetLabel: restaurante,
    meta: { comprobante: id, monto: Number(c.amount), facturas: (facturas ?? []).length },
  });

  revalidarCobro();
  revalidatePath(`/super/restaurantes/${c.restaurant_id}`, 'layout');
  return {
    ok: true,
    msg: estado === 'reactivated' ? 'Pago aprobado. El restaurante se reactivó.' : 'Pago aprobado.',
  };
}

export async function rechazarComprobante(
  _prev: ComprobanteState,
  formData: FormData,
): Promise<ComprobanteState> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { error: 'No autorizado.' };
  const id = String(formData.get('id') ?? '');
  if (!UUID_RE.test(id)) return { error: 'Comprobante inválido.' };
  const motivo = String(formData.get('motivo') ?? '').trim().slice(0, 200);
  if (!motivo) return { error: 'Escribe el motivo: el restaurante lo va a leer.' };

  const { data: c, error } = await sesion.db
    .from('payment_proofs')
    .update({ status: 'REJECTED', reviewed_at: new Date().toISOString(), review_note: motivo })
    .eq('id', id)
    .eq('status', 'SUBMITTED')
    .select('restaurant_id, restaurants(name)')
    .maybeSingle();
  if (error) return { error: error.message };
  if (!c) return { error: 'Ese comprobante ya se revisó.' };

  await logSuper(sesion, {
    action: 'cobro.rechazar',
    targetRestaurantId: c.restaurant_id as string,
    targetLabel: (c as { restaurants?: { name?: string } | null }).restaurants?.name ?? null,
    meta: { comprobante: id, motivo },
  });
  revalidarCobro();
  return { ok: true, msg: 'Comprobante rechazado. El restaurante verá el motivo.' };
}
