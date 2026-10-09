# 05 — Guía de Despliegue y CI/CD

---

## Entornos

| Entorno | Stack | Puerto | URL |
|---------|-------|--------|-----|
| **Local (Docker)** | docker-compose | 8000 | `http://localhost:8000` |
| **Local (sin Docker)** | uvicorn directo | 8000 | `http://localhost:8000` |
| **Producción** | Render + Supabase + Upstash | 10000 | `https://tu-app.onrender.com` |

---

## Variables de entorno

### `.env` (raíz del proyecto — solo para Docker Compose)

```env
POSTGRES_PASSWORD=una-contraseña-fuerte
```

### `backend/.env` (para el backend — nunca subir a Git)

```env
# ── Obligatorio ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql+asyncpg://distleogin:PASSWORD@db:5432/distleogin
JWT_SECRET_KEY=genera-con: python -c "import secrets; print(secrets.token_urlsafe(32))"
ENVIRONMENT=development   # development | production
DEBUG=true                # false en producción (obligatorio)

# ── Pool de conexiones (opcional, ajustar según hosting) ─────────────────────
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=5

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440   # 24 horas

# ── CORS ──────────────────────────────────────────────────────────────────────
# En producción, poner solo el dominio real
ALLOWED_ORIGINS=["https://mi-dominio.com"]

# ── Email (SendGrid — recomendado para producción) ───────────────────────────
SENDGRID_API_KEY=SG.xxx
SMTP_FROM_EMAIL=distleogin@gmail.com
SMTP_FROM_NAME=DistLEOGIN

# ── WhatsApp / Twilio ─────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_WEBHOOK_TOKEN=token-secreto-para-validar-twilio

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0   # local Docker
# REDIS_URL=rediss://default:PWD@host.upstash.io:6379   # Upstash producción

# ── Web Push VAPID ────────────────────────────────────────────────────────────
# Generar: pip install pywebpush && vapid --gen
VAPID_PUBLIC_KEY=BFxxxx
VAPID_PRIVATE_KEY=xxxx
VAPID_SUBJECT=mailto:tu@email.com

# ── Storage ───────────────────────────────────────────────────────────────────
STORAGE_BACKEND=local
STORAGE_LOCAL_PATH=./storage/pdfs
```

### Variables de entorno en producción (Render)

En Render estas variables se configuran en el Dashboard bajo "Environment Variables".
Las mismas claves, pero con valores reales de producción:

```
DATABASE_URL     → URL de Supabase (Session Pooler, puerto 5432)
JWT_SECRET_KEY   → clave de 32+ chars generada aleatoriamente
ENVIRONMENT      → production
DEBUG            → false
REDIS_URL        → URL de Upstash (rediss://)
SENDGRID_API_KEY → clave de SendGrid
```

---

## Desarrollo local con Docker

```bash
# Primera vez en una PC nueva
git clone https://github.com/CrisLeonardo/DistLEOGIN.git DistLEOGINRestaurantes
cd DistLEOGINRestaurantes

# Crear archivos de configuración
echo "POSTGRES_PASSWORD=local_dev_password" > .env
cp backend/.env.example backend/.env
# Editar backend/.env con tus valores

# Levantar todo (construye imagen la primera vez, ~3 min)
docker compose up --build

# Acceder
# http://localhost:8000/       → cliente restaurante
# http://localhost:8000/admin/ → panel admin
# http://localhost:8000/docs   → Swagger UI

# Credenciales de prueba (seed_data.sql)
# admin@distleogin.com / Admin2026!
# fogon@distleogin.com  / Fogon2026!
```

**Comandos habituales:**

```bash
docker compose up                    # levantar (sin rebuild)
docker compose up --build            # rebuild al cambiar requirements.txt o Dockerfile
docker compose down                  # parar y eliminar contenedores
docker compose logs -f backend       # ver logs en tiempo real
docker exec -it distleogin_backend bash   # entrar al contenedor
```

---

## Desarrollo sin Docker (solo backend)

```bash
cd backend
pip install -r requirements.txt

# Windows
start-dev.bat

# Linux / Mac
bash start-dev.sh

# Ambos scripts hacen:
# 1. python -m app.db_migrate   → aplica migraciones pendientes
# 2. uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Requisito:** tener PostgreSQL y Redis corriendo localmente (o usar Docker solo para esos servicios).

---

## Despliegue en producción (stack gratuito)

### Arquitectura en la nube

```
GitHub (código)
    │
    │ push → trigger automático
    ▼
Render (backend FastAPI, Docker)
    ├── sirve /api/*         (REST API)
    ├── sirve /              (cliente PWA)
    └── sirve /admin/        (panel admin)
         │
         ├──► Supabase (PostgreSQL 15 gestionado)
         ├──► Upstash  (Redis gestionado)
         ├──► SendGrid (emails transaccionales)
         └──► Twilio   (WhatsApp / SMS)
```

### Paso a paso

**1. Supabase (base de datos)**
```
1. supabase.com → New project
2. SQL Editor → ejecutar 001_initial_schema.sql
3. SQL Editor → ejecutar supabase_seed_completo.sql
4. Settings → Database → Connect → Session Pooler → copiar URI
5. Cambiar postgresql:// por postgresql+asyncpg://
```

**2. Upstash (Redis)**
```
1. upstash.com → Create Database → Regional
2. Copiar Redis URL (formato: rediss://default:PWD@host:6379)
```

**3. Render (backend)**
```
1. render.com → New Web Service → Connect GitHub repo
2. Runtime: Docker  (detecta el Dockerfile automáticamente)
3. Instance Type: Free
4. Environment Variables: añadir todas las del listado anterior
5. Create Web Service → esperar ~5-10 min para el primer build
```

**4. Actualizar API_URL en el frontend**
```javascript
// En frontend/client/app.js y frontend/admin/app.js
// Cambiar:
const API_URL = 'http://localhost:8000';
// Por:
const API_URL = 'https://tu-app.onrender.com';
```

### Mantener activo el servidor gratuito de Render

El tier gratuito duerme tras 15 min de inactividad. Usar UptimeRobot (gratis):
```
1. uptimerobot.com → Add Monitor → HTTP(s)
2. URL: https://tu-app.onrender.com/api/health
3. Intervalo: 5 minutos
```

---

## CI/CD — Flujo automático

```
Desarrollador hace git push
        │
        ▼
GitHub recibe el push
        │
        ▼ (webhook automático de Render)
Render inicia nuevo build
        │
        │  1. docker build . (multi-stage)
        │  2. Instala requirements.txt
        │  3. Copia backend/ y frontend/ en la imagen
        │  4. CMD: python -m app.db_migrate && uvicorn ...
        ▼
Render despliega la nueva imagen (~5-10 min)
        │
        ▼
La URL sigue siendo la misma, el deploy es sin downtime
```

**No hay pipeline CI configurado** (tests, linting). Para añadirlo:

```yaml
# .github/workflows/ci.yml (ejemplo para añadir)
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: test }
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r backend/requirements.txt
      - run: cd backend && pytest -v
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:test@localhost/postgres
          JWT_SECRET_KEY: test-key-32-characters-minimum!!
          ENVIRONMENT: development
          DEBUG: "true"
          REDIS_URL: redis://localhost:6379/0
```

---

## Tailwind CSS — compilar antes de desplegar

Si se modifican los archivos `*.input.css`:

```bash
cd frontend
npm install

# Compilar el CSS del cliente
npx tailwindcss -i client/tailwind.input.css -o client/tailwind.css

# Compilar el CSS del admin
npx tailwindcss -i admin/tailwind.input.css -o admin/tailwind.css

# Modo watch durante desarrollo
npx tailwindcss -i client/tailwind.input.css -o client/tailwind.css --watch
```

Los archivos `tailwind.css` compilados **sí van a Git** para que Render no necesite
Node.js en el proceso de build.

---

## Checklist antes de cada despliegue

```
[ ] Se actualizó VERSION en frontend/client/sw.js  (formato: distleogin-YYYY-MM-DD)
[ ] Se compiló Tailwind si se modificaron .input.css
[ ] Las variables de entorno de producción están actualizadas en Render
[ ] No hay credenciales en el código (verificar con git diff)
[ ] Los tests pasan: cd backend && pytest -v
[ ] backend/.env NO se incluyó en el commit (verificar con git status)
```
