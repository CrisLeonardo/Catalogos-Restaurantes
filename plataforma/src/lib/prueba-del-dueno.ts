/* Motivos por los que un dueño ya no lleva prueba (migración 205). Lo leen
   el servidor (lib/db/prueba-del-dueno) y las pantallas del alta y de
   Suscripción, que también corren en el navegador. */

export type MotivoSinPrueba = 'en_curso' | 'usada' | null;

export const TEXTO_SIN_PRUEBA: Record<Exclude<MotivoSinPrueba, null>, string> = {
  en_curso: 'Ya tienes una prueba en curso en otro restaurante.',
  usada: 'Ya usaste tu prueba gratis en otro restaurante.',
};
