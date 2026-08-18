/* ============================================================
   CORREOS INTERNOS DEL PERSONAL
   ------------------------------------------------------------
   El personal que entra por PIN tiene una cuenta de Supabase Auth con un
   correo inventado por nosotros: es un requisito de Auth (todo usuario
   necesita un identificador), no una credencial que nadie teclee.

   Vive en su propio módulo —sin `'use server'`— porque lo necesitan por
   igual las acciones de servidor (staff.ts) y el panel del navegador, que
   usa esto para no enseñarle al dueño un correo `@staff.leogin.internal`
   como si fuera el de la persona.
   ============================================================ */

/** Dominio de los correos internos: no existe, no recibe nada, no es de nadie. */
export const SYNTHETIC_EMAIL_DOMAIN = '@staff.leogin.internal';

/** ¿Es un correo inventado por nosotros (entra por PIN) o suyo de verdad
    (entra con correo y contraseña, o con Google)? */
export function isSyntheticStaffEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(SYNTHETIC_EMAIL_DOMAIN);
}
