# Reglas de trabajo del repositorio

Estas reglas aplican a todo el repo. El detalle y los ejemplos están en [`docs/guias/FLUJO_GIT.md`](docs/guias/FLUJO_GIT.md); el índice de documentación en [`docs/README.md`](docs/README.md). Las instrucciones específicas de la app están en [`plataforma/CLAUDE.md`](plataforma/CLAUDE.md).

Responde y escribe documentación en **español**.

## Git: nada directo a `main`

1. Antes de tocar archivos: `git switch main && git pull`, y crea una rama `tipo/descripcion-corta` (`feat/`, `fix/`, `audit/`, `docs/`, `chore/`).
2. **Nunca** hagas commit ni push a `main`. El hook `.githooks/pre-push` lo rechaza; **no uses `PERMITIR_PUSH_MAIN=1`** salvo que el usuario diga explícitamente que es una emergencia.
3. Commits con el formato `tipo(ámbito): qué cambió` en presente y sin punto final. Un commit = una idea. Prohibidos los mensajes vagos (`fix`, `mejoras`, `cambios`, `fase 4`). Si toca SQL, nombra la migración.
4. La nota de estado de un plan o tablero va **en el mismo commit** que el cambio, no en un commit aparte.
5. Al terminar: `git push -u origin <rama>` y abre un Pull Request (`gh pr create`) con la plantilla de `.github/pull_request_template.md`.
6. Después de abrir el PR, usa las herramientas `ccd_pr` (`get_status`, `bind_pr`) para ver el CI. No hagas polling del CI.
7. **No fusiones un PR sin que el usuario lo pida**, y solo con el CI en verde. Al fusionar, borra la rama (remota y local).
8. No hagas `git push --force`, `reset --hard` ni borres ramas, etiquetas o worktrees sin comprobar antes que no hay trabajo sin guardar. Si hay cambios sin commitear, respáldalos como parche antes de retirar nada.
9. Para volver a `main` después de fusionar: `git switch main && git pull`. Si algo sale mal en producción, `git revert`, no `reset`.

## Dónde va cada archivo

- **Nada de documentos sueltos en la raíz.** Solo `README.md`, `CHANGELOG.md`, `CLAUDE.md` y los archivos de configuración del repo.
- Documentos nuevos en `docs/<tipo>/`: `guias/`, `planes/`, `registros/`, `auditorias/`, `negocio/`, `diseno/`. Nombres sin espacios ni acentos: `PLAN_TEMA_AAAA-MM-DD.md`, `AUDITORIA_TEMA_AAAA-MM-DD.md`, `GUIA_TEMA.md`.
- Documentos técnicos pegados al código: `plataforma/docs/`.
- Al terminar un plan: márcalo, anota el commit de cierre y muévelo con `git mv` a `docs/archivo/planes-cerrados/`. Lo pendiente pasa a `docs/registros/CHECKLIST_CORRECCIONES.md`.
- Para mover o renombrar usa siempre `git mv` (conserva el historial). Si cambias una ruta de documento, corrige los enlaces que apuntaban a ella.
- **No subas** `.env*`, claves, volcados de BD, `supabase/snippets/`, capturas con datos reales ni archivos de prueba (`sync-test.txt`, `dev-server.log`).

## Migraciones SQL

- En `plataforma/supabase/migrations/NNN_nombre.sql`, con número consecutivo (la última hoy es la 141).
- **Una migración ya aplicada en producción no se edita nunca**; se crea otra.
- Comprueba lo aplicado con `plataforma/supabase/verificar_migraciones.sql`. Un PR con migración debe decir en qué orden se aplica respecto al despliegue del código.

## Versiones

- Al cerrar un hito (auditoría, funcionalidad por fases) actualiza `CHANGELOG.md` en el mismo PR y propón al usuario la etiqueta `vMAYOR.MENOR.PARCHE` (anotada: `git tag -a`). No etiquetes ni publiques sin que el usuario lo confirme.
- Agente de impresión y Leogin Desktop llevan versión propia (`agent-vX.Y.Z`, `desktop-vX.Y.Z`).
- Para marcar lo desplegado: `prod-AAAA-MM-DD` sobre el commit en producción.
