# Plan · Comensal: ficha, carrito, temas y accesibilidad (ficha 1.11) · 2026-11-09

Ficha **1.11** del [plan de la auditoría integral](PLAN_AUDITORIA_INTEGRAL_2026-11-04.md). Hallazgos: **E08, N11, F09, F10, D04, D08, M02, M03, M04, M08, PA-T25, PA-T26**, más lo que dejaron pendiente la 1.9 (opción predeterminada, mínimo y «Otros») y la 1.10 (decir cuándo vuelve lo agotado). Rama `feat/comensal`, apilada sobre la 1.10 (`feat/inventario`, PR #106).

> **Estado:** **implementada** (2026-11-09) en `feat/comensal`, con la [maqueta](../diseno/MAQUETA_COMENSAL_2026-11-09.html) aprobada. Sin migración. Detalle en §6; lo que queda, en §7.

## 1. Diagnóstico (comprobado en código y en pantalla a 390 px, carta de Rincón 502)

| # | Problema | Dónde | Hallazgo |
|---|---|---|---|
| 1 | **La ficha decide por el comensal.** Un grupo obligatorio sin predeterminada («Término») aparece ya marcado en su primera opción; quien no mira, pide «Tres cuartos» sin haberlo elegido. La predeterminada que el restaurante define desde la 1.9 no se usa ni se dice. | `product-sheet.tsx` (`initialSelection`) | M03 |
| 2 | **El mínimo no existe para el comensal.** «Extras» con mínimo 1 dice «Opcional · máx 2» y deja agregar sin elegir. | `product-sheet.tsx` | M03 |
| 3 | **Dos tarjetas fijas en cada platillo:** «8–12 min» y «Recién hecho», iguales para un café y para un pepián. No describen el platillo y prometen un tiempo que nadie midió. | `product-sheet.tsx`, `theme/defaults.ts` | M06, promesa |
| 4 | **El botón «Agregar» con algo pendiente sólo se aclara** (opacidad 0.55); no dice qué falta hasta tocarlo. | `product-sheet.tsx` | D04, D08 |
| 5 | **Las opciones son botones sueltos** (`aria-pressed`): un lector de pantalla no sabe que «Término» es «elige uno» ni cuántos van elegidos. | `product-sheet.tsx` | D08, M08 |
| 6 | **Sin alérgenos no dice nada.** Si el restaurante no los indicó, la ficha calla; parece «no contiene». | `product-sheet.tsx` | M08 |
| 7 | **El carrito no se puede corregir**: sólo cantidad. Cambiar «Papas» por «Ensalada» obliga a borrar y rearmar el platillo. | `cart.tsx` | M04 |
| 8 | **El carrito es vidrio** (`glass` + desenfoque) y un `div role="dialog"` sin manejo de foco: Escape no cierra, el foco no entra ni vuelve. | `cart.tsx` | D08, E08, F10 |
| 9 | **El aviso de lealtad no se lee en tema oscuro**: el párrafo va al 50 % de opacidad sobre una tarjeta transparente con desenfoque. Tampoco recibe el foco ni se cierra con Escape. | `google-loyalty-intro.tsx` | N11, E08 |
| 10 | **Lo agotado sólo se ve tachado**: sin la palabra «Agotado» ni cuándo vuelve, y el lector de pantalla no lo distingue. | `catalog.tsx` (`m-strike`) | M02, 1.10 |
| 11 | **Un platillo sin categoría no aparece** en las cartas por secciones o acordeón (comprobado: «AUD 1.11 Sin categoría» no sale). | `catalog.tsx` | R09, 1.9 |

Lo que **sí** está bien y se conserva: la ficha ya usa `HojaOperativa` (foco al título, Tab atrapado, Escape, devuelve el foco) y su pie con cantidad y total queda fijo: F09 está resuelto en la ficha.

## 2. Propuesta

### Ficha del platillo

- **Opciones inequívocas (M03):**
  - Si el restaurante marcó una **predeterminada**, viene puesta y lo dice: «Papas · predeterminada».
  - Sin predeterminada, un grupo obligatorio **empieza vacío** y su encabezado pide «Elige uno».
  - Los grupos de varias opciones dicen la regla completa: «Elige de 1 a 2», «Elige al menos 1» u «Opcional · hasta 2».
  - Se respeta el mínimo.
- **Botón que dice qué falta (D04):** «Elige término» en lugar de un «Agregar» desvaído. Al completarse cambia a «Agregar · Q62.00». El pie sigue fijo con la cantidad.
- **Lector de pantalla (D08):** cada grupo es un grupo de radios o de casillas con su nombre y su regla; cada opción anuncia su precio extra.
- **Alérgenos (M08):** si no hay datos, una línea dice «Alérgenos: el restaurante no los ha indicado. Pregunta antes de pedir.». Nunca se da a entender «no contiene».
- **Sin tarjetas fijas** de «8–12 min» y «Recién hecho» (ver decisión 2).
- **Agotado:** la ficha dice «Agotado · vuelve mañana a las 05:00» en lugar del botón.

### Carrito

- **Hoja accesible y sólida:** la misma `HojaOperativa` de la ficha (foco, Escape, devolver el foco) y una superficie del tema sin desenfoque.
- **Editar una línea (M04):** «Cambiar» en cada platillo con opciones abre su ficha con lo elegido y la cantidad. «Guardar cambios» reemplaza esa línea: no se borra ni se rearma. Dos versiones del mismo platillo se distinguen por sus opciones.
- Cada línea muestra sus opciones con el precio extra; el total y el botón quedan en el pie fijo.

### Aviso de lealtad (N11, E08)

- Tarjeta **sólida** con los colores de superficie y texto del tema (sin opacidad del 50 % ni vidrio), contraste comprobado en claro y oscuro.
- Recibe el foco, se cierra con Escape y devuelve el foco. Sigue sin bloquear la carta (ver decisión 3).

### Carta

- **Agotado con palabras:** «Agotado · vuelve mañana» bajo el nombre (además del tachado) y en el nombre accesible de la tarjeta.
- **«Otros» al final** para lo que no tiene categoría, en todas las estructuras.

### Temas (PA-T25) y teclado (PA-T26)

- Revisión de contraste de ficha, carrito, aviso y errores en las 8 estructuras, con una paleta clara y una oscura, a 390 y 1280 px.
- Con el teclado del teléfono abierto, el último campo y la acción siguen visibles. El checkout es de la 1.12; aquí, la ficha y el carrito.

### Fuera de esta ficha

Entrada por QR, checkout y seguimiento (1.12) · lealtad después de pedir (M07, 3.3) · revalidar el carrito cuando cambia un precio (4.6) · fotografía y composición de cada estructura (M02 completo).

## 3. Migración

**No hace falta.** La predeterminada y el mínimo ya se guardan desde la 1.9 (dentro de `options`) y `vuelve_at` ya llega a la carta desde la 1.10.

## 4. Decisiones del dueño (2026-11-09)

1. **Un grupo obligatorio sin predeterminada empieza vacío** y el comensal elige.
2. **Se quitan las tarjetas «8–12 min» y «Recién hecho»** de la ficha y de los editores de tema.
3. **El aviso de lealtad sigue** en la primera visita, sólido y accesible.
4. **Maqueta aprobada** tal como se presentó («Aprobada, implementa»).

## 5. Pruebas previstas

- Unitarias: selección inicial con y sin predeterminada; mínimo y máximo; texto del botón; editar una línea del carrito conserva su lugar y suma bien.
- Navegador: 390 y 1280 px, claro y oscuro, en las 8 estructuras; teclado (Tab, Escape, foco devuelto) en ficha, carrito y aviso; contraste medido del aviso y del carrito.

## 6. Implementación (2026-11-09)

- `lib/menu/opciones.ts`: reglas puras con sus pruebas:
  - selección inicial: la predeterminada del restaurante o vacío; los combos empiezan completos;
  - regla de cada grupo («Elige de 1 a 2», «Opcional · hasta 2»), qué falta y texto del botón;
  - selección reconstruida desde una línea del carrito.
- **Ficha** (`menu/product-sheet.tsx`):
  - lo obligatorio sin predeterminada empieza vacío; la predeterminada dice «· predeterminada»; se respeta el mínimo;
  - el botón dice «Elige término» o «Elige 1 más en extras» y lleva al grupo pendiente;
  - cada grupo es `radiogroup` o `group` con su nombre y su regla, y cada opción un `radio` o `checkbox` con `aria-checked`;
  - sin alérgenos indicados, dice «Alérgenos: el restaurante no los ha indicado. Pregunta antes de pedir.»;
  - ya no tiene las tarjetas fijas, que también salen de los editores de tema.
- **Carrito** (`menu/cart.tsx`):
  - usa `HojaOperativa` (foco, Escape y foco devuelto) sobre la superficie sólida del tema;
  - cada opción dice lo que suma;
  - «Cambiar» abre la ficha con lo elegido y «Guardar cambios» reemplaza la línea en su lugar (`replaceItem`/`reemplazarLinea`). Si la línea queda igual a otra, se juntan. Al terminar vuelve al carrito.
- **Aviso de lealtad**: tarjeta sólida con el fondo y el texto del tema (contraste del párrafo ≈ 8.6:1 en Rincón 502, antes 50 % de opacidad sobre vidrio). Recibe el foco, se cierra con Escape y devuelve el foco. Sigue sin bloquear la carta.
- **Carta** (`menu/catalog.tsx`):
  - el mismo aviso en todas las tarjetas: «Agotado · vuelve mañana» con la zona del local, o «No disponible ahora» fuera de horario; antes algunas sólo tachaban;
  - «Otros» al final de las cartas por secciones o acordeón para lo que no tiene categoría.

**Verificación**

- 1,455 unitarias (7 nuevas), tipos y lint sin errores.
- Navegador a 390 px con datos «AUD 1.11» (retirados), en Rincón 502 (oscuro) y en Tacos del Norte de prueba (otra paleta oscura):
  - «Término» vacío y «Papas · predeterminada»;
  - el botón pasa de «Elige término» a «Elige 1 más en extras» y luego a «Agregar · Q72.00»;
  - en el carrito, «Cambiar» de Papas a Ensalada en la misma línea;
  - aviso de lealtad sólido, con foco y Escape;
  - «Agotado · vuelve mañana»;
  - «Otros» al cambiar temporalmente la carta a secciones (se devolvió a «chips»).
- Las pruebas E2E del comensal siguen encontrando el diálogo «Carrito» y su botón «Cerrar».

## 7. Pendientes

- **Revisión completa de temas (PA-T25):** se comprobaron dos paletas oscuras. Faltan las 8 estructuras con una paleta clara, en 1280 px.
- **Teclado del teléfono abierto (PA-T26):** se comprobará con el checkout en la 1.12.
- Revalidar el carrito cuando cambia un precio (4.6) y la lealtad después de pedir (3.3).
