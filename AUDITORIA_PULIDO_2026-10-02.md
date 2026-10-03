# Auditoría de pulido — 2026-10-02

> **Encargo:** auditoría de mejoras visuales, rendimiento, optimización, pequeñas
> mejoras, orden y armonía visual, **por secciones** (Ajustes, Pedidos, Negocio,
> Menú… del panel; catálogo digital; Super Admin), con mirada de QA, desarrollo,
> diseño y marketing. Este archivo es **el tablero de control**: aquí se marca lo
> que se va trabajando.
>
> **Cómo se hizo.** Build de producción local (`next build` + `next start`) contra
> Supabase local, con pedidos de prueba puestos en todos los estados (y devueltos
> a como estaban al terminar). Un script recorrió **cada pantalla** a 390 px
> (teléfono táctil) y 1440 px (escritorio), en claro y oscuro — 40 del panel, 24
> del Super Admin, 18 públicas y 5 de Mi cuenta: **312 capturas** — y en cada una
> midió desbordes, texto de menos de 11 px, blancos táctiles pequeños, recortes y
> errores de consola. Después, lectura del código para encontrar la causa de cada
> cosa; lo que dice «confirmado en el código» se leyó allí, no se supone.
> Limitación: el modo oscuro del panel en **escritorio** no quedó capturado (ese
> recorrido cayó al login, ver N-10); el oscuro se revisó en el teléfono, donde
> se ve bien. Las auditorías anteriores (QA visual 09-22, velocidad 09-25) **no
> se repiten**: lo que de ellas sigue abierto está en la sección de rendimiento.
>
> **Estado:** Fases 1 a 4 hechas y la 6 casi entera el 2026-10-02 (53 de 145 hallazgos, incluidos los 6 P0). Lo que queda: la Fase 5 (necesita D-2), WEB-01/02/03 y CAT-13 (necesitan contenido o una cuenta tuya) y lo continuo; ver la Bitácora al final.

---

## Cómo usar este archivo

- `- [ ]` pendiente · `- [x]` hecho (al marcarlo, añadir fecha y commit al final de la línea).
- **⏸️** = necesita tu visto bueno antes de tocarlo (rediseños de pantallas que ya
  diseñaste tú, decisiones de marca o de producto). Lo demás es corrección o pulido
  que se puede hacer directo.
- **Prioridad:** **P0** roto o dice algo falso · **P1** se nota mucho o estorba el
  trabajo del día · **P2** pulido visible · **P3** detalle o idea.
- **Esfuerzo:** **S** menos de 1 h · **M** medio día · **L** un día o más.
- Cada hallazgo dice **qué pasa**, **qué proponemos** y **dónde** está en el código.
- Al terminar una sesión de trabajo, añadir una línea en la **Bitácora** (al final).

## Tablero de avance

| # | Sección | Hallazgos | Hechos | ⏸️ Decisión |
|---|---------|----------:|-------:|-----------:|
| 1 | Transversal — sistema de diseño y textos | 26 | 16 | 0 |
| 2 | Panel · Armazón y navegación | 10 | 7 | 1 |
| 3 | Panel · Hoy | 5 | 2 | 1 |
| 4 | Panel · Pedidos (En vivo, Cocina, Mesas, Tomar pedidos) | 13 | 1 | 4 |
| 5 | Panel · Menú | 12 | 4 | 0 |
| 6 | Panel · Clientes | 6 | 2 | 0 |
| 7 | Panel · Negocio | 6 | 1 | 1 |
| 8 | Panel · Ajustes | 20 | 11 | 2 |
| 9 | Catálogo digital (lo que ve el comensal) | 13 | 4 | 1 |
| 10 | Super Admin | 10 | 2 | 1 |
| 11 | Mi cuenta (grupo) | 5 | 3 | 0 |
| 12 | Web pública y marketing | 9 | 0 | 0 |
| 13 | Rendimiento y salud del código | 10 | 0 | 1 |
| | **Total** | **145** | **53** | **12** |

Por prioridad: **P0** 6 · **P1** 34 · **P2** 61 · **P3** 44. Hechos: los **6 P0**, 28 P1, 14 P2 y 5 P3.

*(Se actualiza a mano al marcar.)*

---

## Lo más importante en una lista

Si solo se hiciera esto, el sistema ya se vería y se sentiría otro:

1. **Un platillo «agotado» vuelve solo al menú a las 12 h, pero el servidor lo
   sigue rechazando** (CAT-01): el comensal lo ve con su «+», lo pide, y al
   confirmar le sale «ya no está disponible». Y el panel y Tomar pedidos lo
   siguen enseñando como agotado: el mesero no puede vender lo que el menú vende.
2. **Dos márgenes distintos para el mismo restaurante** (MIC-01): el panel dice
   margen 48 %, Mi cuenta dice 1 % (y un «costo» de Q2,759 que no existe).
3. **Horarios dice lo contrario de lo que hace** (AJU-01, AJU-02): el interruptor
   «Recibiendo pedidos» está apagado cuando SÍ se reciben, y sin horario cargado
   cada día dice «Cerrado» cuando el sistema lo trata como «siempre abierto».
4. **El dinero sale escrito de tres maneras** (T-01): `Q2,650.00`, `Q2794.10` y
   `Q1146,00` — esta última con coma decimal, en la Suscripción del dueño y en
   todo el Super Admin.
5. **Cifras que se cortan en el teléfono**: el importe de «En curso» en Hoy
   (HOY-01), las ventas en Mi cuenta (MIC-03), y Mi cuenta entera se sale de la
   pantalla por el correo del saludo (MIC-02).
6. **Pedidos › En vivo en el teléfono:** siete cifras antes del primer pedido y
   tarjetas de ~450 px con el mismo tiempo repetido tres veces (PED-01, PED-02).
7. **El Centro de ayuda describe un menú que ya no existe** (N-01).
8. **Claves internas a la vista del dueño**: `order_void`, `descuento_mesa`,
   `aprobar_anulaciones`, IP `::1`, `WHATSAPP_TOKEN_KEY` (T-15, AJU-12, AJU-15).
9. **Cuatro maneras distintas de guardar** y **cinco estilos de cifras/KPI**
   (T-08, T-05): es lo que más «desarmonía» da a simple vista.
10. **Personalizar el sitio mide 12.800 px en el teléfono** (AJU-10).
11. **Sin buscador** en Platillos ni en Clientes (MEN-01, CLI-01).
12. **Fichas grises en modo claro** (formulario del platillo, tarjetas de pedido,
    Super Admin) junto a fichas blancas en el resto (T-12).
13. **Marketing:** la web de ventas no mide nada (sin analítica) y no enseña ni
    un cliente real (WEB-01, WEB-02).

---

## Decisiones que necesito de ti

Estas cambian el trabajo; el resto se puede hacer sin preguntar.

- **D-1 · ¿Tú o vos?** ✅ **Decidido 2026-10-02: tú.** La interfaz habla de «tú» en ~300 textos y de «vos» en ~25
  («abrís», «repartís», «Contá el efectivo», «Escribí», «Encendé», «tenés»…).
  Hay que escoger una. Recomiendo **tú** (es la mayoría, y es lo habitual en
  software escrito en Guatemala); si prefieres vos, se cambian los ~300. (T-13)
- **D-2 · Pantallas de servicio que diseñaste tú** (Pedidos › En vivo, Mesas,
  Tomar pedidos). ¿Arreglos puntuales solamente, o puedo proponer cambios de
  diseño (tarjeta de pedido más compacta, tablero en columnas en escritorio, mesas
  libres en rejilla en el teléfono)? Si es lo segundo, lo haría primero como
  maqueta para que la apruebes. (PED-02, PED-06, PED-09, PED-13)
- **D-3 · Hoy, Pedidos y Negocio › Resumen enseñan las mismas cifras y gráficas.**
  Propuesta: **Hoy** = el pulso (avisos, cifras del día, lo que está pasando);
  **Pedidos** = solo operación, sin gráficas; **Negocio › Resumen** = semana/mes
  con comparación contra el periodo anterior. ¿De acuerdo? (HOY-05, NEG-02)
- **D-4 · Botones con texto blanco sobre el color de marca** (pendiente desde
  la auditoría del 09-22): en oscuro el naranja se aclara y el contraste baja a
  ~3:1. ¿Se oscurece el acento en los botones o se deja?
- **D-5 · QR de mesa con dirección corta.** Hoy cada QR lleva el UUID del
  restaurante (`/m/aaaaaaaa-aaaa-…/7`): el código sale más denso y la dirección
  es ilegible. Se puede pasar a `/m/<slug>/7` **manteniendo vivos los viejos**
  (los QR ya impresos siguen funcionando). ¿Lo hago? (AJU-06)
- **D-6 · WhatsApp (API de Meta).** La pantalla pide «Phone number ID» y «token»
  de Meta y, si el servidor no está configurado, le enseña al dueño un error
  técnico. ¿La escondemos hasta que esté lista para un restaurantero? (AJU-15)
- **D-7 · QR de mesa directo a la carta.** Hoy el comensal sentado ve primero la
  portada a pantalla completa. ¿Entrar directo a la carta cuando viene con mesa?
  (CAT-04)
- **D-8 · El Super Admin, ¿comparte las piezas del panel o conserva su estilo
  propio** (rótulos Anton, números de color)? (SUP-09)
- **D-9 · Render en Virginia** (REN-01, heredado del 09-25): sigue siendo lo que
  más velocidad da y solo lo puedes hacer tú.

---

## 1 · Transversal — sistema de diseño y textos

Lo que aparece en muchas pantallas a la vez. Arreglarlo una vez arregla todas.

### Dinero, fechas y textos

- [x] **T-01** · **P0** · M — **El dinero sale escrito de tres maneras.**
  Qué pasa: `Q2,650.00` (Hoy, Pedidos — `formatPrice`), `Q2794.10` sin separador
  de miles (Finanzas, Mi cuenta, historial de caja — `` `Q${n.toFixed(2)}` ``) y
  `Q1146,00` con **coma decimal** (Suscripción del dueño y **todo** el Super
  Admin — `fmtMoney` de `lib/money.ts` usa el locale `'es'`, que en español
  genérico pone coma decimal y no agrupa números de 4 cifras). Hay **~25
  funciones de formato de dinero** sueltas por el código.
  Propuesta: una sola `formatMoney(n, { currency, decimals })` en `lib/money.ts`
  con `es-GT` (o el locale del restaurante), una prueba que fije `Q1,146.00`, y
  reemplazar las 25.
  Dónde: `lib/money.ts:17`, `app/admin/(protected)/finanzas/page.tsx:37`,
  `app/mi-cuenta/(panel)/*/page.tsx`, `components/admin/cash-history-panel.tsx:9`,
  `clientes/page.tsx:29`, `planes/page.tsx:67`, etc.
  ✅ **Hecho 2026-10-02 (Fase 1).** `fmtMoney` pasa a `es-GT` (con prueba), y 17 formateadores sueltos (Finanzas, Mi cuenta, Caja, Clientes, Planes, Super…) y el mensaje de cobro por WhatsApp la usan. Visto: «Q1,146.00» en Suscripción, «Q1,495.00» en el Super, «Q2,794.10» en Finanzas. De paso: las filas de 5+ cifras bajan a 22 px para que el importe con separador no se corte, y las cifras del Super crecen con la pantalla sin salirse.

- [x] **T-02** · P1 · S — **Fechas crudas y tiempos relativos mal calculados.**
  Qué pasa: «Vence el 2026-09-01», «Mensualidad 2026-09», «Pagado el 2026-07-18»
  (Suscripción), «último pago 2026-07-18» (Super), eje «09-03» en gráficas; «Última
  conexión **hace 2004 h**» (La PC del local; en la misma pantalla otro bloque dice
  «hace 84 días»); «Entró: 02 oct 2026, 11:06 a. m.» en pedidos de hoy. Hay **7
  copias** de `timeAgo`/`agoLabel`, cada una con su regla.
  Propuesta: `lib/dates.ts` con `formatDate` («1 sep 2026», «septiembre 2026»),
  `formatTime` («11:06») y `formatRelative` (min → h → días → fecha), y usarlo en
  todas.
  Dónde: `suscripcion/page.tsx:437-439`, `print-agent-settings.tsx:424`,
  `mi-pc/page.tsx:37`, `staff-panel.tsx:61`, `trusted-devices-panel.tsx:17`,
  `new-orders-alert.tsx:73`, `waiter-calls-alert.tsx:31`, `hoy-widgets.tsx:34`,
  `lib/main-pc.ts:57`.
  ✅ **Hecho 2026-10-02 (Fase 1).** `lib/dates.ts` (`haceTiempo`, `fechaCorta`, `mesYAnio`, `diaMes`, `esHoy`, con pruebas). «Última conexión el 10 jul 2026» en vez de «hace 2004 h»; «Mensualidad septiembre de 2026 · Vence el 1 sept 2026»; «hace 24 días» en Personal; ejes del Super con «3 sept»; pedidos de hoy «Entró a las 12:17 p. m.». Se dejaron los avisos en vivo (pedido nuevo, llamada) que solo miden minutos.

- [x] **T-03** · P3 · S — **Plurales perezosos:** «2 cobro(s)», «2 restaurante(s)»,
  «cobro(s) pendiente(s)». Un `plural(n, 'cobro', 'cobros')`.
  Dónde: `suscripcion/page.tsx:371`, `app/super/finanzas/page.tsx`.
  ✅ **Hecho 2026-10-02 (Fase 1).** Quitados todos los «(s)»: cobros, restaurantes, pagos, agotados, días, entregas, recetas.

- [x] **T-13** · P2 · S · ⏸️ D-1 — **«Tú» y «vos» mezclados.** ~300 textos con tú
  (toca, elige, tienes, puedes) y ~25 con voseo: Ajustes («abrís», «repartís»,
  «ponés», «necesitás», «Encendé»), Horarios, Zona de entrega («Marcá»), Caja
  («Contá el efectivo», «Escribí cuántos…»), Categorías («Ordená»), estados vacíos
  («Aún no tenés…», «Creá el primero»), buscador («Probá… querés… mirá»),
  Funciones («podés», «elegís»), Repartidores («cobrás»), Copia de datos
  («Descargá»).
  🔎 **Añadido 2026-10-02:** el checkout público también vosea: «¿Cómo te llamás?».
  ✅ **Hecho 2026-10-02 (Fase 2).** ~45 textos pasados a «tú» en panel, menú público, errores amables y mensajes de las acciones (incluido «¿Cómo te llamás?» del checkout). Como el editor del tema guarda una COPIA de los textos, `resolve.ts` cambia al vuelo los textos por defecto viejos que un restaurante tenga guardados (si el dueño escribió el suyo, se respeta); con prueba. Solo quedan formas de «vos» en comentarios del código.

- [x] **T-14** · P3 · S — **Anglicismos y jerga técnica** en pantallas del dueño:
  «badge», «checkout», «food cost», «delivery», «tagline», «builtin», «preview:»,
  «agente», «slug», «token», «MRR». Pasar a español llano (el Super Admin puede
  conservar los suyos).
  ✅ **Hecho 2026-10-02 (Fase 2).** «checkout», «delivery», «tagline», «badge», «builtin», «food cost» y «la PC del agente» fuera de las pantallas del dueño (cupones, funciones, plan Premium, editor del tema, perfil «Lema», zonas, insumos, salón, PC del local). Se dejó «Apps de delivery» (así se les dice en GT) y los textos del Super.

- [x] **T-15** · P1 · M — **Claves internas a la vista.** Bitácora de Personal con
  `order_void`, `descuento_mesa`, `channel_toggle`, `auto_archive`,
  `staff_pin_login`, `vale`, `mesa`, `articulo_libre` y «pedido → SERVED»
  (`describeActivity` cae al nombre crudo y a `STATUS_ES` le falta SERVED);
  permisos del personal con claves («aprobar_anulaciones», «menu»); accesos con
  IP `::1` / `::ffff:127.0.0.1`; «Formato de números: es-GT»; «Detalle técnico:
  falta WHATSAPP_TOKEN_KEY»; enlace `/admin/mesero` escrito en un estado vacío.
  Propuesta: diccionario de acciones legible («Carlos anuló un plato de la Mesa
  4»), etiquetas de permisos, y nunca IP/variables de entorno en el panel.
  Dónde: `staff-panel.tsx:50-60,151`, `access-log-panel.tsx`, `whatsapp-panel.tsx`.
  ✅ **Hecho 2026-10-02 (Fase 2).** Bitácora con frases (`lib/activity-labels.ts`, con pruebas: «Carlos anuló un plato — «se acabó»», «Aplicó un descuento del 10 % en la mesa 4 («Cumpleaños»)»); permisos viejos con palabras; accesos con «Dueño del restaurante» en vez de «Cuenta sin nombre» y sin IP local (`::1`, `::ffff:`, redes privadas); WhatsApp sin «WHATSAPP_TOKEN_KEY»; formato de números como selector de país con ejemplo; «Pedidos › Tomar pedidos» en vez de `/admin/mesero`.

### Componentes y patrones

- [ ] **T-05** · P2 · M — **Cinco estilos de cifras (KPI).** (a) rejilla en una
  tarjeta con número monoespaciado (Hoy, Pedidos, Clientes, Negocio); (b) tarjetas
  sueltas con número en Geist negrita (Lealtad); (c) píldoras «0 activos · 0 total»
  (Cupones); (d) Super Admin: rótulo Anton en mayúsculas + número Unbounded de
  color; (e) franja con scroll horizontal (Mesas). Todo a `<Stat>/<StatGroup>`
  (`components/ui/stat.tsx`).
  🔄 **Parcial 2026-10-02 (Fase 3):** Lealtad, Proveedores y Cupones ya usan `<StatGroup>/<Stat>` (Cupones solo si hay cupones). Quedan el Super (D-8) y la franja de Mesas (D-2).

- [x] **T-06** · P1 · S — **Tres cifras en rejilla de dos = hueco.** En Hoy
  («Resumen del día»), Pedidos («Tiempos de hoy»), Inventario, Lista de espera,
  Encuestas y Clientes la tercera cifra queda sola en una fila y deja medio
  recuadro vacío — también en escritorio a 1440 px (Hoy: dos tercios en blanco).
  Arreglo en `StatGroup`: con 3 elementos, 3 columnas (compactas en el teléfono).
  ✅ **Hecho 2026-10-02 (Fase 1).** La causa no era el teléfono: en escritorio la regla «cifra impar = dos columnas» ganaba por especificidad CSS a la de escritorio, y la tercera cifra saltaba de renglón. Reglas del teléfono con `max-md:` y conteo con `Children.toArray` (los `false` abrían columnas vacías). Visto: Hoy a 1440 con las tres cifras en una fila.

- [x] **T-07** · P2 · M — **Cinco estilos de pestañas.** Segmentado gris (secciones
  de la barra), subrayado (Lealtad, Reservaciones, Lista de espera, ficha del
  Super), segmentado blanco (Fichas/Plano/Lista de Mesas), segmentado con iconos
  (Personalizar) y píldoras (filtros de Tomar pedidos). Existe
  `components/ui/tabs.tsx` **sin un solo uso**. Dejar dos: «secciones» y «filtros».
  ✅ **Hecho 2026-10-02 (Fase 3).** `components/admin/page-tabs.tsx` + `.adm-tabs-page`: Lealtad, Proveedores, Reservaciones, Lista de espera y Facturación usan el control segmentado de la barra de sección (a lo ancho en el teléfono). Los filtros de Tomar pedidos siguen en píldoras. Pendiente: la ficha del Super (D-8).

- [x] **T-08** · P1 · M — **Cuatro maneras de guardar.** (1) barra flotante que
  aparece al haber cambios (Pedidos y cobro — la buena); (2) botón ancho
  deshabilitado «Sin cambios que guardar» (Perfil); (3) botón ancho siempre
  activo (Horarios «Guardar operación», Zona de entrega, Repartidores); (4)
  botón pequeño a la izquierda dentro de la tarjeta (Lealtad, Salón, La PC del
  local); y (5) barra fija enorme a todo el ancho (ficha del platillo). Unificar en
  `.adm-savebar` + `use-form-dirty.ts`, con el aviso de «cambios sin guardar» al
  salir.
  ✅ **Hecho 2026-10-02 (Fase 3).** `components/admin/save-bar.tsx`: una sola barra `.adm-savebar` que sale con cambios, dice «Guardado» un momento y pregunta «¿Salir sin guardar?» al tocar un enlace (y el aviso del navegador al cerrar). Usada en Perfil, Horarios, Ubicación, Zonas, Pedidos y cobro, Salón, Lealtad › Configuración, Facturación › Configuración, La PC del local y la ficha del platillo al editar; Personalizar conserva su barra con «Ver sitio» pero gana el aviso al salir. `useValueDirty()` nuevo para pantallas sin <form>. Probado en vivo en el platillo.

- [x] **T-09** · P2 · M — **Cinco maneras de «crear nuevo».** Formulario siempre
  abierto encima de la lista (Cupones, Repartidores, WhatsApp), una pestaña
  «Nueva reservación»/«Agregar grupo» (Reservaciones, Lista de espera), botón que
  abre ventana (Personal), botón que lleva a otra página (Platillos), y dos botones
  para lo mismo (Ingredientes: «+ Nuevo insumo» y «Agregar el primero»). Propuesta:
  botón «+ Nuevo…» arriba a la derecha → hoja/ventana; el estado vacío repite la
  acción solo cuando no hay nada.
  🔄 **Parcial 2026-10-02 (Fase 3):** Insumos con un solo «+ Nuevo insumo»; Cupones ya no abre el formulario de entrada (estado vacío + «+ Nuevo cupón» arriba a la derecha); Repartidores rehecho: «+ Nuevo repartidor», formulario solo al pedirlo, lista en tarjeta, estado vacío; Proveedores con el mismo botón. Quedan las pestañas «Nueva reservación»/«Agregar grupo».
  ✅ **Hecho 2026-10-02 (Fase 6).** Completo: Reservaciones y Lista de espera ya no crean desde una pestaña; «+ Nueva reservación» / «+ Agregar grupo» arriba a la derecha (solo con lista), formulario con título y «Cancelar», y la acción en el estado vacío cuando no hay nada.

- [x] **T-10** · P1 · M — **Títulos de pantalla sin regla.** Título repetido (barra
  «Hoy» + encabezado «Hoy»; Super: «Restaurantes/Restaurantes»,
  «Finanzas/Finanzas», «Inicio/Resumen de la plataforma»); encabezados internos en
  Anton MAYÚSCULAS («CATEGORÍAS DEL MENÚ», «POR ENVIAR A COCINA», «VISTA PREVIA»)
  junto a otros en Unbounded («Cierre del día», «Contá el efectivo»,
  «Información») y pantallas sin encabezado; barra con título equivocado
  (Repartidores y WhatsApp dicen «Panel»; Salón dice «Ajustes»; Cuentas del
  Super dice «Super Admin»); títulos cortados en el teléfono («Personal y
  permi…», «Copia de tus dat…»). Regla: la barra lleva el nombre de la pantalla,
  sin repetirlo abajo; rótulos de bloque con `.adm-label`.
  ✅ **Hecho 2026-10-02 (Fase 3).** Barra con el nombre correcto (Salón, Repartidores, WhatsApp, Facturación, Copia de datos, Platillo/Nuevo platillo, Cuentas en el Super) y sin repetirlo abajo: Hoy, Categorías, Repartidores, WhatsApp, Canales y siete pantallas del Super (`PageHeader` con título opcional). Encabezados de grupo de Pedidos sin Anton.

- [x] **T-11** · P2 · S — **Rótulos de formulario en MAYÚSCULAS** («NOMBRE *»,
  «CATEGORÍA», «CÓDIGO *», «PUNTOS OTORGADOS», «BILLETES», «GASTOS DE HOY») cuando
  el rediseño del 08-21 dejó los rótulos en minúscula (`.adm-label`). En Caja
  conviven «GASTOS DE HOY» y «Cortes recientes» en la misma pantalla.
  ✅ **Hecho 2026-10-02 (Fase 3).** `components/admin/field-label.ts` (`FIELD_LABEL`) en 14 formularios + Perfil: rótulos en minúscula, 13 px, como `.adm-label`. «ZONAS A LAS QUE LLEVAS…» pasó a título de ficha.

- [x] **T-12** · P1 · M — **Fichas grises en modo claro.** El formulario del
  platillo, las tarjetas de pedido, la ficha del restaurante y los formularios del
  Super se ven grises (gris sobre gris, con campos grises) mientras el resto del
  panel usa tarjetas blancas. Causa: usan `<Glass variant="quiet">`, pensado para
  el menú en oscuro, en vez de `<Card>` del panel.
  Dónde: `product-form.tsx` (11 usos), `components/super/*` (≈20),
  `staff-pin-login.tsx`, `order-card.tsx`.
  ✅ **Hecho 2026-10-02 (Fase 3).** En `admin.css`, dentro del área de personal `.glass-quiet`/`.glass-solid` se pintan como tarjeta del panel (blanca en claro, sin desenfoque): arregla de una vez el platillo, las fichas del Super y el resto. Tarjeta de pedido con `--adm-card` y contorno rojo si va tarde. Visto en claro y oscuro.

- [x] **T-16** · P2 · M — **Diálogos del sistema operativo.** 15 `confirm()` y 2
  `alert()` («PIN actualizado.», «Contraseña actualizada…»): caja gris del
  navegador, fuera del tema, en inglés en algunos navegadores. Existe
  `components/ui/dialog.tsx` (2 usos). Propuesta: `useConfirm()` sobre ese diálogo
  y, para borrar cosas recuperables, toast con «Deshacer».
  Dónde: `categories-panel.tsx:423`, `cupones-panel.tsx:108`,
  `delete-button.tsx:20`, `staff-panel.tsx:236-237,493`, `proveedores-panel.tsx:95,237`,
  `reservaciones-panel.tsx:137`, `ingredient-panel.tsx:155`, `recipe-editor.tsx:345`,
  `invitations-panel.tsx:67`, `trusted-devices-panel.tsx:132`,
  `entry-pin-card.tsx:91`, `canales-panel.tsx:75`, `super/theme-editor.tsx:108,464`.
  ✅ **Hecho 2026-10-02 (Fase 3).** `useConfirm()` en `components/ui/confirm-dialog.tsx` (diálogo del panel, foco en «Cancelar», rojo solo si borra) y `confirmSubmit()` para formularios con server action (pregunta y reenvía el mismo formulario). Cambiados los 15 `confirm()`, incluido `DeleteButton`; los dos `alert()` de Personal pasaron a aviso (toast) y ya no se repiten en cada render. Probado en vivo: Cancelar no borra, Eliminar sí (categoría de prueba creada y borrada).

- [x] **T-17** · P3 · S — **Estados vacíos dispares:** tarjeta centrada con icono y
  botón (Reservaciones, Ingredientes), sin tarjeta (Lista de espera), texto suelto
  (Caja «Aún no hay arqueos»). Todo a `<EmptyState>`.
  ✅ **Hecho 2026-10-02 (Fase 3).** Lista de espera con `<EmptyState>`. «Aún no hay arqueos» en Caja se deja como nota dentro de su tarjeta a propósito (la acción está en la misma pantalla).

- [x] **T-18** · P2 · S — **Avisos de cinco colores:** ámbar (Lealtad), morado
  (Encuestas), azul (La PC del local), rojo rosado (WhatsApp), gris (Zona de
  entrega). Quedarse con cuatro semánticos: info · aviso · peligro · éxito.
  ✅ **Hecho 2026-10-02 (Fase 3).** Avisos con las clases `.note-info/-warn/-danger/-ok`: Encuestas (morado → info), WhatsApp sin conexión (rojo → info: no es un error del dueño), Zona de entrega (gris → info), Lealtad (warn).

- [ ] **T-19** · P3 · S — **Gráficas de colores distintos:** barras naranja (Hoy),
  café oscuro (Encuestas), negras (Visitas), gris+naranja y naranja pálido (Super).
  Paleta de gráficas en tokens.

- [ ] **T-20** · P2 · S — **Blancos táctiles pequeños.** «×» para anular una línea
  de pedido: 22 px y rojo, pegado al precio; flechas de Categorías: 26 px; «quitar
  mesa» del plano: 24 px; enlaces «Configurar →»/«Abrir X →» de Funciones: 17 px
  de alto; teléfonos del pedido: 18 px. Mínimo 44 px de área en el teléfono.

- [ ] **T-21** · P2 · S — **Texto de menos de 11 px:** nombres del selector de
  iconos (9,5), encabezados de tabla de Finanzas (9,5), ejes de gráficas (7,5–9),
  insignias «NUEVO/POPULAR/VENCIDO/PAGADO» (9,5), URL bajo cada QR (9,5).

### Escala visual

- [ ] **T-22** · P2 · L — **No hay escala tipográfica.** 1.900 `fontSize` en línea
  con ~40 tamaños distintos (13, 12,5, 12, 13,5, 11,5, 11, 14,5, 9,5…) y 7 pesos
  (400–900). Propuesta: 8 tamaños en tokens (`--fs-11 … --fs-32`) y 4 pesos; se
  migra pantalla a pantalla junto con lo demás (no de golpe).

- [ ] **T-23** · P3 · M — **Radios sin escala:** 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18 px. Ya existen `--radius-md/lg/xl/2xl`; usarlos.

- [ ] **T-24** · P2 · S — **Ancho de contenido distinto por pantalla:** Hoy y
  Ajustes ~1.040 px, Pedidos/Menú/Mesas a todo el ancho, Super con rejillas que
  llenan dos tercios. Dos anchos: «lectura» (formularios, ajustes) y «tablero»
  (operación).

- [ ] **T-25** · P3 · S — **Emojis junto a iconos de línea** (alérgenos 🥕🌶🥚 en la
  ficha y en el menú). Opcional: iconos propios o dejarlos (se reconocen bien).

- [ ] **T-26** · P2 · L — **Componentes base que casi no se usan**: `Input` (2
  usos), `Tabs`, `Sheet`, `Skeleton`, `Textarea`, `Tooltip` (0) — mientras 4.700
  `style={{…}}` reimplementan lo mismo a mano. Es la raíz de T-05…T-12: cada
  pantalla dibuja sus propias piezas.

- [ ] **T-04** · P2 · S — **Aviso «Pedido nuevo» tapa el contenido.** En el
  teléfono queda fijo sobre los últimos ~90 px de cualquier pantalla (campos,
  interruptores, «Guardar»). Dar ese espacio al contenido mientras está visible o
  plegarlo a una píldora tras unos segundos.

---

## 2 · Panel · Armazón y navegación

- [x] **N-01** · **P1** · M — **El Centro de ayuda describe un menú que ya no
  existe.** «El menú lateral tiene tres grupos: Operación, Negocio y Cuenta. La
  sección Cuenta empieza oculta… haz clic en "Cuenta" para expandirla… Módulos,
  Soporte». El menú es de 6 destinos desde el 08-21. Revisar
  `lib/tutorial/content.ts` (1.276 líneas) y los tours guiados contra la
  navegación actual (`lib/admin-nav.ts`); idealmente una prueba que falle si un
  tutorial nombra una pantalla que no está en el menú.
  ✅ **Hecho 2026-10-02 (Fase 2).** `lib/tutorial/content.ts` reescrito sección por sección contra `admin-nav.ts` y las pantallas: los seis destinos, rutas reales (Ajustes → Horarios, Menú → Platillos…), flechas ↑↓ en vez de arrastrar, agotado por 12 h, lealtad con premios (sin «canjear puntos al pagar», que ya no existe), caja, salón, tomar pedidos, lista de espera; «Plan Popular» → «Plan Estándar». Tours: el paso de la pausa buscaba el interruptor en Perfil (ahora va a Horarios) y los de catálogo/categorías hablaban de arrastrar.

- [x] **N-02** · P1 · S — **Pantallas huérfanas.** Repartidores y WhatsApp no están
  en ningún menú, su barra dice «Panel» y no tienen «volver». Repartidores además
  guarda las **zonas y tarifas de envío**. Darles sitio: Repartidores en Pedidos
  (o Ajustes › Zona de entrega) y WhatsApp en Ajustes.
  🔄 **Parcial 2026-10-02:** las zonas salieron de Repartidores (N-03). Repartidores y WhatsApp siguen sin sitio en el menú.
  ✅ **Hecho 2026-10-02 (Fase 4).** Repartidores y WhatsApp en Ajustes › Servicio y en el menú (`admin-nav.ts`, con la prueba que compara menú y portada): Repartidores si se entrega a domicilio; WhatsApp solo cuando la conexión ya está activa en Leogin (si no, sería un callejón; la decisión de fondo sigue en D-6). Con sitio en el grupo, las dos ganan su «‹ Ajustes».

- [x] **N-03** · P1 · M — **La entrega a domicilio se configura en dos sitios.**
  El radio en el mapa vive en Ajustes › Zona de entrega; las zonas por nombre y su
  tarifa, en Repartidores (pantalla huérfana). La propia Zona de entrega dice «usará
  las zonas de texto (si las configuraste)» sin decir dónde. Juntarlo en Zona de
  entrega.
  ✅ **Hecho 2026-10-02 (Fase 2).** Las zonas con su tarifa pasaron a Ajustes › Zona de entrega, junto al mapa; Repartidores deja un enlace. Y la tarifa normal de envío ya se puede poner (AJU-19).

- [x] **N-04** · P2 · S — **Textos que mandan a sitios viejos:** «La cantidad de
  mesas, en Mesas» (Pedidos y cobro), «Para las mesas, usa los QR de la sección
  Mesas» (Código QR) — los dos viven ahora en Ajustes › Salón.
  Dónde: `orders-currency-editor.tsx`, `app/admin/(protected)/qr/page.tsx`.
  ✅ **Hecho 2026-10-02 (Fase 2).** «La cantidad de mesas y sus QR, en Ajustes › Salón»; el QR general manda a Salón; la ficha del platillo apunta a «Menú también en inglés» en Ajustes.

- [x] **N-05** · P1 · S — **Tres cifras distintas para «funciones activas».**
  Ajustes dice «15 activas» (cuenta todo el jsonb `modules`), Funciones dice «8
  funciones activas» (solo las activables) y Suscripción «7 módulos incluidos».
  Dónde: `ajustes/page.tsx:102`, `modules-panel.tsx:227`, `suscripcion/page.tsx:180`.
  ✅ **Hecho 2026-10-02 (Fase 1).** Ajustes cuenta igual que Funciones («8 activas»); Suscripción dice «7 funciones incluidas» (lo que trae el plan, que es otra pregunta).

- [ ] **N-06** · P2 · S — **Ajustes en escritorio desbalanceado:** tres columnas de
  alturas muy distintas («Tu restaurante» 7 filas, «Servicio» 2, «El equipo» 1) y
  «Tu cuenta» debajo de la primera — dos tercios de la pantalla vacíos abajo.
  Dos columnas equilibradas.

- [ ] **N-07** · P3 · S — **Insignias «NUEVO»/«POPULAR» permanentes** en Funciones
  (Reservaciones, Encuestas y Cupones son de julio). Atarlas a una fecha de alta.

- [x] **N-08** · P1 · S — **Error de React al abrir Facturación y Canales.**
  Cargando `/admin/facturacion` (FEL apagado) o `/admin/canales` directamente, la
  consola lanza *Minified React error #310* antes de redirigir (anotado en la
  auditoría del 09-22 como pendiente). Pintar un aviso «Esta función no está
  activa» en vez de `redirect()` dentro de la página.
  ✅ **Hecho 2026-10-02 (Fase 1).** Facturación ya no redirige (pinta el aviso) y Canales se redirige desde `next.config.ts`. Barrido: 0 errores de consola en las dos.

- [x] **N-09** · P2 · S — **Facturación con FEL apagado lleva a «Funciones»** sin
  explicar por qué: quien venía de Negocio aterriza en Ajustes. Ligado a N-08.
  ✅ **Hecho 2026-10-02 (Fase 1).** Facturación apagada dice «La factura electrónica todavía no está activa» con enlace a Funciones (sin el «+» de crear: `EmptyState` acepta `icon: null`). La barra todavía dice «Panel» (va con T-10).

- [ ] **N-10** · P2 · M · ⏸️ — **Sesión que se cae bajo carga (a investigar).**
  Durante el barrido, 2 de los 8 recorridos del panel aterrizaron en el login
  con la sesión viva («Continuar como…»). El layout trata cualquier fallo de
  `auth.getUser()` (también un error de red o un tiempo agotado) igual que «no
  hay sesión» y manda al login. En local fue con la máquina sin memoria; no está
  visto en producción. Propuesta: distinguir error de «sin usuario» y reintentar
  una vez antes de expulsar. Dónde: `app/admin/(protected)/layout.tsx:45`,
  `lib/supabase/server.ts:113`.

---

## 3 · Panel · Hoy

- [x] **HOY-01** · **P1** · S — **El importe de «En curso» se corta en el
  teléfono** («Q132.(», «Q243.(»). Las columnas tienen ancho fijo
  (`w-26` + `w-29` + `w-24` = 316 px + huecos) y no caben en 358 px.
  Propuesta: en el teléfono, dos renglones (mesa/canal + estado arriba, cliente y
  total abajo) o quitar el ancho fijo del estado.
  Dónde: `app/admin/(protected)/page.tsx:369-380`.
  ✅ **Hecho 2026-10-02 (Fase 1).** En el teléfono, dos renglones (canal + estado + total arriba, cliente y tiempo abajo); desde `sm`, la fila de siempre. Visto con 8 pedidos activos.

- [ ] **HOY-02** · P2 · S — **«Hoy» dos veces** (barra + encabezado). Ver T-10.

- [x] **HOY-03** · P2 · S — **«Resumen del día» con hueco** (T-06) **y sin
  comparación.** Un «+12 % vs. el viernes pasado» bajo cada cifra es lo que hace
  útil la portada (y lo que el dueño mira cada día).
  ✅ **Hecho 2026-10-02 (Fase 6).** El hueco se fue con T-06. La comparación sube a donde se mira: bajo «Ventas», «↑ 12 % vs. un viernes normal» (lo que un día igual llevaba a esta hora, promedio de las cuatro semanas anteriores; con menos de dos días de referencia no se dice nada). `Stat` admite ahora una línea `sub`.

- [ ] **HOY-04** · P2 · S — **«Cómo va el día» en escritorio:** el total abajo a la
  izquierda y las barras apretadas en el tercio derecho; mucho blanco.

- [ ] **HOY-05** · P1 · M · ⏸️ D-3 — **Las mismas cifras en tres pantallas** (Hoy,
  Pedidos › En vivo, Negocio › Resumen): Ventas/Pedidos/Ticket + «14 días» + «Lo
  que más sale». Ver D-3.

---

## 4 · Panel · Pedidos

### En vivo

- [x] **PED-01** · **P1** · S — **Siete cifras antes del primer pedido** en el
  teléfono (~640 px de scroll): «Ventas hoy», «Pedidos hoy (8 en curso)», «Ticket
  promedio hoy», «En cocina (preparándose ahora)», y tres de «Tiempos de hoy». En
  la pantalla de operación lo primero son los pedidos: cifras en una franja de
  una línea (o plegables).
  ✅ **Hecho 2026-10-02 (Fase 4).** En el teléfono las cifras del día y los tiempos van en UNA franja que se desplaza de lado (`StatStrip`: «Q138.00 vendido hoy · 2 pedidos · 2 en curso · 1 en cocina…»); en escritorio, igual que antes. No cambia QUÉ cifras se enseñan (eso es D-3). Los filtros por tipo de servicio también quedaron en una fila.

- [ ] **PED-02** · P1 · M · ⏸️ D-2 — **Tarjeta de pedido sobrecargada (~450 px en el
  teléfono).** El tiempo sale tres veces (encabezado del grupo, chip «38 min» y
  banda «38 min esperando.»); todo en rojo (borde, chip, banda) aunque solo sea un
  aviso → fatiga de alarma; «Entró: 02 oct 2026, 11:06 a. m.» con fecha completa en
  pedidos de hoy; «Mesa 9» dos veces (título y detalle); cuatro botones por
  tarjeta. Propuesta: un solo reloj con color por umbral, banda solo si pasa el
  doble del umbral, hora sola, «Recibo» y «Copia de comanda» en un «⋯».

- [ ] **PED-03** · P2 · S — **Dos formatos de número de pedido:** «H-7» y
  «ORD-2026-00057». En Cocina «#ORD-2026-00057» a tamaño grande se corta. Mostrar
  la forma corta en todas partes («#57»).

- [ ] **PED-04** · P3 · S — **Encabezados de grupo en Anton MAYÚSCULAS** («POR
  ENVIAR A COCINA», «LISTOS PARA ENTREGAR») — el único sitio del panel con ese
  estilo junto con Categorías. Ver T-10.

- [ ] **PED-05** · P3 · S — **Filtros en dos líneas** en el teléfono (Todos / En
  local / Para llevar / Domicilio): una sola fila con scroll.

- [ ] **PED-06** · P2 · M · ⏸️ D-2 — **Escritorio: grupos apilados en una página de
  2.900 px.** A 1440 px caben tres columnas (Por enviar · En cocina · Listos) y se
  vería todo sin mover la página.

- [ ] **PED-07** · P2 · S — **«×» rojo de 22 px para anular un plato**, pegado al
  precio: fácil de tocar sin querer en hora pico. Pasarlo al «⋯» de la tarjeta o
  pedir confirmación en el sitio.

### Cocina

- [ ] **PED-08** · P3 · S — **Colores fuera de la paleta** (azul «Comenzar», verde
  «Marcar listo»; 25 colores hex fijos en `kitchen-display.tsx`). En cocina el
  código de color tiene sentido, pero que salga de los tokens semánticos
  (`--c-ok`, `--c-info`…) para que el modo claro/oscuro y el contraste queden
  garantizados.

### Mesas

- [ ] **PED-09** · P1 · S · ⏸️ D-2 — **17 mesas libres como filas de 60 px a todo el
  ancho** en el teléfono: ~1.000 px de scroll vacío. En escritorio ya son una
  rejilla; en el teléfono, 4–5 por fila.

- [ ] **PED-10** · P2 · S — **Recortes en el teléfono:** la tercera cifra («Sin
  cobrar Q0.») queda cortada, y la pestaña «En qué va» también. Además dos filas
  de pestañas + botón antes de la primera mesa.

- [ ] **PED-11** · P3 · S — **Dos relojes en la ficha** («Lista 8 min» y «11 min»):
  en el teléfono no dice qué es cada uno (en escritorio sí: «en esta etapa»).

- [ ] **PED-12** · P3 · S — **Texto de explicación permanente** («Las mesas se
  ordenan por urgencia, no por número…»): a la ayuda o a un «?».

### Tomar pedidos

- [ ] **PED-13** · P2 · S · ⏸️ D-2 — Detalles sin tocar el diseño: los platillos
  **agotados salen primero** en la rejilla (Roll de Canela, Mocha Negra) — deberían
  ir al final; filtro «Por co…» cortado; «26 min · 3 pl…» truncado en la lista de
  escritorio.

---

## 5 · Panel · Menú

- [x] **MEN-01** · **P1** · S — **Sin buscador en Platillos.** El plan Básico admite
  150 platillos; encontrar uno es hacer scroll. Buscador + filtro por categoría
  (que ya existe) + «sin foto» / «agotados».
  ✅ **Hecho 2026-10-02 (Fase 4).** Buscador en Platillos (sin tildes ni mayúsculas, en nombre, descripción y etiquetas) que se combina con la categoría, y filtros rápidos «Agotados», «Sin foto» y «Ocultos» con su cuenta, que solo salen si hay algo que filtrar. «3 platillos de 42 · Quitar filtros» y estado vacío del filtro con salida. De paso, los precios de la lista con `fmtMoney` (aún iban con `Q{toFixed(2)}`). Probado en vivo: «canela» → Roll de Canela; «zzzz» → aviso y «Quitar filtros».

- [x] **MEN-02** · **P1** · S — **Ficha del platillo en el teléfono: lo básico va
  cuarto.** Primero salen Foto, Ícono del patrón y Disponible; nombre y precio
  después. En escritorio «Lo básico» sí va primero. Mismo orden en los dos.
  ✅ **Hecho 2026-10-02 (Fase 1).** En el teléfono las columnas se disuelven (`display: contents`) y cada tarjeta se ordena: foto, lo básico, los interruptores, el resto, y el icono del patrón al final. La rejilla pasó a `minmax(0, 1fr)`: sin eso, el selector de iconos estiraba la ficha a 809 px (se vio y se corrigió antes de darlo por bueno).

- [x] **MEN-03** · **P1** · S — **«Disponible» y «Platillo activo» se confunden.**
  «Disponible» apagado dice «Oculto en el menú»; «Platillo activo» apagado dice
  «no aparece en el menú»; y la lista dice «Agotado». Propuesta: «Hay existencias
  hoy» (apagado = Agotado, se ve pero no se pide) y «Mostrar en el menú».
  ✅ **Hecho 2026-10-02 (Fase 1).** «Hay existencias / Agotado» («Se ve en el menú pero no se puede pedir. Vuelve solo en 12 h.») y «Mostrar en el menú / Oculto del menú». En la lista, «Disponible / Agotado» en vez de «Activo», y el aviso del deshacer ya no dice que se oculta.

- [ ] **MEN-04** · P2 · S — **«Eliminar» rojo arriba junto al título.** Bajarlo a
  una «zona de peligro» al final del formulario.

- [ ] **MEN-05** · P3 · S — **El precio no lleva «Q»** dentro del campo; teclado
  numérico decimal en el teléfono.

- [ ] **MEN-06** · P3 · S — **Etiquetas duplicables:** «Nuevo» de las sugeridas y
  «Nuevo ×» personalizada a la vez.

- [ ] **MEN-07** · P3 · S — **Botón «Combo (componentes incluidos)»** con fondo
  verde, borde naranja punteado y texto rojo.

- [ ] **MEN-08** · P2 · M — **Categorías:** todas con el mismo icono genérico (una
  mesa), encabezado Anton «CATEGORÍAS DEL MENÚ», flechas de 26 px, y cada flecha
  es un viaje al servidor con recarga. Propuesta: arrastrar para ordenar (o
  flechas optimistas), y el icono solo si la categoría tiene uno.

- [ ] **MEN-09** · P3 · S — **Ingredientes:** dos botones para lo mismo y «food cost».

- [ ] **MEN-10** · P2 · S — **Inventario en el teléfono:** el nombre del platillo se
  corta detrás de los controles (− 26 + ⏱ ⚙); cifras 2+1 (T-06).

- [ ] **MEN-11** · P3 · S — **Excel/PDF en una fila propia** sobre la lista
  (Platillos, Clientes). Un botón «Exportar» junto a la acción principal.

- [x] **MEN-12** · P2 · S — **Marketing — platillos sin foto.** Sin foto la carta
  pierde pedidos. Contador «4 platillos sin foto» con acceso directo (en Hoy ›
  «Necesita tu atención» y como filtro en Platillos).
  ✅ **Hecho 2026-10-02 (Fase 6).** Aviso «N platillos sin foto» en Hoy › Necesita tu atención (solo para quien edita el catálogo), que abre Platillos con el filtro «Sin foto» ya puesto (`?filtro=sin-foto`). El filtro en Platillos llegó con MEN-01.

---

## 6 · Panel · Clientes

- [x] **CLI-01** · **P1** · S — **Clientes sin buscador ni orden, y con cifras sin
  rótulo** («0  Q0.00», «1  Q88.50»: ¿pedidos? ¿gasto?). Buscador por nombre o
  teléfono, orden por gasto/última visita, y «3 pedidos · Q88.50».
  ✅ **Hecho 2026-10-02 (Fase 4).** Buscador por nombre o teléfono y orden (Última visita · Más gasto · Más pedidos · Nombre) en la URL (`?q=&orden=`), porque la lista se pagina en el servidor; abrir un cliente o pasar de página conserva la búsqueda. En el teléfono, cada fila dice «3 pedidos · Q88.50 · último 22 sep» en vez de dos números sueltos. `lib/customer-sort.ts` aparte para no meter el cliente de Supabase con service role en el navegador. Probado: «kiosko» y «5550» (teléfono) encuentran a quien deben.

- [ ] **CLI-02** · P2 · S — **Lealtad:** el aviso «Configura las tasas del programa
  para empezar» aparece aunque los campos ya muestran 1/10/100 (no se sabe si está
  activo o no); dobles espacios alrededor de «Recompensas» en el interruptor; dos
  párrafos largos de letra pequeña; guardar pequeño a la izquierda (T-08).

- [ ] **CLI-03** · P2 · S — **Cupones:** el formulario «Crear cupón» está siempre
  abierto aunque arriba hay «+ Nuevo cupón» (T-09).

- [ ] **CLI-04** · P2 · S — **Encuestas:** las reseñas tienen scroll propio dentro
  de la tarjeta (scroll dentro de scroll en el teléfono); barras café oscuro;
  aviso morado (T-18, T-19).

- [ ] **CLI-05** · P3 · S — **Reservaciones / Lista de espera:** «Nueva
  reservación» y «Agregar grupo» son pestañas, no botones (T-09); estados vacíos
  distintos entre las dos.

- [x] **CLI-06** · P3 · M — **Marketing — volver a traer clientes.** Hoy solo se
  exportan. Ideas: «Escribir por WhatsApp» desde la fila (wa.me), y un filtro «no
  vuelven hace 30 días».
  ✅ **Hecho 2026-10-02 (Fase 6).** En la ficha del cliente, «Escribir por WhatsApp» (wa.me con «¡Hola Ana! Te escribimos de Azúcar Negra.» ya escrito) y en la lista el filtro «Sin pedir hace +30 días» (en el servidor: último pedido hace más de 30 días; quien nunca pidió no cuenta).

---

## 7 · Panel · Negocio

- [x] **NEG-01** · **P1** · S — **Finanzas:** `Q2794.10` sin separador (T-01) y
  «Utilidad (margen 48 %) Q34.50» con un ingreso de Q2,794: el margen sale solo de
  los platillos que tienen costo, y no lo dice. Rótulo honesto: «Utilidad de los
  platillos con costo (1 de 10)» + invitación a cargar costos.
  ✅ **Hecho 2026-10-02 (Fase 1).** Aviso bajo las cifras cuando faltan costos: «La utilidad y el margen solo cuentan los platillos que tienen costo cargado: Q72.00 de Q2,781.00 vendidos (3%)».

- [ ] **NEG-02** · P2 · M · ⏸️ D-3 — **Resumen repite Hoy.** Proponer periodo
  (semana/mes) y comparación con el periodo anterior.

- [ ] **NEG-03** · P3 · S — **Analítica:** rótulos con paréntesis («Pedidos válidos
  (31 con cancelados)», «Franja pico (día fuerte: Vie)»); «Aplicar» negro y el
  periodo elegido naranja (dos colores para el mismo control).

- [ ] **NEG-04** · P2 · S — **Caja en el teléfono:** el paso 3 «Propinas» se corta
  por la derecha; el campo «turno» metido en la línea de la fecha parece roto;
  hueco vacío antes de «Cortes recientes»; «GASTOS DE HOY» vs «Cortes recientes».

- [ ] **NEG-05** · P3 · S — **Gráficas sin valores**: ni eje ni cifra al tocar una
  barra; ejes a 7,5–9 px.

- [ ] **NEG-06** · P2 · S — **«Cerrar la caja del día»** aparece al final de
  Finanzas como enlace a Caja, que ya es una pestaña al lado: sobra.

---

## 8 · Panel · Ajustes

### Portada y pantallas

- [x] **AJU-01** · **P0** · S — **Horarios: el interruptor está al revés.** Dice
  «Recibiendo pedidos» con el interruptor **apagado**; encenderlo **pausa** los
  pedidos (`checked={paused}`). Lo esperado: encendido = recibiendo.
  Dónde: `hours-editor.tsx:187-197`.
  ✅ **Hecho 2026-10-02 (Fase 1).** Encendido = recibiendo pedidos. Textos: «Apágalo para pausar…» / «Tus clientes no pueden pedir hasta que lo vuelvas a encender».

- [x] **AJU-02** · **P0** · S — **Horarios: «Cerrado» cuando está abierto.** Sin
  ningún día configurado, cada día dice «Cerrado», pero el sistema lo trata como
  **siempre abierto** (lo dice el propio texto de ayuda). Mostrar «Abierto todo el
  día (sin horario)» o pedir que se configure.
  Dónde: `hours-editor.tsx:224-225,315`.
  ✅ **Hecho 2026-10-02 (Fase 1).** Sin ningún día encendido: aviso «Sin horario: tu menú sale abierto a toda hora» y cada día dice «Sin horario». Comprobado en `lib/hours.ts`: `hours = null` → abierto siempre.

- [x] **AJU-03** · P3 · S — **Horarios:** botón «Guardar operación» (¿qué
  operación?) → «Guardar horario»; ayuda con «badge» y «checkout».
  ✅ **Hecho 2026-10-02 (Fase 1).** Botón «Guardar horario»; ayuda sin «badge» ni «checkout».

- [ ] **AJU-04** · P2 · S — **Perfil: una tarjeta por campo** (6 tarjetas para 6
  campos); el ejemplo de WhatsApp es una lista de formatos que se corta; la
  pantalla se llama «Perfil» en la barra, «Información» en el encabezado y «Perfil
  del negocio» en Ajustes.

- [x] **AJU-05** · P1 · M — **Salón:** la barra dice «Ajustes»; en el teléfono las
  mesas del plano **salen encimadas** (1–5 superpuestas, con sus «×» chocando):
  están a 15 % del ancho una de otra (~44 px) y cada una mide ~60 px — el tamaño de
  la mesa no se ajusta al ancho del plano (en escritorio se ven bien); 20 QR a tamaño
  completo uno tras otro → página de 4.700 px en el teléfono, y **no hay
  «Descargar todos»** (PDF listo para imprimir, uno por mesa o en hoja de
  pegatinas).
  ✅ **Hecho 2026-10-02 (Fase 4).** Mesas del plano que se achican con el plano (38–68 px, crecen con el zoom) — ya no salen encimadas en el teléfono; «Descargar todos (PDF)»: hoja A4 con seis QR por página, nombre del restaurante, «Mesa N» y línea de corte (`lib/documents/table-qr-sheet.ts`, 405 KB para 20 mesas); se ven 8 QR con «Ver los 20 QR», y la URL larga dejó la tarjeta («Copiar enlace» la copia). La barra ya decía «Salón» (T-10). La página bajó de ~4.700 a 2.884 px en el teléfono.

- [ ] **AJU-06** · P2 · M · ⏸️ D-5 — **QR de mesa con UUID** (`/m/aaaaaaaa-aaaa-…/7`):
  código más denso (peor lectura impreso pequeño) y dirección ilegible.

- [x] **AJU-07** · P2 · M — **Marketing — Código QR sin marca.** Solo el cuadro
  negro. Logo al centro, nombre del restaurante, «Escanea para ver el menú y
  pedir», y cartel/tarjeta de mesa para imprimir (A6, pegatina, PNG para redes).
  ✅ **Hecho 2026-10-02 (Fase 6).** El QR general lleva tu logo al centro (QR con corrección alta `ecc=H`) y la pantalla ofrece «Tarjeta para redes (PNG)» 1080×1350 —nombre, QR, «Escanea para ver el menú y pedir» y el enlace— y «Cartel para imprimir (PDF, A6)» en hoja A5 con línea de corte (`lib/documents/qr-art.ts`, que también usan los QR de mesa). Fondo claro y acento solo como detalle, por D-4. Verificado sin logo (en local ningún restaurante tiene y el proxy de logos solo acepta HTTPS); si el logo no carga, el recuadro se oculta.

- [ ] **AJU-08** · P2 · S — **Zona de entrega** con el mapa apagado es un
  interruptor y un botón enorme «Guardar ubicación y radio»; el icono del aviso
  queda en su propia línea. Ver N-03.
  🔄 **Parcial 2026-10-02:** ahora tiene las zonas debajo del mapa. Quedan los dos botones grandes de guardar (va con T-08) y el icono del aviso en su propia línea.

- [x] **AJU-09** · P2 · S — **Pedidos y cobro: «Formato de números» pide escribir
  «es-GT».** Selector con ejemplo («Guatemala — Q1,234.50»).
  ✅ **Hecho 2026-10-02 (Fase 2).** Selector por país (Guatemala, México, El Salvador…) con el ejemplo «Así se ven tus precios: 1,234.50»; un código raro ya guardado se conserva.

- [x] **AJU-10** · **P1** · M — **Personalizar el sitio mide 12.800 px en el
  teléfono.** 22 plantillas a alto completo (cada vista previa ~60 % vacía), y la
  vista previa del sitio al fondo de todo. Las miniaturas dicen «Tu Restaurante» /
  «TU RESTO» en vez de tu nombre y tu logo. Propuesta: rejilla de 2 columnas con
  miniaturas recortadas, botón flotante «Ver cómo queda», y miniaturas con tus
  datos (vende mucho más la plantilla).
  ✅ **Hecho 2026-10-02 (Fase 4).** Galería en dos columnas en el teléfono con la miniatura reducida y recortada en cuadrado (sin la descripción), las miniaturas con el nombre del restaurante (también en Mi cuenta › Nuevo restaurante, con el nombre que se va escribiendo) y un botón flotante «Ver cómo queda» que baja a la vista previa (y «Ver» dentro de la barra de guardar). La pantalla pasó de ~12.800 a 3.712 px en el teléfono.

- [ ] **AJU-11** · P2 · S — **La PC del local:** «hace 2004 h» (T-02); los dos
  enlaces del final llevan títulos de 22 px en Unbounded, más grandes que los
  títulos de la pantalla; jerga («agente», «preview:», ««documento»»).

- [x] **AJU-12** · **P1** · M — **Personal:** la bitácora enseña claves crudas
  (T-15) y ~50 filas sin «ver más»; «Últimos accesos» repite «Cuenta sin nombre»
  ~40 veces con la IP; los permisos de cada persona salen como claves. Página de
  4.600 px en el teléfono. Propuesta: nombres legibles, agrupar accesos por persona
  y aparato, 10 filas + «Ver todo».
  ✅ **Hecho 2026-10-02 (Fase 2).** Ver T-15. Además: 10 filas de actividad + «Ver toda la actividad (30)», accesos repetidos del mismo ingreso agrupados y 8 a la vista con «Ver más» (`<details>`, sin JS). La página bajó de 4.600 a 2.700 px en el teléfono.

- [x] **AJU-13** · **P1** · S — **Mi suscripción:** dinero con coma (`Q1146,00`),
  fechas ISO, «cobro(s)», filas del historial partidas en 4 líneas en el teléfono,
  «1 de novi…» cortado. Y lo más importante: **con pagos vencidos no hay cómo
  pagar** — ni datos de la cuenta bancaria ni botón «Enviar comprobante por
  WhatsApp».
  🔄 **Parcial 2026-10-02:** dinero, fechas («1 nov 2026», «Vence el 1 sept 2026»), «Mensualidad septiembre de 2026» y plurales, hechos. Falta lo de pagar con cobros vencidos y las filas del historial en el teléfono.
  ✅ **Hecho 2026-10-02 (Fase 2).** Con cobros pendientes: bloque «Cómo pagar» con las instrucciones que Leogin escribe en Super › Configuración › Soporte (nueva clave `payment_instructions` en `platform_settings`, sin migración) y botón «Enviar comprobante de pago» por WhatsApp con el monto y el restaurante ya escritos. Historial en dos renglones en el teléfono; «1 nov 2026». Visto con instrucciones de prueba (luego borradas).

- [ ] **AJU-14** · P2 · S — **Funciones:** conteos que no cuadran (N-05),
  insignias caducas (N-07), enlaces de 17 px, «Activado para tu restaurante» en
  verde metido en medio de una descripción.

- [ ] **AJU-15** · P1 · S · ⏸️ D-6 — **WhatsApp:** le enseña al dueño «Detalle
  técnico: falta WHATSAPP_TOKEN_KEY» y un formulario de la API de Meta que no
  puede funcionar sin esa configuración del servidor.
  🔄 **Parcial 2026-10-02:** sin la clave del servidor ya no se enseña el formulario de Meta ni el «Detalle técnico»; el aviso dice que se escriba a soporte. Esconder la pantalla entera sigue pendiente de D-6.

- [ ] **AJU-16** · P2 · S — **Repartidores:** barra «Panel», selector nativo del
  sistema, formulario siempre abierto. Ver N-02/N-03.

- [ ] **AJU-17** · P3 · S — **Copia de tus datos:** bien resuelta. Solo el título
  cortado en el teléfono (T-10).

- [ ] **AJU-18** · P2 · S — **Interruptor «Menú también en inglés» suelto en la
  portada de Ajustes** (bien que sea un interruptor, pero sin decir cuántos
  platillos están traducidos: «3 de 10 platillos traducidos»).

- [x] **AJU-19** · **P1** · S — **La tarifa normal de envío no se podía configurar.**
  (Encontrado al reescribir la ayuda.) `deliveryFee` existía en el tema con 0 por
  defecto, pero ninguna pantalla lo editaba: un restaurante sin zonas entregaba
  gratis sin saberlo.
  ✅ **Hecho 2026-10-02 (Fase 2).** Fila «Envío a domicilio» en Ajustes › Pedidos y cobro (solo si entrega a domicilio), acotada en el servidor a 0–10,000; las zonas siguen mandando sobre ella.

- [x] **AJU-20** · P1 · S — **Guardar te sacaba de la pantalla.** Guardar el
  horario, la ubicación o las zonas terminaba en `redirect('/admin/perfil?saved=1')`:
  aparecías en Perfil, otra pantalla, sin saber si se había guardado lo tuyo.
  ✅ **Hecho 2026-10-02 (Fase 2).** Las tres acciones responden «guardado» y el editor lo dice en su sitio («Cambios guardados», «Zonas guardadas»). Probado en vivo en Horarios.

---

## 9 · Catálogo digital (lo que ve el comensal)

Revisado con Azúcar Negra (6 platillos, tema oscuro), Tacos del Norte (25
platillos) y la demo. El menú ya se veía bien y carga rápido (ver REN-07); lo de
aquí es lo que todavía le cuesta pedidos.

- [x] **CAT-01** · **P0** · S — **«Agotado» que vuelve solo al menú… pero no al
  servidor.** Un platillo marcado agotado vuelve al menú del comensal a las 12 h
  (`isUnavailable` en `lib/product-availability.ts`), pero nadie vuelve a poner
  `is_available = true` (no hay tarea programada). Resultado, confirmado en el
  código:
  - el comensal ve «Roll de Canela» y «Mocha Negra» (agotados desde agosto) con su
    botón «+», los pide, y **al confirmar** `verifyAndPriceItems` responde «ya no
    está disponible» (`lib/actions/orders.ts:126` lee `is_available` crudo);
  - Platillos (`catalog-panel.tsx:294-299`) y Tomar pedidos
    (`servicio/carta.tsx:73-107,222`, `servicio-panel.tsx:933,1024`) los siguen
    mostrando **agotados**: el mesero no puede vender lo que el menú ofrece.
  Propuesta: una sola regla en los cuatro sitios (`isUnavailable`), o restaurar
  `is_available` al pasar las 12 h. No se probó un pedido de punta a punta.
  ✅ **Hecho 2026-10-02 (Fase 1).** Una sola regla (`isUnavailable`, ahora con existencias: sin stock no vuelve solo) en el servidor (`verifyAndPriceItems` y pedidos del hub), Platillos, ficha del platillo y Tomar pedidos; el menú público recibe «agotado sin reloj» cuando no hay existencias, sin ver el stock. Platillos enseña «Sin existencias» con enlace a Inventario y el aviso «No se puede pedir ahora» dice «Reponer». **Probado de punta a punta:** pedido real de «Roll de Canela» (agotado en la base desde agosto) desde el menú local → «¡Pedido enviado!»; luego borrado. Pruebas en `product-availability.test.ts`. Sin revisar: el agente de la PC (modo sin internet) recibe las mismas columnas por `/api/agent/menu` y aplica su propia regla, que vive en `agente-impresion/`.

- [x] **CAT-02** · **P1** · S — **Tarjetas destacadas sin foto ilegibles.** El icono
  de relleno se dibuja enorme detrás del nombre y la descripción (trazo blanco
  bajo texto blanco): «Mocha Negra», «Lox del Barrio», «Guacamole de la casa»,
  «Mole poblano». Sin foto, la destacada debería usar la tarjeta normal o el
  icono pequeño y atenuado.
  ✅ **Hecho 2026-10-02 (Fase 1).** Sin foto, el icono de la destacada se aparta arriba a la derecha y se atenúa (`BrandPattern` acepta `iconAt`/`iconOpacity`). Visto en Azúcar Negra y Tacos del Norte.

- [ ] **CAT-03** · P2 · S — **«Sabor que enamora» publicado en restaurantes
  reales.** Es el eslogan de relleno y sale en cualquier menú cuyo dueño no
  escribió el suyo (Azúcar Negra, Tacos del Norte). Dejarlo vacío y pedirlo en
  «Necesita tu atención».

- [ ] **CAT-04** · P2 · S · ⏸️ D-7 — **El QR de la mesa abre en la portada.** Con
  `?mesa=3` el comensal, ya sentado, ve la portada a pantalla completa y tiene que
  tocar «Ver el menú» antes de ver un plato. Con mesa, entrar directo a la carta
  (la portada sigue para el enlace general y redes).

- [ ] **CAT-05** · P3 · S — **Insignias de tres estilos en la misma carta:**
  «FAVORITO» (mayúsculas sobre naranja), «nuevo» (minúscula sin fondo), «Picante»
  (gris).

- [ ] **CAT-06** · P3 · S — **El mismo icono (una mesa) en casi todos los
  platillos sin foto**: repetido no aporta; mejor el icono de la categoría (ya
  existe) o solo el patrón de marca.

- [ ] **CAT-07** · P2 · S — **«Fidelidad» en el menú, «Lealtad» en el panel**: el
  mismo programa con dos nombres. Elegir uno (para el comensal, «Mis puntos» se
  entiende mejor).

- [ ] **CAT-08** · P2 · S — **Pedido cancelado sin salida:** la página de
  seguimiento dice «Cancelado» y nada más — ni motivo, ni cómo escribir al
  restaurante (WhatsApp/teléfono), ni «Volver a pedir».

- [ ] **CAT-09** · P3 · S — **Carrito vacío** en `/checkout`: solo «Ver el menú».
  Oportunidad: «Lo más pedido» con su «+».

- [ ] **CAT-10** · P3 · S — **Escritorio:** el fondo de la portada termina en una
  línea horizontal dura a ~790 px a los lados de la columna.

- [x] **CAT-11** · P2 · M — **SEO / Google:** el menú no publica datos
  estructurados (schema.org `Restaurant` + `Menu`: dirección, horario, tipo de
  cocina, precios), que es lo que Google usa para la ficha del local; y
  `openGraph.locale` es `es_MX` (la landing usa `es_GT`). Dónde: `app/page.tsx:85`.
  ✅ **Hecho 2026-10-02 (Fase 6).** Datos estructurados schema.org en el menú público (`lib/seo/restaurant-jsonld.ts`, con pruebas): `Restaurant` con dirección, teléfono, logo, rango de precios, horario (`OpeningHoursSpecification`; sin horario no se afirma nada) y la carta (`Menu` → `MenuSection` → `MenuItem` con precio y moneda ISO). El JSON va con `<` escapado (un nombre «</script>» no cierra la etiqueta, hay prueba). `og:locale` pasó a `es_GT`.

- [x] **CAT-12** · P2 · S — **404 sin salida y con el mensaje equivocado.**
  Restaurante inexistente: «Este subdominio no corresponde…» y nada más — falta
  «Ir a Leogin» y, para captar, «¿Es tu restaurante? Crea tu menú gratis». En el
  dominio principal (`/ruta-que-no-existe`) sale el MISMO texto de «subdominio»,
  que ahí no tiene sentido.
  ✅ **Hecho 2026-10-02 (Fase 6).** 404 en dos versiones: en la dirección de un restaurante que no existe, «Este menú no existe», con «Ir a Leogin» y «¿Es tu restaurante? Crea tu menú gratis»; en el dominio principal, «Esta página no existe» con «Ir al inicio» (sin la palabra «subdominio»).

- [ ] **CAT-13** · P3 · M — **Marketing — subir el ticket:** sugerir «Acompáñalo
  con…» (bebida/postre de la carta) en la ficha del platillo y en el carrito. Es la
  palanca de venta más barata que tiene un menú digital.

---

## 10 · Super Admin

- [x] **SUP-01** · **P0** · M — **Todo el dinero con coma decimal** («Q698,00»,
  «Q1495,00», «vendió Q2794,10»). Es T-01.
  ✅ **Hecho 2026-10-02 (Fase 1).** Ver T-01.

- [ ] **SUP-02** · P2 · S — **Títulos duplicados y nombres que cambian:**
  «Inicio / Resumen de la plataforma», «Restaurantes / Restaurantes», «Finanzas /
  Finanzas», «Métricas / Métricas de la plataforma»; Cuentas lleva «Super Admin»
  en la barra; el destino se llama «Configuración» en escritorio y «Ajustes» en el
  teléfono.

- [ ] **SUP-03** · P2 · M — **Tablas que no caben en el teléfono** (Cobranza,
  «Todos los restaurantes» de Métricas): columnas cortadas («Q199,00 (pausado»).
  En el teléfono, tarjetas.

- [x] **SUP-04** · **P1** · S — **«Conversión 135.7 %»**: pedidos ÷ visitas cuenta
  también los pedidos del mesero y de caja, que no vienen de una visita al menú.
  Solo pedidos en línea.
  ✅ **Hecho 2026-10-02 (Fase 1).** Conversión = pedidos sin mesero ÷ visitas, con tope 100 %; rótulo «pedidos en línea / visitas». Visto: 65.2 %.

- [ ] **SUP-05** · P3 · S — **Inicio en escritorio:** «Recién llegados» y «Más
  activos» llenan dos tercios; el último tercio, vacío.

- [ ] **SUP-06** · P3 · S — **Ficha del restaurante con doble navegación:** pestañas
  arriba y las mismas cuatro como tarjetas-enlace abajo.

- [ ] **SUP-07** · P2 · M — **Apariencia mide 18.700 px en el teléfono** (la misma
  galería que AJU-10).

- [ ] **SUP-08** · P3 · S — **Cuentas:** 30 tarjetas altas sin paginar y «Correo
  sin verificar» en casi todas (ruido: se puede pasar a un filtro).

- [ ] **SUP-09** · P3 · M · ⏸️ D-8 — **Lenguaje visual propio** (rótulos Anton en
  mayúsculas, números Unbounded de colores) distinto del panel. ¿El Super comparte
  las piezas del panel o mantiene su identidad? Si comparte, sale gratis T-05.

- [ ] **SUP-10** · P3 · S — **Inicio:** «Pendiente de cobro» y «Pagos vencidos»
  enseñan lo mismo cuando todo lo pendiente está vencido; los títulos de «Requiere
  tu atención» se cortan en el teléfono («Azúcar Negra tiene pagos …»).

---

## 11 · Mi cuenta (grupo)

- [x] **MIC-01** · **P0** · S — **Dos márgenes para el mismo restaurante.** Mismo
  periodo, mismos pedidos: el panel (Negocio › Finanzas) dice «Costo de productos
  vendidos Q37.50 · Utilidad Q34.50 (margen 48 %)»; Mi cuenta › Finanzas dice
  «Costo (COGS) Q2759.60 · Utilidad Q34.50 · margen 1 %». Mi cuenta calcula el
  costo como ingreso − utilidad, y la utilidad solo cuenta los platillos que
  tienen costo cargado. Usar el mismo cálculo que el panel (y el mismo aviso de
  NEG-01). Dónde: `app/mi-cuenta/(panel)/finanzas/page.tsx:38-40`.
  ✅ **Hecho 2026-10-02 (Fase 1).** `getGroupReport` suma costo y base del margen como el panel; arreglado en la pantalla, la tabla por restaurante, Comparativa, el Excel y el PDF. Visto: «Costo de lo vendido Q37.50 · margen 48 %», igual que Negocio › Finanzas.

- [x] **MIC-02** · **P1** · S — **Mi cuenta se sale de la pantalla en el
  teléfono** (la página mide 430 px en un teléfono de 390, igual Comparativa): el
  saludo es «Hola, dueno@azucarnegra.test» y el correo no se corta. Saludar por
  el nombre y permitir el corte.
  ✅ **Hecho 2026-10-02 (Fase 1).** Saludo con lo de antes de la arroba («Hola, dueno») y corte de palabra permitido. Mi cuenta mide 390 px.

- [x] **MIC-03** · **P1** · S — **Resumen: «Q2650.00» se sale de su tarjeta**
  (se lee «Q2650.0C»): la primera cifra va en letra de portada gigante.
  ✅ **Hecho 2026-10-02 (Fase 1).** Una sola cifra (`components/mi-cuenta/kpi.tsx`) para Resumen, Finanzas y Comparativa: mono, tamaño que se adapta, rótulo a 11 px. «Q2,650.00» cabe.

- [ ] **MIC-04** · P2 · S — Dinero sin separador (T-01); la primera cifra de cada
  rejilla en Unbounded y las demás en monoespaciada; rótulos Anton en mayúsculas;
  pestañas cortadas a la derecha en el teléfono.
  🔄 **Parcial 2026-10-02:** separador de miles, una sola fuente para las cifras y rótulo a 11 px, hechos (MIC-03). Faltan los rótulos Anton en mayúsculas y las pestañas cortadas.

- [ ] **MIC-05** · P3 · S — **Cada pantalla describe los planes a su manera**
  (portada: «Lealtad, cupones y reservaciones»; Crear otro restaurante: «Panel de
  mesero, recetas y cupones»; Suscripción: 8 viñetas distintas). Una sola fuente
  en `lib/plans.ts`.

---

## 12 · Web pública y marketing

La portada comercial está bien escrita y bien construida. Lo que le falta es lo
que hace que un restaurantero confíe y lo que permite saber si funciona.

- [ ] **WEB-01** · **P1** · S — **No se mide nada.** Ni una herramienta de
  analítica en la web: no se sabe cuántos la visitan, cuántos tocan «Crear mi
  restaurante», ni en qué paso del registro se van. Propuesta: analítica sin
  cookies (Plausible o Umami, no exige aviso de cookies) + 4 eventos: clic en el
  botón principal, registro iniciado, registro completado, primer platillo.

- [ ] **WEB-02** · P2 · M — **Sin prueba social.** Ni un testimonio, logo de
  cliente, caso real (Rincón 502), cifra de restaurantes activos o foto de un
  local usándolo. Para un dueño de restaurante en Guatemala es lo que más
  convence. Sección «Ya lo usan» con 2–3 casos con nombre y foto.

- [ ] **WEB-03** · P2 · M — **El teléfono de la portada enseña cuadros de
  color** en vez de fotos de comida, y media pantalla negra vacía. Captura real
  del menú de un cliente (con su permiso).

- [ ] **WEB-04** · P2 · S — **/planes: la tabla comparativa está desalineada**:
  las ✓/✗ no caen bajo su columna (Básico / Estándar / Premium).

- [ ] **WEB-05** · P3 · S — **«🇬🇹 Hecho en Guatemala» se ve «GT Hecho en
  Guatemala» en Windows** (Windows no dibuja banderas emoji). Bandera en SVG.
  Dónde: `components/site-chrome.tsx:126`.

- [ ] **WEB-06** · P3 · S — **Dos estilos de campo en el mismo flujo:** el login
  con campos grises rellenos, el registro con campos blancos con borde.

- [ ] **WEB-07** · P3 · S — **«Empezar gratis» también en los planes de pago**:
  decir «Probar 30 días gratis» (es lo que pasa) y dejar «Empezar gratis» al
  Básico.

- [ ] **WEB-08** · P3 · S — **Restos de la plantilla de Next en `public/`** sin uso:
  `next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg`.

- [ ] **WEB-09** · P3 · S — **La banda final «Moderniza tu restaurante hoy»** lleva
  la «L» del logo suelta arriba a la izquierda, sin relación con el texto.

---

## 13 · Rendimiento y salud del código

- [ ] **REN-01** · **P1** · — · ⏸️ D-9 — **(Heredado I-1, el que más velocidad da)**
  Render en Oregón y Supabase en Virginia: ~70 ms por consulta. No es código;
  pasos en `AUDITORIA_2026-09-25.md` §2. Sigue abierto.

- [ ] **REN-02** · P2 · M — **(Heredado P-3/P-5)** Quedan **54 `router.refresh()`**
  en 27 archivos (proveedores, lealtad, cupones, reservaciones, cocina…) tras
  acciones que ya revalidan → cada toque pinta la pantalla dos veces. Y la
  re-precarga de ~10 enlaces tras cada acción.

- [ ] **REN-03** · P3 · S — **Código muerto:** `waiter-panel.tsx` (2.273 líneas),
  `plan-gmv-alert.tsx`, `plan-gmv-bar.tsx` sin importar.

- [ ] **REN-04** · P2 · L — **`checkout-form.tsx`: 1.468 líneas y 40 `useState`** en
  un solo componente: cada tecla que escribe el comensal re-pinta el checkout
  entero, en su teléfono. Dividir por pasos y memorizar.

- [ ] **REN-05** · P3 · L — **4.709 `style={{…}}` en línea:** objeto nuevo en cada
  pintado y la razón de que la CSP siga con `unsafe-inline` en estilos. Se van
  yendo solos con T-22/T-26.

- [ ] **REN-06** · P3 · S — **Funciones repetidas:** 25 formateadores de dinero, 7
  de tiempo relativo (T-01, T-02).

- [ ] **REN-07** · P3 · — — **Menú público, medido:** ~230 KB gzip de JS (69 de
  react-dom, ~95 del runtime de Next, ~55 de la app), CSS 94 KB, HTML 76 KB con 6
  platillos. Está bien; vigilar el HTML con cartas de 100+ platillos.

- [ ] **REN-08** · P3 · S — **(Heredado M-6)** Fuentes de Google bloqueantes en el
  menú. Decisión estética pendiente.

- [ ] **REN-09** · P2 · S — **Reordenar categorías** = un envío de formulario y
  recarga por cada flecha (MEN-08).

- [ ] **REN-10** · P2 · S — Ver **N-10** (sesión que se cae bajo carga).

---

## Plan de trabajo propuesto

Por orden de impacto ÷ riesgo. Cada fase cierra con capturas antes/después.

1. ✅ **Fase 1 — Lo que está mal (P0 y P1 rápidos). HECHA 2026-10-02.** CAT-01, MIC-01,
   AJU-01, AJU-02, T-01 (con SUP-01), HOY-01, MIC-02, MIC-03, CAT-02, N-05,
   SUP-04, NEG-01, MEN-02, MEN-03, N-08, T-06, T-02.
2. ✅ **Fase 2 — Textos y claves. HECHA 2026-10-02.** T-13 (según D-1), T-15, AJU-12, AJU-13,
   T-03, T-14, N-01 (ayuda), N-04.
3. ✅ **Fase 3 — Piezas comunes. HECHA 2026-10-02** (T-05 y T-09 parciales). T-08 (guardar), T-12 (fichas
   blancas), T-05 (cifras), T-07 (pestañas), T-10/T-11 (títulos y rótulos), T-16
   (diálogos), T-09, T-17, T-18. Aquí es donde se nota la «armonía».
4. ✅ **Fase 4 — Pantallas largas y buscadores. HECHA 2026-10-02.** MEN-01, CLI-01, AJU-10,
   AJU-05, AJU-12, N-02/N-03, PED-01.
5. **Fase 5 — Servicio (con tu visto bueno, D-2).** PED-02, PED-06, PED-09, PED-13.
6. 🔄 **Fase 6 — Marketing y extras. Casi entera 2026-10-02** (faltan WEB-01/02/03 y CAT-13). WEB-01 (medir primero), WEB-02, WEB-03,
   CAT-11, CAT-12, CAT-13, AJU-07, MEN-12, HOY-03, CLI-06.
7. **Continuo.** T-22/T-23/T-26 (escala tipográfica y componentes) pantalla a
   pantalla, a medida que se toca cada una.

---

## Bitácora

| Fecha | Qué se hizo | Commit |
|-------|-------------|--------|
| 2026-10-02 | Auditoría inicial: barrido de ~330 capturas, lectura de código, este archivo. | — |
| 2026-10-02 | **Fase 1** (decisión D-1: «tú»). 21 hallazgos: CAT-01, MIC-01, AJU-01/02/03, T-01, T-02, T-03, T-06, HOY-01, MIC-02/03, CAT-02, N-05, N-08, N-09, SUP-01, SUP-04, NEG-01, MEN-02, MEN-03. Verificado: `tsc` y `eslint` limpios, 768 pruebas (19 nuevas: `money`, `dates`, `product-availability`), dos builds de producción y barrido de capturas de cada pantalla tocada a 390 y 1440 px con pedidos activos y un platillo sin existencias; pedido real de prueba de CAT-01 (luego borrado). Al verificar salieron y se arreglaron dos cosas que el propio cambio había causado (ficha del platillo a 809 px en el teléfono; «Q2,794.…» cortado en la fila de 6 cifras). Base local devuelta a su estado. | `8c0bf81` (rama `auditoria-pulido-2026-10-02`) |
| 2026-10-02 | **Fase 2.** T-13, T-14, T-15, AJU-12, AJU-13, N-01 (ayuda y tours reescritos), N-03, N-04, AJU-09, y dos hallazgos nuevos arreglados: AJU-19 (tarifa de envío sin pantalla) y AJU-20 (guardar te mandaba a Perfil). Parciales: AJU-15, N-02, AJU-08. Verificado: `tsc` y `eslint` limpios, 774 pruebas (nuevas: bitácora en palabras, textos viejos del tema), build de producción, capturas de las 13 pantallas tocadas y guardado real en Horarios. | `352e973` |
| 2026-10-02 | **Fase 3 — piezas comunes.** T-07, T-08, T-10, T-11, T-12, T-16, T-17, T-18 hechos; T-05 y T-09 parciales. Piezas nuevas: `ui/confirm-dialog.tsx`, `admin/save-bar.tsx`, `admin/page-tabs.tsx`, `admin/field-label.ts`, `useValueDirty`. De paso: interruptor de Lealtad con la frase partida, enlace de Repartidores que abría huecos, «Q1,495.0 / 0» partido en el Inicio del Super. Verificado: `tsc`, `eslint`, 774 pruebas, build de producción, capturas claro/oscuro de 23 pantallas del panel y 8 del Super, guardar/salir y borrar probados en vivo; base local devuelta a su estado. | `70fa42c` |
| 2026-10-02 | **Fase 4 — pantallas largas y buscadores.** MEN-01 (buscador y filtros en Platillos), CLI-01 (buscar y ordenar Clientes en el servidor), AJU-10 (Personalizar de ~12.800 a 3.712 px en el teléfono, miniaturas con tu nombre, «Ver cómo queda»), AJU-05 (mesas del plano sin encimarse, PDF con todos los QR), N-02 (Repartidores y WhatsApp con sitio en Ajustes), PED-01 (cifras en una franja en el teléfono). Piezas nuevas: `.adm-search`, `StatStrip`, `lib/customer-sort.ts`, `lib/documents/table-qr-sheet.ts`, `aria-label` en `Select`. Tablero recontado desde las casillas (la Fase 3 no había sumado). Verificado: `tsc`, `eslint`, 774 pruebas, build, capturas claro/oscuro, buscadores probados en vivo y el PDF generado y revisado (4 hojas, 405 KB). | `434c942` |
| 2026-10-02 | **Fase 6 (lo que no depende de ti) + cierre de T-09.** CAT-12 (404 con salida), CAT-11 (schema.org en el menú + `es_GT`), MEN-12 (aviso de platillos sin foto en Hoy), CLI-06 (WhatsApp desde la ficha y «Sin pedir hace +30 días»), AJU-07 (QR con logo, tarjeta para redes y cartel A6), HOY-03 (comparación bajo «Ventas»), T-09 (Reservaciones y Lista de espera sin pestaña de crear). Pendientes por necesitar algo tuyo: WEB-01 (elegir analítica y crear la cuenta), WEB-02/03 (testimonios y capturas con permiso), CAT-13 (qué sugerir). Verificado: `tsc`, `eslint`, pruebas (nuevas: datos estructurados e inyección), build, recorrido con Playwright (404, JSON-LD, filtros, WhatsApp, descargas del QR revisadas a ojo). | ver commit |
