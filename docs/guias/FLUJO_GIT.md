# Flujo de trabajo con git

Una página, para no tener que pensarlo cada vez. Aplica a todo el repositorio.

## En una línea

**Nada va directo a `main`.** Cada cambio vive en una rama, se abre un Pull Request, el CI se pone en verde y recién entonces se fusiona. `main` siempre debe poder ir a producción.

> Importante: si Render tiene el auto-deploy activo (revísalo en su panel), **cada fusión a `main` se despliega a producción**. Por eso `main` no es un borrador.

## 1. Ramas

Una rama por cambio, con el formato `tipo/descripcion-corta` en minúsculas y con guiones:

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `feat/` | Funcionalidad nueva | `feat/impresion-por-estacion` |
| `fix/` | Arreglo de un error | `fix/qr-mesa-pwa` |
| `audit/` | Fases de una auditoría | `audit/pulido-2026-10-02` |
| `docs/` | Solo documentación u orden de carpetas | `docs/orden-carpeta` |
| `chore/` | Mantenimiento, dependencias, CI | `chore/actualizar-next` |

Al terminar y fusionar, **borra la rama** (GitHub lo ofrece con un botón). Una rama fusionada no sirve de nada y confunde.

## 2. Commits

Formato: `tipo(ámbito): qué cambió, en presente y sin punto final`

```
fix(caja): el descuento por método de pago ya no se cobra dos veces
feat(servicio): tomar pedidos para llevar sin mesa
docs(planes): cerrar PLAN_ORIGEN_UNICO
```

- **tipo:** `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `audit`.
- **ámbito (opcional):** el módulo: `caja`, `servicio`, `menu`, `super`, `acceso`, `agente`, `desktop`, `ci`, `sql`.
- **Un commit = una idea.** Si el mensaje necesita un «y», probablemente son dos commits.
- **Nada de** `fix`, `cambios`, `mejoras`, `fase 4`, `ppç`. Dentro de seis meses nadie sabrá qué hacían.
- Si el cambio toca una migración, nómbrala en el mensaje: `(migración 141)`.
- Las notas de estado («Tablero: hash del commit…») van **dentro del mismo commit** que el cambio, no en uno aparte.

La plantilla `.gitmessage` te lo recuerda al hacer `git commit` sin `-m`.

## 3. Pull Requests

1. `git switch -c fix/mi-cambio` desde un `main` actualizado (`git pull`).
2. Trabaja y haz commits.
3. `git push -u origin fix/mi-cambio`
4. Abre el PR en GitHub (la plantilla trae la lista de revisión).
5. Espera el CI en verde. Si falla, arregla en la misma rama; no se fusiona en rojo.
6. Fusiona. Usa **Squash and merge** para cambios chicos (un commit limpio en `main`) y **Create a merge commit** para trabajos por fases donde cada commit de la rama cuenta una parte de la historia.
7. Borra la rama.

`main` no se puede proteger con reglas de GitHub porque el repositorio es privado en plan gratuito. Lo compensa el hook `pre-push` de `.githooks/`: **rechaza el push directo a `main`**. Si de verdad necesitas saltártelo (urgencia en producción), hazlo a propósito: `PERMITIR_PUSH_MAIN=1 git push`.

## 4. Migraciones SQL

- Van en `plataforma/supabase/migrations/NNN_nombre.sql`, con número consecutivo (hoy la última es la 140).
- **Una migración que ya corrió en producción no se edita jamás.** Si hay que corregirla, se crea otra.
- Al aplicar una migración en producción, anótalo en el commit o PR y compruébalo con `plataforma/supabase/verificar_migraciones.sql`.
- Un PR con migración se fusiona **solo cuando** ya sabes en qué orden se aplicará en producción respecto al despliegue del código.

## 5. Versiones y etiquetas

- **Plataforma:** versionado `vMAYOR.MENOR.PARCHE` (`v0.10.0`). Mientras no haya lanzamiento comercial se sube el MENOR en cada hito grande (cierre de una auditoría, una funcionalidad por fases) y el PARCHE en arreglos sueltos. El `v1.0.0` será el lanzamiento.
- **Agente de impresión** (`agent-vX.Y.Z`) y **Leogin Desktop** (`desktop-vX.Y.Z`) tienen su propia versión, que sale de sus `package.json`; sus releases se publican con sus workflows.
- Crear una etiqueta, siempre **anotada** y con una línea que diga qué es:

```bash
git tag -a v0.11.0 -m "Resumen del hito" <commit>
git push origin v0.11.0
```

- Cada hito se anota en [`CHANGELOG.md`](../../CHANGELOG.md) en el mismo PR que lo cierra.
- Para saber qué hay en producción, usa la etiqueta de despliegue `prod-AAAA-MM-DD` sobre el commit desplegado:
  `git tag -a prod-2026-10-09 -m "Despliegue a producción" <commit>`.

## 6. Reglas que no se rompen

- No hacer `git push --force` a `main` ni a ramas con PR abierto de otra persona.
- No subir `.env*`, claves, volcados de base de datos, consultas guardadas del Studio ni capturas con datos reales.
- Antes de empezar algo nuevo: `git switch main && git pull`.
- Si algo se rompió en producción y no sabes por qué: `git log --oneline -20` y revierte con `git revert <commit>`, no con `reset`.

## 7. Configuración única después de clonar

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
```
