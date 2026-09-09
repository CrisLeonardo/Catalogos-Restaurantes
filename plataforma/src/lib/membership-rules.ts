/* ============================================================
   LA REGLA DEL ÚLTIMO DUEÑO (fase 4)
   ------------------------------------------------------------
   Aparte de la acción porque es la única regla de esta fase que puede
   equivocarse en silencio: si falla del lado permisivo, un restaurante
   se queda sin ninguna persona dueña y NADIE se entera. El local sigue
   abierto, sigue tomando pedidos y sigue facturando; simplemente ya no
   hay quien entre a su panel a cambiar un precio o a cobrar. Se
   descubre semanas después, cuando alguien lo necesita.

   Se pregunta en los DOS caminos que llevan al mismo sitio: quitarle
   el acceso al único dueño, y bajarle el papel. Preguntarlo solo en el
   primero deja la puerta de atrás abierta.
   ============================================================ */

/**
 * ¿Este restaurante se quedaría sin ninguna persona dueña si `userId`
 * dejara de serlo?
 *
 * @param dueñosActuales ids con membresía OWNER viva en ese restaurante.
 */
export function dejariaSinDueño(dueñosActuales: string[], userId: string): boolean {
  // Sin ningún dueño ya, esta acción no es la que lo deja así — y bloquearla
  // haría imposible arreglar un local que ya está roto: para nombrar a uno
  // nuevo hay que poder tocar el que hay.
  if (dueñosActuales.length === 0) return false;
  return dueñosActuales.every((id) => id === userId);
}
