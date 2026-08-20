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

/* ============================================================
   USUARIO DEL RESTAURANTE — la credencial del administrador
   ------------------------------------------------------------
   El dueño da de alta a su encargado con un USUARIO, no con un correo:
   `carlos` + una contraseña, y con eso entra desde la dirección de su
   restaurante. Lo que se guarda en Supabase Auth sigue siendo un correo
   —Auth exige uno— pero es interno y nadie lo teclea nunca:

       u.<id del restaurante sin guiones>.<usuario>@staff.leogin.internal

   Por qué el usuario y no el correo real de la persona, que era lo de antes:

    · `auth.users` es único por correo en TODA la plataforma. Dar de alta a
      un encargado con su Gmail OCUPABA ese correo para siempre: el día que
      esa persona quisiera abrir su propio restaurante en Leogin se topaba
      con "ya existe una cuenta con ese correo" — por una cuenta que le
      creó un jefe anterior.
    · Un usuario es del RESTAURANTE, no de la persona. Es exactamente lo que
      promete el modelo: "estas credenciales sirven solo para este local".
      Dos restaurantes pueden tener su propio `carlos` sin saber el uno del
      otro.
    · Y funciona para el encargado que no tiene correo, o que no lo revisa.
      En este mercado la credencial se dicta por WhatsApp; pedirle un correo
      que no usa era inventar un trámite.

   El id del restaurante va en el correo interno —y no el slug— porque el
   slug puede cambiar: si un dueño cambia la dirección de su menú, las
   credenciales de su equipo no pueden dejar de funcionar por eso.
   ============================================================ */

/** Minúsculas, números, guion y guion bajo. Sin puntos: el punto separa las
    tres partes del correo interno y haría ambiguo el análisis. */
const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;

/** Mensaje de error, o null si el usuario es válido. */
export function validateUsername(username: string): string | null {
  if (!username) return 'Escribe un usuario para esta persona.';
  if (username.length < 3) return 'El usuario debe tener al menos 3 caracteres.';
  if (username.length > 24) return 'El usuario es demasiado largo (máximo 24).';
  if (!USERNAME_RE.test(username)) {
    return 'El usuario solo puede llevar letras minúsculas, números, guion y guion bajo.';
  }
  return null;
}

/** El correo interno con el que este usuario entra a ESTE restaurante. */
export function staffUsernameEmail(restaurantId: string, username: string): string {
  return `u.${restaurantId.replace(/-/g, '')}.${username.toLowerCase()}${SYNTHETIC_EMAIL_DOMAIN}`;
}

/**
 * El usuario y el restaurante que hay dentro de un correo interno, o null si
 * no es uno de estos (un PIN del local, o un correo real de verdad).
 */
export function parseStaffUsername(
  email: string | null | undefined,
): { restaurantIdFlat: string; username: string } | null {
  if (!isSyntheticStaffEmail(email)) return null;
  const local = email!.slice(0, email!.length - SYNTHETIC_EMAIL_DOMAIN.length);
  const parts = local.split('.');
  if (parts.length !== 3 || parts[0] !== 'u') return null;
  if (!/^[0-9a-f]{32}$/i.test(parts[1]) || !USERNAME_RE.test(parts[2])) return null;
  return { restaurantIdFlat: parts[1].toLowerCase(), username: parts[2] };
}

/**
 * Qué escribió alguien en el campo de acceso: su correo, o su usuario.
 *
 * Se separan por el PUNTO: un correo de verdad siempre lo lleva en el dominio
 * (`ana@gmail.com`) y una dirección de restaurante nunca (`ana@rincon-502`).
 * No se puede distinguir por otra cosa —ni preguntándole a la persona, que es
 * lo que se quería evitar— y equivocarse aquí es dejar a alguien fuera de su
 * turno, así que vive aparte y con pruebas.
 *
 * Devuelve null cuando es un usuario y no hay forma de saber de qué
 * restaurante: usuario suelto en el dominio raíz, o usuario mal escrito.
 */
export function splitLoginIdentifier(
  entrada: string,
  tenantSlug: string | null,
):
  | { kind: 'email'; email: string }
  | { kind: 'username'; username: string; slug: string }
  | null {
  const limpio = entrada.trim();
  if (!limpio) return null;

  const arroba = limpio.lastIndexOf('@');
  const dominio = arroba === -1 ? '' : limpio.slice(arroba + 1);
  if (arroba !== -1 && dominio.includes('.')) {
    return { kind: 'email', email: limpio.toLowerCase() };
  }

  const username = (arroba === -1 ? limpio : limpio.slice(0, arroba)).toLowerCase();
  const slug = ((arroba === -1 ? tenantSlug : dominio) ?? '').toLowerCase();
  if (!slug || validateUsername(username)) return null;
  return { kind: 'username', username, slug };
}
