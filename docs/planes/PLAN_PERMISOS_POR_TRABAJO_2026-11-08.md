# Plan · Permisos por trabajo (ficha 1.7) · 2026-11-08

Ficha **1.7** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **E12, N18, N19, F14, C05, R35**. Rama `feat/permisos-por-trabajo`, con la ficha 0.12 incorporada (ver [registro §28](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md#28-base-de-la-ficha-17--se-incorpora-012-2026-11-08)). Siguiente migración libre: **177**, comprobada en todas las ramas remotas.

> **Estado:** inventario hecho, modelo propuesto y decisiones del dueño tomadas (§4). [Maqueta de Personal y «Así verá el panel»](../diseno/MAQUETA_PERMISOS_POR_TRABAJO_2026-11-08.html) **pendiente de aprobación**; después, migración y código.

## 1. Inventario: cómo se decide hoy quién puede qué

### Modelo de datos

- `profiles.role` (`SUPER_ADMIN`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`, `RESTAURANT_WAITER` obsoleto) y `profiles.permissions` (lista de **secciones** o `null`).
- `restaurant_members` (migración 113): `role` (`OWNER`, `MANAGER`, `STAFF`, `WAITER`), `permissions` (lista de secciones o `null`) y `status`. Una fila por persona y restaurante.
- Las **secciones** son 30 llaves de `lib/permissions.ts` (`ADMIN_SECTIONS`). Una sección significa a la vez «ver la pantalla» y «hacer todo lo que hay en ella».

### Reglas que existen

| Regla | Dónde | Qué decide |
|---|---|---|
| `can(role, permissions, sección)` | `lib/permissions.ts` | Dueño y superadmin: todo. Personal con `null`: **todo**. Personal con lista: sólo esas secciones. Mesero obsoleto: sólo `mesero`. |
| `leogin_puede(restaurante, secciones…)` | migración 140 | El mismo `can()` en SQL para las tablas que la app escribe con la sesión. También trata `null` como todo. |
| `puedeEnSeccion` | `lib/auth/seccion.ts` | Guarda de las acciones del panel: pertenencia + sección, con rol efectivo por membresía. |
| `assertTableAccess` | `lib/auth/table-access.ts` | Salón, cobro de mesa, Servicio, Cocina, pedidos en vivo. Por defecto exige `mesero`; sentar y repartir aceptan `mesas`. |
| `authRestaurant` | `lib/caja/acceso.ts` | **Toda la Caja** (17 acciones de turnos, correcciones, traspasos) exige la sección `finanzas`. |
| `puedeAprobar` | `lib/void-approval.ts` | Firma sola una anulación o corrección quien **no** es mesero puro. |
| `ownerCtx` | `lib/actions/staff.ts` | Administrar personal: dueño o `MANAGER`; el gerente no puede crear accesos con usuario ni dar secciones que no tiene. |
| `canBill`, `dejariaSinDueño` | `lib/membership-roles.ts`, `membership-rules.ts` | Cobro del plan sólo dueño; nunca quitar al último dueño. |

### Problemas encontrados

1. **Caja y Finanzas son el mismo permiso (F14, C05).** Para que alguien abra o cierre caja hay que darle `finanzas`, que también enseña utilidades, reportes y exportaciones. Tampoco se distingue cobrar, abrir, registrar salida, cerrar, ver lo esperado, corregir ni devolver.
2. **`null` concede todo (F14).** En la app (`can`) y en la base (`leogin_puede`). Quien se creó antes de que existieran las listas tiene acceso completo sin que nadie lo haya decidido.
3. **El alta con usuario crea un gerente (R35.2).** En `createStaff`, todo acceso con usuario y contraseña nace como `MANAGER` en la membresía, y `MANAGER` puede administrar personal. El rol depende de *cómo entra*, no de *qué hace*.
4. **Cuatro comprobaciones distintas para lo mismo.** Cupones exige `profiles.role = RESTAURANT_OWNER` y no mira la membresía: un dueño moderno o un gerente quedan fuera, al revés que en el resto. FEL y `module-auth` leen los permisos del perfil y no los de la membresía de esa sucursal. Reservaciones pide una sección `reservaciones` que no existe en `ADMIN_SECTIONS`.
5. **Plantillas que no corresponden al trabajo (N18).** «Cajero» da `pedidos`, `mesas` y `clientes`, pero no Caja; no hay plantilla de Encargado, Recepción ni Reparto. La ficha muestra 30 casillas sin grupos ni consecuencias.
6. **Superadmin parte de «Dueño» (N19).** El selector de `restaurant-users.tsx` arranca en `OWNER`; transferir la propiedad y dar un acceso usan el mismo formulario.
7. **Guardas exportadas desde un archivo `'use server'`.** `ownerCtx` y `assertStaffOfRestaurant` quedan publicadas como acciones llamables. Hoy no se aprovechan (devuelven un cliente que no se puede serializar o reciben un contexto falso que falla), pero contradicen la regla del propio repositorio y se mueven a `lib/auth/`.
8. **Revocación.** Los permisos se leen en cada petición, así que quitar una sección surte efecto en la siguiente acción. Borrar a alguien elimina su usuario de Auth; no hay política escrita para un turno de Caja abierto ni para pedidos en curso a su nombre.

Datos locales (Supabase local, 2026-11-08): 5 membresías `OWNER` con `null`, 1 `MANAGER` con lista; 33 perfiles de dueño con `null` y 1 de personal con lista. **No se conocen los datos de producción**: la migración debe tratar cualquier combinación.

## 2. Modelo propuesto

### Capacidades en lugar de sólo secciones

Las secciones siguen sirviendo para la navegación. Se añaden **capacidades** finas con nombre `área.tarea`, guardadas en la misma lista `permissions` para no tocar el esquema de dos tablas:

| Área | Capacidades |
|---|---|
| Salón y servicio | `mesero` (tomar pedidos y atender mesas), `mesas` (sentar y repartir), `lista_espera`, `pedidos` |
| Cocina | `cocina` |
| **Caja** | `caja.cobrar`, `caja.abrir`, `caja.salida`, `caja.cerrar`, `caja.ver_esperado`, `caja.corregir`, `caja.devolver` |
| Finanzas | `finanzas` (utilidades, reportes y gráficos), `respaldo` (exportar datos), `fel` |
| Carta e inventario | `catalogo`, `categorias`, `inventario`, `ingredientes`, `proveedores` |
| Clientes | `clientes`, `loyalty`, `cupones`, `whatsapp` |
| Local | `ajustes`, `personalizar`, `perfil`, `modulos`, `qr`, `impresion`, `repartidores` |
| Equipo | `personal` (administrar personal) |
| Reparto | `reparto` |

Sólo el **dueño** conserva: suscripción y cobro del plan, transferir la propiedad, crear o quitar dueños y borrar el restaurante. Esto no se puede delegar con una casilla.

### Plantillas por trabajo

Una plantilla rellena capacidades; el dueño puede añadir o quitar excepciones y la ficha las muestra como tales.

| Plantilla | Capacidades (propuesta) |
|---|---|
| Mesero | `mesero`, `caja.cobrar` |
| Cocina | `cocina` |
| Caja | `caja.cobrar`, `caja.abrir`, `caja.salida`, `caja.cerrar`, `pedidos`, `mesas` |
| Recepción | `mesas`, `lista_espera`, `pedidos` |
| Reparto | `reparto` |
| Encargado | Servicio, Cocina, Caja completa (incluye ver esperado, corregir y devolver), `catalogo`, `categorias`, `inventario`, `clientes`, `personal` |
| Dueño | Todo, más lo indelegable |

### Una sola regla, en app y base

- `lib/auth/capacidades.ts`: `capacidadesEn(restaurantId)` resuelve el rol efectivo por membresía (0.12) y devuelve el conjunto. Todas las guardas (`puedeEnSeccion`, `assertTableAccess`, `authRestaurant`, cupones, FEL, `module-auth`, personal) pasan por ella.
- `leogin_puede` (nueva versión en la migración 177) entiende las capacidades y **deja de tratar `null` como todo** después de la conversión.
- Una sección de navegación se ve si la persona tiene cualquier capacidad de esa área.

### Vista «Así verá el panel»

En la ficha de cada persona: los destinos que verá, las acciones delicadas que puede hacer (descuentos, anulaciones, devoluciones, exportar, personal, configuración) y lo que no podrá hacer. Se calcula con la misma función que usa el servidor.

## 3. Migración 177 sin dejar a nadie fuera

1. **Antes del código.** Convierte cada `null` de personal (`STAFF`, `MANAGER`, `RESTAURANT_STAFF`) en una lista explícita equivalente a todo lo que hoy puede hacer: todas las secciones actuales más todas las capacidades de Caja. Nadie pierde acceso a mitad de un turno.
2. **`finanzas` existente → Caja completa + `finanzas`.** Quien hoy opera Caja la sigue operando.
3. **Bitácora.** Cada fila cambiada queda registrada (antes, después, motivo `migracion_177`), para que el dueño vea a quién se le amplió o mantuvo.
4. **Después, el código nuevo** deja de leer `null` como todo. Si el código llegara antes que la migración, el personal con `null` perdería el acceso: el orden es obligatorio y va en el PR.
5. Los dueños y el superadmin no dependen de la lista; el último dueño sigue protegido.

## 4. Decisiones del dueño (2026-11-08)

1. **El mesero cobra.** La plantilla Mesero incluye `caja.cobrar`; el dueño puede quitarlo como excepción. La migración da `caja.cobrar` a quien hoy tiene `mesero`, para no cambiar el trabajo de nadie.
2. **Arqueo ciego como opción del local.** Interruptor en Ajustes, apagado por defecto. Con él encendido, quien no tiene `caja.ver_esperado` cuenta sin ver lo esperado y la diferencia aparece al confirmar el conteo.
3. **El puesto lo decide la plantilla, no la forma de entrar.** Usuario o PIN es sólo el acceso. Administrar personal es la capacidad `personal`, que da la plantilla Encargado o una excepción del dueño.
4. **Sin acceso de soporte temporal en 1.7.** Queda anotado como pendiente; no se abre ningún acceso nuevo.

## 5. Pruebas previstas

- Matriz positiva/negativa por plantilla contra cada acción del servidor (no sólo la UI), con acceso directo a la acción.
- SQL: `leogin_puede` con capacidades, conversión de `null`, bitácora y RLS (`audit-rls-candados.mjs`, `audit-security-definer.mjs`).
- Multi-restaurante: misma persona con plantillas distintas en A y B.
- Revocación en la siguiente acción; último dueño; MFA de superadmin.
- Visual: ficha de Personal y «Así verá el panel» en 390 y 1280 px, claro y oscuro, tras aprobar la maqueta.
