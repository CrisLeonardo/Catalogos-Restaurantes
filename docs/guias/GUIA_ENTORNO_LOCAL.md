# Guía del entorno LOCAL — Leogin

> Cómo trabajar la plataforma en tu computadora antes de subir nada a producción.
> Escrita el 2026-06-08. Acompaña a `GUIA_DESPLIEGUE.md`.

---

## 1. El modelo mental (lee esto primero)

Tu plataforma son **dos piezas** que corren juntas:

```
┌─────────────────────┐        ┌──────────────────────────────┐
│  La app (Next.js)   │ ─────▶ │  Supabase                    │
│  carpeta plataforma/│  lee y │  (base de datos PostgreSQL + │
│  npm run dev        │ escribe│   login + storage de fotos)  │
└─────────────────────┘        └──────────────────────────────┘
        :3000                          local o en la nube
```

- **La app** siempre corre igual: `npm run dev` (en local) o en Render (en producción).
- **Supabase** es lo que cambia: puede ser una copia **local** (en tu PC, con Docker) o el proyecto **en la nube** (supabase.com).

La app sabe a qué Supabase conectarse por el archivo **`.env.local`** (en local) o por las **variables de entorno** (en Render). Solo cambias esas 3 claves y la misma app apunta a una base u otra.

> **Por eso antes "se sentía que no funcionaba":** sin `.env.local` con claves de Supabase, la app solo muestra la **demo** de un restaurante (Café Demo) y los paneles `/admin` y `/super` te mandan a la portada. No es que falte código: faltaba conectar la base de datos. Eso ya está resuelto en local.

---

## 2. ¿Necesito Docker? — Tu duda resuelta

**No es obligatorio.** Hay dos formas de tener Supabase para desarrollar. Las dos son válidas:

| | **A) Supabase en la nube** | **B) Supabase local (Docker)** |
|---|---|---|
| Qué es | Un proyecto gratis en supabase.com | Una copia completa de Supabase corriendo en tu PC dentro de Docker |
| Necesita Docker | No | Sí (ya lo tienes instalado y corriendo) |
| Internet | Sí | No (trabajas offline) |
| Riesgo | Si te equivocas, tocas la base "real" | Aislado: puedes borrar y recrear sin miedo |
| Velocidad | Depende de tu internet | Instantáneo |
| Ideal para | Empezar rápido / producción | Desarrollar y experimentar sin romper nada |

**Lo que recomiendo (y lo que ya dejé montado):**

- **Para desarrollar → B) Supabase local con Docker.** Pruebas, te equivocas, reinicias, y nunca tocas los datos reales de tus clientes.
- **Para producción → A) Supabase en la nube** (tu proyecto ya creado). Ahí viven los datos reales. Ver `GUIA_DESPLIEGUE.md`.

Docker es solo el "motor" que levanta esa copia local de Supabase. No programas en Docker; solo lo enciendes para tener la base de datos local.

---

## 3. Lo que YA dejé funcionando en tu PC

Ya hice todo esto por ti (no tienes que repetirlo, solo entenderlo):

1. Instalé el CLI de Supabase y lo inicialicé (`supabase/config.toml`).
2. Levanté Supabase local con Docker (`npx supabase start`).
3. Apliqué las **6 migraciones** (creó las 7 tablas + 31 políticas de seguridad RLS + el restaurante demo).
4. Creé el archivo **`.env.local`** apuntando a ese Supabase local.
5. Creé un **Super Admin** de prueba y un **Dueño** de prueba.
6. Probé el flujo completo en el navegador (funciona).

### Credenciales de prueba (solo local)

| Rol | Email | Contraseña | Entra en |
|-----|-------|-----------|----------|
| **Super Admin** (tú) | `admin@local.test` | `Admin12345` | http://localhost:3000/login → `/super` |
| **Dueño** (restaurante demo) | `dueno@azucarnegra.test` | `Dueno12345` | http://localhost:3000/login → `/admin` |

> Estas credenciales **solo existen en tu Supabase local**. No sirven en producción.

### Entrar sin escribir la contraseña

Con `DEV_LOGIN=1` en tu `.env.local` (ya viene puesto) puedes abrir sesión de
un tirón, sin pasar por el formulario:

| Quieres | Abre |
|---------|------|
| El panel del dueño | http://localhost:3000/api/dev-login |
| Directo a una pantalla | http://localhost:3000/api/dev-login?next=/admin/caja |
| Otro usuario | http://localhost:3000/api/dev-login?email=admin@local.test&next=/super |

Abre una sesión **real** de Supabase por el mismo camino que el login por PIN
(`generateLink` + `verifyOtp`): no hay contraseñas de por medio en ningún
momento.

> **Por qué es seguro dejarlo puesto.** La ruta exige DOS candados a la vez: la
> bandera `DEV_LOGIN=1` (que no es `NEXT_PUBLIC_`, así que no viaja al
> navegador) **y** que `NEXT_PUBLIC_SUPABASE_URL` apunte a `127.0.0.1` o
> `localhost`. Con cualquiera de los dos cerrado responde 404. El segundo es el
> que de verdad importa: aunque la bandera se colara en un despliegue real, ahí
> el Supabase es el de la nube y la ruta se niega igual. Una bandera se
> enciende por error; un host no.

---

## 4. Tu rutina diaria de trabajo

Cada vez que te sientes a trabajar:

```powershell
# 1) Asegúrate de que Docker Desktop esté abierto (ícono de la ballena).

# 2) Enciende Supabase local (si no está ya encendido)
cd "C:\Users\minec\Documents\Catalogos Restaurantes\plataforma"
npx supabase start

# 3) Enciende la app
npm run dev
```

Abre **http://localhost:3000** y ya estás trabajando.

> ⚠️ **Nota sobre `node`/`npm`:** en tu PC `node` está en `C:\Program Files\nodejs\` pero a veces no está en el PATH de la terminal. Si `npm` "no se reconoce", abre la terminal así primero:
> ```powershell
> $env:Path = "C:\Program Files\nodejs;" + $env:Path
> ```
> (o reinstala Node marcando "Add to PATH", o usa la terminal integrada de VS Code que sí lo toma).

### Para terminar

```powershell
# Apaga la app: Ctrl + C en la terminal donde corre npm run dev

# Apaga Supabase local (opcional; libera RAM/Docker)
npx supabase stop
```

`supabase stop` **no borra tus datos**: la próxima vez que hagas `supabase start` siguen ahí.

---

## 5. Comandos útiles de Supabase local

```powershell
cd "C:\Users\minec\Documents\Catalogos Restaurantes\plataforma"

npx supabase status     # ver URLs y claves locales
npx supabase start      # encender
npx supabase stop       # apagar (conserva datos)
npx supabase db reset   # ⚠️ BORRA y recrea la base desde las migraciones (vuelve a 0)
```

### Studio: ver tu base de datos con el mouse

Con Supabase local encendido, abre **http://localhost:54323** — es el "panel de Supabase" pero local. Ahí puedes ver tablas, usuarios, correr SQL, etc. Igual que el dashboard de la nube, pero en tu PC.

### URLs del Supabase local

| Servicio | URL |
|----------|-----|
| API (la que usa la app) | http://127.0.0.1:54321 |
| Studio (panel visual) | http://127.0.0.1:54323 |
| Base de datos directa | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Mailpit (correos de prueba) | http://127.0.0.1:54324 |

---

## 6. Probar subdominios en local (multi-tenant)

Cada restaurante vive en su subdominio. En local Chrome resuelve `*.localhost` automáticamente:

- **http://localhost:3000** → portada **demo** (sin restaurante real).
- **http://cafe-demo.localhost:3000** → el menú **real** del restaurante `cafe-demo` leído de la base.
- **http://cafe-demo.localhost:3000/login** → ahí entraría el dueño de ese restaurante.

Si creas otro restaurante con slug `tacos-pepe`, lo verás en `http://tacos-pepe.localhost:3000`.

---

## 7. Crear más usuarios de prueba

Para crear otro Super Admin (o recrearlo) usa el script que dejé:

```powershell
cd "C:\Users\minec\Documents\Catalogos Restaurantes\plataforma"
node scripts/crear-super-admin.mjs tucorreo@ejemplo.com TuContraseña123
```

Lee las claves de `.env.local` automáticamente. Es **idempotente**: si el correo ya existe, solo le asegura el rol Super Admin.

Para crear **dueños de restaurante** NO necesitas script: entra como Super Admin → abre el restaurante → sección **"Acceso del restaurante"** → "Crear un acceso nuevo".

---

## 8. Si algo falla (troubleshooting)

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `npm no se reconoce` | Node no está en el PATH de esa terminal | `$env:Path = "C:\Program Files\nodejs;" + $env:Path` |
| `npm.ps1 ... la ejecución de scripts está deshabilitada` | PowerShell con ExecutionPolicy `Restricted` | Una vez: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` (di `S`). O usa `npm.cmd run dev` sin cambiar nada |
| `supabase start` se queda colgado o falla | Docker Desktop no está abierto | Abre Docker Desktop y espera a que diga "running" |
| `port 54321 already in use` | Ya estaba encendido | Usa `npx supabase status`; si no, `npx supabase stop` y vuelve a `start` |
| La app muestra solo la demo | Falta o está mal `.env.local` | Revisa que `.env.local` tenga las 3 claves y reinicia `npm run dev` |
| `/admin` o `/super` me mandan a la portada | No hay sesión o Supabase no responde | Verifica que Supabase local esté encendido y vuelve a hacer login |
| Cambié una migración y no se refleja | Las migraciones ya aplicadas no se re-corren solas | `npx supabase db reset` (¡borra datos locales!) |

---

## 9. Resumen de una línea

> **Docker enciende un Supabase de juguete en tu PC; `.env.local` conecta la app a él; `npm run dev` levanta la app. Rompes lo que quieras en local; producción ni se entera.**

Cuando estés listo para que el mundo lo vea → `GUIA_DESPLIEGUE.md`.
