# Plan · Catálogo y alta de platillo (ficha 1.9) · 2026-11-09

Ficha **1.9** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **E10, N17, R06, R07, R08, R09, M03** (lado del panel), **O10** y **PA-T24**. Rama `feat/catalogo`, apilada sobre la 1.8 (`feat/recepcion`, PR #103).

> **Estado:** diagnóstico hecho; propuesta y [maqueta](../diseno/MAQUETA_CATALOGO_2026-11-09.html) **pendientes de aprobación**.

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

## 4. Decisiones del dueño (pendientes)

1. **Precio en lote:** ¿se permite subir o bajar precios en lote (propuesta), o sólo disponibilidad, visibilidad y categoría?
2. **Platillo duplicado:** ¿nace **oculto** hasta revisarlo (propuesta) o visible?

## 5. Pruebas previstas

- Unitarias de la regla sello/dieta, de la vista previa del lote y de la validación de opciones.
- Postgres: lote transaccional con fallo parcial, migración 179 idempotente, borrar categoría con reasignación.
- Pantalla: 390, 768 y 1280 px, claro y oscuro; nombre largo y traducción incompleta (PA-T24).
