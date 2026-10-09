# PLAN — Panel de Grupo multi-sucursal (Fase E)

> Doc vivo. Objetivo: un dueño con varias sucursales (el "jefe del grupo")
> monitorea y administra todas desde un panel propio en **slug-central.tudominio.com**.
> Acompaña a `PLAN_ADMIN_PRO.md` (Fases A–D) e `IMPLEMENTACIONES.md`.

## Estado

| Pieza | Estado |
|------|--------|
| Modelo de datos (organizations, GROUP_OWNER, organization_id) | ✅ |
| Ruteo `slug-central` → `/central/*` | ✅ |
| Panel consolidado `/central` (resumen, sucursales, comparativa, finanzas) | ✅ |
| Gestión de grupos en el Super Admin (`/super/grupos`) | ✅ |
| Verificado end-to-end (2026-06-14) | ✅ |
| **Pendiente:** que el GROUP_OWNER administre cada sucursal con SU mismo login (hoy abre el `-admin` de la sucursal; el acceso de escritura cruzado es follow-up) | ⬜ |

---

## Arquitectura

**Migración:** `024_grupos.sql`
- Tabla `organizations` (id, name, slug único, logo_url, color_primary, contact_email).
- `restaurants.organization_id` (NULL = independiente).
- `profiles.organization_id` + rol `GROUP_OWNER` (recrea `profiles_role_check`).

**Ruteo** (`src/lib/tenant.ts` + `src/proxy.ts`)
- `isGroupSubdomain(host)` / `getGroupSlug(host)` — sufijo `-central`.
- `getTenantSlug` devuelve `null` para `*-central` (no es un menú).
- `proxy.ts`: en host de grupo, header `x-org-slug` + rewrite `/` → `/central`, `/x` → `/central/x`.
- `super-admin.ts validateSlug`: reserva `central` y rechaza slugs que terminen en `-admin`/`-central`.

**Datos** (`src/lib/db/group.ts`)
- `getGroupContext()` — auth: GROUP_OWNER por su `organization_id`; SUPER_ADMIN por `x-org-slug`. Devuelve org + sucursales (seguro: cada jefe solo ve su grupo).
- `getGroupDashboard(branches)` — KPIs consolidados de hoy + por sucursal (reusa `getOrderStats` por sucursal en su zona horaria) + stock bajo/agotado.
- `getGroupReport(branches, from, to)` — consolidado por rango (reusa `getSalesReport`) + contribución por sucursal + serie combinada.

**Frontend**
- `src/components/group/group-shell.tsx` — shell del grupo (reusa clases `.admin-*` responsive), logout vía `logoutGroup`.
- `/central/(protected)/` — `page.tsx` (resumen), `sucursales/`, `comparativa/`, `finanzas/`. `/central/login` fuera del guard. `/central/layout.tsx` = pass-through.
- `auth.ts`: `login` redirige GROUP_OWNER → `/central`; `logoutGroup` → `/central/login`.

**Super Admin** (`/super/grupos`)
- Lista + `/super/grupos/new` (crear grupo) + `/super/grupos/[id]` (asignar/quitar sucursales, alta del login del jefe, eliminar).
- Acciones en `super-admin.ts`: `createOrganization`, `assignRestaurantToOrg`, `unassignRestaurant`, `createGroupOwner`, `deleteOrganization`. Lecturas en `db/super-admin.ts`: `getAllOrganizations`, `getOrganizationDetail`.

---

## Verificación end-to-end (2026-06-14) ✅
1. Super Admin (UI): creó "Grupo Azúcar" (`grupo-azucar`), asignó 2 sucursales (Azúcar Negra + Azúcar Negra Centro), creó el login del jefe (`jefe@grupo.com`).
2. `grupo-azucar-central.localhost:3000` → rewrite a `/central` → login del grupo → **resumen consolidado**: Ventas hoy **Q269** (Q165+Q104), 7 pedidos, ticket Q38.43, mejor sucursal, tabla por sucursal con "Administrar".
3. Comparativa: Ingreso del grupo **Q2166** = Azúcar Negra Q1787 (83%) + Centro Q379 (17%); 45 pedidos; utilidad Q1266 — agregación correcta.
4. Sucursales y Finanzas del grupo renderizan sin errores. Build/typecheck limpios (42 rutas), sin errores en consola.

## Para activar en producción
- DNS: el wildcard `*.tudominio.com` ya cubre `slug-central` (no requiere registro nuevo en Cloudflare).
- Aplicar `024_grupos.sql` en la nube. Crear el grupo, asignar sucursales y el login del jefe desde `/super/grupos`.
- Credenciales locales de prueba: jefe de grupo `jefe@grupo.com` / `Jefe12345`.
