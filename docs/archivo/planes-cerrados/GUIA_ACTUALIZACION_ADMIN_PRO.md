# Guía de actualización — Admin Pro + Panel de Grupo

> Cómo subir a producción lo nuevo (Fases A–E). Pensada para hacerse paso a paso
> sin saber de DevOps. Si algo no calza, dímelo y lo ajustamos.

## ¿Qué estás subiendo?
- **Admin Pro** en el panel de cada restaurante: Finanzas (costos, margen, reportes, corte de caja), Analítica (horas pico, cancelación, tiempos), Inventario (stock + anti-sobreventa), Promociones (cupones) y Personal (staff con permisos + bitácora).
- **Panel de Grupo**: un jefe con varias sucursales entra a `slug-central.tudominio.com` y ve todo consolidado. Se administra desde tu Super Admin (`/super/grupos`).

**No hay variables de entorno nuevas ni cambios de DNS.** Solo: (1) actualizar la base de datos y (2) desplegar el código.

---

## Paso 1 — Actualizar la base de datos (Supabase nube)

Esto agrega columnas y tablas nuevas. **No borra nada** y es seguro re-ejecutarlo (idempotente).

1. Entra a tu proyecto en **supabase.com** → menú izquierdo **SQL Editor** → **New query**.
2. Abre el archivo **`plataforma/supabase/actualizacion_019_a_024.sql`** de tu repo, copia **todo** su contenido y pégalo en el editor.
3. Dale **Run** (abajo a la derecha). Debe terminar sin errores (verás "Success").
   - *¿Por qué?* Junta las 6 migraciones nuevas (019 a 024) en un solo paso para que no tengas que correrlas una por una.
4. **Verifica** (opcional) pegando esto en una query nueva y dándole Run:
   ```sql
   select
     (select count(*) from information_schema.columns where table_name='products' and column_name='cost') as tiene_costo,
     (select count(*) from information_schema.tables where table_name='promotions') as tiene_promos,
     (select count(*) from information_schema.tables where table_name='organizations') as tiene_grupos;
   ```
   Debe devolver `1, 1, 1`. Si es así, la BD quedó lista. ✅

> Si tu base en la nube es vieja y le faltan migraciones intermedias, primero aplica las que falten (009 a 018, también idempotentes) y luego esta actualización. En local ya está todo aplicado.

---

## Paso 2 — Desplegar el código (Render)

Render redespliega solo cuando subes los cambios a tu rama de producción.

1. Sube el código:
   ```bash
   git add -A
   git commit -m "Admin Pro (finanzas, analitica, inventario, promos, personal) + panel de grupo"
   git push
   ```
2. En **render.com** → tu Web Service: el deploy arranca solo. Espera a que diga **Live** (2–4 min).
   - Si no arranca solo: botón **Manual Deploy → Deploy latest commit**.
3. No toques las variables de entorno: no cambiaron.

---

## Paso 3 — Usar lo nuevo

### Admin Pro (cada restaurante)
- Ya aparece en el panel del dueño: **Finanzas, Analítica, Inventario, Promociones, Personal** (menú lateral, agrupado por secciones).
- **Finanzas, Analítica, Promociones y Clientes** requieren el módulo **Pedidos** (plan Premium). Inventario y Personal funcionan en cualquier plan.
- **Costos:** en el editor de cada platillo hay un campo "Costo" → así se calculan utilidad y margen.
- **Personal:** el dueño crea meseros/cajeros en **Personal** y les marca a qué secciones pueden entrar.

### Panel de Grupo (para clientes con varias sucursales)
1. En tu **Super Admin** → pestaña **Grupos** → **Nuevo grupo** (nombre + slug, ej. `tacos-del-norte`).
2. En el grupo: **asigna las sucursales** (restaurantes ya existentes) y **crea el login del jefe** (email + contraseña).
3. El jefe entra en **`slug-central.tudominio.com`** (ej. `tacos-del-norte-central.tudominio.com`) y ve el consolidado de todas sus sucursales.
   - **No necesitas tocar Cloudflare**: el wildcard `*.tudominio.com` que ya tienes cubre `-central`.

---

## Notas
- Las migraciones se quedan también como archivos sueltos en `plataforma/supabase/migrations/019…024` por si prefieres correrlas una a una.
- Pendiente opcional (no bloquea nada): que el jefe del grupo pueda **editar** cada sucursal con su mismo login (hoy las **monitorea** y abre el panel `-admin` de cada una).
- Detalle técnico completo en `PLAN_ADMIN_PRO.md` y `PLAN_GRUPOS.md`.
