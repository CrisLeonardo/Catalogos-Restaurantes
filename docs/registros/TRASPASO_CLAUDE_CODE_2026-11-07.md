# Traspaso a Claude Code · 2026-11-07

## Punto de partida

El usuario cambia de Codex a Claude Code por su límite de uso. Este archivo permite continuar la auditoría del **3 de noviembre de 2026** con las decisiones ya tomadas. El traspaso sólo agrega documentación y preparación local; **no empieza la ficha 1.7**.

- Proyecto: `C:\Users\minec\Documents\Catalogos-Restaurantes`.
- Repositorio: `github.com/CrisLeonardo/Catalogos-Restaurantes`.
- Rama de partida: `codex/navegacion-capsula`.
- Último commit funcional: **`0f523f487248634ce2b2ae84eea4a48788d5cbfe`**. El commit posterior de traspaso sólo cambia documentación.
- [PR #101](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/101), base `feat/pedidos-en-vivo`, abierto. [CI funcional correcto](https://github.com/CrisLeonardo/Catalogos-Restaurantes/actions/runs/42372797087): **1,353 unitarias, una omisión previa, 90 pruebas de Postgres y 19 E2E**.
- Los cambios funcionales están comprometidos y subidos. Las skills, sus adaptadores y las referencias locales se conservan aparte del código versionado.
- Siguiente ficha: **1.7 · Permisos por trabajo**. Quedan **seis fichas de implementación de Ola 1**; esto no equivale a seis fichas para terminar toda la auditoría.

## Lecturas para continuar

1. [`CLAUDE.md`](../../CLAUDE.md), [`plataforma/CLAUDE.md`](../../plataforma/CLAUDE.md) y [`plataforma/AGENTS.md`](../../plataforma/AGENTS.md). Next.js **16.4.3** exige leer la guía relevante de `plataforma/node_modules/next/dist/docs/` antes de escribir código.
2. [Plan completo](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md): método, decisiones, fichas, tablero e índice inverso de hallazgos. Su tablero es más reciente que algunas tablas iniciales del registro.
3. [Registro de ejecución](ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md), especialmente §§18–27. Sus primeras secciones incluyen instrucciones históricas; prioriza este traspaso y el estado comprobado con GitHub.
4. [Auditoría integral](../auditorias/AUDITORIA_INTEGRAL_2026-11-03.md), [por apartado](../auditorias/AUDITORIA_POR_APARTADO_2026-11-03.md) e [inicial](../auditorias/AUDITORIA_INICIAL_2026-11-02.md), según los IDs de la ficha.
5. [Sistema visual vigente](../diseno/SISTEMA_VISUAL_2026-11-05.md), implementación actual y referencias aprobadas descritas más abajo.

## Forma de trabajar acordada

- Español claro. Avanzar ficha por ficha y cerrar cada una con evidencia, documentación, commit, push y PR. El usuario ha autorizado continuar con los pendientes; no volver a solicitar confirmación para pasos rutinarios ya autorizados.
- Antes de cambiar una parte visual nueva: revisar el resultado real, contrastar la auditoría y presentar una maqueta para aprobación. La navegación de #101 y las vistas ya implementadas tienen su aprobación; conservarlas.
- Reproducir los fallos antes de corregirlos. Para CI, GitHub es la fuente principal: `gh pr view/checks`, `gh run view`, anotaciones y logs; incluir siempre `--repo github.com/CrisLeonardo/Catalogos-Restaurantes`.
- Verificación proporcional: tipos, lint, pruebas pertinentes, transacciones/concurrencia reales cuando corresponda y revisión visual en móvil/tablet/escritorio. Las pruebas automáticas no sustituyen pruebas de uso con personas o con el equipo físico del local.
- Crear datos de prueba identificables y eliminarlos al terminar. Probar contra Supabase local; conservar `.env.local` y las claves fuera de Git y de los reportes.
- **No fusionar PR, no desplegar, no etiquetar versiones y no modificar producción sin petición explícita.** El usuario decidió terminar primero la Ola 1. Preparar un PR no autoriza fusionarlo.
- No usar `reset --hard`, force-push, borrar trabajo ajeno ni reiniciar la base local para resolver un problema de entorno.
- Las migraciones ya aplicadas se conservan; agregar una nueva y documentar su orden respecto al código. Revisar número libre y RLS/MFA, además de la lógica de negocio.

## Estado y cadena de PR

Ola 0 implementada en ramas. Ola 1 tiene **1.0–1.6 implementadas** y el complemento de navegación terminado. Integración, despliegue y validaciones de campo siguen siendo trabajo separado.

| Ficha | PR | Rama | Base del PR |
|---|---|---|---|
| 0.19 · límite del día de Caja | [#90](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/90) | `fix/limite-inicio-dia-caja` | `fix/cobros-en-transito-caja` |
| 1.0 · base visual | [#91](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/91) | `feat/exploracion-sistema-visual` | `fix/limite-inicio-dia-caja` |
| 1.1 · cobro completo | [#92](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/92) | `feat/cobro-completo` | `feat/exploracion-sistema-visual` |
| 1.2 · recibo y borrador de Caja | [#93](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/93) | `feat/caja-borrador-cuadre-recibo` | `feat/cobro-completo` |
| 1.2 · conteo y autoguardado | [#94](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/94) | `feat/caja-conteo-autoguardado` | `feat/caja-borrador-cuadre-recibo` |
| 1.2 · ajuste del botón | [#95](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/95) | `fix/caja-margen-boton` | `feat/caja-conteo-autoguardado` |
| 1.2 · traspaso de turno | [#96](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/96) | `feat/caja-traspaso-turno` | `fix/caja-margen-boton` |
| 1.3 · salón, pago y limpieza | [#97](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/97) | `feat/salon-pagada-limpieza` | `feat/caja-traspaso-turno` |
| 1.4 · Servicio | [#98](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/98) | `feat/servicio-turno-estable` | `feat/salon-pagada-limpieza` |
| 1.5 · Cocina | [#99](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/99) | `feat/cocina-etapas-estaciones` | `feat/servicio-turno-estable` |
| 1.6 · Pedidos en vivo | [#100](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/100) | `feat/pedidos-en-vivo` | `feat/cocina-etapas-estaciones` |
| Complemento · navegación | [#101](https://github.com/CrisLeonardo/Catalogos-Restaurantes/pull/101) | `codex/navegacion-capsula` | `feat/pedidos-en-vivo` |

El CI que fallaba originalmente en #94 **ya está corregido**: se comprobó SUCCESS en `d8fdc7f`, corrida `42177600870`. También se comprobaron los CI correctos de #99 (`552b75b`), #100 (`9ab7dfe`) y #101 (`0f523f4`). No reabrir esos fallos a partir de enlaces viejos sin mirar el último head.

Los PR #71–#89 y otros PR independientes siguen abiertos; ver el registro y `gh pr list`. Algunas correcciones iniciales tienen base `main`, y hay conflictos previstos al integrarlas. No inferir que toda la auditoría ya está fusionada porque el árbol actual contiene su trabajo.

Para 1.7, comprobar árbol limpio y estado remoto antes de crear una rama. Base prevista: `origin/codex/navegacion-capsula`; nombre sugerido: `feat/permisos-por-trabajo`; PR contra `codex/navegacion-capsula`. Si la cadena ya cambió por una fusión posterior, resolver la base con GitHub antes de continuar.

Hay cinco worktrees antiguos de Claude bajo `.claude/worktrees/`, con otras ramas y commits. **Abrir la carpeta principal indicada arriba para este traspaso**, no retomar una tarea vieja suponiendo que contiene esta implementación. Si se crea otro worktree, verificar su base y el acceso a las skills y referencias locales antes de editar. No se modificaron ni eliminaron esos worktrees.

## Siguiente ficha: 1.7 · Permisos por trabajo

IDs: **E12, N18, N19, F14, C05 y R35**. Es una ficha grande con migración. No se ha implementado ni hay un diseño nuevo aprobado para esta ficha.

1. Inventariar capacidades efectivas y sus comprobaciones en UI, Server Actions, rutas, RPC y RLS. Considerar identidad personal, membresía y sucursal activa.
2. Plantillas por trabajo: mesero, cocina, caja, encargado y recepción; revisar también dueño y reparto según R35. Alta con el rol menos privilegiado adecuado, tareas agrupadas y excepciones visibles.
3. Separar **operar Caja** de **ver Finanzas/utilidades**. Distinguir cobrar, abrir, registrar salida, cerrar, ver esperado, corregir y devolver; separar administrar personal de transferir propiedad. Arqueo ciego opcional, no impuesto.
4. Migrar permisos antiguos, incluido `null`, con equivalencia explícita y bitácora. Hoy `can()` interpreta `RESTAURANT_STAFF` con permisos `null` como acceso completo. Evitar pérdida accidental de acceso en un turno o ampliación de privilegios.
5. Vista previa «Así verá el panel» y acciones delicadas visibles. UI y autorización directa deben coincidir.
6. Definir revocación en sesiones activas y operaciones pendientes; conservar último dueño, MFA de superadmin y aislamiento entre restaurantes. No añadir acceso de soporte general; R35 sólo contempla soporte temporal si se decide incorporarlo.
7. Matriz positiva/negativa por rol, acceso directo al servidor, multi-restaurante, revocación y último dueño; pruebas SQL/servidor y UI pertinentes. Documentar lo que requiera validación de campo.

Archivos para empezar, sin asumir que son el inventario completo:

- `plataforma/src/lib/permissions.ts`
- `plataforma/src/lib/membership-roles.ts`, `membership-rules.ts` y sus pruebas
- `plataforma/src/lib/db/membership.ts`
- `plataforma/src/lib/actions/staff.ts`, `staff-pin.ts`, `memberships.ts`
- `plataforma/src/components/admin/staff-panel.tsx`, `admin/shell.tsx`
- `plataforma/src/lib/auth/` y guardas de las acciones de cobro/Caja
- `plataforma/supabase/migrations/`, `supabase/pruebas/` y `tests/e2e/`

Última migración en el árbol: **176**, verificada aplicada en local. **177 es sólo el siguiente candidato**: comprobar ramas/remotos antes de asignarlo. No editar 173–176 para implementar permisos nuevos.

Pendientes posteriores: **1.8 Recepción; 1.9 Catálogo; 1.10 Inventario y agotados; 1.11 Comensal, temas y accesibilidad; 1.12 Entrada, checkout y seguimiento**. Siguen además las olas 2–4, la línea comercial y las validaciones continuas de calidad.

## Decisiones de diseño que se deben conservar

El usuario pide un sistema moderno, práctico, agradable, rápido y fácil de entender. Ha rechazado propuestas genéricas y una primera barra que se parecía poco a su referencia. Las skills no reemplazan contrastar cada detalle con la imagen aprobada y con el uso real.

- Dirección global implementada: **Identidad actual depurada**, con variables de tema existentes. «Hospitalidad precisa» sigue como alternativa en la maqueta comparativa; no se aprobó como reemplazo global.
- Navegación aprobada: cápsula **gris clara**, borde elevado claro, sombra neutra, selección **carbón biselada** e icono junto al texto en horizontal. Ese material se mantiene sobre temas claros y oscuros.
- Comensal: tres destinos `Pedidos / Menú / Cuenta`, o cuatro `Menú / Pedidos / Mis puntos / Cuenta`. Resumen superior sólo con carrito: cantidad, nombre e importe reales y bolsa. Es un botón que abre el carrito. Vitrina mantiene su navegación superior propia.
- Superadmin móvil: `Inicio / Locales / Cuentas / Más`; Más da acceso a Grupos, Métricas, Finanzas y Ajustes. Escritorio mantiene sus siete enlaces laterales.
- **Panel del restaurante: se decidió conservar la barra operativa actual**, opción autorizada por el usuario por su estructura y permisos. No copiar la fila de resumen del comensal a los paneles. «Mi cuenta» tiene pestañas superiores, fuera de este complemento.
- Geometría: barra mínima 64 px, destinos 48 px, ancho máximo 460 px, dock 84 px más área segura; resumen mínimo 44 px. Geist 550 para cápsula, transición de selección 220 ms y movimiento reducido respetado. La hoja Más usa la escala del panel: peso 600 para enlace activo.
- Implementación compartida en `src/components/ui/capsule-navigation.{tsx,module.css}`, `menu/bottom-nav.tsx`, `menu/cart.tsx` y `super/shell.tsx`.
- Revisión independiente de 13 capturas y del ajuste posterior 650→600: `ship`. Detector: `[]`. La prueba `type-scale.test.ts` se conserva; no ampliar su escala para ocultar errores.

Sobre la pregunta anterior del usuario: **sí** se había cambiado la ficha compartida del platillo en 1.0 (`54863d5`, 5 de noviembre), antes de instalar las skills el 6 de noviembre: jerarquía, pie de acción, foco y teclado. No se sustituyeron las ocho estructuras ni las 26 paletas de carta. Una comprobación local de geometría cubrió 208 combinaciones en tres anchos (624 casos); **no es una auditoría completa de accesibilidad ni cierra 1.11/1.12**.

Las pruebas de campo de Servicio/Cocina, lectura a distancia, audio, impresión y pruebas con personas siguen pendientes aunque una ficha tenga implementación terminada.

## Skills y referencias disponibles en esta máquina

Skills originales: `.agents/skills/frontend-design`, `.agents/skills/impeccable` y `.agents/skills/web-design-guidelines`. Hay enlaces de directorio de Windows en **`.claude/skills/`** hacia esos mismos archivos; no son copias distintas. Mantener ambos extremos al seguir en esta máquina.

También se prepararon `.claude/agents/impeccable-finish-reviewer.md` y `impeccable-documenter.md` a partir de las instrucciones de los agentes instalados, con nombres compatibles con Claude Code. Su uso se limita a las revisiones/documentación que solicite el flujo de Impeccable. No se cambiaron permisos, autenticación ni modelos de Claude.

Las skills y referencias locales están excluidas mediante `.git/info/exclude`; **no viajan en el PR ni en un clon nuevo**. En esta máquina se pueden usar sin abrir Codex. El ejecutable `claude` no apareció en el PATH de esta terminal, por lo que no se verificó su carga dentro de una sesión real de Claude; abrir el proyecto en Claude Code y comprobar `/skills` y `/agents`.

Carpeta de referencias preparada para Claude:

`C:\Users\minec\Documents\Catalogos-Restaurantes\.claude\handoff\auditoria-2026-11-07\visual`

Incluye la referencia original, la reconstrucción aprobada, el HTML con su fuente, mediciones, capturas y maquetas previas de salón/Servicio/Cocina. En `revision/` están las capturas finales y el estado activo de Más con peso 600. **La variante de restaurante en la maqueta era exploratoria: no es una orden de implementarla.**

Origen conservado, por si hace falta contrastar:

`C:\Users\minec\.codex\visualizations\2026\11\06\01a1afa2-6041-7d43-b18f-3f0fae13803a`

Para una superficie visual nueva, leer las skills pertinentes; Impeccable carga su contexto una vez por sesión, exige revisión del render y sus handoffs cuando corresponda. Usar su lanzador `.cmd` en PowerShell. No generar PRODUCT/DESIGN globales para reparar un supuesto desfase durante una extensión acotada; el sistema documentado del repo sigue vigente.

Formato contrastado con documentación oficial: [skills de Claude Code](https://code.claude.com/docs/en/skills) y [agentes de proyecto](https://code.claude.com/docs/en/sub-agents).

## Entorno local y comprobaciones

- App: `http://localhost:3000`; carta de prueba: `http://rincon502.localhost:3000/`.
- Panel local de revisión: `http://localhost:3000/api/dev-login?email=auditoria-rincon502%40local.test&next=%2Fpanel%2Frincon502%2Fpedidos`. Sólo funciona con `DEV_LOGIN=1` y Supabase local. No reutilizarlo para omitir MFA de superadmin.
- Supabase local: API **54600**, Postgres **54601**, proyecto Docker **plataforma**. `.env.local` ya está configurado; no copiar sus claves a este documento.
- Al preparar el traspaso estaban activos los ocho contenedores `supabase_*_plataforma` y Next con **`npm run start -- --hostname 127.0.0.1`**, compilación optimizada. El proceso puede terminar al cerrar la aplicación que lo inició: comprobar disponibilidad antes de usarlo.
- Para editar con recarga, detener únicamente el proceso verificado de este proyecto que ocupa 3000 y usar `npm run dev` desde `plataforma/`. Para validar el build, `npm run build` y reiniciar `npm run start -- --hostname 127.0.0.1`; un servidor ya abierto puede seguir sirviendo el build anterior.
- Si Docker está detenido, revisar contenedores y arrancar el proyecto existente; no hacer `db reset` sobre esta base de trabajo. El reset del CI es otro entorno efímero.
- El verificador SQL local confirmó las migraciones hasta **176**, sin filas `NO`, al preparar este traspaso. Su archivo es `plataforma/supabase/verificar_migraciones.sql`.
- Los fixtures efímeros de las pruebas de navegación se eliminaron. No usar los correos `aud-nav-*` como cuentas persistentes.

Comandos desde `plataforma/`, según el alcance de cada cambio:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:dinero
node scripts/audit-security-definer.mjs
node scripts/audit-rls-candados.mjs
npx playwright test
```

Para navegación, las verificaciones específicas están en `tests/e2e/navegacion-super.spec.ts`, `tests/e2e/pedidos.spec.ts` y `src/lib/type-scale.test.ts`. El CI completo usa Next en desarrollo y puede tardar más por la compilación inicial. En el último resultado funcional no hubo fallos ni pruebas intermitentes; había una omisión unitaria previa y un aviso de lint preexistente en `checkout-form.tsx`.

## Prompt listo para iniciar

> Continuamos la auditoría de Leogin del 3 de noviembre en este repositorio. Lee primero CLAUDE.md y docs/registros/TRASPASO_CLAUDE_CODE_2026-11-07.md, verifica la rama y los PR con gh y retoma la ficha 1.7: Permisos por trabajo. Conserva las decisiones y diseños aprobados; usa las skills de diseño cuando corresponda y presenta maqueta antes de cambios visuales nuevos. Trabaja ficha por ficha, con pruebas reales, documentación, commit, push y PR apilado. No fusiones ni despliegues: terminaremos primero la Ola 1. Revisa los archivos y datos disponibles antes de preguntarme; si encuentras una duda de producto que no esté resuelta, hazla concreta.
