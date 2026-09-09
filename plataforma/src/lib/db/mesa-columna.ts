/**
 * ¿Ya existe `orders.table_number`? (migración 127)
 * ------------------------------------------------------------
 * Las migraciones de este proyecto corren a mano y con retraso: entre que
 * el código sale y la migración se aplica hay una ventana en la que la
 * columna no existe, y pedirla tumba la consulta ENTERA — el salón se
 * quedaría sin ver ninguna mesa ocupada, que es mucho peor que seguir
 * leyendo el texto un rato más.
 *
 * Así que el código sabe funcionar de las dos formas y lo pregunta UNA vez
 * por proceso. Es el mismo problema que `party_size` resuelve reintentando
 * cuando falta la columna en `getActiveTableNumbers`; aquí no basta con
 * reintentar porque la columna no solo se LEE, también se FILTRA, y un
 * filtro por una columna que no existe no devuelve datos incompletos:
 * devuelve error.
 *
 * **Esto es temporal.** El día que la 127 esté en producción se borra este
 * archivo y `mesaDeFila` se queda solo con `row.table_number`.
 */
import { createServiceClient } from '@/lib/supabase/service';
import { faltaLaColumna } from '@/lib/db/migracion-ausente';

let cache: Promise<boolean> | null = null;

export function hayColumnaMesa(): Promise<boolean> {
  if (!cache) {
    cache = (async () => {
      try {
        const db = createServiceClient();
        const { error } = await db.from('orders').select('table_number').limit(1);
        // Cualquier otro fallo (red, permisos) NO significa que la columna
        // no exista: en ese caso se asume que sí y el error se manifiesta
        // donde de verdad esté.
        return !faltaLaColumna(error);
      } catch {
        return true;
      }
    })();
  }
  return cache;
}

/** Solo para las pruebas: olvida lo que se averiguó. */
export function _resetCacheColumnaMesa() {
  cache = null;
}

export { direccionDeMesa, mesaDeFila, etiquetaDeMesa } from '@/lib/mesa';
