/* ============================================================
   ENLACE LEGIBLE DE UN PLATILLO (fase 4 de «La carta que vende», F4-8)
   ------------------------------------------------------------
   El enlace de un platillo era `?platillo=<uuid>`: en el mensaje de
   WhatsApp se leía como ruido. Ahora es `?platillo=doble-bacon`,
   sacado del nombre. El enlace con el código sigue sirviendo (los
   que ya se compartieron no se rompen).

   Si dos platillos se llaman igual, el enlace usa el código: un
   nombre repetido nunca abre el platillo equivocado.
   ============================================================ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface Con { id: string; name: string }

/** «Doble Bacon (grande)» → «doble-bacon-grande». */
export function slugPlatillo(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** El valor de `?platillo=` si tiene forma de código o de nombre; si no, nada. */
export function valorPlatillo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (UUID.test(v)) return v.toLowerCase();
  return v.length <= 60 && SLUG.test(v) ? v : null;
}

/** Lo que va en `?platillo=` para compartir `p`: su nombre, o su código si el nombre se repite. */
export function claveEnlace(p: Con, todos: readonly Con[]): string {
  const s = slugPlatillo(p.name);
  if (!s) return p.id;
  const repetido = todos.some((o) => o.id !== p.id && slugPlatillo(o.name) === s);
  return repetido ? p.id : s;
}

/** El platillo al que apunta `?platillo=` (código o nombre). Nombre repetido → ninguno. */
export function resolverPlatillo<P extends Con>(valor: string | null, todos: readonly P[]): P | null {
  if (!valor) return null;
  if (UUID.test(valor)) return todos.find((p) => p.id === valor.toLowerCase()) ?? null;
  const iguales = todos.filter((p) => slugPlatillo(p.name) === valor);
  return iguales.length === 1 ? iguales[0] : null;
}
