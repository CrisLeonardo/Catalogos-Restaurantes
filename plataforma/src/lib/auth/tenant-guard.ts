/* ============================================================
   CANDADO DE TENANT — quién puede abrir el panel de qué restaurante
   ------------------------------------------------------------
   La sesión del PERSONAL se comparte en todo el dominio
   (`domain=.leogin.online`, ver supabase/server.ts): la cookie de
   quien entró en un restaurante viaja también al subdominio de
   cualquier otro. Eso es a propósito —el dueño de grupo, Leogin
   Desktop y el login central lo necesitan— pero significa que
   ESTAR AUTENTICADO NO DICE NADA sobre a qué panel se tiene
   derecho: eso lo decide esta función, en el servidor, en cada
   petición.

   Vive aparte y sin dependencias (ni Supabase, ni next/headers)
   por dos razones:
     · antes la regla estaba escrita tres veces, uno por grupo de
       rutas, y la de /admin/cocina simplemente no existía —el KDS
       abría en el subdominio de otro restaurante con el nombre de
       ese otro restaurante en pantalla (verificado en local
       2026-08-08). Una sola regla no puede desincronizarse;
     · siendo pura se puede probar de verdad: ver tenant-guard.test.ts.

   Quien la llama carga los datos (perfil, restaurante del
   subdominio) y aplica la decisión; aquí no se consulta nada.
   ============================================================ */

export type TenantDecision =
  /** Puede entrar. */
  | { allow: true }
  /** No puede: a dónde mandarlo (nunca al panel del restaurante ajeno). */
  | { allow: false; redirectTo: string };

export type TenantGuardInput = {
  role: string | null | undefined;
  /**
   * ¿Es miembro del restaurante de este subdominio? (migración 113.)
   *
   * Es la vía por la que entra quien tiene más de un restaurante: su perfil
   * solo puede apuntar a uno, así que `profileRestaurantId` no alcanza para
   * contestar "¿este también es tuyo?". Se calcula en el servidor contra
   * restaurant_members; quien llama responde por ella.
   */
  isMember?: boolean;
  /** Restaurante propio del perfil (null en Super Admin y dueño de grupo). */
  profileRestaurantId: string | null | undefined;
  /** Organización del perfil (solo dueño de grupo). */
  profileOrganizationId: string | null | undefined;
  /** Slug del subdominio actual (header x-tenant-slug del proxy). */
  tenantSlug: string | null | undefined;
  /**
   * Restaurante al que apunta ese slug, o null si no existe/no se pudo leer.
   * `organizationId` solo importa para el dueño de grupo.
   */
  tenant: { id: string; organizationId: string | null } | null;
  /** Slug del restaurante propio, para poder mandarlo a SU panel. */
  ownSlug: string | null | undefined;
  /** Cómo construir la URL absoluta del panel de un slug (adminUrl en la app). */
  adminUrlFor: (slug: string) => string;
};

/**
 * Único punto donde se decide si esta sesión puede abrir el panel de este
 * subdominio. Sin slug de tenant (dominio raíz, login central de Leogin
 * Desktop) no hay nada que proteger: la página que se abra decidirá.
 */
export function decideTenantAccess(input: TenantGuardInput): TenantDecision {
  const {
    role, isMember, profileRestaurantId, profileOrganizationId,
    tenantSlug, tenant, ownSlug, adminUrlFor,
  } = input;

  if (!tenantSlug) return { allow: true };

  // El subdominio no corresponde a ningún restaurante legible: si tiene un
  // restaurante propio, a SU panel; si no (dueño de grupo sin restaurante
  // personal, o una lectura que falló justo ahora), a Mi cuenta — nunca a la
  // portada de mercadeo. Ya está autenticado: mandarlo a la portada pública
  // se lee como si la sesión se hubiera perdido, cuando sigue viva.
  if (!tenant) return { allow: false, redirectTo: ownSlug ? `${adminUrlFor(ownSlug)}/menu` : '/mi-cuenta' };

  // Su propio restaurante: el caso normal, sin importar el rol.
  if (profileRestaurantId && profileRestaurantId === tenant.id) {
    return { allow: true };
  }

  // Otro de sus restaurantes (membresía, migración 113). Es la vía del que
  // tiene varios: su perfil solo puede apuntar a uno.
  if (isMember) return { allow: true };

  // El Super Admin entra a cualquier panel sin pedir nada extra: ya ve todo
  // desde /super, esto solo evita el salto de un subdominio a otro.
  if (role === 'SUPER_ADMIN') return { allow: true };

  // Quien administra un grupo: solo sucursales del SUYO. `tenant` NO prueba
  // pertenencia por sí solo: las políticas RLS se combinan con OR y
  // `restaurants_select_active` deja leer cualquier restaurante activo (lo
  // necesita el menú público). Desde la migración 116 esto se reconoce por la
  // organización del perfil, no por un rol.
  if (profileOrganizationId) {
    if (tenant.organizationId === profileOrganizationId) return { allow: true };
    return { allow: false, redirectTo: '/mi-cuenta' };
  }

  // Dueño/staff/mesero/cocina en el subdominio de OTRO restaurante: a SU panel.
  // Nunca al menú público del restaurante equivocado — eso se leía como "tu
  // cuenta no existe" cuando la cuenta estaba perfectamente bien.
  if (ownSlug) return { allow: false, redirectTo: `${adminUrlFor(ownSlug)}/menu` };
  return { allow: false, redirectTo: '/admin/login' };
}
