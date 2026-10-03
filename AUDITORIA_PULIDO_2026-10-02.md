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
> **Estado:** al 2026-10-03, 127 de 147 hallazgos hechos (los 6 P0 incluidos). D-5 decidido y hecho; D-2 tiene maqueta esperando tu visto bueno (https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP). Lo demás espera una decisión tuya (⏸️: D-3, D-4, D-6…D-9), contenido tuyo (WEB-01/02/03, CAT-13) o es trabajo continuo (T-22, T-26, REN-05); ver la Bitácora al final.

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
| 1 | Transversal — sistema de diseño y textos | 26 | 23 | 0 |
| 2 | Panel · Armazón y navegación | 10 | 10 | 1 |
| 3 | Panel · Hoy | 5 | 4 | 1 |
| 4 | Panel · Pedidos (En vivo, Cocina, Mesas, Tomar pedidos) | 14 | 10 | 4 |
| 5 | Panel · Menú | 12 | 12 | 0 |
| 6 | Panel · Clientes | 6 | 6 | 0 |
| 7 | Panel · Negocio | 6 | 5 | 1 |
| 8 | Panel · Ajustes | 20 | 19 | 1 |
| 9 | Catálogo digital (lo que ve el comensal) | 14 | 11 | 1 |
| 10 | Super Admin | 10 | 9 | 1 |
| 11 | Mi cuenta (grupo) | 5 | 5 | 0 |
| 12 | Web pública y marketing | 9 | 6 | 0 |
| 13 | Rendimiento y salud del código | 10 | 7 | 1 |
| | **Total** | **147** | **127** | **11** |

Por prioridad: **P0** 6 · **P1** 34 · **P2** 62 · **P3** 45. Hechos: los **6 P0**, 28 P1, 53 P2 y 40 P3.

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
  🎨 **2026-10-03: «propón la maqueta primero».** Maqueta publicada: https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP — antes/después de la tarjeta compacta (teléfono), el tablero en tres columnas (escritorio), dos opciones para las mesas libres en el teléfono (A rejilla · B plegadas; la A se parece a la tira del 09-09 que se rechazó) y tres arreglos de Tomar pedidos sin tocar tu diseño. Nada se construye hasta tu visto bueno.
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
  ✅ **Decidido 2026-10-03: sí.** Hecho, ver AJU-06.
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

- [x] **T-19** · P3 · S — **Gráficas de colores distintos:** barras naranja (Hoy),
  café oscuro (Encuestas), negras (Visitas), gris+naranja y naranja pálido (Super).
  Paleta de gráficas en tokens.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Tokens de gráfica `--chart-hi/-base/-alt/-empty` (acento para el dato que importa, gris para el resto) en Hoy, Pedidos, Métricas (ventas y visitas), Encuestas y las gráficas del Super.

- [x] **T-20** · P2 · S — **Blancos táctiles pequeños.** «×» para anular una línea
  de pedido: 22 px y rojo, pegado al precio; flechas de Categorías: 26 px; «quitar
  mesa» del plano: 24 px; enlaces «Configurar →»/«Abrir X →» de Funciones: 17 px
  de alto; teléfonos del pedido: 18 px. Mínimo 44 px de área en el teléfono.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Clase `.tap44`: área de toque de 44 × 44 sin cambiar el dibujo (solo con dedo, `pointer: coarse`) en la «×» de anular plato, las flechas de Categorías, la «×» de quitar mesa del plano, «Abrir … →»/«Configurar →» de Funciones y el teléfono del pedido.

- [x] **T-21** · P2 · S — **Texto de menos de 11 px:** nombres del selector de
  iconos (9,5), encabezados de tabla de Finanzas (9,5), ejes de gráficas (7,5–9),
  insignias «NUEVO/POPULAR/VENCIDO/PAGADO» (9,5), URL bajo cada QR (9,5).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** 63 textos de 7,5–10 px subidos a 11 px en panel y Super (insignias, encabezados de tabla, ejes de gráficas, rótulos); también las etiquetas de días de Métricas. Se dejan los tamaños de los PDF (son puntos de imprenta) y el «MESA» decorativo de la ficha del plano.
  ➕ **2026-10-03 (cierre):** el barrido encontró 37 más de 9–10,5 px (Ajustes del Super, Insumos, Inventario, avisos, Mi cuenta, pasos de «Nuevo restaurante»): todos a 11 px. Quedan a 10 px a propósito las etiquetas de la barra inferior del teléfono.

### Escala visual

- [ ] **T-22** · P2 · L — **No hay escala tipográfica.** 1.900 `fontSize` en línea
  con ~40 tamaños distintos (13, 12,5, 12, 13,5, 11,5, 11, 14,5, 9,5…) y 7 pesos
  (400–900). Propuesta: 8 tamaños en tokens (`--fs-11 … --fs-32`) y 4 pesos; se
  migra pantalla a pantalla junto con lo demás (no de golpe).

- [x] **T-23** · P3 · M — **Radios sin escala:** 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  18 px. Ya existen `--radius-md/lg/xl/2xl`; usarlos.
  ✅ **Hecho 2026-10-03 (cierre).** ~425 radios sueltos de 114 archivos (panel, Super, Mi cuenta) pasan al token más cercano: 5–8 → `--radius-sm` (nuevo, 8 px), 9–11 → `md`, 12–16 → `lg`, 18–22 → `xl`, 99/999 → `full`. Además de la armonía, ahora la «redondez del panel» que puede ajustar el dueño (`--admin-panel-radius`) se aplica a todo y no solo a las tarjetas. Se dejan los de 2–4 px (rayitas, barras) y las miniaturas de plantillas, que imitan el menú del comensal. Revisado en capturas de 16 pantallas del panel y 4 del Super.

- [x] **T-24** · P2 · S — **Ancho de contenido distinto por pantalla:** Hoy y
  Ajustes ~1.040 px, Pedidos/Menú/Mesas a todo el ancho, Super con rejillas que
  llenan dos tercios. Dos anchos: «lectura» (formularios, ajustes) y «tablero»
  (operación).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Dos anchos: `.adm-w-read` (720 px: Perfil, Horarios, Zona de entrega, Pedidos y cobro, Funciones, Copia de datos, Repartidores, WhatsApp, Salón) y `.adm-w-overview` (1.040 px: Hoy, Ajustes, Métricas). Operación sigue a todo lo ancho; Código QR alineado a la izquierda como las demás.

- [x] **T-25** · P3 · S — **Emojis junto a iconos de línea** (alérgenos 🥕🌶🥚 en la
  ficha y en el menú). Opcional: iconos propios o dejarlos (se reconocen bien).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Se dejan los emojis de alérgenos: se reconocen de un vistazo y un icono propio por alérgeno no mejoraría la lectura. Decisión tomada, sin cambio.

- [ ] **T-26** · P2 · L — **Componentes base que casi no se usan**: `Input` (2
  usos), `Tabs`, `Sheet`, `Skeleton`, `Textarea`, `Tooltip` (0) — mientras 4.700
  `style={{…}}` reimplementan lo mismo a mano. Es la raíz de T-05…T-12: cada
  pantalla dibuja sus propias piezas.

- [x] **T-04** · P2 · S — **Aviso «Pedido nuevo» tapa el contenido.** En el
  teléfono queda fijo sobre los últimos ~90 px de cualquier pantalla (campos,
  interruptores, «Guardar»). Dar ese espacio al contenido mientras está visible o
  plegarlo a una píldora tras unos segundos.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Con una tarjeta de «Pedido nuevo» flotando, el contenido gana su alto en el acolchado de abajo (se puede bajar a ver lo que tapaba) y la barra de guardar se sube encima de la tarjeta (`:has(.adm-float-stack)` en admin.css).

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

- [x] **N-06** · P2 · S — **Ajustes en escritorio desbalanceado:** tres columnas de
  alturas muy distintas («Tu restaurante» 7 filas, «Servicio» 2, «El equipo» 1) y
  «Tu cuenta» debajo de la primera — dos tercios de la pantalla vacíos abajo.
  Dos columnas equilibradas.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Portada de Ajustes en dos columnas CSS que se reparten por altura (`columns: 2 320px`): ya no quedan dos tercios vacíos abajo.

- [x] **N-07** · P3 · S — **Insignias «NUEVO»/«POPULAR» permanentes** en Funciones
  (Reservaciones, Encuestas y Cupones son de julio). Atarlas a una fecha de alta.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «NUEVO» caduca a los 60 días de la fecha de alta (`since` en `lib/modules.ts`, `moduleBadge`); Reservaciones, Lista de espera, Encuestas y Cupones ya no lo llevan. «POPULAR» se queda.

- [x] **N-08** · P1 · S — **Error de React al abrir Facturación y Canales.**
  Cargando `/admin/facturacion` (FEL apagado) o `/admin/canales` directamente, la
  consola lanza *Minified React error #310* antes de redirigir (anotado en la
  auditoría del 09-22 como pendiente). Pintar un aviso «Esta función no está
  activa» en vez de `redirect()` dentro de la página.
  ✅ **Hecho 2026-10-02 (Fase 1).** Facturación ya no redirige (pinta el aviso) y Canales se redirige desde `next.config.ts`. Barrido: 0 errores de consola en las dos.

- [x] **N-09** · P2 · S — **Facturación con FEL apagado lleva a «Funciones»** sin
  explicar por qué: quien venía de Negocio aterriza en Ajustes. Ligado a N-08.
  ✅ **Hecho 2026-10-02 (Fase 1).** Facturación apagada dice «La factura electrónica todavía no está activa» con enlace a Funciones (sin el «+» de crear: `EmptyState` acepta `icon: null`). La barra todavía dice «Panel» (va con T-10).

- [x] **N-10** · P2 · M · ⏸️ — **Sesión que se cae bajo carga (a investigar).**
  Durante el barrido, 2 de los 8 recorridos del panel aterrizaron en el login
  con la sesión viva («Continuar como…»). El layout trata cualquier fallo de
  `auth.getUser()` (también un error de red o un tiempo agotado) igual que «no
  hay sesión» y manda al login. En local fue con la máquina sin memoria; no está
  visto en producción. Propuesta: distinguir error de «sin usuario» y reintentar
  una vez antes de expulsar. Dónde: `app/admin/(protected)/layout.tsx:45`,
  `lib/supabase/server.ts:113`.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Dos arreglos para la misma causa (un token de sesión que el servidor no logra refrescar a tiempo en una petición): `getStaffUser` reintenta una vez si `auth.getUser()` falla por red o 5xx (antes eso mandaba al login), y `getRestaurantBySlug` repite con la llave de servicio si la lectura falla por algo que no sea «no existe» (antes el candado te mandaba a Platillos). Reproducido antes: la primera entrada a Mesas saltaba a Platillos; después, 0 saltos en 12 entradas. Es intermitente: si vuelve a pasar, hay que mirar los registros de Render.

---

## 3 · Panel · Hoy

- [x] **HOY-01** · **P1** · S — **El importe de «En curso» se corta en el
  teléfono** («Q132.(», «Q243.(»). Las columnas tienen ancho fijo
  (`w-26` + `w-29` + `w-24` = 316 px + huecos) y no caben en 358 px.
  Propuesta: en el teléfono, dos renglones (mesa/canal + estado arriba, cliente y
  total abajo) o quitar el ancho fijo del estado.
  Dónde: `app/admin/(protected)/page.tsx:369-380`.
  ✅ **Hecho 2026-10-02 (Fase 1).** En el teléfono, dos renglones (canal + estado + total arriba, cliente y tiempo abajo); desde `sm`, la fila de siempre. Visto con 8 pedidos activos.

- [x] **HOY-02** · P2 · S — **«Hoy» dos veces** (barra + encabezado). Ver T-10.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con T-10 (Fase 3): la cabecera dice la fecha y el local, no «Hoy» otra vez.

- [x] **HOY-03** · P2 · S — **«Resumen del día» con hueco** (T-06) **y sin
  comparación.** Un «+12 % vs. el viernes pasado» bajo cada cifra es lo que hace
  útil la portada (y lo que el dueño mira cada día).
  ✅ **Hecho 2026-10-02 (Fase 6).** El hueco se fue con T-06. La comparación sube a donde se mira: bajo «Ventas», «↑ 12 % vs. un viernes normal» (lo que un día igual llevaba a esta hora, promedio de las cuatro semanas anteriores; con menos de dos días de referencia no se dice nada). `Stat` admite ahora una línea `sub`.

- [x] **HOY-04** · P2 · S — **«Cómo va el día» en escritorio:** el total abajo a la
  izquierda y las barras apretadas en el tercio derecho; mucho blanco.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Cómo va el día» y «Lo que más sale hoy» lado a lado cuando hay sitio (rejilla de 380 px mínimo); si solo hay una, ocupa todo.

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
  🎨 **Maqueta 2026-10-03** esperando tu visto bueno: https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP

- [x] **PED-03** · P2 · S — **Dos formatos de número de pedido:** «H-7» y
  «ORD-2026-00057». En Cocina «#ORD-2026-00057» a tamaño grande se corta. Mostrar
  la forma corta en todas partes («#57»).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** `lib/order-number.ts` (con pruebas): «#57» en vez de «ORD-2026-00057» en la tarjeta de pedido, Cocina, aviso de pedido nuevo, repartidor, mesero, Servicio, notificación y la comanda impresa (navegador y térmica). El recibo, el historial del cliente y Facturación conservan el número completo.

- [x] **PED-04** · P3 · S — **Encabezados de grupo en Anton MAYÚSCULAS** («POR
  ENVIAR A COCINA», «LISTOS PARA ENTREGAR») — el único sitio del panel con ese
  estilo junto con Categorías. Ver T-10.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto en la Fase 3 (encabezados de grupo sin Anton).

- [x] **PED-05** · P3 · S — **Filtros en dos líneas** en el teléfono (Todos / En
  local / Para llevar / Domicilio): una sola fila con scroll.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto en la Fase 4: una fila que se desplaza.

- [ ] **PED-06** · P2 · M · ⏸️ D-2 — **Escritorio: grupos apilados en una página de
  2.900 px.** A 1440 px caben tres columnas (Por enviar · En cocina · Listos) y se
  vería todo sin mover la página.
  🎨 **Maqueta 2026-10-03** esperando tu visto bueno: https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP

- [x] **PED-07** · P2 · S — **«×» rojo de 22 px para anular un plato**, pegado al
  precio: fácil de tocar sin querer en hora pico. Pasarlo al «⋯» de la tarjeta o
  pedir confirmación en el sitio.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Sin cambio de lugar: la «×» ya abre el diálogo de anulación con motivo y PIN (no anula al tocar), así que un toque sin querer no hace nada. Con T-20 se toca mejor a propósito.

### Cocina

- [x] **PED-08** · P3 · S — **Colores fuera de la paleta** (azul «Comenzar», verde
  «Marcar listo»; 25 colores hex fijos en `kitchen-display.tsx`). En cocina el
  código de color tiene sentido, pero que salga de los tokens semánticos
  (`--c-ok`, `--c-info`…) para que el modo claro/oscuro y el contraste queden
  garantizados.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Cocina toma verde/ámbar/rojo/azul de los tokens semánticos (`--c-ok/-warn/-danger/-info`) y los rellenos de botón con texto blanco de `--c-ok-fill`/`--c-info-fill` (≥ 5:1); las transparencias pasan a `color-mix`. Las superficies oscuras propias de la cocina se mantienen a propósito.

### Mesas

- [ ] **PED-09** · P1 · S · ⏸️ D-2 — **17 mesas libres como filas de 60 px a todo el
  ancho** en el teléfono: ~1.000 px de scroll vacío. En escritorio ya son una
  rejilla; en el teléfono, 4–5 por fila.
  🎨 **Maqueta 2026-10-03** esperando tu visto bueno: https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP

- [x] **PED-10** · P2 · S — **Recortes en el teléfono:** la tercera cifra («Sin
  cobrar Q0.») queda cortada, y la pestaña «En qué va» también. Además dos filas
  de pestañas + botón antes de la primera mesa.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Sin tocar el diseño de Mesas (D-2): la tira de cifras, que se desplaza, se desvanece en el borde derecho en el teléfono para que se vea que hay más. «En qué va» ya cabía.

- [x] **PED-11** · P3 · S — **Dos relojes en la ficha** («Lista 8 min» y «11 min»):
  en el teléfono no dice qué es cada uno (en escritorio sí: «en esta etapa»).
  🔄 **Parcial 2026-10-03:** el código ya rotula la cifra grande («en esta etapa», M-21); falta verlo con mesas ocupadas en el teléfono.
  ✅ **Hecho 2026-10-03 (cierre).** Visto con mesas ocupadas: la ficha compacta del teléfono NO llevaba el rótulo. Ahora dice «25 min · en esta etapa» bajo la cifra, como la ancha (la cifra es desde que la comida entró a cocina; «Lista 8 min», cuánto lleva lista).

- [x] **PED-14** · P3 · S — **«Mesa 4 · Mesa 4» en el aviso de pedido nuevo.**
  (Encontrado al verificar PED-11.) Un pedido de mesa sin nombre llega con
  «Mesa 4» como nombre y como dirección, y la tarjeta los pintaba los dos.
  ✅ **Hecho 2026-10-03.** El renglón del aviso quita lo repetido: «Mesa 4 · hace 8 min».

- [x] **PED-12** · P3 · S — **Texto de explicación permanente** («Las mesas se
  ordenan por urgencia, no por número…»): a la ayuda o a un «?».
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** La explicación del orden pasó a un desplegable «¿En qué orden van las mesas?».

### Tomar pedidos

- [ ] **PED-13** · P2 · S · ⏸️ D-2 — Detalles sin tocar el diseño: los platillos
  **agotados salen primero** en la rejilla (Roll de Canela, Mocha Negra) — deberían
  ir al final; filtro «Por co…» cortado; «26 min · 3 pl…» truncado en la lista de
  escritorio.
  🎨 **Maqueta 2026-10-03** esperando tu visto bueno: https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP

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

- [x] **MEN-04** · P2 · S — **«Eliminar» rojo arriba junto al título.** Bajarlo a
  una «zona de peligro» al final del formulario.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Eliminar» salió de junto al título: va al final, en una tarjeta aparte «Eliminar este platillo» con su explicación. El título ya no se corta a 200 px.

- [x] **MEN-05** · P3 · S — **El precio no lleva «Q»** dentro del campo; teclado
  numérico decimal en el teléfono.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Q» dentro de los campos de precio y costo (el teclado decimal ya estaba).

- [x] **MEN-06** · P3 · S — **Etiquetas duplicables:** «Nuevo» de las sugeridas y
  «Nuevo ×» personalizada a la vez.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Lo escrito que coincide con una etiqueta sugerida (sin tildes ni mayúsculas) se guarda como la sugerida, también lo ya guardado así: no más «Nuevo» y «Nuevo ×» a la vez.

- [x] **MEN-07** · P3 · S — **Botón «Combo (componentes incluidos)»** con fondo
  verde, borde naranja punteado y texto rojo.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Combo (componentes incluidos)» con el mismo estilo que los otros dos botones.

- [x] **MEN-08** · P2 · M — **Categorías:** todas con el mismo icono genérico (una
  mesa), encabezado Anton «CATEGORÍAS DEL MENÚ», flechas de 26 px, y cada flecha
  es un viaje al servidor con recarga. Propuesta: arrastrar para ordenar (o
  flechas optimistas), y el icono solo si la categoría tiene uno.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Subir/bajar categorías al instante (`useOptimistic`); sin icono elegido, el que sugiere el nombre (Café → taza, Dulce → galleta) en vez de la misma mesa. El encabezado Anton ya se había ido (T-10) y las flechas tienen área de toque (T-20).

- [x] **MEN-09** · P3 · S — **Ingredientes:** dos botones para lo mismo y «food cost».
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con T-09 (un solo «+ Nuevo insumo») y T-14 (sin «food cost»).

- [x] **MEN-10** · P2 · S — **Inventario en el teléfono:** el nombre del platillo se
  corta detrás de los controles (− 26 + ⏱ ⚙); cifras 2+1 (T-06).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** La fila de Inventario se parte en dos renglones cuando los controles no caben: el nombre del platillo ya no se corta.

- [x] **MEN-11** · P3 · S — **Excel/PDF en una fila propia** sobre la lista
  (Platillos, Clientes). Un botón «Exportar» junto a la acción principal.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** `components/admin/export-menu.tsx`: un solo «Exportar» con menú (Excel / PDF) en la fila de herramientas de Platillos y de Clientes, en vez de una fila propia.

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

- [x] **CLI-02** · P2 · S — **Lealtad:** el aviso «Configura las tasas del programa
  para empezar» aparece aunque los campos ya muestran 1/10/100 (no se sabe si está
  activo o no); dobles espacios alrededor de «Recompensas» en el interruptor; dos
  párrafos largos de letra pequeña; guardar pequeño a la izquierda (T-08).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** El aviso dice lo que falta («todavía no está activo: guarda las tasas, aunque te sirvan las que vienen») y la barra de guardar sale aunque no se toque nada («Activar el programa», sin pedir confirmación al salir). La letra pequeña de quién acumula puntos va plegada. Los dobles espacios y el guardar pequeño ya se arreglaron en la Fase 3.

- [x] **CLI-03** · P2 · S — **Cupones:** el formulario «Crear cupón» está siempre
  abierto aunque arriba hay «+ Nuevo cupón» (T-09).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con T-09 (Fase 3).

- [x] **CLI-04** · P2 · S — **Encuestas:** las reseñas tienen scroll propio dentro
  de la tarjeta (scroll dentro de scroll en el teléfono); barras café oscuro;
  aviso morado (T-18, T-19).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Sin scroll dentro de la tarjeta: cinco reseñas y «Ver todas (N)». Las barras y el aviso ya se arreglaron (T-18, T-19).

- [x] **CLI-05** · P3 · S — **Reservaciones / Lista de espera:** «Nueva
  reservación» y «Agregar grupo» son pestañas, no botones (T-09); estados vacíos
  distintos entre las dos.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con T-09 y T-17.

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

- [x] **NEG-03** · P3 · S — **Analítica:** rótulos con paréntesis («Pedidos válidos
  (31 con cancelados)», «Franja pico (día fuerte: Vie)»); «Aplicar» negro y el
  periodo elegido naranja (dos colores para el mismo control).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Rótulos sin paréntesis («Pedidos válidos» con «de 31 en total» debajo, «Cancelados», «Hora pico» con «Día más fuerte: vie»); «Aplicar» en botón neutro, así el único color es el periodo elegido.

- [x] **NEG-04** · P2 · S — **Caja en el teléfono:** el paso 3 «Propinas» se corta
  por la derecha; el campo «turno» metido en la línea de la fecha parece roto;
  hueco vacío antes de «Cortes recientes»; «GASTOS DE HOY» vs «Cortes recientes».
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** En el teléfono el turno baja a su propio renglón («turno (opcional)») y los tres pasos caben enteros sin las rayitas entre ellos; «Cortes recientes» con el mismo rótulo que «Gastos de hoy». El hueco antes de «Cortes recientes» es el sitio del botón «Siguiente» fijo abajo.

- [x] **NEG-05** · P3 · S — **Gráficas sin valores**: ni eje ni cifra al tocar una
  barra; ejes a 7,5–9 px.
  🔄 **Parcial 2026-10-03:** ejes y rótulos a 11 px (T-21) y colores comunes (T-19). Falta enseñar el valor al tocar una barra en el teléfono.
  ✅ **Hecho 2026-10-03 (cierre).** `components/ui/chart-readout.tsx`: tocar una barra (o pasar el ratón) enmarca su columna y escribe debajo «mié 23 sept · Q1,234.00»; sin tocar nada dice la de hoy. Las gráficas siguen siendo del servidor (cada columna lleva `data-tip`) y la columna entera es tocable, también la de un día flojo de 2 px. En Hoy/Pedidos («Cómo va el día»), Negocio › Resumen (ventas y visitas), el Inicio y las Métricas del Super (visitas · pedidos · ventas) y Mi cuenta › Finanzas. `DaySale`/`DayVisits` llevan ahora la fecha; `diaSemana()` en `lib/dates.ts` (con prueba).

- [x] **NEG-06** · P2 · S — **«Cerrar la caja del día»** aparece al final de
  Finanzas como enlace a Caja, que ya es una pestaña al lado: sobra.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Fuera el enlace «Cerrar la caja del día» al final de Finanzas: Caja es la pestaña de al lado.

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

- [x] **AJU-04** · P2 · S — **Perfil: una tarjeta por campo** (6 tarjetas para 6
  campos); el ejemplo de WhatsApp es una lista de formatos que se corta; la
  pantalla se llama «Perfil» en la barra, «Información» en el encabezado y «Perfil
  del negocio» en Ajustes.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto en la Fase 3 (una tarjeta, ejemplo de WhatsApp corto) y la barra ahora dice «Perfil del negocio», como en Ajustes.

- [x] **AJU-05** · P1 · M — **Salón:** la barra dice «Ajustes»; en el teléfono las
  mesas del plano **salen encimadas** (1–5 superpuestas, con sus «×» chocando):
  están a 15 % del ancho una de otra (~44 px) y cada una mide ~60 px — el tamaño de
  la mesa no se ajusta al ancho del plano (en escritorio se ven bien); 20 QR a tamaño
  completo uno tras otro → página de 4.700 px en el teléfono, y **no hay
  «Descargar todos»** (PDF listo para imprimir, uno por mesa o en hoja de
  pegatinas).
  ✅ **Hecho 2026-10-02 (Fase 4).** Mesas del plano que se achican con el plano (38–68 px, crecen con el zoom) — ya no salen encimadas en el teléfono; «Descargar todos (PDF)»: hoja A4 con seis QR por página, nombre del restaurante, «Mesa N» y línea de corte (`lib/documents/table-qr-sheet.ts`, 405 KB para 20 mesas); se ven 8 QR con «Ver los 20 QR», y la URL larga dejó la tarjeta («Copiar enlace» la copia). La barra ya decía «Salón» (T-10). La página bajó de ~4.700 a 2.884 px en el teléfono.

- [x] **AJU-06** · P2 · M · ⏸️ D-5 — **QR de mesa con UUID** (`/m/aaaaaaaa-aaaa-…/7`):
  código más denso (peor lectura impreso pequeño) y dirección ilegible.
  ✅ **Hecho 2026-10-03 (D-5).** Los QR de mesa (tarjetas, PNG y el PDF de «Descargar todos») llevan ahora `/m/<slug>/<mesa>`: 33 módulos en vez de 37 (comparado contra el QR real del PDF). Los ya impresos con UUID siguen igual. El UUID se había elegido porque no cambia nunca; para no perder eso, la **migración 134** (`restaurant_slug_aliases` + disparador) guarda el slug viejo cuando el Super lo cambia, y el proxy lo resuelve: un QR con `/m/<slug-viejo>/7` sigue abriendo su restaurante. Y un slug que ya usó un restaurante no puede quedárselo otro (aviso en la app y disparador en la base), porque sus QR impresos abrirían el menú equivocado. Probado: slug, UUID, alias tras cambiar el slug (y vuelta), dirección inexistente → portada, navegar al checkout dentro del prefijo, y los disparadores en una transacción deshecha. **Migración 134 PENDIENTE en producción**: sin ella todo funciona igual que hoy salvo el alias (el código tolera que la tabla no exista).

- [x] **AJU-07** · P2 · M — **Marketing — Código QR sin marca.** Solo el cuadro
  negro. Logo al centro, nombre del restaurante, «Escanea para ver el menú y
  pedir», y cartel/tarjeta de mesa para imprimir (A6, pegatina, PNG para redes).
  ✅ **Hecho 2026-10-02 (Fase 6).** El QR general lleva tu logo al centro (QR con corrección alta `ecc=H`) y la pantalla ofrece «Tarjeta para redes (PNG)» 1080×1350 —nombre, QR, «Escanea para ver el menú y pedir» y el enlace— y «Cartel para imprimir (PDF, A6)» en hoja A5 con línea de corte (`lib/documents/qr-art.ts`, que también usan los QR de mesa). Fondo claro y acento solo como detalle, por D-4. Verificado sin logo (en local ningún restaurante tiene y el proxy de logos solo acepta HTTPS); si el logo no carga, el recuadro se oculta.

- [x] **AJU-08** · P2 · S — **Zona de entrega** con el mapa apagado es un
  interruptor y un botón enorme «Guardar ubicación y radio»; el icono del aviso
  queda en su propia línea. Ver N-03.
  🔄 **Parcial 2026-10-02:** ahora tiene las zonas debajo del mapa. Quedan los dos botones grandes de guardar (va con T-08) y el icono del aviso en su propia línea.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto: barra de guardado única (T-08) y aviso con el icono en línea (T-18).

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

- [x] **AJU-11** · P2 · S — **La PC del local:** «hace 2004 h» (T-02); los dos
  enlaces del final llevan títulos de 22 px en Unbounded, más grandes que los
  títulos de la pantalla; jerga («agente», «preview:», ««documento»»).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «hace 2004 h» y los títulos grandes ya estaban (T-02, T-10). Fuera la jerga: «agente» → «la PC principal», «preview:» → «Simulador en pantalla (para probar)», «documento» → «en hoja normal (para probar)».

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

- [x] **AJU-14** · P2 · S — **Funciones:** conteos que no cuadran (N-05),
  insignias caducas (N-07), enlaces de 17 px, «Activado para tu restaurante» en
  verde metido en medio de una descripción.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Activado para ti» como etiqueta junto al nombre, no en verde dentro de la descripción. Conteos, insignias y enlaces ya estaban (N-05, N-07, T-20).

- [ ] **AJU-15** · P1 · S · ⏸️ D-6 — **WhatsApp:** le enseña al dueño «Detalle
  técnico: falta WHATSAPP_TOKEN_KEY» y un formulario de la API de Meta que no
  puede funcionar sin esa configuración del servidor.
  🔄 **Parcial 2026-10-02:** sin la clave del servidor ya no se enseña el formulario de Meta ni el «Detalle técnico»; el aviso dice que se escriba a soporte. Esconder la pantalla entera sigue pendiente de D-6.

- [x] **AJU-16** · P2 · S — **Repartidores:** barra «Panel», selector nativo del
  sistema, formulario siempre abierto. Ver N-02/N-03.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Selector del panel en vez del nativo para «Usuario del personal»; barra y formulario ya estaban (T-10, T-09).

- [x] **AJU-17** · P3 · S — **Copia de tus datos:** bien resuelta. Solo el título
  cortado en el teléfono (T-10).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con T-10 («Copia de datos»).

- [x] **AJU-18** · P2 · S — **Interruptor «Menú también en inglés» suelto en la
  portada de Ajustes** (bien que sea un interruptor, pero sin decir cuántos
  platillos están traducidos: «3 de 10 platillos traducidos»).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «1 de 6» junto al interruptor de «Menú también en inglés» (platillos a la vista con nombre en inglés), en ámbar si está encendido y faltan.

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

- [x] **CAT-03** · P2 · S — **«Sabor que enamora» publicado en restaurantes
  reales.** Es el eslogan de relleno y sale en cualquier menú cuyo dueño no
  escribió el suyo (Azúcar Negra, Tacos del Norte). Dejarlo vacío y pedirlo en
  «Necesita tu atención».
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** El lema por defecto pasa a vacío; «Sabor que enamora» guardado en un tema se trata como vacío (o como el lema real del restaurante si lo tiene), con pruebas. Sin lema la portada no pinta esa línea y Hoy pide escribirlo («Tu menú no tiene lema» → Perfil).

- [ ] **CAT-04** · P2 · S · ⏸️ D-7 — **El QR de la mesa abre en la portada.** Con
  `?mesa=3` el comensal, ya sentado, ve la portada a pantalla completa y tiene que
  tocar «Ver el menú» antes de ver un plato. Con mesa, entrar directo a la carta
  (la portada sigue para el enlace general y redes).

- [x] **CAT-05** · P3 · S — **Insignias de tres estilos en la misma carta:**
  «FAVORITO» (mayúsculas sobre naranja), «nuevo» (minúscula sin fondo), «Picante»
  (gris).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Las etiquetas sugeridas se pintan con su nombre del tema («Nuevo», no la clave `new` ni «nuevo» escrito a mano) y el sello de destacado ya no va en MAYÚSCULAS.

- [x] **CAT-06** · P3 · S — **El mismo icono (una mesa) en casi todos los
  platillos sin foto**: repetido no aporta; mejor el icono de la categoría (ya
  existe) o solo el patrón de marca.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** `lib/category-icon.ts` (con pruebas): sin icono elegido, la carta y el panel usan el que sugiere el nombre de la categoría (Tacos → llama, Bebidas → taza, Postres → galleta), por palabra completa — antes «te» casaba con «fuertes».

- [x] **CAT-07** · P2 · S — **«Fidelidad» en el menú, «Lealtad» en el panel**: el
  mismo programa con dos nombres. Elegir uno (para el comensal, «Mis puntos» se
  entiende mejor).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Mis puntos» en la barra de la carta y «Tus puntos» en la cuenta, en vez de «Fidelidad».

- [x] **CAT-08** · P2 · S — **Pedido cancelado sin salida:** la página de
  seguimiento dice «Cancelado» y nada más — ni motivo, ni cómo escribir al
  restaurante (WhatsApp/teléfono), ni «Volver a pedir».
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** La tarjeta de pedido cancelado dice qué hacer y, si el restaurante tiene WhatsApp, «Escribir por WhatsApp» con el número de pedido ya escrito («Volver al menú» ya estaba debajo).

- [ ] **CAT-09** · P3 · S — **Carrito vacío** en `/checkout`: solo «Ver el menú».
  Oportunidad: «Lo más pedido» con su «+».
  🔄 **Pendiente 2026-10-03:** ofrecer «Lo más pedido» desde el carrito vacío pide traer la hoja de opciones del platillo al checkout; caso raro (llegar a pagar sin nada), se deja para cuando se toque el checkout (REN-04).
  Con REN-04 hecho, el checkout ya está partido y esto cabría como pieza aparte; sigue siendo un caso raro y lo dejo para cuando se decida CAT-13 (las dos son «sugerir platillos»).

- [x] **CAT-10** · P3 · S — **Escritorio:** el fondo de la portada termina en una
  línea horizontal dura a ~790 px a los lados de la columna.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** No era un fallo: el fondo es `position: fixed` y la captura de página completa solo lo pinta una vez. Bajando en la ventana real el fondo es continuo. Sin cambio.

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

- [x] **CAT-14** · P2 · S — **La confirmación de un pedido para llevar decía «Pago:
  Efectivo contra entrega».** (Encontrado al probar REN-04.) El formulario dice
  «Efectivo · Pagas en el local al recoger», pero la confirmación usaba el texto
  del domicilio.
  ✅ **Hecho 2026-10-03.** Para llevar dice «Efectivo»; a domicilio sigue «Efectivo contra entrega».

---

## 10 · Super Admin

- [x] **SUP-01** · **P0** · M — **Todo el dinero con coma decimal** («Q698,00»,
  «Q1495,00», «vendió Q2794,10»). Es T-01.
  ✅ **Hecho 2026-10-02 (Fase 1).** Ver T-01.

- [x] **SUP-02** · P2 · S — **Títulos duplicados y nombres que cambian:**
  «Inicio / Resumen de la plataforma», «Restaurantes / Restaurantes», «Finanzas /
  Finanzas», «Métricas / Métricas de la plataforma»; Cuentas lleva «Super Admin»
  en la barra; el destino se llama «Configuración» en escritorio y «Ajustes» en el
  teléfono.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Ajustes» en escritorio, teléfono y barra (era «Configuración» y «Ajustes»). Los títulos repetidos ya se fueron con T-10.

- [x] **SUP-03** · P2 · M — **Tablas que no caben en el teléfono** (Cobranza,
  «Todos los restaurantes» de Métricas): columnas cortadas («Q199,00 (pausado»).
  En el teléfono, tarjetas.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** `<Table data-stack>`: en el teléfono cada fila es una tarjeta con «rótulo: valor» (de `data-label`). Aplicado a Cobranza y a «Todos los restaurantes» de Métricas.

- [x] **SUP-04** · **P1** · S — **«Conversión 135.7 %»**: pedidos ÷ visitas cuenta
  también los pedidos del mesero y de caja, que no vienen de una visita al menú.
  Solo pedidos en línea.
  ✅ **Hecho 2026-10-02 (Fase 1).** Conversión = pedidos sin mesero ÷ visitas, con tope 100 %; rótulo «pedidos en línea / visitas». Visto: 65.2 %.

- [x] **SUP-05** · P3 · S — **Inicio en escritorio:** «Recién llegados» y «Más
  activos» llenan dos tercios; el último tercio, vacío.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Columnas de 420 px mínimo en la parte de abajo del Inicio: las dos listas llenan el ancho en vez de dejar un tercio vacío.

- [x] **SUP-06** · P3 · S — **Ficha del restaurante con doble navegación:** pestañas
  arriba y las mismas cuatro como tarjetas-enlace abajo.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Fuera las cuatro tarjetas «Adónde ir» de la ficha: eran las mismas pestañas de arriba.

- [x] **SUP-07** · P2 · M — **Apariencia mide 18.700 px en el teléfono** (la misma
  galería que AJU-10).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** La galería del tema del Super usa las mismas miniaturas compactas que Personalizar (AJU-10), con el nombre del restaurante.

- [x] **SUP-08** · P3 · S — **Cuentas:** 30 tarjetas altas sin paginar y «Correo
  sin verificar» en casi todas (ruido: se puede pasar a un filtro).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** 20 cuentas a la vista y «Ver más»; «Correo sin verificar» solo se marca con el filtro «Sin verificar» puesto (en la lista entera era ruido).

- [ ] **SUP-09** · P3 · M · ⏸️ D-8 — **Lenguaje visual propio** (rótulos Anton en
  mayúsculas, números Unbounded de colores) distinto del panel. ¿El Super comparte
  las piezas del panel o mantiene su identidad? Si comparte, sale gratis T-05.

- [x] **SUP-10** · P3 · S — **Inicio:** «Pendiente de cobro» y «Pagos vencidos»
  enseñan lo mismo cuando todo lo pendiente está vencido; los títulos de «Requiere
  tu atención» se cortan en el teléfono («Azúcar Negra tiene pagos …»).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Los títulos de «Requiere tu atención» bajan a dos renglones en vez de cortarse, y «Pendiente de cobro» dice de cuántos restaurantes es o «todo ya vencido», para no repetir «Pagos vencidos».

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

- [x] **MIC-04** · P2 · S — Dinero sin separador (T-01); la primera cifra de cada
  rejilla en Unbounded y las demás en monoespaciada; rótulos Anton en mayúsculas;
  pestañas cortadas a la derecha en el teléfono.
  🔄 **Parcial 2026-10-02:** separador de miles, una sola fuente para las cifras y rótulo a 11 px, hechos (MIC-03). Faltan los rótulos Anton en mayúsculas y las pestañas cortadas.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Rótulos Anton en mayúsculas cambiados por el rótulo del panel (13 px, normal) en Resumen, Finanzas, Comparativa, Mi cuenta y Nuevo restaurante; la fila de pestañas se desvanece en el borde y centra la activa.

- [x] **MIC-05** · P3 · S — **Cada pantalla describe los planes a su manera**
  (portada: «Lealtad, cupones y reservaciones»; Crear otro restaurante: «Panel de
  mesero, recetas y cupones»; Suscripción: 8 viñetas distintas). Una sola fuente
  en `lib/plans.ts`.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** `PLAN_POINTS` en `lib/plans.ts`: cuatro puntos por plan que leen la portada y «Crear otro restaurante». Suscripción ya salía de las capacidades de `plans.ts`.

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

- [x] **WEB-04** · P2 · S — **/planes: la tabla comparativa está desalineada**:
  las ✓/✗ no caen bajo su columna (Básico / Estándar / Premium).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Las ✓/✗ de la comparativa de /planes, centradas bajo su plan (el icono es un bloque y `text-align` no lo movía).

- [x] **WEB-05** · P3 · S — **«🇬🇹 Hecho en Guatemala» se ve «GT Hecho en
  Guatemala» en Windows** (Windows no dibuja banderas emoji). Bandera en SVG.
  Dónde: `components/site-chrome.tsx:126`.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Bandera de Guatemala dibujada (SVG) en vez del emoji, que Windows mostraba como «GT».

- [x] **WEB-06** · P3 · S — **Dos estilos de campo en el mismo flujo:** el login
  con campos grises rellenos, el registro con campos blancos con borde.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** El registro usa el mismo relleno de campo que el login.

- [x] **WEB-07** · P3 · S — **«Empezar gratis» también en los planes de pago**:
  decir «Probar 30 días gratis» (es lo que pasa) y dejar «Empezar gratis» al
  Básico.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** «Probar 30 días gratis» en los planes de pago (lo que de verdad pasa) y «Empezar gratis» solo en el Básico; de paso, «Sin pedidos en línea» del Básico lleva «—» y no una palomita.

- [x] **WEB-08** · P3 · S — **Restos de la plantilla de Next en `public/`** sin uso:
  `next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg`.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Borrados `next.svg`, `vercel.svg`, `globe.svg`, `window.svg` y `file.svg` (sin ninguna referencia).

- [x] **WEB-09** · P3 · S — **La banda final «Moderniza tu restaurante hoy»** lleva
  la «L» del logo suelta arriba a la izquierda, sin relación con el texto.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** La «L» de la banda final, centrada sobre el título.

---

## 13 · Rendimiento y salud del código

- [ ] **REN-01** · **P1** · — · ⏸️ D-9 — **(Heredado I-1, el que más velocidad da)**
  Render en Oregón y Supabase en Virginia: ~70 ms por consulta. No es código;
  pasos en `AUDITORIA_2026-09-25.md` §2. Sigue abierto.

- [x] **REN-02** · P2 · M — **(Heredado P-3/P-5)** Quedan **54 `router.refresh()`**
  en 27 archivos (proveedores, lealtad, cupones, reservaciones, cocina…) tras
  acciones que ya revalidan → cada toque pinta la pantalla dos veces. Y la
  re-precarga de ~10 enlaces tras cada acción.
  🔄 **Pendiente 2026-10-03:** quitar cada `router.refresh()` exige comprobar acción por acción que revalida la pantalla de la que se llama; sin eso la pantalla se queda vieja. Mejor hacerlo con pruebas de cada flujo.
  ✅ **Hecho 2026-10-03 (cierre).** Comprobado en el código de Next 16 (`revalidate.js`, `action-handler.js`): una acción que llama a `revalidatePath`/`updateTag` ya trae la pantalla nueva en su propia respuesta. Revisadas ~50 acciones una por una: todas revalidan en el camino de éxito, así que fuera los `refresh()` de Lealtad, Proveedores, Cupones, Lista de espera, Reservaciones, Insumos, Inventario, Funciones, Canales, Facturación, Cocina, Salón, Tomar pedidos (anular), Personal, aparatos de confianza, WhatsApp, PIN de entrada, Repartidores, Categorías, Caja, temas (panel y Super), Mi cuenta y la lista de bienvenida. Dos acciones revalidaban otra pantalla que la que las llama y se corrigieron (borrar un arqueo ahora revalida Caja; el PIN de entrada, Personal), para no depender de que Next hoy revalide «todo». Se quedan los `refresh()` que vienen de avisos en vivo (Realtime) y los sondeos de respaldo. Medido: crear y borrar un insumo = **1** petición (antes 2). La re-precarga de enlaces tras una acción es el comportamiento normal de Next al invalidar su caché y con `loading.tsx` es barata: no se toca.

- [x] **REN-03** · P3 · S — **Código muerto:** `waiter-panel.tsx` (2.273 líneas),
  `plan-gmv-alert.tsx`, `plan-gmv-bar.tsx` sin importar.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Borrados `waiter-panel.tsx` (sustituido por Servicio), `plan-gmv-alert.tsx` y `plan-gmv-bar.tsx`: ~2.300 líneas sin importar en ningún sitio (quedan en el historial de git).

- [x] **REN-04** · P2 · L — **`checkout-form.tsx`: 1.468 líneas y 40 `useState`** en
  un solo componente: cada tecla que escribe el comensal re-pinta el checkout
  entero, en su teléfono. Dividir por pasos y memorizar.
  ✅ **Hecho 2026-10-03 (cierre).** Partido en `components/checkout/`: `order-summary.tsx` (resumen memorizado — escribir el nombre o la dirección ya no vuelve a pintar la lista, el cupón ni la propina; la casilla del cupón vive dentro), `checkout-success.tsx` (confirmación con su encuesta: las estrellas ya no repintan el checkout), `form-parts.tsx` (opciones de pago, «sin conexión») y `checkout-model.ts` (tipos, distancia y el mensaje de WhatsApp como función pura). Los 8 `useState` del snapshot pasan a uno (`CheckoutDone`). Queda en 993 líneas y 22 `useState`. De paso: la confirmación se fija al confirmarse y ya no relee el formulario (si la sesión de mesa caducaba después, un pedido EN la mesa podía pasar a decir «Para llevar»). Probado de punta a punta en el build: platillo al carrito, cupón de prueba, pedido para llevar, confirmación y encuesta (pedido, calificación y cupón borrados después).

- [ ] **REN-05** · P3 · L — **4.709 `style={{…}}` en línea:** objeto nuevo en cada
  pintado y la razón de que la CSP siga con `unsafe-inline` en estilos. Se van
  yendo solos con T-22/T-26.

- [x] **REN-06** · P3 · S — **Funciones repetidas:** 25 formateadores de dinero, 7
  de tiempo relativo (T-01, T-02).
  🔄 **Parcial 2026-10-03:** los formateadores principales ya son `fmtMoney` y `lib/dates.ts` (T-01, T-02); quedan helpers locales `money()` que se van quitando pantalla a pantalla.
  ✅ **Hecho 2026-10-03 (cierre).** Las cuatro copias de «monto con la moneda del restaurante» (tarjeta de pedido, cuenta de la mesa, carrito de Tomar pedidos, Pedidos) son ahora `fmtCurrency` + `PanelCurrency` en `lib/money.ts` (con pruebas, incluido un locale inválido). Fuera los últimos `Q{n.toFixed(2)}` a la vista (Repartidores, mínimo de cupón, Lealtad, recetas, utilidad del platillo, cobro prorrateado). El resumen «por método» de los PDF/Excel de caja decía `CARD: 120.00`: ahora «Tarjeta: Q120.00» con la moneda del restaurante. Los `money()` que quedan son alias de una línea.

- [x] **REN-07** · P3 · — — **Menú público, medido:** ~230 KB gzip de JS (69 de
  react-dom, ~95 del runtime de Next, ~55 de la app), CSS 94 KB, HTML 76 KB con 6
  platillos. Está bien; vigilar el HTML con cartas de 100+ platillos.
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Medición, no un fallo: se deja anotado para vigilar con cartas de 100+ platillos.

- [ ] **REN-08** · P3 · S — **(Heredado M-6)** Fuentes de Google bloqueantes en el
  menú. Decisión estética pendiente.

- [x] **REN-09** · P2 · S — **Reordenar categorías** = un envío de formulario y
  recarga por cada flecha (MEN-08).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Resuelto con MEN-08 (subir/bajar al instante).

- [x] **REN-10** · P2 · S — Ver **N-10** (sesión que se cae bajo carga).
  ✅ **Hecho 2026-10-03 (detalles P2/P3).** Ver N-10.

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
7. **Continuo.** T-22/T-26 (escala tipográfica y componentes) pantalla a
   pantalla, a medida que se toca cada una. (T-23, los radios, ya se hizo de una vez.)

---

## Bitácora

| Fecha | Qué se hizo | Commit |
|-------|-------------|--------|
| 2026-10-02 | Auditoría inicial: barrido de ~330 capturas, lectura de código, este archivo. | — |
| 2026-10-02 | **Fase 1** (decisión D-1: «tú»). 21 hallazgos: CAT-01, MIC-01, AJU-01/02/03, T-01, T-02, T-03, T-06, HOY-01, MIC-02/03, CAT-02, N-05, N-08, N-09, SUP-01, SUP-04, NEG-01, MEN-02, MEN-03. Verificado: `tsc` y `eslint` limpios, 768 pruebas (19 nuevas: `money`, `dates`, `product-availability`), dos builds de producción y barrido de capturas de cada pantalla tocada a 390 y 1440 px con pedidos activos y un platillo sin existencias; pedido real de prueba de CAT-01 (luego borrado). Al verificar salieron y se arreglaron dos cosas que el propio cambio había causado (ficha del platillo a 809 px en el teléfono; «Q2,794.…» cortado en la fila de 6 cifras). Base local devuelta a su estado. | `8c0bf81` (rama `auditoria-pulido-2026-10-02`) |
| 2026-10-02 | **Fase 2.** T-13, T-14, T-15, AJU-12, AJU-13, N-01 (ayuda y tours reescritos), N-03, N-04, AJU-09, y dos hallazgos nuevos arreglados: AJU-19 (tarifa de envío sin pantalla) y AJU-20 (guardar te mandaba a Perfil). Parciales: AJU-15, N-02, AJU-08. Verificado: `tsc` y `eslint` limpios, 774 pruebas (nuevas: bitácora en palabras, textos viejos del tema), build de producción, capturas de las 13 pantallas tocadas y guardado real en Horarios. | `352e973` |
| 2026-10-02 | **Fase 3 — piezas comunes.** T-07, T-08, T-10, T-11, T-12, T-16, T-17, T-18 hechos; T-05 y T-09 parciales. Piezas nuevas: `ui/confirm-dialog.tsx`, `admin/save-bar.tsx`, `admin/page-tabs.tsx`, `admin/field-label.ts`, `useValueDirty`. De paso: interruptor de Lealtad con la frase partida, enlace de Repartidores que abría huecos, «Q1,495.0 / 0» partido en el Inicio del Super. Verificado: `tsc`, `eslint`, 774 pruebas, build de producción, capturas claro/oscuro de 23 pantallas del panel y 8 del Super, guardar/salir y borrar probados en vivo; base local devuelta a su estado. | `70fa42c` |
| 2026-10-02 | **Fase 4 — pantallas largas y buscadores.** MEN-01 (buscador y filtros en Platillos), CLI-01 (buscar y ordenar Clientes en el servidor), AJU-10 (Personalizar de ~12.800 a 3.712 px en el teléfono, miniaturas con tu nombre, «Ver cómo queda»), AJU-05 (mesas del plano sin encimarse, PDF con todos los QR), N-02 (Repartidores y WhatsApp con sitio en Ajustes), PED-01 (cifras en una franja en el teléfono). Piezas nuevas: `.adm-search`, `StatStrip`, `lib/customer-sort.ts`, `lib/documents/table-qr-sheet.ts`, `aria-label` en `Select`. Tablero recontado desde las casillas (la Fase 3 no había sumado). Verificado: `tsc`, `eslint`, 774 pruebas, build, capturas claro/oscuro, buscadores probados en vivo y el PDF generado y revisado (4 hojas, 405 KB). | `434c942` |
| 2026-10-02 | **Fase 6 (lo que no depende de ti) + cierre de T-09.** CAT-12 (404 con salida), CAT-11 (schema.org en el menú + `es_GT`), MEN-12 (aviso de platillos sin foto en Hoy), CLI-06 (WhatsApp desde la ficha y «Sin pedir hace +30 días»), AJU-07 (QR con logo, tarjeta para redes y cartel A6), HOY-03 (comparación bajo «Ventas»), T-09 (Reservaciones y Lista de espera sin pestaña de crear). Pendientes por necesitar algo tuyo: WEB-01 (elegir analítica y crear la cuenta), WEB-02/03 (testimonios y capturas con permiso), CAT-13 (qué sugerir). Verificado: `tsc`, `eslint`, pruebas (nuevas: datos estructurados e inyección), build, recorrido con Playwright (404, JSON-LD, filtros, WhatsApp, descargas del QR revisadas a ojo). | `fba2fcf` |
| 2026-10-03 | **Detalles P2/P3 del panel.** Transversal (T-04, T-19, T-20, T-21, T-24, T-25), armazón (N-06, N-07), Hoy (HOY-02, HOY-04), Pedidos/Cocina/Mesas (PED-03, 04, 05, 07, 08, 10, 12), Menú (MEN-04…MEN-11), Clientes (CLI-02…05), Negocio (NEG-03, 04, 06) y Ajustes (AJU-04, 08, 11, 14, 16, 17, 18). Piezas nuevas: `.tap44`, tokens de gráfica, `.adm-w-read/-overview`, `lib/order-number.ts`, `export-menu.tsx`. Parciales: NEG-05, PED-11. Verificado: `tsc`, `eslint`, 781 pruebas, build, capturas claro/oscuro de 20 pantallas. | `840a9bd` |
| 2026-10-03 | **Detalles P2/P3 del menú público, Super, Mi cuenta, web y rendimiento.** CAT-03, 05, 06, 07, 08, 10; SUP-02, 03, 05, 06, 07, 08, 10; MIC-04, 05; WEB-04…09; REN-03, 07, 09, 10 y N-10 (sesión: reintento ante fallos de red y lectura del restaurante con llave de servicio si falla). Piezas nuevas: `lib/category-icon.ts`, `PLAN_POINTS`, `<Table data-stack>`. Pendientes con nota: CAT-09, REN-02, REN-06. Verificado: `tsc`, `eslint`, 788 pruebas (nuevas: lema, iconos), build, capturas del menú, la web, el Super y Mi cuenta, y 12 entradas seguidas al panel sin un salto. | `669bbdd` |
| 2026-10-03 | **Cierre de lo que no depende de ti.** NEG-05 (tocar una barra dice su cifra, en todas las gráficas), PED-11 (rótulo de la cifra grande en la ficha del teléfono), REN-02 (fuera ~45 `router.refresh()` sobrantes, comprobado acción por acción), REN-04 (checkout partido y memorizado), REN-06 (`fmtCurrency`), T-23 (radios a tokens), 37 textos más a 11 px (T-21), y dos hallazgos nuevos arreglados: PED-14 («Mesa 4 · Mesa 4») y CAT-14 («Efectivo contra entrega» al recoger). Verificado: `tsc`, `eslint`, 793 pruebas, cuatro builds de producción, recorrido con Playwright (lectura de barras en panel/Super/Mi cuenta, insumo creado y borrado con una sola petición, checkout de punta a punta), capturas de 16 pantallas del panel y 4 del Super. Pedidos de prueba y cupón borrados; los 3 pedidos puestos en curso para ver Mesas, devueltos a su estado. Lo que queda (21) espera D-2…D-9, contenido tuyo o es continuo. | `a21f6af` |
| 2026-10-03 | **D-5 hecho y maqueta de D-2.** AJU-06: QR de mesa con `/m/<slug>/<mesa>` (migración 134 con alias de slug para que un QR impreso sobreviva a un cambio de slug, y guardia para que nadie herede el slug de otro). Verificado: `tsc`, `eslint`, pruebas, build, recorrido con Playwright (slug, UUID, alias, inexistente, checkout, QR del PDF comparado píxel a píxel). D-2: maqueta publicada (https://claude.ai/artifact/JMFGLY23GhsNgDrU5KfvJP) con capturas reales del «antes» y la propuesta con los colores y letras del panel; pedidos de prueba devueltos a su estado. | (este commit) |
