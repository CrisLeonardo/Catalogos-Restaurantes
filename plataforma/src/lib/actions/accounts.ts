'use server';

/* ============================================================
   RESCATAR UNA CUENTA DE LEOGIN (fase 2)
   ------------------------------------------------------------
   Lo que faltaba para poder ayudar a alguien por teléfono.

   Hasta ahora el único rescate vivía dentro de la ficha de un
   restaurante (`resetRestaurantUserPassword`), lo que dejaba fuera a
   las dos personas que más lo necesitan: la que creó su cuenta y nunca
   llegó a crear su restaurante, y la que se quedó sin restaurante
   porque se borró. A esas no había forma de llegar. Aquí el punto de
   partida es la PERSONA, así que da igual cuántos locales tenga —tres,
   uno o ninguno—.

   TRES COSAS QUE NO SE PUEDEN HACER, y no es prudencia de más:

   1) Tocar a un SUPER_ADMIN. Es la regla que ya traía el rescate viejo
      y se conserva: quien entra aquí ya puede escribir en toda la base,
      y poder cambiarle la contraseña a otro super admin convierte una
      sesión robada en una toma del panel entero.

   2) Cambiar el correo de una cuenta de GOOGLE. Su identidad en Google
      sigue apuntando al correo viejo, así que al volver a entrar se
      partiría en dos cuentas: la de Google con lo de antes y la nuestra
      con el correo nuevo. A esa persona no se le corrige el correo, se
      le dice que entre con Google.

   3) Cambiar el correo de una credencial por PIN. Ese correo no es un
      correo: es `u.<restaurante>.<usuario>@staff.leogin.internal`, y de
      ahí se leen el restaurante y el usuario (`parseStaffUsername`).
      Editarlo a mano rompe el login del local.

   Las tres dejan rastro en `super_admin_log` (migración 132). Se
   registra DESPUÉS de que la acción salga bien: una bitácora que
   apunta intenciones y no hechos no sirve para contestar «¿qué le
   pasó a mi cuenta?».
   ============================================================ */

import { revalidatePath } from 'next/cache';
import { currentSuperAdmin, type SuperAdminSession } from '@/lib/auth/super-admin-guard';
import { logSuper } from '@/lib/super-admin-log';
import { getAccountById, findAccountIdByEmail } from '@/lib/db/accounts';
import { sendRecoveryEmail } from '@/lib/auth/recovery-email';
import { sendEmailVerification } from '@/lib/auth/email-verification';
import { emailEnabled } from '@/lib/email';
import {
  impedimentoParaCambiarCorreo,
  impedimentoParaEnlace,
  type ImpedimentoCorreo,
  type ImpedimentoEnlace,
} from '@/lib/account-rescue-rules';
import type { AccountRow } from '@/lib/db/accounts';

export type AccountActionState = { error: string } | { ok: string } | null;

const NO_AUTORIZADO: AccountActionState = { error: 'No autorizado.' };

/** Qué se le dice a quien está al teléfono por cada impedimento. */
const MOTIVO_CORREO: Record<NonNullable<ImpedimentoCorreo>, string> = {
  google:
    'Esta cuenta entra con Google, y su identidad seguiría apuntando al correo viejo: cambiarlo aquí la partiría en dos. Dile que entre con el botón de Google.',
  pin:
    'Es una credencial de acceso por PIN, no un correo de verdad: de ahí se leen el restaurante y el usuario. Cámbiala desde Personal, en el panel del restaurante.',
  formato: 'Escribe un correo válido.',
  'dominio-interno': 'Ese dominio es interno: no recibe correo.',
  'sin-cambio': 'Ese ya es su correo.',
};

const MOTIVO_ENLACE: Record<NonNullable<ImpedimentoEnlace>, string> = {
  pin: 'Una credencial por PIN no tiene buzón: el enlace no llegaría a ninguna parte.',
  'sin-correo': 'Esta cuenta no tiene correo.',
  'sin-proveedor':
    'Todavía no hay proveedor de correo configurado (falta RESEND_API_KEY). Ponle una contraseña a mano.',
};

/**
 * El cliente de servicio y la cuenta sobre la que se va a actuar, o un error
 * ya listo para devolver. Las tres acciones empiezan igual y la comprobación
 * de «no es un super admin» tiene que estar en las tres.
 */
async function objetivo(userId: string): Promise<
  | { sesion: SuperAdminSession; cuenta: AccountRow }
  | { fallo: AccountActionState }
> {
  const sesion = await currentSuperAdmin();
  if (!sesion) return { fallo: NO_AUTORIZADO };
  if (!userId) return { fallo: { error: 'Cuenta inválida.' } };

  const detalle = await getAccountById(userId);
  if (detalle.estado === 'migracion-pendiente') {
    return { fallo: { error: 'Falta correr la migración 131 en esta base.' } };
  }
  if (detalle.estado === 'no-existe') return { fallo: { error: 'Esa cuenta ya no existe.' } };
  // Se responde lo mismo que a quien no tiene permiso: desde fuera no puede
  // deducirse si el id existe y es intocable, o si no existe.
  if (detalle.cuenta.role === 'SUPER_ADMIN') return { fallo: NO_AUTORIZADO };

  return { sesion, cuenta: detalle.cuenta };
}

/**
 * ¿Este fallo de Auth es «ese correo ya está cogido»?
 *
 * Mira el código antes que el texto: el mensaje que llega es genérico y el
 * código (23505, la violación de unicidad de Postgres) es lo único fiable
 * cuando llega. Las palabras van después, por si otra versión de GoTrue
 * contesta de otra forma.
 */
function correoOcupado(error: { message?: string; code?: string; status?: number }): boolean {
  if (error.code === '23505') return true;
  const m = error.message?.toLowerCase() ?? '';
  return ['duplicate', 'already', 'registered', 'exists'].some((p) => m.includes(p));
}

/** Refresca la ficha y la lista después de cambiar algo. */
function refrescar(userId: string) {
  revalidatePath(`/super/cuentas/${userId}`);
  revalidatePath('/super/cuentas');
}

/* ── 1. Reponer la contraseña ───────────────────────────────
   Igual que `resetRestaurantUserPassword`, menos la parte que sobraba:
   NO se pide un restaurante. Ese requisito era el que dejaba sin salida
   a quien no tiene ninguno. */

export async function resetAccountPassword(
  prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = (formData.get('userId') as string)?.trim();
  const password = (formData.get('password') as string) ?? '';

  const ctx = await objetivo(userId);
  if ('fallo' in ctx) return ctx.fallo;
  const { sesion, cuenta } = ctx;

  if (password.length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres.' };

  const { error } = await sesion.db.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  // La contraseña NO se registra, ni entera ni a trozos: la bitácora se
  // consulta para explicarle algo a un cliente, no para guardar credenciales.
  await logSuper(sesion, {
    action: 'cuenta.contrasena',
    targetUserId: userId,
    targetLabel: cuenta.email,
  });
  refrescar(userId);
  return { ok: 'Contraseña cambiada. Dísela por un canal en el que confíes y pídele que la cambie al entrar.' };
}

/* ── 2. Corregir el correo ──────────────────────────────────
   El hallazgo A-04: hasta ahora no había ninguna llamada en el proyecto
   que escribiera el correo de nadie, así que un dedazo en el registro
   —`juan@gmial.com`— era una cuenta muerta: no la recordaba, el enlace
   de recuperación iba a un buzón inexistente y su slug quedaba ocupado.
   La única salida era abrir otra cuenta. */

export async function changeAccountEmail(
  prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = (formData.get('userId') as string)?.trim();
  const email = (formData.get('email') as string)?.trim().toLowerCase() ?? '';

  const ctx = await objetivo(userId);
  if ('fallo' in ctx) return ctx.fallo;
  const { sesion, cuenta } = ctx;
  const { db } = sesion;

  const impedimento = impedimentoParaCambiarCorreo(cuenta, email);
  if (impedimento) return { error: MOTIVO_CORREO[impedimento] };

  // ¿De quién es ya ese correo? Se pregunta antes porque el error de Auth
  // no se puede leer: cuando el correo está ocupado devuelve «Error
  // updating user» y nada más (por dentro es un 23505, pero no sube).
  // Comprobado contra la base al construir esto.
  const dueño = await findAccountIdByEmail(email);
  if (dueño && dueño !== userId) return { error: `Ya hay otra cuenta de Leogin con ${email}.` };

  // `email_confirm: true` para que pueda entrar de inmediato con el correo
  // nuevo — sin esto GoTrue lo deja pendiente y le cierra el paso justo
  // después de haberle arreglado el problema.
  const { error } = await db.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (error) {
    // La red de seguridad de la comprobación de arriba: un COMENSAL con ese
    // mismo correo no tiene perfil, así que no sale en la vista, pero ocupa
    // el correo en Auth igual. Aquí ya no se puede decir de quién es —solo
    // que está cogido—, y eso es mejor que «Error updating user».
    if (correoOcupado(error)) return { error: `Ese correo ya está en uso por otra cuenta.` };
    return { error: error.message };
  }

  // Que Auth lo dé por bueno no significa que el buzón sea suyo: eso es lo
  // que dice `email_verified_at`, y del correo nuevo no consta nada. Se
  // borra y se le manda la confirmación, para que la pantalla siga diciendo
  // la verdad en vez de dar por verificado un correo que acabas de teclear
  // tú (ver lib/account-classification.ts).
  await db.from('profiles').update({ email_verified_at: null }).eq('id', userId);
  await sendEmailVerification(email);

  // El correo VIEJO va en la bitácora: sin él, la fila dice que alguien
  // cambió un correo pero no desde cuál, y esa es justo la pregunta que se
  // hace cuando una persona dice que ya no puede entrar.
  await logSuper(sesion, {
    action: 'cuenta.correo',
    targetUserId: userId,
    targetLabel: email,
    meta: { antes: cuenta.email, despues: email },
  });

  refrescar(userId);
  return {
    ok: emailEnabled()
      ? `Ahora entra con ${email}. Le mandamos el correo de confirmación.`
      : `Ahora entra con ${email}. Queda como «sin verificar» hasta que confirme el buzón.`,
  };
}

/* ── 3. Mandarle el enlace de recuperación ──────────────────
   La misma que se manda sola desde «Olvidé mi contraseña», disparada
   por ti. Sirve para no tener que dictar una contraseña por WhatsApp:
   la elige la persona y no pasa por nadie más. */

export async function sendAccountRecoveryLink(
  prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = (formData.get('userId') as string)?.trim();

  const ctx = await objetivo(userId);
  if ('fallo' in ctx) return ctx.fallo;
  const { sesion, cuenta } = ctx;

  const impedimento = impedimentoParaEnlace(cuenta, emailEnabled());
  if (impedimento) return { error: MOTIVO_ENLACE[impedimento] };

  const result = await sendRecoveryEmail(cuenta.email!);
  if (result.ok) {
    await logSuper(sesion, {
      action: 'cuenta.enlace-recuperacion',
      targetUserId: userId,
      targetLabel: cuenta.email,
    });
    return { ok: `Enlace enviado a ${cuenta.email}. Caduca en una hora y funciona una sola vez.` };
  }

  // Aquí sí se dice qué pasó. La respuesta neutra del formulario público
  // existe para no filtrar quién es cliente de Leogin; contigo esa
  // preocupación no aplica, y callar el fallo te dejaría esperando.
  if (result.reason === 'sin-proveedor') return { error: MOTIVO_ENLACE['sin-proveedor'] };
  if (result.reason === 'sin-cuenta') {
    return { error: 'Supabase no reconoce ese correo. Revisa que sea el de la cuenta.' };
  }
  return { error: 'El proveedor no aceptó el envío. Inténtalo de nuevo en unos minutos.' };
}
