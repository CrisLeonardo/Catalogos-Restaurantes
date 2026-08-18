# Login con Google (comensales y dueños)

Hay **dos flujos con Google**, con la misma configuración externa (Google Cloud
+ Supabase) y el mismo interruptor (`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED`), pero con
sesiones y callbacks distintos:

| | Comensal (menú) | Dueño / gerente (panel) |
|---|---|---|
| Dónde aparece | Menú público → Cuenta / Recompensas | `/login`, `/admin/login`, `/central/login` y el wizard de `/registro` |
| Callback | `/auth/callback` | `/admin/auth/google/callback` |
| Cookie | `sb-leogin-diner-v2`, host-only (por restaurante) | cookie por defecto de Supabase, dominio `.leogin.online` |
| Para qué | Ver y canjear puntos desde cualquier dispositivo | Crear el restaurante y entrar al panel sin contraseña |

Los dos son **opcionales**: sin configurar, los botones no aparecen y todo
sigue funcionando (el comensal por teléfono, el dueño con correo y contraseña).

El código ya está listo. Para activarlo hay 3 pasos: Google Cloud → Supabase → variable de entorno.

## 1. Google Cloud (cliente OAuth)

1. Entra a <https://console.cloud.google.com> → **APIs y servicios → Pantalla de consentimiento OAuth**.
   - Tipo: **Externo**. Llena nombre de la app, correo de soporte y logo (opcional).
   - En *Usuarios de prueba* agrega tu correo mientras esté en modo prueba, o **publica** la app.
2. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. En **URIs de redireccionamiento autorizados** agrega la URL de callback de Supabase:
   ```
   https://<TU-PROYECTO>.supabase.co/auth/v1/callback
   ```
   (La encuentras en Supabase → Authentication → Providers → Google.)
4. Copia el **Client ID** y el **Client Secret**.

## 2. Supabase (proveedor Google)

1. Supabase → **Authentication → Providers → Google** → activar.
2. Pega el **Client ID** y **Client Secret** del paso anterior. Guardar.
3. Supabase → **Authentication → URL Configuration → Redirect URLs**. Agrega las
   URLs a las que se puede volver tras autenticar (un patrón por línea):
   ```
   https://leogin.online/auth/callback
   https://*.leogin.online/auth/callback
   https://leogin.online/admin/auth/google/callback
   https://*.leogin.online/admin/auth/google/callback
   ```
   El subdominio comodín cubre el menú y el panel de cada restaurante
   (`slug.leogin.online`, `admin.slug.leogin.online`). Las dos últimas líneas
   son las del **dueño**: sin ellas el botón del menú funciona pero el del
   panel deja al dueño en la raíz sin sesión. En desarrollo agrega también
   `http://localhost:3000/auth/callback` y
   `http://localhost:3000/admin/auth/google/callback`.

   **Si agregas otro dominio a `NEXT_PUBLIC_ROOT_DOMAIN`** (ver
   `legacyDomainRedirectHost` en proxy.ts), agrega aquí el mismo trío de
   patrones para ESE dominio también — Supabase no adivina dominios nuevos
   por su cuenta, y sin esto el login "funciona" pero manda al comensal a la
   raíz en vez de a su menú (ver la sección de abajo).

## 3. Variable de entorno

Activa el botón en la app (Render / `.env.local`):

```
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1
```

Sin esta variable el botón no se muestra (el flujo por teléfono sigue intacto).

## Cómo funciona

- La sesión del comensal es **por restaurante**: cookie propia
  (`sb-leogin-diner-v2`, host-only) en el subdominio donde inició sesión.
  Entrar con Google en `azucar-negra.leogin.online` NO te deja logueado en
  `garden-cup.leogin.online` — cada restaurante pide su propio "Continuar con
  Google". (Antes la cookie era de dominio `.leogin.online` y la sesión se
  compartía en toda la plataforma; el proxy expira esas cookies v1 solas.)
- Los puntos se llevan **por teléfono**. Google solo **enlaza** la cuenta al
  cliente (1:1 por restaurante) cuando el comensal hace un pedido con su número,
  o cuando usa "Enlazar este número a mi cuenta" en la sección de Recompensas.
- El callback `/auth/callback` intercambia el código por la sesión y regresa al
  menú. Si algo falla, vuelve con `?auth_error=1` sin romper la página.
- **Las cuentas de staff SÍ pueden ser comensales.** La sesión del comensal
  vive en su propia cookie, separada de la del panel admin, así que un
  dueño/mesero que entra con Google en el menú (aunque use el mismo correo de
  su cuenta de staff) es simplemente un comensal más: ve sus puntos, enlaza su
  teléfono y pide con normalidad, sin tocar su sesión del panel. (Antes
  `resolveDinerAuthUserId` descartaba esos usuarios y la UI les pedía "inicia
  sesión" en bucle por más que la sesión fuera válida.)

## Antes de poner `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` en producción

Esta lista es la causa más común de que el login "no funcione" sin dar ningún
error visible — Supabase falla en silencio si algo no calza:

- [ ] Google Cloud → credencial OAuth creada, con el redirect URI de Supabase
      (`https://TU-PROYECTO.supabase.co/auth/v1/callback`) exacto, sin barra final.
- [ ] Supabase → Authentication → Providers → Google → activado, con Client ID
      y Secret pegados.
- [ ] Supabase → Authentication → URL Configuration → **Site URL** =
      `https://leogin.online` (la raíz, sin subdominio).
- [ ] Supabase → misma pantalla → **Redirect URLs** incluye, línea por línea,
      el mismo trío por CADA dominio en `NEXT_PUBLIC_ROOT_DOMAIN` (hoy son dos:
      leogin.online se dejó vivo tras migrar a distleogin.com — ver
      `legacyDomainRedirectHost` en proxy.ts):
      ```
      https://leogin.online/auth/callback
      https://*.leogin.online/auth/callback
      https://*.leogin.online/**
      https://distleogin.com/auth/callback
      https://*.distleogin.com/auth/callback
      https://*.distleogin.com/**
      ```
      El patrón `https://*.<dominio>/**` ya cubre el callback del dueño
      (`/admin/auth/google/callback`) en los subdominios; agrega además
      `https://<dominio>/admin/auth/google/callback` para el dominio raíz, que
      es donde se registra un restaurante nuevo.
      Si falta el patrón con `*` de un dominio, Supabase regresa a la raíz en
      vez del subdominio del restaurante y el comensal nunca queda logueado
      — confirmado en producción el 2026-08-13 tras agregar distleogin.com
      sin actualizar esta lista.
- [ ] `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` puesto en Render (no solo en
      `render.yaml` — hay que asignarle el valor en el dashboard porque el
      repo lo declara con `sync: false`).
- [ ] Prueba real: incógnito → `slug.leogin.online` → Continuar con Google →
      debe regresar logueado al MISMO subdominio, no a `leogin.online`.

## Solución de problemas

### "Después de Continuar me manda a leogin.online y NO inicia sesión"

Causa: la URL de retorno del subdominio del restaurante **no está en la lista
blanca** de Supabase, así que Supabase usa el *Site URL* (la raíz) como respaldo
y nunca pasa por `/auth/callback`. Pasa lo mismo si el comensal entra por un
dominio que no está en la lista aunque `leogin.online` sí lo esté (ej. un
dominio nuevo recién agregado a `NEXT_PUBLIC_ROOT_DOMAIN`). **Solución:** en
Supabase → **Authentication → URL Configuration → Redirect URLs** agrega (un
patrón por línea, uno por CADA dominio activo):

```
https://*.leogin.online/auth/callback
https://*.leogin.online/**
https://*.distleogin.com/auth/callback
https://*.distleogin.com/**
```

El **Site URL** no necesita cambiar cuando agregas un dominio — solo importa
como respaldo cuando ninguna URL de la lista calza. Con el patrón `*` del
dominio correcto en la lista, al volver de Google aterriza en
`slug.<dominio>/auth/callback`, se crea la sesión (cookie host-only de ese
subdominio) y queda logueado en el menú del restaurante.

### "La pantalla de Google dice jsvlxfkw…supabase.co, no mi marca"

Eso lo controla Google, no la app:

- **Mejora rápida (gratis):** Google Cloud → *Pantalla de consentimiento OAuth* →
  pon **Nombre de la app = Leogin** y sube el **logo**. El título pasa a
  "Iniciar sesión en Leogin".
- **Marca completa (de pago):** la línea "…supabase.co accederá a tu información"
  solo desaparece con el add-on **Custom Domain** de Supabase (~US$10/mes), que
  pone la autenticación en `auth.leogin.online`. Si lo activas, cambia el redirect
  URI de Google a `https://auth.leogin.online/auth/v1/callback`.

Funciona igual con o sin esto: es solo cosmético / de confianza visual.

## Cómo funciona el flujo del DUEÑO

- **Entrar** (`/login`, `/admin/login`, `/central/login`): "Continuar con
  Google" → Google → `/admin/auth/google/callback`. El callback canjea el
  código con la cookie del PERSONAL, apunta el acceso en la bitácora
  (`panel_access_log`, método `google`) y manda a donde mandaría el login con
  contraseña (`resolveStaffDestination`): su panel, `/central` si es dueño de
  grupo, `/super/restaurantes` si es super admin.
- **Registrarse** (`/registro`, paso "Tu cuenta"): "Registrarme con Google" →
  el wizard guarda su borrador en `sessionStorage` (plan, nombre, dirección,
  plantilla) para que la vuelta de Google no lo mande a empezar de nuevo → al
  volver, el paso de la cuenta ya está resuelto y no se pide contraseña.
  `signupRestaurant` **relee la sesión en el servidor**: el campo
  `auth_provider` del formulario es una pista, no una credencial.
- **Cuenta de Google que ya administra un restaurante**: el registro se detiene
  antes de crear nada ("esta cuenta ya administra un restaurante"). Hoy
  `profiles` es uno a uno con el usuario de Auth — una cuenta, un restaurante.
  Quitar esa limitación (una cuenta con varios restaurantes y un selector) es
  lo que plantea `PLAN_ACCESO_MULTICUENTA.md` en la raíz del repo.
- **Mismo correo con contraseña y con Google**: Supabase enlaza la identidad de
  Google al usuario que ya existe cuando el correo coincide y está confirmado.
  El dueño que se registró con correo puede entrar después con Google (mismo
  correo) y cae en su misma cuenta, sin duplicados.
- **El personal (cajeros, meseros) no usa Google**: entra por PIN en el
  dispositivo del local (`staff-pin.ts`). Es a propósito — ver el plan.

## Nota sobre sesiones

La sesión del comensal (cookie `sb-leogin-diner-v2`, host-only por restaurante)
y la del personal (cookie por defecto de Supabase, dominio `.leogin.online`)
son **independientes**: conviven en el mismo navegador sin pisarse. El dueño
puede tener abierto su panel admin y a la vez probar el menú como comensal con
Google — ninguna de las dos sesiones afecta a la otra.
