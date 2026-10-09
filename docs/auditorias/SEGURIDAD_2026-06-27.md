# Endurecimiento de seguridad — 2026-06-27

Resumen de lo aplicado para el lanzamiento. Defensa en profundidad sobre la base
que ya existía (RLS multi-tenant, anti doble-submit, validaciones).

## Cabeceras de seguridad (`src/proxy.ts`)
Aplicadas a toda la app vía el proxy (middleware de Next 16):
- **Content-Security-Policy**: `default-src 'self'` + orígenes mínimos. Bloquea
  scripts/objetos externos. Permite estilos en línea (`'unsafe-inline'`, la app
  los usa por todos lados) y `'unsafe-eval'` (exports PDF/Excel y debug de React).
  - `frame-ancestors 'self'` (no `'none'`): la vista previa del super admin embebe
    `/preview/*` en un iframe del mismo origen.
  - `connect-src` permite `https:`/`wss:` (Supabase + Realtime) y `localhost`
    (impresión QZ / agente). **Sin** `upgrade-insecure-requests` para no romper la
    impresión local por `ws://localhost` en producción.
- **X-Frame-Options: SAMEORIGIN** (anti-clickjacking, compatibilidad).
- **X-Content-Type-Options: nosniff**.
- **Referrer-Policy: strict-origin-when-cross-origin**.
- **Permissions-Policy**: cámara/micrófono/payment deshabilitados; `geolocation=(self)`
  (la usa el selector de sucursal y el mapa de domicilios).
- **Strict-Transport-Security** (HSTS) solo en producción.

> Si en el futuro se quiere CSP estricta con nonces, hay que migrar los estilos en
> línea a clases/CSS-in-JS con nonce (refactor grande). Hoy no es viable sin romper la UI.

## Rate limiting (`src/lib/rate-limit.ts`)
Ya existía en pedidos/registro/métricas. Se añadió a:
- **Login** (`actions/auth.ts`): 10 intentos / 5 min por IP + 6 / 5 min por IP+email
  (anti fuerza bruta).
- **API v1** (`/api/v1/me`): 30 / min por IP.

> El limitador es en memoria (por instancia). Para escalar a varias instancias,
> migrar a Redis/Upstash con la misma interfaz `rateLimit()`.

## Sistema de API keys (mig. 051 + `lib/api-keys.ts`)
- Tabla `api_keys` con **solo el hash SHA-256** (el secreto se ve una vez).
- RLS ON sin políticas → acceso solo por service role.
- Generación/verificación en `lib/api-keys.ts` (comparación en tiempo constante,
  expiración y revocación). Endpoint de ejemplo `/api/v1/me`.
- Gestión desde `/super/configuracion` (crear, copiar una vez, revocar).
- Para integraciones futuras (webhooks de pasarela, socios). **Los secretos de
  terceros (Stripe/Recurrente) NO van aquí**: van en env. Ver `docs/PAGOS_INTEGRACION.md`.

## Auditoría anti-inyección / XSS
- **SQL**: la app usa el cliente de Supabase (parametrizado) y RPCs con parámetros
  ligados. No hay SQL construido por concatenación de strings ni `EXECUTE` dinámico
  en las migraciones. El único `.ilike` (`db/promos.ts`) va parametrizado.
- **XSS**: el `custom_css` del restaurante se inyecta en `<style>` pero pasa por
  `sanitizeCustomCss()` (quita `</style>`, `</script>`, `<!--`) → cierra el breakout
  a JavaScript. Inputs públicos (métricas) validados por regex (UUID/path).
- **Sin hallazgos críticos.** Recomendación residual: el `custom_css` puede exfiltrar
  vía `url()`; el control es limitar quién lo edita (hoy super admin/dueño) — aceptable.

## Pendiente para producción (nube)
- Aplicar migración **051** (api_keys) en Supabase nube.
- Definir env vars de la pasarela cuando se active el cobro automático.
