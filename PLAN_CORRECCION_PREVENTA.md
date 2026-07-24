# PLAN — Corrección Pre-Venta (ejecución por fases)

> **Origen:** auditoría de negocio/GTM hecha fuera de este repo (Cowork, 2026-07-24) sobre el estado completo del proyecto: código, seguridad, estado de producción, precios y material de venta. No es una auditoría técnica más — es la que revisa si el sistema está listo para que Leonardo empiece a vender puerta a puerta en El Progreso, Jutiapa.
>
> **Este archivo es la fuente de verdad compartida entre sesiones**, igual que `PLAN_AUDITORIA_LANZAMIENTO.md`: cada fase se trabaja en una sesión propia, verificada de punta a punta antes de pasar a la siguiente. Se marca aquí lo que se completa (con fecha y evidencia) para que la siguiente sesión tenga contexto sin releer todo el hilo original.

## Regla que gobierna todas las fases

**Congelamiento de producto: ninguna función nueva hasta tener el primer cliente piloto pagando.** Este plan es de corrección y blindaje, no de features. Si durante cualquier fase surge una idea nueva de producto, se anota al final en "Backlog post-piloto" y no se construye ahora. El objetivo de las 4 fases es que Leonardo pueda tocar la puerta del primer restaurante sin que el sistema, los precios o la seguridad le fallen a media reunión.

## Cómo usar este documento

- `[ ]` = pendiente · `[x]` = hecho (con fecha y una línea de evidencia).
- **Una fase = una sesión.** No mezclar fases salvo que el resto sea trivial.
- Antes de cerrar una fase: correr `npx tsc --noEmit`, correr `node scripts/test-aislamiento.mjs` (debe dar 0 fugas), y si el cambio es visible en la app, verificarlo en navegador.
- Los ítems marcados **"requiere tu acceso"** son cosas que la sesión de Code no puede verificar ni aplicar (no hay credenciales de producción) — quedan documentadas con instrucciones exactas para que Leonardo las resuelva y la siguiente sesión las marque `[x]`.
- Al cerrar cada fase, agregar una entrada a la **Bitácora** al final de este archivo (qué se hizo, qué se verificó, qué quedó pendiente). No borrar entradas anteriores.

---

## Fase 0 — Red de seguridad primero (bloqueante)

**Por qué va primero:** el 22 de julio se encontró que 38 de 43 funciones `security definer` eran ejecutables por cualquiera con la clave `anon`, saltándose la aplicación por completo. Se corrigió, pero se encontró por accidente, no por proceso — y el único script de aislamiento (`test-aislamiento.mjs`) estuvo roto y sin que nadie lo notara antes de esa misma sesión. Antes de tocar precios o contenido de venta, hay que asegurar que un hueco así no pueda volver a pasar desapercibido.

- [ ] **1. Auditoría de regresión de `security definer`.** Recorrer `pg_proc` en el schema `public` (contra Supabase local) buscando `prosecdef = true`, y confirmar que ninguna función creada después de la migración 084 quedó con `execute` sin revocar para `anon`/`authenticated`. Si aparece alguna, aplicar el mismo patrón de la 084 (restringir a `service_role`, o documentar por qué debe quedar pública, como se hizo con `get_group_branches`).
- [ ] **2. Convertir esa auditoría en script reutilizable** (`scripts/audit-security-definer.mjs` o similar) que se pueda correr en cualquier momento, no solo hoy.
- [ ] **3. CI real para `plataforma`.** Crear `.github/workflows/ci.yml` que en cada push/PR corra `npm run typecheck`, `npm run lint`, y `node scripts/test-aislamiento.mjs`. Hoy `.github/workflows/` solo tiene `release-desktop.yml` — la plataforma web no tiene ningún pipeline automático. Si correr Supabase local dentro de GitHub Actions no es viable en esta sesión, documentar exactamente qué falta (secretos, servicios) para que la siguiente sesión lo cierre.
- [ ] **4. Al menos un test automatizado real con Playwright** (ya está instalado como devDependency, hoy cero archivos `.test.`/`.spec.` en `src`). Cobertura mínima: crear pedido, anular pedido, e intento de acceso cross-tenant que debe fallar.
- [ ] **5. Runbook único de producción — requiere tu acceso.** Consolidar en un solo bloque copiable la verificación de las 15 migraciones pendientes (074-088), la variable `NEXT_PUBLIC_ROOT_DOMAIN` en Render, y la publicación `supabase_realtime` de `orders`/`waiter_calls` en Supabase de producción. Ya existe la mayor parte de este SQL en `PLAN_AUDITORIA_LANZAMIENTO.md` — reunirlo en un solo lugar de un solo uso. Code no puede correrlo (no hay credenciales de prod); Leonardo lo pega en el SQL Editor y reporta el resultado en la siguiente sesión.
- [ ] **Cierre de fase:** `tsc --noEmit` limpio, `test-aislamiento.mjs` en verde, CI corriendo en un PR de prueba real. Documentar en Bitácora.

---

## Fase 1 — Una sola verdad de precios

**Por qué:** hoy existen tres cifras distintas para lo mismo. `plans.ts` (código, fuente de verdad declarada) dice Básico Q0 / Estándar Q299 / Premium Q599 / Pro Q999 (pausado). `Leogin_Planes_y_Precios_2026.docx` (12 de julio) dice Q149 / Q399 / Q749 / Q999. `Cotizador.xlsx` (15 de junio) todavía cobra Q1,000 + Q250 de setup para Premium — precio que ya estaba obsoleto en julio y nunca se corrigió. Si Leonardo se sienta con un restaurante usando cualquiera de esos dos archivos, cotiza mal su propio producto.

- [ ] **1. Confirmar valores vigentes en `plans.ts`** (planes y los 9 módulos de `ADDON_MODULES`) y listarlos en la entrada de Bitácora de esta fase como referencia exacta, con fecha.
- [ ] **2. Actualizar `Cotizador.xlsx`** con los precios reales del plan correspondiente y sus setup fees. Agregar también un segundo escenario de ROI para un restaurante que **no** usa hoy apps de delivery (PedidosYa/Uber Eats) — el escenario actual asume Q32,400/mes en delivery con 25% de comisión, que es un perfil de restaurante urbano, no el comedor típico de un municipio agrícola como El Progreso.
- [ ] **3. Actualizar `Leogin_Planes_y_Precios_2026.docx`** para que coincida con `plans.ts`, o agregar una nota visible de "vigente desde [fecha]" si Leonardo prefiere no reescribirlo entero todavía.
- [ ] **4. Crear `PRECIOS_VIGENTES.md`** de una sola página: tabla final de planes + módulos + setup fees, fechada, pensada como referencia rápida de un vistazo antes de una demo — no reemplaza `plans.ts` como fuente de código, es la referencia humana.
- [ ] **Cierre de fase:** confirmar a mano que `Cotizador.xlsx`, el docx y `PRECIOS_VIGENTES.md` muestran exactamente las mismas cifras que `plans.ts`. Documentar en Bitácora.

---

## Fase 2 — Caja de herramientas de venta

**Por qué:** existe una tarjeta de presentación (`tarjeta-leogin.html`) pero no hay guión de demo, manejo de objeciones más allá de FEL, ni forma de dar seguimiento a los restaurantes visitados. Esto es contenido, no producto — no debe tocar código de la plataforma.

- [ ] **1. Guión de demo de 90 segundos** en lenguaje llano, pensado para mostrarse en el celular del dueño del restaurante — sin jerga técnica ("RLS", "multi-tenant", etc.).
- [ ] **2. Documento de manejo de objeciones**, sumado al que ya existe de FEL/cobro manual: wifi inestable, desconfianza de dejar datos en la nube, meseros que no son digitales, qué pasa con la información del restaurante si Leogin deja de operar.
- [ ] **3. Plantilla de seguimiento de prospectos** (un `.xlsx` o `.md` simple, sin backend): restaurante, contacto, fecha de visita, qué usa hoy, objeción principal, próximo paso.
- [ ] **4. Redactar 2-3 alternativas de oferta de piloto** (ej. primer mes gratis a cambio de testimonio, Q0 de alta para los primeros clientes) para que Leonardo elija una — no decidir por él.
- [ ] **Cierre de fase:** los cuatro documentos existen, están en español simple, ninguno asume que el prospecto entiende cómo funciona el software por dentro. Documentar en Bitácora.

---

## Fase 3 — Cierre (checklist, no necesariamente una sesión de código)

- [ ] Confirmar Fases 0-2 cerradas y verificadas.
- [ ] Confirmar que el runbook de producción de la Fase 0 §5 fue corrido por Leonardo y que las 15 migraciones + dominio + Realtime quedaron en verde.
- [ ] Releer la regla de congelamiento al inicio de este documento y confirmar que sigue vigente hasta el primer cliente piloto pagando.
- [ ] **Nota explícita, no delegable:** la validación de mercado en El Progreso — hablar con dueños de restaurante reales sobre qué usan hoy, cuánto pagarían, qué wifi tienen — es trabajo de campo de Leonardo. Ninguna sesión de Code puede hacer esto ni reemplazarlo. Si al cerrar esta fase esa conversación todavía no ha pasado, el plan técnico está completo pero el negocio sigue sin validar.

---

## Backlog post-piloto (no tocar hasta tener el primer cliente pagando)

_(vacío — anotar aquí cualquier idea de producto que surja durante las fases 0-3, en vez de construirla ahora)_

---

## Bitácora

_(cada sesión agrega una entrada aquí al cerrar su fase — no borrar entradas anteriores)_
