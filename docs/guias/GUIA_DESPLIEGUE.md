# Guía de DESPLIEGUE — Leogin a producción

> De tu PC al internet, paso a paso. Supabase (nube) + Render + dominio.
> Escrita el 2026-06-08. Acompaña a `GUIA_ENTORNO_LOCAL.md`.
> Todo con **planes gratuitos**.

---

## Mapa del despliegue

```
  Tu código (GitHub)
        │  Render hace "pull" y compila
        ▼
  ┌─────────────────────────┐        ┌──────────────────────────┐
  │  Render (la app)        │ ─────▶ │  Supabase (la nube)      │
  │  menuvivo.onrender.com  │  datos │  base de datos real      │
  └─────────────────────────┘        └──────────────────────────┘
        ▲
        │  DNS wildcard *.tudominio.com
  Cloudflare (cuando tengas dominio)
```

Orden recomendado: **1) Supabase → 2) GitHub → 3) Render → 4) Dominio.**

---

# PARTE 1 — Supabase en la nube

Ya tienes un proyecto creado. Vamos a prepararlo.

## 1.1 Obtener las claves

En el dashboard de tu proyecto (https://supabase.com/dashboard):

1. Engrane **Project Settings** → **API**.
2. Copia y guarda estas tres cosas (las usarás en Render):

| Dato | Dónde está | Para qué |
|------|-----------|----------|
| **Project URL** | `https://xxxxx.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon / publishable key** | sección "Project API keys" | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role / secret key** | misma sección (¡secreta!) | `SUPABASE_SERVICE_ROLE_KEY` |

> Supabase muestra dos estilos de llaves: las **nuevas** (`sb_publishable_...` / `sb_secret_...`) y las **legacy JWT** (`eyJ...`). **Cualquiera de las dos funciona** con esta app. Usa las que te aparezcan.
>
> ⚠️ La **service_role / secret** ignora toda la seguridad: jamás la pongas en el navegador, en el código, ni en Git. Solo va en variables de entorno del servidor (Render).

## 1.2 Crear las tablas (correr el SQL)

1. En el dashboard: menú lateral **SQL Editor** → **New query**.
2. Abre el archivo **`plataforma/supabase/setup_produccion.sql`** de este proyecto, copia **todo** su contenido y pégalo.
3. Pulsa **Run**. Debe decir "Success". Esto crea las 7 tablas, la seguridad RLS y el bucket de imágenes.

> Alternativa (avanzada, con el CLI): `npx supabase link --project-ref TU_REF` y luego `npx supabase db push`. Para empezar, el copy-paste del SQL es lo más simple y seguro.

> **Nota:** `setup_produccion.sql` NO incluye el restaurante demo "Café Demo" — tu producción arranca limpia. (El demo solo existe en local.)

## 1.3 Verificar el Storage (fotos)

El SQL ya crea el bucket `restaurant-assets` (público para leer, restringido para subir).
Compruébalo en **Storage** → debe aparecer `restaurant-assets`. Si no, vuelve a correr el SQL.

## 1.4 Activar Realtime para pedidos (Plan Premium)

Solo necesario si venderás el módulo de **Pedidos**. Para que el panel del restaurante escuche pedidos nuevos en vivo:

1. Dashboard → **Database** → **Replication** (o **Publications** → `supabase_realtime`).
2. Activa la tabla **`orders`**.

Si no lo haces, todo funciona menos la alerta automática de pedidos nuevos.

## 1.5 Crear tu Super Admin en la nube

Este es **tu** acceso de dueño de la plataforma. Desde tu PC, apuntando a la nube:

```powershell
cd "C:\Users\minec\Documents\Catalogos Restaurantes\plataforma"

# Pasa las claves de la NUBE por variable de entorno (no las de local):
$env:NEXT_PUBLIC_SUPABASE_URL = "https://TU-PROYECTO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "TU_SERVICE_ROLE_KEY"
node scripts/crear-super-admin.mjs tucorreo@real.com UnaContraseñaFuerte123
```

> El script usa primero las variables del sistema; si no, lee `.env.local`. Al pasarlas arriba, escribe en la **nube**, no en local.

Alternativa manual (sin script): Dashboard → **Authentication** → **Add user** (con "Auto Confirm"). Luego **SQL Editor**:
```sql
insert into profiles (id, restaurant_id, role, full_name)
values ('<UID_del_usuario>', null, 'SUPER_ADMIN', 'Super Admin');
```
(el UID lo ves en Authentication → Users).

---

# PARTE 2 — Subir el código a GitHub

Render despliega desde un repositorio de GitHub.

> ⚠️ Importante: tu repo (`Catalogos Restaurantes`) contiene la app en la **subcarpeta `plataforma/`** más carpetas de prototipo. Eso está bien; en Render le diremos que la app está en `plataforma`.

Si aún no tienes el repo en GitHub:

1. Crea un repo vacío en https://github.com/new (ej. `menuvivo`), **privado**.
2. Desde la carpeta del proyecto:

```powershell
cd "C:\Users\minec\Documents\Catalogos Restaurantes"
git add .
git commit -m "Plataforma lista para desplegar"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/menuvivo.git
git push -u origin main
```

> El `.gitignore` ya evita subir `.env.local`, `node_modules` y `.next`. Tus secretos NO se suben. ✅

---

# PARTE 3 — Render (la app)

## 3.1 Crear el Web Service

1. Entra a https://dashboard.render.com → **New +** → **Web Service**.
2. Conecta tu cuenta de GitHub y elige el repo `menuvivo`.
3. Configura así:

| Campo | Valor |
|-------|-------|
| **Name** | `menuvivo` (será `menuvivo.onrender.com`) |
| **Region** | Virginia (US East) — la misma que Supabase; con Oregón cada consulta cruza el país |
| **Branch** | `main` |
| **Root Directory** | **`plataforma`** ← ¡clave! la app está en esa subcarpeta |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Instance Type** | **Free** |

> La versión de Node la toma sola del archivo `plataforma/.node-version` (Node 22).

> **Auto-deploy:** está activo (Settings → Build & Deploy → Auto-Deploy), así que cada fusión a `main` se despliega sola. En octubre de 2026 un deploy no se detectó y hubo que usar **Manual Deploy**. Si vuelve a pasar: comprueba en GitHub (Settings → Webhooks) que el webhook de Render sigue entregando, que Auto-Deploy no esté en «After CI checks pass» con el CI aún corriendo, y deja constancia con la etiqueta `prod-AAAA-MM-DD` del commit que quedó en producción.
> Render asigna el puerto por la variable `PORT`; `next start` la respeta automáticamente.

## 3.2 Variables de entorno

Antes de crear, baja a **Environment Variables** y agrega estas 4:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | tu service_role/secret key |
| `NEXT_PUBLIC_ROOT_DOMAIN` | de momento `menuvivo.onrender.com` (luego tu dominio) |

Estas 4 bastan para que la app arranque. Los módulos que hablan con terceros piden las suyas, y **si faltan, el módulo simplemente no opera — nada más se rompe**:

| Key | Para qué | Si falta |
|-----|----------|----------|
| `LEOGIN_SECRET_KEY` | Cifra en la base los secretos que Leogin guarda por cuenta del restaurante (token de WhatsApp, credenciales del certificador FEL). 32 bytes: `openssl rand -base64 32` | No se pueden guardar esos secretos. La facturación en modo Manual sigue funcionando |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Canal de WhatsApp (F1A/F1B) | El canal no opera |
| `FEL_CRON_SECRET` | Autentica el disparador de la cola de facturas | El endpoint responde 401 siempre (cerrado por defecto, no abierto) |
| `QZ_PRIVATE_KEY_B64` | Firma para impresión silenciosa | Imprime igual, pero QZ pide permiso la 1ª vez por sesión |

> ⚠️ Si ya tenías `WHATSAPP_TOKEN_KEY` puesta, **copia ese mismo valor** en `LEOGIN_SECRET_KEY`. Es la misma clave con nombre nuevo; poner una distinta deja ilegibles los tokens de WhatsApp ya guardados y hay que reconectar cada número.

3. **Create Web Service**. Render compila (2-5 min). Cuando termine, abre la URL `https://menuvivo.onrender.com`.

## 3.2b Cron de la cola de facturas (solo si usas FEL con certificador)

Si un restaurante factura con INFILE, las facturas que no certificaron al primer intento quedan en cola y hay que drenarla. En Render: **New → Cron Job**, cada 5 minutos (`*/5 * * * *`):

```bash
curl -fsS -X POST https://tudominio.com/api/fel/cola -H "Authorization: Bearer $FEL_CRON_SECRET"
```

Sin esto las facturas pendientes no se reintentan solas; el dueño puede reintentarlas a mano desde Facturación, pero no es un sustituto.

## 3.3 Primera prueba en producción

- `https://menuvivo.onrender.com` → debe mostrar la **portada demo** (aún no hay restaurantes reales). Eso confirma que la app vive.
- `https://menuvivo.onrender.com/login` → entra con tu Super Admin de la nube (Parte 1.5) → deberías ver `/super/restaurantes` vacío.

> Mientras `NEXT_PUBLIC_ROOT_DOMAIN` sea `menuvivo.onrender.com`, los subdominios de restaurantes **todavía no funcionan** (onrender.com no te da wildcard). Para eso necesitas tu propio dominio → Parte 4. Puedes ir creando restaurantes desde `/super` mientras tanto.

---

# PARTE 4 — Tu dominio + subdominios (Cloudflare)

Esto es lo que hace que cada restaurante tenga su `surestaurante.tudominio.com`. Necesitas haber **comprado un dominio** (ej. en Namecheap, GoDaddy, Cloudflare, ~$10/año).

## 4.1 Apuntar el dominio a Render

En Render: tu servicio → **Settings** → **Custom Domains** → agrega:
- `tudominio.com`
- `www.tudominio.com`
- `*.tudominio.com`  ← el **wildcard**, esto da los subdominios de restaurantes

Render te dirá qué registros DNS crear.

## 4.2 DNS en Cloudflare

Si tu dominio está en Cloudflare (recomendado, su wildcard es gratis):

1. Cloudflare → tu dominio → **DNS** → **Add record**:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `@` (o `tudominio.com`) | `menuvivo.onrender.com` | Activado (naranja) |
| CNAME | `www` | `menuvivo.onrender.com` | Activado |
| CNAME | `*` | `menuvivo.onrender.com` | Activado |

2. Espera unos minutos. Render emite el certificado SSL (candado) automáticamente, incluido el wildcard.

## 4.3 Actualizar la variable de dominio

En Render → Environment → cambia:

```
NEXT_PUBLIC_ROOT_DOMAIN = tudominio.com
```

Guarda (Render redepliega solo). Ahora:
- `tudominio.com` → portada de la plataforma
- `mi-restaurante.tudominio.com` → menú de ese restaurante
- `mi-restaurante.tudominio.com/login` → acceso del dueño

---

# PARTE 5 — Poner en marcha tu primer restaurante real

Ya en producción, todo se hace desde tu panel (sin tocar código ni base de datos):

1. Entra a `tudominio.com/login` como **Super Admin**.
2. **/super/restaurantes** → **+ Nuevo** → nombre y slug (ej. `tacos-pepe`).
3. En el editor del restaurante:
   - **Plan y módulos:** Catálogo (gratis) o Premium (con pedidos).
   - **Apariencia:** colores, logo, estilo.
   - **Acceso del restaurante:** "Crear un acceso nuevo" → email + contraseña del dueño. **Copia la contraseña** y entrégasela.
4. El dueño entra en `tacos-pepe.tudominio.com/login` y gestiona su menú.
5. Sus clientes escanean el QR (panel del dueño → **QR**) que apunta a `tacos-pepe.tudominio.com`.

---

# PARTE 6 — Notas del plan gratuito

| Tema | Qué pasa | Mitigación |
|------|----------|-----------|
| **Render Free "duerme"** tras 15 min sin tráfico | La 1ª visita tarda ~30-50s en despertar | Gratis: ping con **UptimeRobot** cada 5 min a tu URL. Cuando haya clientes, sube a **Starter ($7/mes)** |
| **Supabase Free** | 500 MB BD, 1 GB Storage | Suficiente para varios restaurantes; subes de plan cuando crezca |
| **Cloudflare Free** | DNS wildcard incluido | No necesitas pagar |

---

# PARTE 7 — Actualizar la app después (flujo normal)

Cada vez que cambies código:

```powershell
cd "C:\Users\minec\Documents\Catalogos Restaurantes"
git add .
git commit -m "describe el cambio"
git push
```

Render detecta el push y **redepliega solo**. 

Si el cambio incluye **cambios en la base de datos** (nuevas tablas/columnas):
1. Crea la migración en `plataforma/supabase/migrations/` (siguiente número).
2. Pruébala en local con `npx supabase db reset`.
3. En producción, pega ese SQL nuevo en el **SQL Editor** de Supabase (o `supabase db push` si linkeaste el proyecto).

---

# PARTE 7b — Migración 122: motivo de la llamada al mesero

Es la **única** migración del rediseño de "Tomar pedidos y mesas"
(2026-08-26) y está **pendiente en producción**.

**Qué hace:** añade `waiter_calls.reason` para distinguir *"necesito algo"*
de *"quiero pagar"*. Es lo que permite que el salón avise **"Mesa 6 pidió la
cuenta"** en vez de un genérico "te llaman" — el aviso más útil de la
pantalla, porque cobrar es lo que libera la mesa.

**Sin ella no se rompe nada.** El código detecta que la columna no existe y
reintenta sin ella, tanto al escribir como al leer: el botón del comensal
sigue funcionando y todas las llamadas cuentan como genéricas. Solo se pierde
el detalle.

**Cómo aplicarla** — pega el contenido de
`plataforma/supabase/migrations/122_waiter_call_reason.sql` en el **SQL Editor**
de Supabase. Es idempotente (`add column if not exists` + la restricción
envuelta en un bloque que ignora el duplicado): si la ejecutas dos veces no
pasa nada.

**Cómo comprobar que quedó:**

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'waiter_calls' and column_name = 'reason';
```

Un renglón con `text` y `'call'::text` = lista. Cero renglones = no corrió.

Después, en el menú público, el botón flotante ofrece las dos opciones
("Necesito algo" / "La cuenta, por favor") y el salón las pinta distinto.

---

# PARTE 7c — Migraciones 123 a 127: el salón, la caja y la anulación

Son las que quedaron **pendientes en producción** después del rediseño de
Mesas / Tomar pedidos / Caja (123) y de la auditoría del salón (124-127).
Van **en orden**: la 126 y la 127 instalan disparadores que dependen de lo
que dejan las anteriores.

Todas son **idempotentes** (probado: ejecutarlas dos veces seguidas no
cambia nada ni da error). Si una falla a la mitad, se puede volver a pegar
entera.

| # | Archivo | Qué hace | Si NO se aplica |
|---|---------|----------|-----------------|
| 123 | `123_salon_caja_rediseno.sql` | `orders.party_size`, `order_items.seat_no`, `cash_expenses`, columnas de `cash_counts` | El salón no sabe cuánta gente hay, el reparto por asiento no se guarda y el cierre de caja pierde gastos y propinas |
| 124 | `124_anular_recalcula_propina.sql` | `void_order_item` recalcula la propina en proporción | Se sigue cobrando la propina de un plato anulado |
| 125 | `125_reparto_de_mesa_compartido.sql` | Tabla `table_splits` | El reparto de la cuenta vive solo en el navegador que lo hizo |
| 126 | `126_anulacion_firma_siempre.sql` | Exige `approved_by` al anular fuera de `NEW`; `void_order` audita antes de cancelar | La app sigue pidiendo el PIN, pero la base no lo obliga |
| 127 | `127_mesa_por_numero.sql` | `orders.table_number` + relleno hacia atrás + disparador | Todo sigue funcionando leyendo `address` (hay red de respaldo), pero no se pueden usar mesas con nombre |

**Cómo aplicarlas:** una por una, pegando el archivo entero en el
**SQL Editor** de Supabase, en orden 123 → 124 → 125 → 126 → 127.

### Comprobar que quedaron

```sql
-- 123 y 127: las columnas nuevas
select table_name, column_name
  from information_schema.columns
 where (table_name = 'orders'      and column_name in ('party_size','table_number'))
    or (table_name = 'order_items' and column_name = 'seat_no')
 order by 1, 2;
-- se esperan 3 filas

-- 125: la tabla del reparto
select to_regclass('public.table_splits') as table_splits;   -- no debe ser null

-- 126 y 127: los dos disparadores
select tgname from pg_trigger
 where tgname in ('order_voids_exige_firma_trg', 'orders_set_table_number_trg');
-- se esperan 2 filas

-- 127: cuántos pedidos de mesa quedaron con número
select count(*) filter (where table_number is not null) as con_numero,
       count(*)                                          as total_dine_in
  from orders where order_type = 'DINE_IN';
-- los que queden sin número son los que no tienen dirección: es correcto
```

### Después de la 124, una comprobación con dinero

La propina tiene que seguir cuadrando con el subtotal. En cualquier pedido
con propina:

```sql
select id, subtotal, tip, total, round(subtotal + tip, 2) as suma
  from orders where tip > 0 order by created_at desc limit 5;
-- `total` y `suma` deben coincidir en las cinco filas
```

### Si hay que echar atrás

Ninguna borra datos, así que revertir es quitar lo que añaden:

```sql
-- 126: deja de exigir la firma (las filas ya firmadas se quedan)
drop trigger if exists order_voids_exige_firma_trg on order_voids;

-- 127: deja de mantener la columna (la app vuelve sola a leer `address`)
drop trigger if exists orders_set_table_number_trg on orders;
-- y si además hay que quitar la columna:
-- alter table orders drop column if exists table_number;
```

La 124 y la 125 no tienen vuelta atrás útil: la 124 solo corrige una cuenta
mal hecha, y borrar `table_splits` tiraría repartos en curso.

### Orden respecto al despliegue del código

El código sabe funcionar **sin** la 127 (`lib/db/mesa-columna.ts` lo detecta
y vuelve a leer `address`), así que da igual si va antes o después. La 126
sí conviene aplicarla **con o después** del código: si va antes, un panel
viejo intentaría anular sin firma y le saldría un error de base en vez del
mensaje amable.

---

# PARTE 8 — Poner la nube al día (módulos, recetas, llamada al mesero)

El esquema fue creciendo. Si tu Supabase de producción está **atrasado**, aplica
los paquetes consolidados **en orden**, en el **SQL Editor**:

1. Si estás en la 024 → ejecuta `plataforma/supabase/actualizacion_025_a_036.sql`.
2. Luego ejecuta `plataforma/supabase/actualizacion_037_a_048.sql`
   (recetas/ingredientes, framework de **módulos** + columna `module_settings`,
   FEL, proveedores, lealtad, reservaciones, encuestas, cupones y
   **llamada al mesero**).

Cada paquete se ejecuta **una sola vez**. Si re-ejecutas y ves
`policy already exists`, esa parte ya estaba aplicada — puedes ignorarlo.

### Realtime (imprescindible para pedidos y llamada al mesero)
En **Database → Replication → `supabase_realtime`**, confirma que estén
publicadas las tablas:
- `orders` (avisos de pedido nuevo)
- `waiter_calls` (botón "Llamar al mesero")

La migración 048 intenta agregar `waiter_calls` por SQL; si no quedó, actívala
ahí manualmente. **Sin Realtime, las alertas no llegan al panel.**

### Activar los módulos por restaurante
Los módulos NO se encienden solos: desde el **Super Admin → restaurante → Plan**
concede el entitlement, y el dueño los prende en **/admin/modulos**. Un módulo
solo funciona si su migración ya está aplicada en la nube.

---

# Checklist final

- [ ] Supabase: claves copiadas
- [ ] Supabase: `setup_produccion.sql` ejecutado (7 tablas creadas)
- [ ] Supabase: `actualizacion_025_a_036.sql` y `actualizacion_037_a_048.sql` ejecutados (en orden)
- [ ] Supabase: bucket `restaurant-assets` existe
- [ ] Supabase: Realtime en `orders` (solo si venderás Premium)
- [ ] Supabase: Realtime en `waiter_calls` (módulo Llamar al mesero)
- [ ] Supabase: Super Admin creado
- [ ] GitHub: código subido (sin `.env.local`)
- [ ] Render: Web Service con Root Directory = `plataforma`
- [ ] Render: 4 variables de entorno puestas
- [ ] Render: la URL `.onrender.com` abre la demo
- [ ] Render: login del Super Admin funciona
- [ ] (con dominio) Cloudflare: CNAME `@`, `www`, `*` → onrender
- [ ] (con dominio) Render: custom domains + wildcard con SSL
- [ ] (con dominio) `NEXT_PUBLIC_ROOT_DOMAIN` = tudominio.com
- [ ] Primer restaurante real creado y probado
- [ ] Supabase: migraciones 123 → 124 → 125 → 126 → 127 aplicadas **en orden** (PARTE 7c)
