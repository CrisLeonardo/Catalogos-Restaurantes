# Plan · Catálogo y alta de platillo (ficha 1.9) · 2026-11-09

Ficha **1.9** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **E10, N17, R06, R07, R08, R09, M03** (lado del panel), **O10** y **PA-T24**. Rama `feat/catalogo`, apilada sobre la 1.8 (`feat/recepcion`, PR #103).

> **Estado:** **implementada** (2026-11-09) en `feat/catalogo`, con la [maqueta](../diseno/MAQUETA_CATALOGO_2026-11-09.html) aprobada y la migración 179. Detalle en §6; lo que queda, en §7.

## 0. Base: la ficha 0.7 ya está incorporada

R08 y R09 dependen de 0.7 (receta y orden de categorías atómicos y candados entre restaurantes, PR #76, migración 156), que no estaba en la cadena. Se fusionó en esta rama (`87d8121`): sólo chocaba el verificador de migraciones. Su prueba SQL pasa sobre la base con 160–178. En producción, la 156 se aplica en su orden, con 154–159, antes de la 177.

## 1. Diagnóstico (comprobado en código, datos locales y pantalla)

| # | Problema | Dónde | Hallazgo |
|---|---|---|---|
| 1 | **Título repetido** en el alta: «Nuevo platillo» en la barra y otra vez junto a «Volver». | `menu/productos/new`, `[id]` | N17 |
| 2 | **Inglés siempre visible**, aunque el menú bilingüe esté apagado. | `product-form.tsx` | N17, PA-T24 |
| 3 | **Etiquetas y dietas se contradicen:** «Vegano» y «Picante» existen como sello libre y como dieta estructurada. | `product-form.tsx`, `tags` / `dietary_tags` | N17, R07.5 |
| 4 | **Un solo formulario largo**: foto, básicos, dietas (12 casillas), costo, opciones, ícono y disponibilidad, todo abierto para crear un platillo de nombre y precio. Crear cinco platillos repite todo. | `product-form.tsx` | R07.1, E10 |
| 5 | **Categoría sin alta en línea**: si no existe, hay que salir del formulario. | `product-form.tsx` | E10 |
| 6 | **Opciones sin predeterminada explícita**: un grupo tiene obligatorio y máximo, pero no mínimo ni opción por defecto; el comensal recibe la primera. | `options-editor.tsx` | M03, R08.2 |
| 7 | **Borrar una categoría esconde sus platillos.** La llave pasa a `null` y en las cartas por secciones o acordeón sólo se pintan platillos con categoría: desaparecen del menú sin aviso. | `deleteCategoryModal`, `menu/catalog.tsx` | R09.4 |
| 8 | **Los agotados ocupan el primer pantallazo** del catálogo (tres tarjetas grandes antes de la lista). | `catalog-panel.tsx` | R06.1 |
| 9 | **Sólo se filtra por categoría.** No hay «sin foto», «sin costo», «sin categoría», «agotado» ni «oculto», ni orden elegido. | `catalog-panel.tsx` | R06.2–3 |
| 10 | **No hay cambios en lote**: subir precios o agotar cinco platillos se hace uno por uno. | — | R06.4, E10 |
| 11 | No se puede **duplicar** un platillo como punto de partida. | — | R07.3 |

## 2. Propuesta

### Alta y edición del platillo

- **Un solo título** (el de la barra) y «Volver» sin repetirlo.
- **Formulario progresivo.** Siempre a la vista: nombre, precio (con «Q») y categoría, con **«+ Nueva categoría» en línea**. Lo demás en secciones plegables que dicen su contenido cuando están cerradas: «Foto», «Descripción», «Opciones · 2 grupos», «Dietas y alérgenos · Vegano, Sin gluten», «Sellos», «Costo y puntos», «Disponibilidad». Al crear, sólo «Lo básico» abierto.
- **«Guardar y crear otro»**, que conserva la categoría (E10: cinco platillos sin repetir).
- **Inglés sólo si el menú bilingüe está activo**, o si el platillo ya tiene traducción guardada.
- **Sellos separados de dietas.** Los sellos son comerciales (Nuevo, Favorito, Especial…). Si se escribe un sello que es una dieta (Vegano, Picante, Sin gluten…), se ofrece marcar la dieta y no se guarda duplicado. Los platillos existentes con ese duplicado se corrigen con la migración 179.
- **Opciones inequívocas (lado del panel, M03):** cada grupo dice obligatorio, mínimo y máximo, y permite marcar una **opción predeterminada** explícita; el servidor valida que tenga sentido (mínimo ≤ máximo, predeterminada dentro del grupo). El comensal la usará en la 1.11.
- **Validación en el servidor:** nombre, precio ≥ 0 con dos decimales, categoría existente y del mismo restaurante.
- **Duplicar** desde la ficha, avisando qué se copia (opciones, dietas, sellos, foto, receta) y qué no (existencias: nace disponible y oculto hasta revisarlo).

### Catálogo

- **Agotados en una línea** («3 agotados ahora · Ver»), no tres tarjetas.
- **Filtros combinables con contador:** Agotado, Oculto, Sin foto, Sin costo, Sin categoría; y «Limpiar».
- **Orden elegido:** como en la carta, por nombre o por última edición.
- **Cambios en lote** con selección visible: disponible/agotado, mostrar/ocultar, mover de categoría y precio (+/- % o monto). Antes de aplicar, **vista previa antes → después**. Se aplica todo o nada: si una fila no se puede cambiar (por ejemplo, un precio que quedaría negativo), no cambia ninguna y se dice cuál; nunca aparenta éxito parcial.
- **Volver conserva** búsqueda, filtros y orden (van en la dirección).

### Categorías

- Filas compactas: nombre, número de platillos, horario y estado en una línea.
- **Borrar una categoría con platillos exige elegir a dónde van**, con el resumen; nunca quedan escondidos.

### Fuera de esta ficha

Biblioteca de grupos reutilizables y simulador de pedidos (R08.3–4) · versionado de precio y receta (R08.6) · archivar con historial (R08.7) · importación por lote y recorte de fotos (R07.4, R07.6) · cobertura de traducción (R09.5). El comensal (predeterminada en la ficha del platillo, «Otros» para lo que quede sin categoría) va en la 1.11.

## 3. Migración prevista (179)

- Corrige los duplicados sello/dieta existentes (mueve el sello a la dieta equivalente) con constancia en la bitácora. Idempotente.
- Función de lote `leogin_aplicar_lote_catalogo` que aplica los cambios de varios platillos en una sola transacción (todo o nada) y deja constancia en la bitácora.

## 4. Decisiones del dueño (2026-11-09)

1. **Precio en lote: sí, con vista previa.** Se sube o baja por porcentaje o por monto; antes de aplicar se ve cada precio antes → después. Todo o nada, con bitácora.
2. **Platillo duplicado: nace oculto** hasta revisarlo.
3. **Maqueta aprobada** tal como se presentó («Aprobada, implementa»).

## 5. Pruebas previstas

- Unitarias de la regla sello/dieta, de la vista previa del lote y de la validación de opciones.
- Postgres: lote transaccional con fallo parcial, migración 179 idempotente, borrar categoría con reasignación.
- Pantalla: 390, 768 y 1280 px, claro y oscuro; nombre largo y traducción incompleta (PA-T24).

## 6. Implementación (2026-11-09)

**Migración `179_catalogo_lote_y_categorias.sql`**: aplicar **ANTES** del código y **después de la 178**. Idempotente y con huella en `verificar_migraciones.sql`.

- `products.updated_at` con disparador, para ordenar por «última edición».
- Candado: la categoría de un platillo es de su mismo restaurante (`LGD01`).
- Sellos que son dietas («Vegano», «Picante», y las claves `hot`/`veg` que guardaba el formulario anterior) pasan a la dieta y salen de los sellos; queda constancia por local (`catalogo_sellos_a_dietas`).
- `leogin_aplicar_lote_catalogo`: disponible, visible, categoría y precio (`porcentaje` o `monto`, redondeo a centavos), todo o nada; si un precio quedaría negativo no cambia ninguno y dice cuál. Bitácora `catalogo_lote` con el antes → después de hasta 100 precios.
- `leogin_borrar_categoria`: con platillos exige destino, los mueve y borra en una transacción; bitácora `categoria_borrada` con cuántos y a dónde.
- Ambas funciones sólo para `service_role`.

**Código**

- `lib/catalogo/reglas.ts`: validación de precio, sellos frente a dietas, reglas de grupos de opciones (mínimo ≤ máximo, predeterminada dentro del grupo), vista previa del lote con la misma aritmética que la 179, filtros combinables y orden.
- Acciones: alta y edición validan precio y opciones en el servidor y separan sellos de dietas; «Crear y agregar otro» conserva la categoría; `duplicateProduct` copia opciones, dietas, sellos, foto, costo y receta (con `leogin_reemplazar_receta`) y deja la copia oculta; `aplicarLoteCatalogo`; `crearCategoriaEnLinea`; `deleteCategoryModal` con destino.
- Ficha del platillo (`product-form.tsx`): un solo título; «Lo básico» siempre a la vista con «+ Nueva categoría»; secciones plegables con resumen; sellos comerciales separados de dietas con sugerencia «Marcar dieta»; inglés sólo con el menú bilingüe activo o traducción guardada; opción predeterminada y mínimo/máximo en el editor de opciones; «Duplicar» en la ficha con confirmación. La barra de guardar del alta es sólida.
- Catálogo (`catalog-panel.tsx`): lo agotado en una línea (se retiró la tarjeta «No se puede pedir ahora»); filtros combinables con contador y «Limpiar»; orden como en la carta, por nombre o por última edición; búsqueda, categoría, filtros y orden en la dirección, y «Volver»/«Guardar» regresan a la lista tal como estaba; selección con barra de lote (Precio…, Agotar, Disponible, Ocultar, Mostrar, Mover a…) y vista previa de precios.
- Categorías: borrar una categoría con platillos pide el destino debajo de la fila.
- Bitácora en palabras para `catalogo_lote`, `catalogo_sellos_a_dietas`, `platillo_duplicado` y `categoria_borrada` con destino.

**Verificación local**

- 1,447 unitarias, 118 de Postgres (8 nuevas de la 179), tipos y lint sin errores; auditorías de `security definer` y candados RLS con cero hallazgos; el verificador reconoce 156 y 177–179.
- Navegador con datos «AUD 1.9» (retirados al terminar): lote +10 % y la vista previa que bloquea un precio negativo; filtros combinados desde la dirección y «Volver» que los conserva; sello «Vegano» que pasa a dieta y sugerencia al escribir «Picante»; duplicado oculto; alta en serie con categoría creada en línea; borrar categoría moviendo su platillo. A 1280 px en claro y a 390 px en claro y oscuro.

## 7. Pendientes

- **Comensal (1.11):** usar la opción predeterminada y el mínimo en la ficha del platillo, y mostrar «Otros» para lo que quede sin categoría en las cartas por secciones o acordeón.
- **768 px** no se revisó por separado (sí 390 y 1280).
- Filas compactas de Categorías con horario en una línea: no se tocaron; el borrado con destino sí.
- Fuera de esta ficha, como se dijo en §2: biblioteca de grupos, simulador, versionado de precio y receta, archivar con historial, importación por lote, recorte de fotos y cobertura de traducción.
