/* ============================================================
   IR A UNA SECCIÓN DE LA CARTA (fase 4 de «La carta que vende», F4-6)
   ------------------------------------------------------------
   La ficha de un platillo agotado ofrece «Ver más de Hamburguesas».
   La ficha no conoce la navegación de la estructura (píldoras,
   secciones, acordeón, portadas): avisa con un evento y el catálogo
   hace lo mismo que su riel de PC.
   ============================================================ */

export const EVENTO_IR_A_CATEGORIA = 'carta:ir-a-categoria';

export function irACategoria(id: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_IR_A_CATEGORIA, { detail: id }));
}
