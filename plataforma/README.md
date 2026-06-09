# Plataforma — Menús interactivos para restaurantes (código)

App **Next.js 16** (App Router, TypeScript, Tailwind v4) + **Supabase**.
Multi-tenant por subdominios. Diseño *liquid glass*.

> Documentación de estrategia y fases en la carpeta superior:
> `PLAN_MAESTRO.md`, `IMPLEMENTACIONES.md`, `ERRORES.md`.
>
> **Guías prácticas (carpeta superior):**
> - `GUIA_ENTORNO_LOCAL.md` — cómo desarrollar en local (con Supabase + Docker).
> - `GUIA_DESPLIEGUE.md` — cómo subir a Supabase (nube) + Render paso a paso.

---

## Arranque local

**Opción rápida (solo ver la demo, sin base de datos):**

```bash
cd plataforma
npm install
npm run dev                           # http://localhost:3000 (modo demo)
```

> Sin `.env.local`, la app corre en **modo demo**: solo la portada de un restaurante.
> Los paneles `/admin` y `/super` requieren Supabase.

**Opción completa (todo funcional, con Supabase local en Docker):**

```bash
cd plataforma
npm install
npx supabase start                    # levanta Supabase en Docker + aplica migraciones
# crea .env.local con las claves que imprime `supabase start` (ver GUIA_ENTORNO_LOCAL.md)
node scripts/crear-super-admin.mjs admin@local.test Admin12345
npm run dev
```

Detalle completo y troubleshooting en **`../GUIA_ENTORNO_LOCAL.md`**.

Para probar **subdominios en local**, abre `http://azucar-negra.localhost:3000` (Chrome
resuelve `*.localhost` sin configuración extra). El **proxy** (`src/proxy.ts`) detecta el slug
`azucar-negra` y lo propaga como header `x-tenant-slug`.

---

## Deploy en Render (Fase 0)

1. **Sube el código a GitHub** — este directorio (`plataforma/`) es tu repositorio.
2. **Crea un Web Service en Render** → conecta el repo → Render detecta `render.yaml`
   automáticamente y pre-rellena el build/start command.
3. **Agrega las variables de entorno** en Render (Environment → Add from YAML o una a una):
   - `NEXT_PUBLIC_ROOT_DOMAIN` → tu dominio (ej. `midominio.com`)
   - `NEXT_PUBLIC_SUPABASE_URL` → de Supabase → Project Settings → API
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ídem
   - `SUPABASE_SERVICE_ROLE_KEY` → ídem (solo servidor)
4. Render lanza el build. La primera URL será algo como `menuvivo.onrender.com`.

### DNS wildcard (Cloudflare)

Para que `azucar-negra.midominio.com` apunte al mismo servicio:

1. En Cloudflare, agrega un registro CNAME:
   - **Name:** `*`
   - **Target:** `menuvivo.onrender.com` (la URL de tu servicio Render)
   - **Proxy:** On (naranja)
2. En Render, en tu Web Service → Settings → Custom Domains → agrega `*.midominio.com`.
3. Render emite el certificado SSL wildcard automáticamente (puede tardar unos minutos).

---

## Estructura

```
plataforma/
├── render.yaml               # configuración de deploy en Render
├── src/
│   ├── app/
│   │   ├── layout.tsx        # fuentes, fondo asphalt, glass por defecto
│   │   ├── page.tsx          # demo Fase 0: portada Spotlight + catálogo cuadrícula
│   │   └── globals.css       # sistema de diseño liquid glass (themeable)
│   ├── components/
│   │   └── glass.tsx         # <Glass> con sheen, <Price>, <Tag>
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts     # cliente navegador (anon)
│   │   │   └── server.ts     # cliente servidor (cookies)
│   │   └── tenant.ts         # subdominio → slug del restaurante
│   └── proxy.ts              # (Next.js 16) resuelve tenant + refresca sesión Supabase
├── supabase/
│   ├── migrations/           # 001..006 (esquema + RLS + storage + pedidos)
│   └── setup_produccion.sql  # migraciones combinadas para pegar en la nube
├── scripts/
│   └── crear-super-admin.mjs # alta del Super Admin (local o nube)
├── .env.local.example
└── .node-version             # 22
```

## Theming por restaurante

El tema se controla con variables CSS sobre `<html>`:

- `--brand-bg`, `--brand-text`, `--brand-accent` → colores del restaurante.
- `data-glass="translucido | esmerilado | solido"` → intensidad del glass.

En Fase 1+ estos valores vendrán de la tabla `restaurant_themes` en Supabase,
inyectados por el servidor según el subdominio.

## Scripts

```bash
npm run dev         # desarrollo con Turbopack
npm run build       # build de producción
npm run start       # servir el build (usa PORT si está definida)
npm run lint        # ESLint
npm run typecheck   # TypeScript sin emitir
```
