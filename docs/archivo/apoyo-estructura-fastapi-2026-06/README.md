# DistLEOGIN — Documentación Técnica

Plataforma B2B para distribución de alimentos a restaurantes en Guatemala.  
**Stack:** FastAPI · PostgreSQL 15 · SQLAlchemy 2.0 async · Redis · HTML/CSS/JS Vanilla · Docker

---

## Índice

| # | Archivo | Contenido |
|---|---------|-----------|
| 1 | [01_ARQUITECTURA.md](01_ARQUITECTURA.md) | Cómo interactúan todos los componentes del sistema |
| 2 | [02_ESTRUCTURA_ARCHIVOS.md](02_ESTRUCTURA_ARCHIVOS.md) | Árbol de directorios comentado con buenas prácticas |
| 3 | [03_FLUJO_DE_DATOS.md](03_FLUJO_DE_DATOS.md) | Ciclo completo de un dato: del clic al commit en BD |
| 4 | [04_COMPONENTES_REUTILIZABLES.md](04_COMPONENTES_REUTILIZABLES.md) | Módulos copiables para otros proyectos |
| 5 | [05_DESPLIEGUE_CI_CD.md](05_DESPLIEGUE_CI_CD.md) | Variables de entorno, Docker, Render, CI/CD |
| 6 | [06_BASE_DE_DATOS.md](06_BASE_DE_DATOS.md) | Schema, patrones y decisiones de diseño |
| 7 | [07_SEGURIDAD.md](07_SEGURIDAD.md) | JWT, RBAC, XSS, CSP, rate limiting |

---

## Acceso rápido

```
# Desarrollo local
docker compose up --build
# → http://localhost:8000/         cliente PWA
# → http://localhost:8000/admin/   panel administrador
# → http://localhost:8000/docs     Swagger UI

# Tests
cd backend && pytest -v

# Credenciales locales (seed)
admin@distleogin.com  /  Admin2026!
fogon@distleogin.com  /  Fogon2026!
```

> Repositorio GitHub: https://github.com/CrisLeonardo/DistLEOGIN
