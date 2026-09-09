import 'server-only';

import { cache } from 'react';
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaTabla } from '@/lib/db/migracion-ausente';
import { armarCuenta, type AccountLocal, type AccountRow, type CuentaCruda, type LocalBasico } from '@/lib/account-classification';
import type { MemberRole } from '@/lib/membership-roles';
import { dejariaSinDueño } from '@/lib/membership-rules';

/* ============================================================
   CUENTAS DE LEOGIN — el índice por PERSONA (migración 131)
   ------------------------------------------------------------
   El resto del Super Admin entra por el restaurante: dime el local y te
   digo quién lo administra (`getRestaurantUsers`). Esto es la pregunta
   al revés, que es como llega a ti: «soy Carlos, este es mi correo, no
   puedo entrar».

   Sin esta dirección hay dos personas a las que NO se llega de ninguna
   forma, y son justo las que necesitan ayuda:

     · quien creó su cuenta y no llegó a crear el restaurante —el alta
       deja `profiles.restaurant_id` en null a propósito—, que además ya
       tiene su correo ocupado;
     · el personal de un restaurante borrado, que sigue entrando al
       login y ya no cuelga de ninguna ficha.

   Las REGLAS (qué es «sin local», qué es «huérfana», qué cuenta como
   verificado) viven en `lib/account-classification.ts`, con pruebas.
   Aquí solo se consulta.
   ============================================================ */

export type { AccountLocal, AccountRow, LocalBasico } from '@/lib/account-classification';

export type AccountsResult = {
  rows: AccountRow[];
  /** La migración 131 todavía no ha corrido en esta base. */
  migracionPendiente: boolean;
};

/**
 * Todas las cuentas de Leogin, con sus locales ya cruzados.
 *
 * Son tres consultas y no una por persona: el correo lo trae la vista
 * (por eso existe), así que no hace falta un `getUserById` por fila —que
 * es lo que habría convertido esta pantalla en cien peticiones—, ni
 * barrer `auth.admin.listUsers`, que pagina de cincuenta en cincuenta,
 * no busca por texto y además devolvería a todos los comensales.
 *
 * Se filtra y ordena arriba, en el cliente: `profiles` son las personas
 * que trabajan en la plataforma —dueños y personal—, no sus clientes,
 * así que son pocas y caben de una vez.
 */
export const listAccounts = cache(async (): Promise<AccountsResult> => {
  const db = createServiceClient();

  const { data: cuentas, error } = await db
    .from('admin_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  // La vista no existe todavía en esta base: la pantalla lo dice y no
  // revienta con un error de Postgres.
  if (error) {
    if (faltaLaTabla(error)) return { rows: [], migracionPendiente: true };
    throw new Error(error.message);
  }

  const filas = (cuentas ?? []) as CuentaCruda[];
  if (!filas.length) return { rows: [], migracionPendiente: false };

  const [{ data: members }, { data: restaurants }] = await Promise.all([
    db.from('restaurant_members').select('user_id, restaurant_id, role').eq('status', 'active'),
    db.from('restaurants').select('id, name, slug, plan_actual, status'),
  ]);

  const catalogo = catalogoDeLocales(restaurants);
  const buscarLocal = (id: string) => catalogo.get(id);

  const porUsuario = new Map<string, AccountLocal[]>();
  for (const m of members ?? []) {
    const restaurantId = m.restaurant_id as string;
    const local = catalogo.get(restaurantId);
    // Una membresía a un restaurante que ya no existe no debería poder
    // ocurrir (la FK borra en cascada), pero si ocurre no se inventa un
    // nombre: se ignora.
    if (!local) continue;
    const lista = porUsuario.get(m.user_id as string) ?? [];
    lista.push({ restaurantId, ...local, role: m.role as MemberRole, legacy: false });
    porUsuario.set(m.user_id as string, lista);
  }

  const ahora = Date.now();
  const rows = filas.map((f) => armarCuenta(f, porUsuario.get(f.id) ?? [], buscarLocal, ahora));

  return { rows, migracionPendiente: false };
});

/** El catálogo de restaurantes indexado por id, para resolver los locales. */
function catalogoDeLocales(
  restaurants: Record<string, unknown>[] | null,
): Map<string, LocalBasico> {
  return new Map(
    (restaurants ?? []).map((r) => [
      r.id as string,
      {
        name: (r.name as string) ?? '',
        slug: (r.slug as string) ?? '',
        plan: (r.plan_actual as string | null) ?? null,
        status: (r.status as string | null) ?? null,
      },
    ]),
  );
}

export type AccountDetail =
  | { estado: 'ok'; cuenta: AccountRow }
  | { estado: 'no-existe' }
  | { estado: 'migracion-pendiente' };

/**
 * UNA cuenta, para su ficha.
 *
 * Es la misma forma que la lista pero pidiendo solo lo suyo: sus membresías
 * y los restaurantes que aparecen en ellas, no la plataforma entera. La
 * ficha se abre para rescatar a una persona concreta y puede recargarse
 * varias veces seguidas mientras se le repone el acceso.
 */
export const getAccountById = cache(async (id: string): Promise<AccountDetail> => {
  const db = createServiceClient();

  const { data: fila, error } = await db
    .from('admin_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (faltaLaTabla(error)) return { estado: 'migracion-pendiente' };
    throw new Error(error.message);
  }
  if (!fila) return { estado: 'no-existe' };

  const cruda = fila as CuentaCruda;

  const { data: members } = await db
    .from('restaurant_members')
    .select('restaurant_id, role')
    .eq('user_id', id)
    .eq('status', 'active');

  // Los suyos y, si lo tiene, el del camino viejo: `armarCuenta` necesita
  // poder resolver los dos.
  const ids = new Set<string>((members ?? []).map((m) => m.restaurant_id as string));
  if (cruda.restaurant_id) ids.add(cruda.restaurant_id);

  const { data: restaurants } = ids.size
    ? await db.from('restaurants').select('id, name, slug, plan_actual, status').in('id', [...ids])
    : { data: [] as Record<string, unknown>[] };

  const catalogo = catalogoDeLocales(restaurants as Record<string, unknown>[] | null);

  const membresias: AccountLocal[] = [];
  for (const m of members ?? []) {
    const restaurantId = m.restaurant_id as string;
    const local = catalogo.get(restaurantId);
    if (!local) continue;
    membresias.push({ restaurantId, ...local, role: m.role as MemberRole, legacy: false });
  }

  return { estado: 'ok', cuenta: armarCuenta(cruda, membresias, (rid) => catalogo.get(rid)) };
});

/**
 * De quién es este correo, o `null` si de nadie.
 *
 * Se pregunta ANTES de intentar el cambio porque el error que devuelve
 * Auth cuando el correo ya existe no se puede leer: llega como
 * «Error updating user», sin más (comprobado — por dentro es un 23505 de
 * Postgres, pero eso no sube hasta el cliente). Sin esta consulta, a quien
 * está al teléfono se le enseña esa frase y no aprende nada.
 *
 * Solo ve cuentas con perfil, que son las de esta pantalla. Un comensal
 * con ese mismo correo no sale aquí y el cambio fallará igual — de ahí que
 * la acción TAMBIÉN mire el error, y no solo esto.
 */
export async function findAccountIdByEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from('admin_accounts')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Un local que se quedaría sin nadie. */
export type LocalHuerfanable = { restaurantId: string; name: string };

/**
 * ¿Qué restaurantes se quedarían SIN NINGUNA persona dueña si esta cuenta
 * desapareciera?
 *
 * Se pregunta en dos sitios y por eso vive aquí: la ficha lo enseña antes de
 * ofrecer el botón de borrar, y la acción lo vuelve a comprobar antes de
 * borrar de verdad. Enseñarlo sin comprobarlo sería un aviso decorativo.
 *
 * Es la misma regla que impide quitar al último dueño desde la pestaña
 * Accesos (fase 4). Borrar la cuenta es el otro camino al mismo sitio, y si
 * no se cerrara, la regla no serviría de nada.
 */
export async function localesQueSeQuedanSinDueño(userId: string): Promise<LocalHuerfanable[]> {
  const db = createServiceClient();

  const { data: suyos } = await db
    .from('restaurant_members')
    .select('restaurant_id')
    .eq('user_id', userId)
    .eq('role', 'OWNER')
    .eq('status', 'active');

  const ids = (suyos ?? []).map((m) => m.restaurant_id as string);
  if (!ids.length) return [];

  // Todos los dueños de esos locales, en UNA consulta.
  const { data: dueños } = await db
    .from('restaurant_members')
    .select('restaurant_id, user_id')
    .in('restaurant_id', ids)
    .eq('role', 'OWNER')
    .eq('status', 'active');

  const porLocal = new Map<string, string[]>();
  for (const d of dueños ?? []) {
    const rid = d.restaurant_id as string;
    porLocal.set(rid, [...(porLocal.get(rid) ?? []), d.user_id as string]);
  }

  const solos = ids.filter((rid) => dejariaSinDueño(porLocal.get(rid) ?? [], userId));
  if (!solos.length) return [];

  const { data: restaurantes } = await db.from('restaurants').select('id, name').in('id', solos);
  return (restaurantes ?? []).map((r) => ({
    restaurantId: r.id as string,
    name: (r.name as string) ?? '',
  }));
}
