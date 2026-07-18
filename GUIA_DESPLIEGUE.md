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
| **Region** | Oregon (US West) — o la más cercana |
| **Branch** | `main` |
| **Root Directory** | **`plataforma`** ← ¡clave! la app está en esa subcarpeta |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Instance Type** | **Free** |

> La versión de Node la toma sola del archivo `plataforma/.node-version` (Node 22).
> Render asigna el puerto por la variable `PORT`; `next start` la respeta automáticamente.

## 3.2 Variables de entorno

Antes de crear, baja a **Environment Variables** y agrega estas 4:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://TU-PROYECTO.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | tu service_role/secret key |
| `NEXT_PUBLIC_ROOT_DOMAIN` | de momento `menuvivo.onrender.com` (luego tu dominio) |

3. **Create Web Service**. Render compila (2-5 min). Cuando termine, abre la URL `https://menuvivo.onrender.com`.

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
