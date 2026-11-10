# Registro de cambios

Cada versión es una etiqueta de git sobre un commit de `main` (`git show v0.7.0`). Las versiones de `v0.2.0` a `v0.10.0` se pusieron **retroactivamente** el 2026-10-09 sobre los hitos grandes que ya existían; desde aquí se etiqueta al cerrar cada hito. Reglas en [`docs/guias/FLUJO_GIT.md`](docs/guias/FLUJO_GIT.md).

Esto es la plataforma (`plataforma/`). El agente de impresión y Leogin Desktop llevan su propia versión (ver sus `package.json`).

## Sin publicar
- **Experiencia práctica, sin saturar** (rama `feat/experiencia-practica-movil`; principio rector del dueño, 2026-11-10):
  - Tomar pedidos: el salón pasa de título + contador + tres botones + filtros + zonas + pie fijo a una fila de mandos (Mesas | Plano · buscar · Para llevar) y una de filtros. Quien toma el pedido elige plano o mesas y el aparato lo recuerda; el teléfono abre en mesas. Las mesas libres ocupan menos, las que están fuera del plano siguen la página, tocar una mesa libre abre la carta directo y «atrás» sin nada apuntado vuelve al salón.
  - Carta del mesero: con dedo, los favoritos son una tira deslizable sin teclas; el pie «0 por enviar · Q0.00» ya no sale vacío.
  - Un plato personalizable abre su hoja al tocarlo (antes entraba sin opciones salvo grupo obligatorio) y la hoja usa las mismas reglas que la ficha del comensal: opción por omisión, mínimos y máximos.
  - Menú en línea: vuelve la barra de icono y nombre, ahora sólida y con la paleta del restaurante; el carrito es un solo botón. La cápsula gris queda solo en superadmin.
  - Panel: el aviso «Estás administrando…» es una línea y no una tarjeta; «Pantalla completa» sale de la barra del teléfono.

## v0.18.0 — 2026-11-10 · Auditoría integral: olas 0 y 1
PR de integración `release/integracion-2026-11-09` (#72–#108) · migraciones 154–180. En producción: 155–180 en un solo script ANTES del despliegue y la 154 DESPUÉS ([guía, parte 7d](docs/guias/GUIA_DESPLIEGUE.md)).
- **Correcciones de la Ola 0 que faltaban** (fichas 0.1–0.6, 0.8, 0.10, 0.11 y 0.13):
  - textos y enlaces que prometían otra cosa (0.1);
  - una sola fuente para precio y alcance de cada plan (0.2);
  - un error de consulta ya no se muestra como vacío ni como cero (0.3);
  - pausa de pedidos inmediata, confirmada y con fin automático (0.4, migración 155);
  - cupones que valen el día completo en la zona del local, programados y con estado único (0.5, migración 154);
  - pedido, cupón y puntos en una sola operación (0.6, migración 157);
  - compras creadas en una transacción y sin reabrir una recibida (0.8, migración 159);
  - un solo corte de caja por periodo y «sin apertura» marcado en el historial (0.10, migración 158);
  - la cola offline dice si guardó y la del mesero se reenvía sola (0.11);
  - pruebas del circuito del dinero en Postgres (0.13).
- **Lo ya descrito abajo** de las fichas 0.7, 0.9, 0.12, 0.14–0.19 y 1.0–1.12.
- **Herramienta:** `scripts/armar-migraciones-produccion.mjs` junta un rango de migraciones en un script transaccional con guarda contra doble aplicación.

- **Pedido y seguimiento honestos del comensal** (auditoría 1.12):
  - la confirmación dice «lo recibió; te avisamos cuando lo acepte», sin el «20–30 min» ni el «notificado al instante» fijos;
  - el seguimiento muestra Recibido, Aceptado, En preparación (platos listos), Listo y Entregado con su hora real;
  - si en 10 minutos no lo aceptan, lo dice y da el WhatsApp del local;
  - la carta confirma la mesa del QR, y una mesa que no existe no recibe pedidos.
- **Ficha y carrito del comensal** (auditoría 1.11):
  - opciones inequívocas: lo obligatorio sin predeterminada empieza vacío y se respeta el mínimo;
  - carrito accesible con «Cambiar» por línea;
  - aviso de lealtad legible en oscuro;
  - «Agotado · vuelve mañana» y «Otros» para lo que no tiene categoría.
- **Inventario y agotados con intención** (auditoría 1.10, migración 180):
  - agotar «hasta mañana», «hasta reponer» o «hasta que lo active», y agotar por ingrediente;
  - cobertura «N de M» y «Por revisar hoy»;
  - ajustes con motivo bajo bloqueo y activación del control en lote.
- **Catálogo** (auditoría 1.9, migración 179): ficha progresiva, filtros combinables, cambios en lote con vista previa, duplicar y borrar categoría con destino.
- **Recepción** (auditoría 1.8, migración 178): agenda con capacidad, «no asistió», aviso honesto y día de negocio.
- **Permisos por trabajo** (auditoría 1.7, migración 177): plantillas por puesto, Caja separada en capacidades y arqueo ciego opcional.
- **Navegación inferior del comensal y superadmin.** La cápsula sigue la referencia aprobada: gris claro, bisel elevado, selección negra e iconos junto al texto. El comensal muestra cantidad, producto e importe sobre la barra cuando tiene un carrito. Superadmin conserva tres accesos visibles y reúne los otros cuatro en «Más». El panel del restaurante conserva sus accesos operativos.
- **Pedidos en vivo** (auditoría 1.6, migración 176). El tablero avisa cuando un filtro oculta una incidencia. Cada pedido tiene un historial de estados, anulaciones, cobros y avisos fallidos. Los avances y anulaciones del tablero recuperan el resultado de un reintento y detectan cambios hechos desde otro dispositivo.
- **Cocina por etapa y estación** (auditoría 1.5, migración 175): cada puesto marca sus platos y Pase confirma cuándo los recoge Servicio. El tablero separa los tiempos de preparación y espera de salida, y muestra variantes, alérgenos, anulaciones y fallos de impresión en la comanda.
- **Servicio estable por turno** (auditoría 1.4, migración 174): los favoritos tienen puestos fijos en cada dispositivo. Tomar pedidos busca por nombre o alias y conserva los borradores al cambiar de mesa. La comanda distingue saldo enviado, platos por enviar y notas para cocina.
- **Salón y comanda** (auditoría 1.3, migración 173): el plano permanece junto a la comanda en escritorio y el teléfono abre cada mesa por separado. Cobrar conserva los pedidos pendientes de entrega. El personal confirma la limpieza antes de volver a sentar a un grupo. Traslados y llegadas desde Recepción actualizan la ocupación en una transacción.

## v0.17.0 — 2026-11-02 · Tomar pedidos como un POS y En línea con tope
PR #63-#69 · migraciones 151-153 (en producción: la 152 ANTES del despliegue, la 151 cuando sea, la 153 DESPUÉS; la 149 ya no hace falta)
- **El plano cabe en cualquier pantalla** (PR #63): en el teléfono el plano de Mesas medía 620 px de ancho mínimo y el de Tomar pedidos 460 px en 4:3 (el editor guarda 16:10), así que la página entera se corría de lado y las mesas se encimaban. Ahora los dos usan un visor común: se encuadra en lo dibujado, se gira 90° solo en pantalla vertical (con botón para girarlo a mano), las mesas miden lo que permite su vecina más cercana con 44 px de mínimo, y se acerca con dos dedos, Ctrl + rueda o botones; al acercar, cada mesa enseña más. Las zonas son pestañas tocables con cuántas mesas tienen gente («Salón 3/14»). «Fuera del plano» ya no cuenta las mesas colocadas en otra zona.
- **La carta del mesero con la foto de cada plato** (PR #64): funciona como cualquier POS. Un toque agrega uno, o abre la hoja si el plato tiene un grupo obligatorio. El número de la esquina dice cuántos van, «−» quita uno y «⋯» abre opciones y nota. Sale «Quedan N» cuando quedan pocos y «Agotado» en gris; sin foto, iniciales sobre un color fijo, y si el restaurante no tiene fotos se quedan las tarjetas compactas. Son 3 columnas en el teléfono, 5 en tablet y 4 en la PC.
- **Cinco funciones de POS en Tomar pedidos** (PR #66):
  - «Mis mesas»: un filtro con solo las mesas del mesero;
  - agotar un plato desde el servicio y devolverlo con «Ya hay», para quien tiene permiso de carta;
  - «Otra ronda»: copia la última ronda de la mesa al carrito contra la carta de hoy;
  - alergias de la mesa (migración 151): se anotan una vez, se ven en rojo en la comanda y salen en cada envío como «ALERGIA: …»;
  - pasar un plato ya enviado a otra mesa o a otro asiento (migración 152): `move_order_item` reparte subtotal, propina y total en una transacción y no deja mover lo anulado ni cuentas con cobros o descuentos.
- **Arreglo: dueños con varios restaurantes** (PR #66): no podían mandar comandas en la sucursal a la que entran por membresía («No autorizado» y el pedido de vuelta al carrito). Ahora la comprobación es la misma que en el resto del servicio.
- **Se retiran los encargos y la transferencia del comensal** (PR #67, migración 153): por decisión del dueño salen **Pedidos › Encargos**, la franja de encargos del menú, la opción «Transferencia» del checkout con su comprobante, la cuenta del restaurante en Ajustes › Pedidos y cobro y el aviso de pago en la tarjeta del pedido. La 153 devuelve el archivado automático al de la 099 y borra `encargo_fechas` y sus columnas en `orders`. **Paga tu plan** (148) no cambia.
- **Tope de 300 pedidos al mes en En línea** (PR #69): es lo que ahora lo separa de Estándar. Es un tope blando: nunca se corta un pedido. El panel «Hoy» avisa al llegar al 80 % y al pasarlo, Mi suscripción enseña «Pedidos este mes: N de 300» y se pide pasar a Estándar el mes siguiente. Cuenta el mes del calendario en la zona del restaurante, sin los cancelados. Planes, el alta y /vende-en-linea lo dicen y presentan En línea con zonas de reparto y seguimiento del pedido.
- **CI con la CLI 3 de Supabase** (PR #68): la versión nueva ya no aceptaba `[inbucket]` en `config.toml` y `supabase start` fallaba en todos los PR. Ahora la sección se llama `[local_smtp]` y la CLI queda fijada en 3.0.0.

## v0.16.0 — 2026-11-02 · Paga tu plan, encargos y plan En línea
PR #58-#61 · migraciones 148-150 (pendientes en producción: aplicar en ese orden ANTES del despliegue)
- **Plan de necesidad y plan En línea** (PR #58 y #59, [plan](docs/planes/PLAN_NECESIDAD_Y_PLAN_EN_LINEA_2026-10-28.md)): qué agregar para que un restaurante *necesite* Leogin, en nueve fases. Decisiones del dueño: un plan para quien solo vende en línea a **Q99**, el cobro de Leogin por transferencia pero profesional, y «Leo contesta tu WhatsApp» queda pendiente. Este hito cierra las fases 1 a 3.
- **Paga tu plan** (PR #59, migración 148): «Mi suscripción» enseña cómo pagar en tres pasos: la cuenta con botón de copiar, un código de pago fijo (`LG-XXXXXX`) y la subida del comprobante a un bucket privado. El comprobante queda «en revisión» hasta que el super admin lo aprueba o lo rechaza con motivo en la bandeja nueva **Finanzas › Comprobantes**. Aprobar marca pagadas las facturas y reactiva al restaurante si estaba suspendido. Hoy avisa del cobro pendiente y Super › Configuración guarda la cuenta en campos separados.
- **Encargos con cupo** (PR #60, migración 149): en **Pedidos › Encargos** el restaurante abre una tanda («Tamales del sábado») con día de entrega, cierre y cupo, y puede pedir pago por adelantado. El menú enseña una franja con «Quedan N» y deja encargar aunque el local esté cerrado. El encargo sale en la tarjeta del pedido y en la comanda, y el seguimiento dice para cuándo es. Si dos personas piden el último lugar a la vez, solo una se lo queda. La 149 también evita que el archivado automático de 6 horas cancele los encargos antes de su día.
- **Pago por transferencia del comensal** (PR #60, migración 149): el restaurante pone su cuenta en **Ajustes › Pedidos y cobro**. El cliente elige «Transferencia», ve la cuenta en el seguimiento y sube su comprobante. El restaurante lo confirma desde la tarjeta del pedido («Confirmar pago» o «No llegó»). Con el pago enviado, el cliente ya no puede cancelar solo.
- **Plan En línea** (PR #61, migración 150): Q99 al mes, sin costo de alta, para llevar y a domicilio, encargos y transferencia, con 150 productos y 1 usuario. No incluye comer en local, finanzas, cupones, lealtad ni mesero. La 150 lo agrega a la restricción de planes, al cobro y a su piso de módulos (sin ella habría recibido gratis los de Premium). Se ve en `/planes`, en la portada (cuatro planes, en 4, 2 o 1 columna), en el alta y en `/vende-en-linea` («Menos de Q4 al día»).
- **Cambiar de plan desde el panel** (PR #61): Mi suscripción muestra los cuatro planes y, antes de confirmar, el precio, desde cuándo se cobra y lo que se deja de tener al bajar. Al bajar se apagan los módulos del plan anterior y se ajustan los modos de pedido y la mensualidad. Solo el dueño puede hacerlo. Se quitaron los botones «Actualizar a…» que abrían WhatsApp.
- **Arreglos** (PR #61): cinco pantallas decidían si un restaurante tiene panel de mesero con una lista de planes escrita a mano; ahora lo leen del plan.
- **Dependencias por avisos de seguridad** (PR #59): `node-forge` 1.4.2, que usa `acme-client` para el HTTPS del hub local.

## v0.15.0 — 2026-10-27 · Vende en línea
PR #55 y #56 · sin migraciones
- **Leogin para quien vende en línea** (PR #56, [plan](docs/planes/PLAN_PORTADA_Y_VENDE_EN_LINEA_2026-10-27.md)): página `/vende-en-linea` para quien vende por WhatsApp o Instagram sin local («Tu menú en un link. Tus pedidos, en orden.»), con el chat que se vuelve un pedido, lo que no le va a estorbar tachado, la Vitrina por temporadas y «Menos de Q7 al día». Puerta en la segunda pantalla de la portada y enlace en la cabecera, el menú y el pie. El alta llega con Estándar «para llevar + a domicilio» ya marcado.
- **Video «Del chat al pedido»** (PR #56, mismo plan §3): 30 s vertical (y corte de 15 s) para quien vende en línea, hecho con código como la intro: el chat lleno de «¿precio?» y el pedido perdido, Leo, el link en la bio, el cliente que pide solo, el pedido que llega completo y la semana. Se ve en `/vende-en-linea` («Míralo en 30 segundos», ruta `/intro-en-linea`); `grabar-video.mjs` y `publicar-en-web.mjs` aceptan `--archivo en-linea.html`.
- **La portada en el teléfono** (PR #56): sin desborde lateral (la intro salía cortada), el video en el primer pantallazo, cabecera sólida, la vitrina de diseños «mitad y mitad», menos recorrido en «Del caos al control», cifras 2×2 y carruseles; la intro vertical centrada.
- **También en PR #56:** en el teléfono la tarjeta de la intro es cuadrada, con la versión vertical (el gancho casi al doble de tamaño); el panel de quien vende solo en línea ya no enseña Mesas, Tomar pedidos ni Salón con candado; Leo del video con los dos brazos y la campanita (#55); y los videos ya no salen con una franja oscura de 8 px en el borde.
- **Leo con los dos brazos en la intro** (PR #55): el Leo de la intro solo dibujaba el brazo izquierdo y no tenía la campanita; ahora lleva el brazo derecho apoyado en la campana, igual que el componente `leo.tsx`. Se regeneró `/intro`. Los medios de la portada (imagen y bucle) no tienen a Leo, así que no cambian.

## v0.14.1 — 2026-10-27 · Leo v3 y sticker de logros
PR #51-#53 · sin migraciones
- **Leo v3** (PR #51 y #52, [propuesta](docs/diseno/marca/leo-v3-propuesta.html) y [variantes](docs/diseno/marca/leo-v3-variantes.html)): silueta S2 con campanita en la punta del pie y ojos E1. Tiene ceja derecha siempre alzada, sonrisa con dientes y dos brazos, con tres niveles de detalle según el tamaño (completo, compacto y mínimo, con color plano en los chicos). Aplicado en el componente y en la intro.
- **Pie recto y sticker de logros** (PR #53, [hoja de cara y sticker](docs/diseno/marca/leo-cara-y-sticker.html)): el pie termina en punta recta para que la silueta no se lea como bota, en el panel y en la intro. Leo sale como calcomanía (borde blanco, giro y animación de pegado) solo en los logros del panel: la fiesta del primer pedido, las tarjetas de hito, el récord de «Tu día» y «Tu año». La cara se queda igual.

## v0.14.0 — 2026-10-27 · Pídelo tú mismo
PR #45-#49 · sin migraciones
- **Pídelo tú mismo** (PR #49, hallazgo EV-01 de la [auditoría de experiencia y venta](docs/auditorias/AUDITORIA_EXPERIENCIA_Y_VENTA_2026-10-27.md)): la demo de Rincón 502 deja pedir. El carrito termina en «Enviar mi pedido de prueba» y enseña «¡Así le llegó a la cocina!», el panel con el pedido sonando, que se puede aceptar y marcar listo. En la web, en PC, «Haz un pedido de prueba» abre una sala con su QR: lo que el visitante pide desde su celular aparece y suena en el panel de la página, con su nombre. Sin base de datos (difusión de Supabase Realtime).
- **Auditoría de experiencia y venta** (PR #46): el panel, la web y el catálogo evaluados con la vara de Nintendo y Apple y de venta, con pasada en pantalla. 19 hallazgos (EV-00 a EV-18; EV-12 ya estaba hecho); quedan pendientes EV-02 a EV-09 y EV-13.
- **Primera impresión** (PR #48): Hoy ya no dice «↓ 100 %» antes de la primera venta, sino con cuánto cierra un día igual (EV-15). El aviso de la PC principal deja de salir en todas las pantallas y pasa a «Necesita tu atención» en Hoy, solo con pedidos; el tour de bienvenida no se abre encima de los primeros pasos (EV-14). El panel dice «platillo» en todas partes (EV-17). Las llamadas al mesero dejan de contar a las 3 horas (EV-18). En la web, «0 apps que descargar» en lugar de «7 herramientas» y Premium «Recomendado» en lugar de «Más popular» (EV-10 y EV-11).
- **Arreglos** (PR #47): Tomar pedidos salía en blanco y Cocina devolvía al login al dueño del modelo de membresías (EV-00). «Carbón de Autor» salía clara pese a ser la paleta oscura insignia; ahora tiene sus colores, y el alta arranca en claro con la paleta nueva «Lino & Coral», igual que antes (EV-16).
- **Ventana con versión vieja** (PR #45): una pestaña abierta desde antes de un despliegue se recarga sola ante «Failed to find Server Action» en vez de quedarse rota.

## v0.13.0 — 2026-10-26 · Tu restaurante, bajo control
PR #27, #28, #33-#36, #38-#42 · migraciones 145-147 (aplicadas en producción antes del despliegue)
- **Tu restaurante, bajo control** (PR #38 y #39, [estrategia de atracción](docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md)): la promesa de marca, Leo v2 y una portada nueva con la intro animada de 54 s («Las tres fugas», con cortes de 30 y 15 s para redes) en `/intro`, «Del caos al control» al deslizar y la vitrina «Tu menú, a tu manera» con el menú de verdad en las 8 estructuras.
- **El menú y el panel se mueven con sentido** (PR #40, [plan](docs/planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md)): en el menú los platillos entran al deslizar y vuelan al carrito; en el panel las cifras ruedan, el pedido nuevo cae y la caja se estampa al cuadrar.
- **Rincón 502, el único restaurante de ejemplo** (PR #39 y #41): la demo en vivo, las pruebas, los scripts, las guías y Leogin Desktop dejan Azúcar Negra.
- **Momentos pico, Leo y ganchos** (fases C, D y E de la [estrategia de atracción](docs/negocio/ESTRATEGIA_ATRACCION_2026-10-25.md), PR #42, migración 147, [plan](docs/planes/PLAN_MOMENTOS_PICO_2026-10-26.md)). **Panel:** «Termina de armar tu restaurante» arranca en 20 % y Leo señala el paso que sigue; Leo en todas las pantallas vacías; el primer pedido del restaurante es una fiesta; en Hoy, el plato estrella, la hora pico y el récord del día cuando lo es de verdad; hitos (100 pedidos, primer mes, cada año); al cerrar el turno, lo vendido en el día con su récord y un aviso al dueño; «Comparte tu plato del día» y «Tu año con Leogin» con imagen para el estado de WhatsApp. **Menú:** al enviar el pedido vuela, suena un «pop» y la palomita se dibuja en verde; se dicen los puntos que suma y cuánto falta para el premio (o los que se pierden sin cuenta); doble de puntos en el primer pedido desde el celular y sorpresa de la casa al azar, las dos en Lealtad. **Web:** «Crear mi menú gratis», «Míralo en tu celular» con QR en computadora, la tarjeta de la intro en movimiento y «Ver todo lo que incluye»; al crear el restaurante, «Así se ve TU restaurante». **Billetera:** Leo da la bienvenida.
- **Cuenta Leogin del comensal** (PR #33-#35, migración 146, [plan](docs/planes/PLAN_BILLETERA_COMENSAL_2026-10-25.md)): una sola cuenta de Google para todos sus restaurantes, la billetera «Mis restaurantes» en `distleogin.com/billetera` y el puente que abre su sesión en cada restaurante por el link estable `/m/<slug>`.
- **Menú del comensal: «Atrás» y Esc cierran la hoja abierta** (auditoría de navegación 2026-10-14, PR #28): el platillo, el carrito, Mi cuenta, Mis puntos y Mis pedidos dejan una entrada en el historial, así que el gesto «Atrás» de Android cierra la hoja en vez de sacar del menú (o devolver a la cámara si se entró por un QR), y Esc la cierra en PC. Volver desde el pago reabre el carrito.
- **Barra del panel con roles estrechos** (misma auditoría, PR #28): el mesero puro ya no ve «Hoy» (que lo devolvía a Tomar pedidos) ni una barra inferior con un solo destino, y su salón gana esos 56 px; el botón «Tomar pedido» ya no depende de tener «Menú»; con barra lateral (tablet y PC) «Pedidos» vuelve a marcarse en Tomar pedidos, y el título dice la pantalla cuando no hay fila de pestañas.
- **Caja por turnos** (FUN-01, PROD-02…06 de la [auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md), PR #27, migración 145, [plan](docs/planes/PLAN_CAJA_TURNOS_2026-10-09.md)): el turno se abre con quién y fondo y su cuadre cubre solo lo **cobrado** desde el cierre anterior (una mesa abierta ya no es un «faltante»; dos turnos al día cuadran cada uno lo suyo y el historial suma el día). Antes de cerrar avisa de mesas, domicilios y pedidos para llevar sin cobrar. Hora de corte del día por restaurante (05:00 por omisión, en Ajustes › Horarios) para caja, gastos, propinas, Hoy, reportes y analítica. «Cobros de este turno» deja corregir el método, reabrir una mesa cobrada por error y devolver todo o una línea (hasta 3 días), con motivo, firma de encargado y bitácora; el reporte de ventas enseña las devoluciones aparte. Un corte ya no se borra: el último se anula con motivo y firma y el turno se vuelve a contar.
- **Arreglos** (PR #42): el asistente para crear un restaurante se saltaba el resumen («Continuar» lo creaba ahí mismo); la ventana de la intro de la portada salía pegada arriba a la izquierda; la CI dejó de pasar ESLint por el GSAP minificado de la intro.
- **Dependencias por avisos de seguridad** (PR #36): Next.js 16.4.3, zod 4, `dompurify` 3.4.17 y `follow-redirects` 1.16.2.

## v0.12.0 — 2026-10-13 · Auditoría de salida a producción
PR #10-#25 · migraciones 142-144 (pendientes en producción, en ese orden)
- [Auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md): qué falta para vender (errores del sistema, errores humanos, seguridad, legal y fiscal, funciones). Los planes de servidores quedan como decisión cerrada (Render Starter en `render.yaml`).
- Arreglos de la auditoría (migraciones 142-144): el dueño registrado solo ya puede subir fotos y logo (142); cobrar una mesa cierra solo lo que leyó y registra el pago una vez; la cancelación del comensal es atómica y ya no pisa la confirmación de cocina (143); anular o cancelar devuelve los puntos canjeados y el uso del cupón (144); el cambio de estado usa el restaurante del pedido para comanda, puntos, FEL y bitácora; la bitácora anota precios, borrados, cupones, gastos, pausa y horario, con filtro por persona.
- Dependencias al día: grupo de menores de la plataforma (Next.js 16.4.0, React 19.3, `@supabase/ssr` 0.12.7, entre otras), del agente de impresión y de Leogin Desktop, y las GitHub Actions. Dependabot ya no propone versiones mayores de zod, TypeScript, vitest ni `@types/node` (se migrarán a propósito).
- Seguridad de dependencias (SEG-01/02/03/05 de la [auditoría de salida a producción](docs/auditorias/AUDITORIA_SALIDA_PRODUCCION_2026-10-09.md)): Next.js 16.2.7 → 16.3.8 (cierra la vulnerabilidad crítica de saltarse el proxy y las de ejecución remota), `sharp` 0.34 → 0.35.5 (fotos subidas en `/img`), `npm audit fix` para el resto. La CI ahora corre las pruebas unitarias, el `build` y un `npm audit` de producción; Dependabot revisa cada semana las dependencias de la plataforma, el agente, Leogin Desktop y las GitHub Actions.
- Vista previa en vivo del editor de personalización fiel al menú real: ya no se pinta con los colores de Leogin (coral y grises claros) en lugar de los del restaurante; el editor arranca con el nombre y lema reales; y la vista previa muestra también el botón de WhatsApp, la pestaña de Fidelidad, «Llamar al mesero» y el selector de idioma.

## v0.11.0 — 2026-10-09 · Estructura Vitrina y lanzamientos
`5388e2f` · migración 141
- Orden de la carpeta: documentación en `docs/` por tipo, archivos de prueba fuera del repositorio.
- Flujo de git: ramas + Pull Request, plantilla de commit, hooks `pre-push` y `commit-msg`, `.mailmap`.
- Estructura de menú **Vitrina** (8.ª) para comercios que venden con la vista: pieza grande por producto, portada de cartel y paletas Cereza, Cacao y Pistache. Opcionales en cualquier estructura: cinta de anuncios, modo lanzamiento con cuenta regresiva y aviso «quedan pocas». Plan: [`PLAN_VITRINA_2026-10-09`](docs/planes/PLAN_VITRINA_2026-10-09.md).
- Vitrina, Fase 2 (migración 141): la edición abre y cierra de verdad (el servidor rechaza pedidos en línea fuera de la edición), archivo de ediciones con «Agotado en …», próximo drop con «Avísame por WhatsApp» y «Quedan 9 de 30».

## v0.10.0 — 2026-10-08 · Acceso y monitoreo antes del lanzamiento
`ef37fa0` · migraciones 136-140
- Candados de escritura y de pedidos/dinero, permisos por sección del panel.
- Super admin con segundo factor y salud de clientes.
- Plan: [`PLAN_ACCESO_Y_MONITOREO_2026-10-08`](docs/planes/PLAN_ACCESO_Y_MONITOREO_2026-10-08.md). Pendiente según el plan: TOTP/2FA completo, Sentry y cron.

## v0.9.0 — 2026-10-04 · Auditoría de pulido (146/148)
`3990f46` · migraciones 134-135
- Textos y claves, piezas comunes, pantallas largas y buscadores, marketing.
- Pedidos y Mesas según la maqueta aprobada (D-2); QR de mesa con dirección corta `/m/<slug>/<mesa>` (D-5).
- Render movido a Virginia, junto a Supabase.
- Registro: [`AUDITORIA_PULIDO_2026-10-02`](docs/auditorias/AUDITORIA_PULIDO_2026-10-02.md).

## v0.8.0 — 2026-09-26 · Auditorías QA visual y de velocidad
`61911fb`
- ~60 arreglos de la auditoría QA visual de todo el panel.
- Imágenes servidas desde `/img`, CSS del admin aparte, «Enviar a cocina» optimista.
- Registro: [`AUDITORIA_2026-09-25`](docs/auditorias/AUDITORIA_2026-09-25.md).

## v0.7.0 — 2026-09-08 · Impresión por estación (M-07)
`12db70e` · migración 130
- Cinco fases: estación, reparto de comandas, papeles, pantalla de activación y reparto sin internet.
- Plan: [`PLAN_IMPRESION_POR_ESTACION`](docs/planes/PLAN_IMPRESION_POR_ESTACION.md).

## v0.6.0 — 2026-09-02 · Origen único y auditoría del salón
`e94c493` · migraciones 124-127
- El panel pasa de subdominio a `/panel/<slug>`.
- 25 hallazgos de Mesas y Tomar pedidos.
- Plan: [`PLAN_ORIGEN_UNICO`](docs/planes/PLAN_ORIGEN_UNICO.md).

## v0.5.0 — 2026-08-26 · Sistema de acceso y rediseño del salón
`745f8d9`
- Login con Google, «Mi cuenta» multi-restaurante, gerentes e invitaciones.
- Rediseño de pedidos y mesas, modo servicio, avisos.
- Plan: [`PLAN_ACCESO_MULTICUENTA`](docs/planes/PLAN_ACCESO_MULTICUENTA.md).

## v0.4.0 — 2026-07-27 · Red de seguridad (CI) y preventa
`4bb2aec` · migraciones 091-092
- CI con Supabase efímero, prueba E2E de pedidos y auditoría de funciones `security definer` en cada push.
- Precios unificados y caja de herramientas de venta.
- Plan: [`PLAN_CORRECCION_PREVENTA`](docs/planes/PLAN_CORRECCION_PREVENTA.md).

## v0.3.0 — 2026-07-22 · Cierre del plan de auditoría de lanzamiento
`1cb9197` · migraciones 074-088
- Login de personal por PIN, anulación con motivo y PIN, auto-archivo de mesas.
- Kardex con costo promedio ponderado y respaldo self-service.
- Alérgenos y dietas, menú bilingüe, lista de espera.
- Plan: [`PLAN_AUDITORIA_LANZAMIENTO`](docs/planes/PLAN_AUDITORIA_LANZAMIENTO.md).

## v0.2.0 — 2026-07-11 · Modo offline y Leogin Desktop
`94c2c78`
- Hub local que toma pedidos sin internet, imprime y sincroniza; cola de pedidos idempotente.
- Leogin Desktop (Tauri v2) v0.3.0 con agente de impresión v0.7.0.

## v0.1.0 — 2026-06-21 · Primera versión etiquetada
`eef5c61`
- Menú digital, pedidos, panel de administración y agente de impresión.
