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
- [x] **5a. Migraciones 074-090 en producción.** **2026-07-24** — Leonardo confirma haberlas corrido todas en el SQL Editor de producción, incluyendo la 089 (`basico_gratis`) y 090 (`finanzas_a_estandar`), las dos más recientes y las únicas que quedaron fuera del diagnóstico consolidado que armó `PLAN_AUDITORIA_LANZAMIENTO.md` el 22 de julio (ese bloque solo cubría 074-088). Nota de numeración: el repo tiene 17 migraciones en ese rango (074 a 090), no 15 (074-088) — este documento tenía el conteo desactualizado porque 089/090 se agregaron después de escrito. Sin evidencia SQL guardada de la corrida (no hay acceso de Code a prod); si algo del panel de finanzas/plan Básico gratuito se ve raro en producción, lo primero a revisar es que 089/090 realmente hayan aplicado limpio.
- [ ] **5b. Runbook de dominio + Realtime — requiere tu acceso.** Esto es lo único que falta del punto 5 original: en Render (servicio `menuvivo`) revisar `NEXT_PUBLIC_ROOT_DOMAIN` (debe ser el dominio real — `leogin.com` o `leogin.online` —, no `.onrender.com`, porque si no los subdominios de restaurante no funcionan); en Supabase de producción, en Database → Replication, confirmar que la publicación `supabase_realtime` incluye `orders` y `waiter_calls`. Las instrucciones detalladas ya están escritas en `PLAN_AUDITORIA_LANZAMIENTO.md` §3 — no hay que redactarlas de nuevo, solo ejecutarlas y reportar qué se encontró en la siguiente sesión.
- [ ] **Cierre de fase:** `tsc --noEmit` limpio, `test-aislamiento.mjs` en verde, CI corriendo en un PR de prueba real. Documentar en Bitácora.

---

## Fase 1 — Una sola verdad de precios

**Por qué:** hoy existen tres cifras distintas para lo mismo. `plans.ts` (código, fuente de verdad declarada) dice Básico Q0 / Estándar Q299 / Premium Q599 / Pro Q999 (pausado). `Leogin_Planes_y_Precios_2026.docx` (12 de julio) dice Q149 / Q399 / Q749 / Q999. `Cotizador.xlsx` (15 de junio) todavía cobra Q1,000 + Q250 de setup para Premium — precio que ya estaba obsoleto en julio y nunca se corrigió. Si Leonardo se sienta con un restaurante usando cualquiera de esos dos archivos, cotiza mal su propio producto.

- [x] **1. Confirmar valores vigentes en `plans.ts`** (planes y los 9 módulos de `ADDON_MODULES`) y listarlos en la entrada de Bitácora de esta fase como referencia exacta, con fecha. **2026-07-24** — tabla completa en Bitácora abajo; confirmado también contra `platform_settings` (sin overrides que difieran de `plans.ts` hoy).
- [x] **2. Actualizar `Cotizador.xlsx`** con los precios reales del plan correspondiente y sus setup fees. Agregar también un segundo escenario de ROI para un restaurante que **no** usa hoy apps de delivery (PedidosYa/Uber Eats) — el escenario actual asume Q32,400/mes en delivery con 25% de comisión, que es un perfil de restaurante urbano, no el comedor típico de un municipio agrícola como El Progreso. **2026-07-24** — Premium corregido a Q599/Q300 setup; agregada hoja "Escenario2_SinDelivery" con el caso de un comedor que empieza a ofrecer domicilio; fórmulas reverificadas a mano (sin LibreOffice en esta máquina, ver Bitácora).
- [x] **3. Actualizar `Leogin_Planes_y_Precios_2026.docx`** para que coincida con `plans.ts`, o agregar una nota visible de "vigente desde [fecha]" si Leonardo prefiere no reescribirlo entero todavía. **2026-07-24** — ambas cosas: se corrigieron las cifras en las tablas/ejemplos y se agregó una nota "Actualización (2026-07-24)" fechada explicando qué cambió desde el 12 de julio.
- [x] **4. Crear `PRECIOS_VIGENTES.md`** de una sola página: tabla final de planes + módulos + setup fees, fechada, pensada como referencia rápida de un vistazo antes de una demo — no reemplaza `plans.ts` como fuente de código, es la referencia humana. **2026-07-24** — creado en la raíz del repo.
- [x] **Cierre de fase:** confirmar a mano que `Cotizador.xlsx`, el docx y `PRECIOS_VIGENTES.md` muestran exactamente las mismas cifras que `plans.ts`. Documentar en Bitácora. **2026-07-24** — confirmado, ver Bitácora para el detalle y las limitaciones de verificación de esta sesión.

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
- [x] Migraciones 074-090 corridas en producción — **2026-07-24**, ver Fase 0 §5a.
- [ ] Confirmar que el runbook de producción de la Fase 0 §5b (dominio `NEXT_PUBLIC_ROOT_DOMAIN` + publicación `supabase_realtime` de `orders`/`waiter_calls`) quedó en verde.
- [ ] Releer la regla de congelamiento al inicio de este documento y confirmar que sigue vigente hasta el primer cliente piloto pagando.
- [ ] **Nota explícita, no delegable:** la validación de mercado en El Progreso — hablar con dueños de restaurante reales sobre qué usan hoy, cuánto pagarían, qué wifi tienen — es trabajo de campo de Leonardo. Ninguna sesión de Code puede hacer esto ni reemplazarlo. Si al cerrar esta fase esa conversación todavía no ha pasado, el plan técnico está completo pero el negocio sigue sin validar.

---

## Backlog post-piloto (no tocar hasta tener el primer cliente pagando)

_(vacío — anotar aquí cualquier idea de producto que surja durante las fases 0-3, en vez de construirla ahora)_

---

## Bitácora

_(cada sesión agrega una entrada aquí al cerrar su fase — no borrar entradas anteriores)_

- **2026-07-24** — Sesión de revisión del plan (sin cerrar ninguna fase todavía). Se verificó contra el repo real y se corrigió una desactualización: el documento decía "15 migraciones pendientes (074-088)", pero ya existen 089 (`basico_gratis`) y 090 (`finanzas_a_estandar`), commiteadas el mismo día — el rango correcto es 074-090 (17 migraciones). Leonardo confirmó haber corrido las 17 en producción, incluidas las dos más recientes que quedaban fuera del diagnóstico consolidado de `PLAN_AUDITORIA_LANZAMIENTO.md`. Se movió esto a Fase 0 §5a (cerrado) y se dejó §5b (dominio + Realtime) como lo único pendiente de acceso de ese punto — todavía no se ha hecho, según confirma Leonardo. También se verificaron en el repo, sin cambios necesarios, el resto de afirmaciones técnicas de Fase 0-1: `scripts/test-aislamiento.mjs` existe, `.github/workflows/` solo tiene `release-desktop.yml`, cero archivos `.test./.spec.` en `src`, Playwright sí está como devDependency (`^1.61.1`), y `plans.ts` sigue con 4 planes (Básico/Estándar/Premium/Pro) y exactamente 9 `ADDON_MODULES` como dice Fase 1 §1. No se ejecutó ningún otro punto de las Fases 0-2 (siguen "una fase = una sesión"). Fecha del docx de precios (12 de julio) y del Cotizador (~15-16 de junio) confirmadas contra `git log`, ambas siguen desactualizadas frente a `plans.ts` — Fase 1 sigue pendiente completa.

- **2026-07-24** — Fase 1 cerrada (misma sesión, continuación, a pedido explícito de Leonardo tras la revisión de arriba). Valores vigentes confirmados en `plans.ts` **y** contra `platform_settings` (grep de todas las migraciones que insertan `plan_price_*`/`module_price_*`/`channel_discount_*`/`group_panel_fee`: la última migración que toca cada clave — 075, 078, 089, 090, todas dentro del rango 074-090 ya confirmado en prod — coincide exactamente con los defaults de `plans.ts`; no hay overrides activos que difieran hoy):

  | Plan | Precio | Alta | Notas |
  |---|---|---|---|
  | Básico | Gratis | Q0 | tope 150 productos, aviso a 3,000 visitas/mes, 1 usuario, sin pedidos en línea |
  | Estándar | Q299/mes | Q300 | 2 de 3 canales de pedido, 2 usuarios, **incluye finanzas** (desde hoy, mig 090) |
  | Premium | Q599/mes | Q300 | 3 canales, usuarios ilimitados, 7 de 9 módulos incluidos gratis, descuento por canal |
  | Pro (pausado) | Q999/mes | Q0 | todo Premium + proveedores + FEL; solo asignable a mano desde super admin |

  Los 9 `ADDON_MODULES`: Reservaciones Q99 (min Básico), Lista de espera Q49 (min Básico), Recetas Q79 (min Básico), Llamar al mesero Q49 (min Estándar), Encuestas Q49 (min Estándar), Cupones Q79 (min Estándar), Lealtad Q99 (min Estándar), Proveedores Q99 (pausado, no ofrecido), FEL Q249+Q500 alta (pausado, no ofrecido). Premium/Pro incluyen gratis los 7 no pausados. Descuento por canal: Q50 c/u, máx. 2 canales desactivados (channel_discount_per/max = 50/2, fijado por la migración 078). Descuento de grupo: 10/15/20% en 2-4/5-9/10+ sucursales; panel central Q299/mes; prueba gratis 30 días.

  **`Cotizador.xlsx`**: corregido Premium de Q1,000+Q250 setup (obsoleto desde el 15 de junio) a Q599+Q300; agregada una fórmula de "% de incremento en ganancias" que faltaba en la tabla original (B26/C26, la celda existía en el `Table` de Excel pero nunca se llenó); agregada una segunda hoja `Escenario2_SinDelivery` con el mismo formato/tablas-Excel que la hoja original, para el perfil de restaurante que hoy NO usa apps de delivery (valores de ejemplo: 8 pedidos/día, ticket Q60 — se marcan explícitamente como ejemplo a ajustar en la visita, no como dato real). **Limitación de esta sesión:** no hay LibreOffice instalado en esta máquina, así que no se pudo correr el recálculo automático (`recalc.py`) que exige el skill de xlsx — en su lugar se reevaluaron las 15 fórmulas de cada hoja a mano en Python contra los valores esperados (coinciden exactamente) y se confirmó que el archivo reabre sin error con `openpyxl` y con las 4 tablas de Excel intactas por hoja. Recomendado: que Leonardo abra el archivo una vez en Excel/LibreOffice real para confirmar visualmente antes de usarlo en una visita.

  **`Leogin_Planes_y_Precios_2026.docx`**: se optó por corregir las cifras en vez de solo poner una nota "vigente desde" (dado el riesgo de que Leonardo cite un precio viejo en visita) — Básico Q149→Gratis, Estándar Q399→Q299, Premium Q749→Q599 en la tabla 3.1 y en los mini-escenarios de la sección 5; conteo de módulos corregido de 8 a 9 (3 menciones) y agregada la fila "Lista de espera" a la tabla 3.2; mecánica de descuento por canal corregida de "Q100, máx. 1 canal" (desactualizada desde antes del 16 de julio) a "Q50, máx. 2 canales, 3 canales posibles"; ejemplo de franquicia de la sección 4 recalculado con Premium a Q599 (Q599 × 0.85 = Q509.15 por sucursal, total Q3,443.75/mes). Se agregó un párrafo "Actualización (2026-07-24)" fechado, con el mismo estilo que el de "Pro en pausa" del 12 de julio que ya traía el documento, explicando qué cambió y señalando a `PRECIOS_VIGENTES.md`. Deliberadamente **no** se tocó la sección 6 (qué protege la migración 072 a clientes existentes) más allá de esto — describe un evento histórico específico y sigue siendo cierta como tal. Verificado con una comparación completa párrafo-por-párrafo antes/después más un grep final de cifras viejas (`149`, `399`, `749`, `Q100 de`, `6 de los 8`) — limpio salvo la mención histórica ya mencionada de la sección 6. Tampoco se pudo generar un PDF de verificación visual (sin LibreOffice); verificación fue textual/estructural con `python-docx`, no visual.

  **`PRECIOS_VIGENTES.md`**: creado en la raíz del repo con la tabla de arriba, fechado, con nota explícita de que `plans.ts` manda si algún día no coinciden.

  Las tres fuentes de venta quedan con exactamente las mismas cifras entre sí y con `plans.ts`. No se tocó ningún archivo de código de la plataforma — Fase 1 fue estrictamente de contenido/documentos, como indica el plan. No se corrió `tsc`/`test-aislamiento.mjs` porque no aplica: ningún archivo bajo `plataforma/src` cambió esta fase.
