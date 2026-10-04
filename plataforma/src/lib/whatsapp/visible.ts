import { isTokenKeyConfigured } from '@/lib/whatsapp/crypto';

/* ============================================================
   ¿QUIÉN VE LA PANTALLA DE WHATSAPP? (auditoría 2026-10-02, D-6)
   ------------------------------------------------------------
   Conectar el número exige el «Phone number ID» y un token de la API de
   Meta: pasos de desarrollador, no de restaurantero. Hasta que exista el
   alta guiada, la pantalla no se le enseña al dueño (ni en el menú, ni en
   Ajustes, ni por la dirección): la ve el Super Admin, que puede conectar
   el número por el restaurante desde su panel. Los avisos a los clientes
   salen igual en cuanto la conexión está activa.

   Cuando haya alta guiada para el dueño, basta con poner esto en `true`.
   ============================================================ */
export const WHATSAPP_PARA_DUENOS = false;

export function whatsappVisiblePara(role: string): boolean {
  return isTokenKeyConfigured() && (WHATSAPP_PARA_DUENOS || role === 'SUPER_ADMIN');
}
