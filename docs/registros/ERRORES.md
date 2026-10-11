# REGISTRO DE ERRORES Y LECCIONES

> Cada error que cometamos se documenta aquí con su causa y solución, para **no repetirlo**.
> Se actualiza **automáticamente** cuando se detecta y resuelve un problema.
> Acompaña a `PLAN_MAESTRO.md` y `IMPLEMENTACIONES.md`.

**Cómo leer este archivo:** antes de tocar un área, revisa si ya hay una lección registrada sobre ella.

---

## Anti-patrones conocidos (prevención — heredados de la documentación de referencia y del stack)

Estos NO son errores ya cometidos en este proyecto, sino trampas conocidas que vamos a **evitar desde el inicio**.

### Seguridad / Multi-tenant

- **RLS desactivada o incompleta = fuga de datos entre restaurantes.** Activar Row Level Security en **todas** las tablas con `restaurant_id` desde su creación. Nunca confiar solo en el filtrado del frontend.
- **No confiar en el `restaurant_id` que manda el cliente.** Debe venir del JWT (usuarios autenticados) o resolverse en el servidor desde el subdominio (cliente público). Si el cliente lo puede falsificar, la política RLS no sirve.
- **Escapar SIEMPRE el HTML antes de inyectar en el DOM** (`innerHTML`). Nombres de platillos/restaurantes pueden contener `<script>`. En React usar JSX (escapa solo); evitar `dangerouslySetInnerHTML`.
- **Nunca subir `.env` ni claves a Git.** Usar `.env.local` (ignorado) + variables de entorno en Render. La `service_role` key de Supabase **solo** en el servidor, jamás en el cliente.

### Supabase

- **`statement_cache_size=0` obligatorio** si se conecta por el pooler en modo transaction (pgbouncer). Olvidarlo causa errores intermitentes de "prepared statement already exists".
- **No exponer la `service_role` key en el navegador.** En el cliente solo va la `anon` key, protegida por RLS. La `service_role` ignora RLS y es solo para el servidor (API routes / Super Admin).
- **Realtime requiere habilitar la replicación** de la tabla (`orders`) en Supabase. Si la alerta de pedidos no llega, revisar que la tabla esté en la publicación de Realtime.
- **Storage: configurar políticas de acceso.** Buckets públicos para imágenes de menú; privados con políticas para uploads del admin.
- **Para sembrar/generar pedidos (seeds de demo, scripts de prueba), usar siempre el RPC `place_order`, nunca INSERT directo en `orders`/`order_items`.** *Por qué:* `place_order` encapsula numeración atómica (`order_counters`), snapshots de precio/costo, descuento de stock cuando `track_stock=true` y sus `stock_movements`, y es el único camino que usa la app de verdad (`src/lib/actions/orders.ts`). Reconstruir eso a mano arriesga columnas o efectos que se agregaron en migraciones posteriores y romper triggers sin darse cuenta. *Cómo aplicarlo:* llamar `select place_order(p_restaurant_id => ..., ...) into v_placed` (devuelve `jsonb`, no un row), y si se necesita "envejecer" el pedido para que parezca histórico, hacer un `UPDATE orders SET created_at=..., status=...` **después** de la RPC, no en vez de ella. Confirmado end-to-end el 2026-08-07 al construir `seed_demo_rincon502.sql`.
- **Antes de escribir SQL directo contra una tabla que lleva varias migraciones, rastrear TODOS los `alter table` posteriores, no solo el `create table` original.** *Por qué:* el esquema real casi nunca es el de la migración fundacional — columnas se agregan/renombran en migraciones muy posteriores y numeradas lejos de la tabla (ej. `loyalty_settings.earn_amount` se agregó en la migración 060, no en la 041 que crea la tabla). *Cómo aplicarlo:* `grep -rn "alter table <tabla>" supabase/migrations/` antes de dar por buena una lista de columnas, y preferir RPCs de la app (ver punto anterior) siempre que exista uno, en vez de reconstruir el INSERT a mano.

### Next.js / Render

- **El middleware corre en Edge runtime:** no usar APIs de Node ni librerías pesadas ahí. Solo extraer subdominio y resolver tenant de forma ligera.
- **Precios congelados en `order_items`.** Guardar `price_snapshot` al crear el pedido. Recalcular desde `products` después es un error (el precio pudo cambiar).
- **Render está en Starter (no se duerme).** Un timeout en producción es un error real: investigarlo, no atribuirlo al arranque en frío.
- **Fijar versión de Node** (`.node-version` o `engines` en package.json) para builds consistentes en Render.
- **No usar `localStorage` para el token de sesión sensible** sin necesidad; preferir las cookies httpOnly que maneja Supabase Auth con `@supabase/ssr`.

### Diseño / UX

- **Animaciones de entrada solo con `transform`, nunca con `opacity:0` como estado de reposo.** Si la línea de tiempo se congela (captura, tab oculto), el contenido con `opacity:0` desaparece. (Lección directa del prototipo.)
- **Versionar el caché del Service Worker / PWA.** Si no se invalida, los usuarios ven código viejo aunque el servidor ya tenga el nuevo.

---

## Errores cometidos en el proyecto

### [2026-06-08] El shell ve una versión truncada/desfasada de archivos del mount

**Contexto:** tras escribir `package.json` con las herramientas de archivo, quise compilar copiando el proyecto al sandbox con `cp` y corriendo `npm install`.
**Síntoma:** `npm`/`python` reportaban `package.json` truncado (532 bytes, JSON inválido) aunque la herramienta `Read` mostraba el archivo completo y válido (33 líneas).
**Causa raíz:** las herramientas de archivo (Read/Write/Edit) y el shell (`bash`) operan sobre vistas distintas del mismo archivo; el mount del shell puede quedar desfasado o sincronizar parcialmente lo que escriben las herramientas de archivo.
**Solución:** confiar en las herramientas de archivo como **autoritativas** para la carpeta del usuario. La compilación/ejecución real se hace en la máquina del usuario (`npm install && npm run dev`), no asumiendo que `cp` desde el mount refleja el último contenido.
**Prevención:** no verificar builds copiando archivos escritos con Write/Edit desde el mount del shell. Para validar JSON/contenido usar la herramienta `Read`. Si se necesita compilar en el sandbox, generar los archivos directamente con `bash` (no con las herramientas de archivo) o validar en la máquina destino.

<!-- PLANTILLA (copiar y rellenar cuando ocurra un error)

### [AAAA-MM-DD] Título corto del error

**Contexto:** qué se intentaba hacer.
**Síntoma:** qué falló / mensaje de error.
**Causa raíz:** por qué pasó.
**Solución:** cómo se resolvió.
**Prevención:** regla para no repetirlo.

-->
