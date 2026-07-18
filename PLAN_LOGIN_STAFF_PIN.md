# Login de staff por PIN — plan de implementación

Este documento es la especificación para implementar un nuevo método de inicio de
sesión para el personal operativo (mesero, cajero, cocina) de cada restaurante,
por PIN numérico, sin tocar el login actual del dueño (email + contraseña).

Está escrito para pasarse directo a Claude Code. Incluye el estado actual real del
código (ya verificado), el diseño propuesto, los archivos a tocar/crear, y las
decisiones abiertas que hay que confirmar con el usuario antes de tocar producción.

---

## 1. Objetivo

Hoy, cada miembro del staff (mesero, cajero) tiene su propia cuenta de Supabase Auth
(email + contraseña de mínimo 8 caracteres). Eso trae dos problemas:

1. **Fricción operativa**: en una PC/tablet compartida del restaurante, cada cambio
   de turno obliga a escribir un email y una contraseña larga — lento para uso
   varias veces al día.
2. **Colisión de identidad entre restaurantes**: el email vive en `auth.users`, una
   tabla ÚNICA y GLOBAL de Supabase compartida por TODOS los restaurantes de la
   plataforma (multi-tenant en una sola base). Si dos restaurantes distintos
   quisieran usar un email "genérico" tipo `mesero1@algo.com` para dos personas
   distintas, el segundo registro fallaría porque el email ya existe.

El objetivo es agregar un **login rápido por PIN de 4 dígitos**, acotado al
restaurante de ese dispositivo, para el uso diario del staff — sin tocar el login
por email/contraseña del dueño, que sigue existiendo igual que hoy.

---

## 2. Cómo funciona el sistema HOY (verificado en el código, resumen para contexto)

- **Multi-tenant por subdominio**: cada restaurante tiene un `slug` en la tabla
  `restaurants`. En producción su panel vive en `https://<slug>-admin.leogin.online`.
  `src/lib/tenant.ts` (`getTenantSlug(host)`) resuelve el restaurante leyendo el
  header `Host` de cada request — ANTES de cualquier autenticación.

- **Login actual** (`src/lib/actions/auth.ts` → `login()`): usa
  `supabase.auth.signInWithPassword({ email, password })`. Ya tiene rate limiting
  por IP y por IP+email (`src/lib/rate-limit.ts`, función `rateLimit(key, max, windowMs)`
  — reutilizable, no reinventar).

- **Alta de staff** (`src/lib/actions/staff.ts` → `createStaff()`): el dueño crea
  cada miembro con `ctx.db.auth.admin.createUser({ email, password })` (Supabase
  Auth Admin API) y luego un registro en `profiles` con
  `role: 'RESTAURANT_STAFF'`, `restaurant_id`, `permissions: string[]`.
  `listStaff()`, `updateStaffPermissions()`, `resetStaffPassword()`, `removeStaff()`
  ya existen y funcionan — **no romper esta parte**, el dueño la sigue usando para
  administrar el equipo (nombres, permisos por sección).

- **Tabla `profiles`** (`supabase/migrations/001_initial_schema.sql` +
  `023_personal.sql`):
  ```sql
  profiles (
    id            uuid primary key references auth.users(id) on delete cascade,
    restaurant_id uuid references restaurants(id) on delete set null,
    role          text check (role in ('SUPER_ADMIN','RESTAURANT_OWNER','RESTAURANT_STAFF')),
    full_name     text,
    permissions   jsonb   -- ["mesero","pedidos",...] o null = todas
  )
  ```

- **Permisos por sección** (`src/lib/permissions.ts`): `can(role, permissions, section)`
  y `isMeseroOnly(role, permissions)` ya deciden qué secciones ve cada quien.
  Reutilizar tal cual, el PIN no debe duplicar esta lógica.

- **Layout del mesero** (`src/app/admin/(waiter)/layout.tsx`): hoy exige
  `supabase.auth.getUser()` (sesión de Supabase Auth) y luego valida
  `can(role, permissions, 'mesero')`. **Este es el punto que hay que adaptar** para
  aceptar también una sesión de "operador por PIN", no solo la de Supabase Auth.

- **Bitácora de actividad** (`src/lib/actions/staff.ts` → `getActivityLog`, tabla
  `activity_log` de `023_personal.sql`): ya registra `actor_id`. El login por PIN
  debe poder alimentar este mismo `actor_id`.

- **App de escritorio (Tauri, `leogin-desktop/`)**: ya persiste `panel_url` en
  `config.json` de esa PC tras el primer login del dueño (`detect_resolved_panel`
  en `src-tauri/src/main.rs`). Cada arranque siguiente navega directo a ese
  subdominio sin pedir login de nuevo (patrón "recordar dispositivo", igual que
  Slack/Discord/Steam). **El login por PIN se apoya en este comportamiento
  existente**: la PC ya sabe a qué restaurante pertenece antes de que el PIN entre
  en juego.

---

## 3. Modelo propuesto

Dos capas separadas, que no se pisan entre sí:

**Capa A — "esta PC es de este restaurante"** (ya existe, no se toca):
el dueño instala/loguea UNA vez por dispositivo → la app recuerda el subdominio →
todos los días siguientes la PC ya sabe su restaurante sin pedir nada.

**Capa B — "quién de mi equipo la está usando ahora mismo"** (lo nuevo):
con el restaurante ya resuelto (Capa A, o por estar parado en su subdominio en el
navegador normal), se muestra una pantalla "¿Quién eres?" con los nombres del staff
de ESE restaurante. Se toca un nombre, se teclea un PIN de 4 dígitos, y queda
identificado ese operador — sin email, sin contraseña larga.

El PIN **no reemplaza** el login por email/contraseña del dueño: sigue existiendo
para el panel completo de administración (finanzas, ajustes, gestión de personal).
El PIN es exclusivamente para las pantallas operativas de uso diario (mesero,
pedidos, cocina/KDS, caja).

---

## 4. Cambios de base de datos

Nueva migración `supabase/migrations/0XX_staff_pin.sql` (usar el siguiente número
correlativo real del repo, hoy van hasta `053_group_owner_admin_access.sql` —
confirmar el último número antes de nombrarla):

```sql
-- PIN operativo del staff, separado de auth.users/profiles a propósito:
-- el PIN NO es una credencial de Supabase Auth, es solo una identificación
-- rápida de "quién" dentro de un contexto ya autorizado por dispositivo/sesión.
create table if not exists staff_pins (
  profile_id      uuid primary key references profiles(id) on delete cascade,
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  pin_hash        text not null,     -- hash con crypto.scrypt (ver §6), NUNCA el PIN en claro
  pin_salt        text not null,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

create index if not exists staff_pins_restaurant_idx
  on staff_pins(restaurant_id);

alter table staff_pins enable row level security;
-- Sin políticas públicas: solo se toca vía server actions con service role,
-- igual que activity_log (patrón ya usado en 023_personal.sql).
```

Decisión de diseño: el PIN se valida junto con el `profile_id` elegido (tocas tu
nombre en la grilla, luego tecleas tu PIN) — **no** se busca "¿de quién es este PIN
1234?" a ciegas dentro del restaurante. Esto evita tener que forzar PINs únicos
entre compañeros del mismo restaurante y es más simple de implementar.

---

## 5. Cambios de backend

### 5.1 Nuevas server actions — `src/lib/actions/staff-pin.ts` (nuevo archivo)

- `setStaffPin(prevState, formData)`: el dueño asigna/cambia el PIN de un miembro
  desde el panel de Personal. Reusa `ownerCtx()` de `staff.ts` (exportarla o
  duplicar el patrón) para confirmar que quien llama es el dueño de ESE
  restaurante. Valida PIN de exactamente 4 dígitos numéricos. Genera salt random
  (`crypto.randomBytes`), hashea con `crypto.scrypt` (ver §6), guarda en
  `staff_pins` (upsert).

- `verifyStaffPin(restaurantId, profileId, pin)`: valida que `profileId`
  pertenezca a `restaurantId` y tenga rol STAFF/WAITER, compara el hash, aplica
  bloqueo tras intentos fallidos (reusar `rateLimit()` de `src/lib/rate-limit.ts`
  con clave `pin:${restaurantId}:${profileId}` — mismo patrón que ya usa
  `login()` en `auth.ts`, no reinventar). Si es válido: crea la "sesión de
  operador" (ver §5.2) y llama a `logActivity()` con `action: 'staff_pin_login'`.

- `clearStaffPin(...)`: el dueño puede quitar el PIN de alguien (ej. si sale del
  restaurante) sin borrar su cuenta completa.

### 5.2 Sesión de operador (sin usar Supabase Auth)

No crear un usuario de Supabase Auth por cada login de PIN — sería lento y
además NO resuelve el problema de fricción. En su lugar: una cookie propia,
firmada server-side con HMAC (usar el módulo `crypto` nativo de Node, ya
disponible, sin agregar dependencias — el repo no tiene `jsonwebtoken` ni `jose`
instalados y no hace falta agregarlos).

- Cookie `leogin_operator`, httpOnly, secure, `SameSite=Lax`, con payload
  `{ profileId, restaurantId, issuedAt }` + firma HMAC con un secreto en
  `LEOGIN_OPERATOR_SECRET` (nueva variable de entorno).
- Vida corta (ej. 12 horas o hasta "Cambiar de usuario" explícito) — pensar en
  que un turno completo no debe expulsar al operador a media jornada.
- El middleware/layout de las rutas operativas (`(waiter)/layout.tsx`, y
  cualquier ruta nueva de caja/cocina que use este login) debe aceptar EITHER
  una sesión de Supabase Auth válida (dueño/staff con cuenta completa, como
  hoy) OR una cookie `leogin_operator` válida — sin duplicar la lógica de
  `can()`/`isMeseroOnly()`, que ya recibe `role`/`permissions` como parámetros
  simples y no le importa de dónde vinieron.

### 5.3 Punto a investigar ANTES de escribir código (bloqueante)

Revisar si alguna política RLS de Postgres depende de `auth.uid()` directamente
(por ejemplo en `orders`, `activity_log`, o cualquier tabla que el mesero
escriba). Si existen políticas así, un operador identificado solo por la cookie
`leogin_operator` (sin sesión real de Supabase Auth) **no** cumplirá esas
políticas al escribir directo desde el cliente. Mitigación: todas las escrituras
del staff ya pasan por server actions con `createServiceClient()` (service role,
bypassa RLS) — confirmar que efectivamente TODAS las rutas usadas por
mesero/cocina/caja siguen ese patrón antes de dar por cerrado el diseño. Buscar:
`grep -rn "createClient(" src/app/admin/\(waiter\) src/app/admin/\(kitchen\)`.

---

## 6. Seguridad del PIN

- **4 dígitos = 10,000 combinaciones.** Es aceptable SOLO porque el bloqueo por
  intentos fallidos es obligatorio, no opcional. Reusar el patrón de `rateLimit()`
  ya existente en `auth.ts` (10 intentos / 5 min por IP, 6 intentos / 5 min por
  IP+identificador) aplicado a `restaurantId+profileId`.
- **Nunca guardar el PIN en claro.** Usar `crypto.scrypt(pin, salt, 64)` (Node
  nativo) en vez de comparación directa. No usar SHA-256 simple (muy rápido de
  fuerza-bruta para un espacio de 10k valores).
- **Bloqueo progresivo**: tras 5 intentos fallidos seguidos, bloquear ese
  `profile_id` por unos minutos (`locked_until` en `staff_pins`) — evita que
  alguien se plante frente al POS probando los 10,000 PINs.
- El PIN identifica a la persona para atribución y permisos — **no** es la única
  barrera de seguridad del sistema: la capa de dispositivo (Capa A, §3) ya exige
  que ese equipo físico haya sido activado por el dueño una vez. Documentar esto
  explícitamente para que nadie lo confunda con "el PIN protege todo el sistema".

---

## 7. Cambios de frontend

- **Nueva pantalla "¿Quién eres?"**: reemplaza (o precede a) lo que hoy carga
  directo `(waiter)/layout.tsx` cuando no hay sesión de operador activa. Grilla
  de tarjetas con `full_name` de cada `listStaff(restaurantId)` (función ya
  existente en `staff.ts`, no crear una nueva). Al tocar una tarjeta, pad
  numérico de PIN (4 dígitos), envía a `verifyStaffPin`.
- **Botón "Cambiar de usuario"** visible en la UI operativa (mesero/cocina/caja),
  para que alguien pueda cerrar su sesión de operador sin afectar la Capa A del
  dispositivo — vuelve a la grilla "¿Quién eres?".
- **Panel de Personal del dueño** (`src/components/admin/staff-panel.tsx`):
  agregar un campo para asignar/cambiar el PIN de cada miembro, junto a lo que
  ya existe (nombre, permisos, resetear contraseña). Mismo modal, una sección
  más.
- **Reusar la identidad visual** ya establecida en `leogin-desktop/ui/index.html`
  (fondo oscuro, gradiente rojo→naranja de marca, tarjeta central redondeada) para
  que la pantalla de PIN se sienta parte de la misma familia, aunque esta vive en
  el panel web (Next.js), no en la app de escritorio.

---

## 8. Qué NO cambia (para evitar romper nada)

- El login del dueño (`auth.ts` → `login()`) sigue siendo email + contraseña vía
  Supabase Auth, sin tocar.
- `createStaff`, `listStaff`, `updateStaffPermissions`, `resetStaffPassword`,
  `removeStaff` en `staff.ts` siguen intactas — el PIN es un dato ADICIONAL sobre
  el mismo `profile`, no un reemplazo de esas funciones.
- `permissions.ts` (`can()`, `isMeseroOnly()`) no se modifica — el PIN solo
  decide QUIÉN está operando; qué puede ver esa persona lo sigue decidiendo esta
  lógica ya existente, sin cambios.
- La app de escritorio (Tauri) no necesita cambios de Rust para esto — la
  pantalla de PIN vive del lado web (dentro del `admin`), que la ventana de
  Tauri ya carga tal cual.

---

## 9. Decisiones abiertas — confirmar con el usuario antes de implementar

1. **¿El PIN también debe funcionar sin internet** (vía el hub local
   `LeoginAgent`, para que el staff pueda "ficharse" aunque se caiga la nube)?
   Si sí, es una fase aparte: requeriría cachear `staff_pins` en el agente local
   y es un cambio más grande — no incluirlo en la primera versión salvo que se
   pida explícitamente.
2. **Duración de la sesión de operador**: ¿se cierra sola al final del turno
   (ej. medianoche), por inactividad (ej. 30 min sin tocar nada), o se queda
   activa hasta que alguien pulse "Cambiar de usuario"? Definir antes de fijar
   el tiempo de vida de la cookie.
3. **Longitud/formato del PIN**: se asume 4 dígitos numéricos (estándar de
   POS de restaurantes). Confirmar si se prefiere otra longitud.
4. **¿El PIN aplica también a "cocina" (KDS) y "caja/finanzas", o solo a
   mesero/pedidos por ahora?** El diseño de arriba es genérico y sirve para
   cualquier sección operativa, pero conviene decidir el alcance de la primera
   versión para no sobre-construir.

---

## 10. Checklist de implementación (orden sugerido)

1. Investigar el punto bloqueante del §5.3 (RLS vs. service role) antes de
   escribir nada — puede cambiar el diseño de la sesión de operador.
2. Migración SQL de `staff_pins` (§4).
3. `src/lib/actions/staff-pin.ts`: `setStaffPin`, `verifyStaffPin`, `clearStaffPin`.
4. Cookie firmada de operador + helper para leerla/validarla server-side
   (`src/lib/auth/operator-session.ts`, nuevo).
5. Adaptar `(waiter)/layout.tsx` (y cualquier layout de caja/cocina que se
   incluya en el alcance, ver §9.4) para aceptar sesión de operador además de
   Supabase Auth.
6. Pantalla "¿Quién eres?" + pad de PIN (frontend).
7. Botón "Cambiar de usuario" en la UI operativa.
8. Campo de PIN en `staff-panel.tsx` (gestión del dueño).
9. Pruebas manuales: PIN correcto, PIN incorrecto x5 (bloqueo), PIN de un
   staff de OTRO restaurante (debe fallar), operador cambia de sección con
   permisos limitados (debe respetar `permissions`), logout de operador no
   cierra la sesión del dispositivo (Capa A sigue viva).
