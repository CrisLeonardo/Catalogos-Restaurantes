# Leogin: auditoría de producto, diseño y capacidad de venta

> **Copia archivada en el repositorio el 2026-11-04.** Texto sin cambios salvo los enlaces entre documentos. Las capturas `evidencias-v2/` (88 imágenes, 7,8 MB) no se suben al repo: quedan en la carpeta original de la entrega (`.codex/visualizations/2026/11/02/01a19d6f-…/evidencias-v2/`), por eso sus enlaces no abren desde aquí. El trabajo derivado se organiza en [PLAN_AUDITORIA_INTEGRAL_2026-11-04](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md).

Fecha: 2 de noviembre de 2026. Base de código revisada: `876dd50`, versión documentada v0.17.0.

Este documento es un plan. No se modificó el sistema, su configuración, su base de datos ni sus precios. El informe se guardó fuera del repositorio.

## 1. Mi opinión sincera

Leogin ya tiene una base funcional considerable. Mi lectura no es «falta construir casi todo». Es **«hay mucho construido, pero la calidad de los recorridos completos todavía es desigual»**. Hay decisiones cuidadas —precios verificados por servidor, pedidos con identificador estable, borradores de servicio, cobros parciales, permisos, alertas, impresión, modo sin conexión— junto a experiencias que todavía exigen que el usuario entienda la estructura interna del producto.

La identidad comercial es reconocible: naranja, titulares fuertes, Leo y un lenguaje cercano. Sin embargo, la presencia visual se reparte entre una web editorial, un catálogo de vidrio translúcido y paneles con distintas convenciones. Mi recomendación es consolidar una dirección de arte propia y llevarla a los flujos, no limitarse a cambiar colores.

**Hoy lo presentaría como un producto avanzado en construcción, apto para pilotos acompañados; esta auditoría no basta para certificar que está listo para venderse y operarse masivamente sin asistencia.** No he medido su retención, sus incidencias reales ni cuánto tarda un restaurante nuevo en operar sin ayuda. Sin esas pruebas, afirmar que ya es irresistible sería complacencia.

Lo que lo puede volver indispensable es una combinación concreta: **empiezo rápido, mi equipo aprende rápido, no pierdo pedidos, sé dónde quedó el dinero y recibo ayuda para mejorar mi negocio**. El diseño debe hacer visible esa tranquilidad desde la primera interacción.

«Que se venda solo» debe convertirse en metas medibles: que el prospecto comprenda el beneficio, pruebe una situación realista y pueda arrancar; que el dueño perciba valor cada semana; que recomendarlo resulte natural. No existe una función ni una estética que garantice que todos lo quieran. Conviene ganar primero un tipo de restaurante y extenderse después.

### Alcance y grado de certeza

| Superficie | Revisión realizada | Límite |
|---|---|---|
| Web comercial | Navegador: portada, planes, FAQ y acceso. DOM, capturas y código | Sin datos de conversiones ni medición de tráfico real |
| Comensal | Demo pública: carta, ficha, extra y carrito; observación a 375 × 812 | No envié pedidos reales ni completé pagos |
| Restaurante | Código de navegación, Hoy, alta, caja, servicio, cocina, inventario, recetas, informes, respaldo y permisos | Sin sesión autenticada; no certifico alineaciones ni comportamiento visual del panel en producción |
| Superadmin | Código de inicio, navegación, salud de clientes, cobros, cuentas, seguridad y consultas | Sin sesión autenticada ni inspección de sus datos reales |
| Técnica | Lectura de lógica crítica, pruebas existentes, CI y migraciones; TypeScript sin emitir archivos | TypeScript pasó. No ejecuté pruebas que crean/borran restaurantes, pruebas de carga ni restauraciones |

Etiquetas usadas: **V** = observado en navegador; **C** = verificado en código; **H** = hipótesis a validar con usuarios o pruebas; **P** = propuesta nueva. Una propuesta no significa que exista un fallo.

Los documentos anteriores se usaron como contexto, no como verdad automática. El historial actual indica que **encargos y transferencia del comensal fueron retirados por decisión del dueño** en el PR #67. No los incluyo como funciones que haya que restaurar. «Paga tu plan», para pagarle a Leogin, es otro flujo y se conserva.

## 2. Hallazgos concretos que sustentan el plan

| ID | Evidencia actual | Implicación y acción |
|---|---|---|
| F01 · V/C | La portada promete pedidos, cocina, caja e inventario; el CTA principal dice «Crear mi menú gratis» | Alinear la expectativa de prueba con lo que se entrega. El gratuito no incluye todo lo prometido |
| F02 · V/C | El texto invita a escribir por WhatsApp; el contacto servido abre `mailto:` | Configurar el canal real o cambiar texto e icono según el canal disponible |
| F03 · V/C | En línea anuncia 300 pedidos/mes; una FAQ dice «No hay tope … de pedidos en ningún plan» | Contradicción comercial confirmada. Explicar el límite blando y el cambio de plan de forma consistente |
| F04 · V | En `/planes`, a la anchura de escritorio observada, Q99/mes cabe en una línea, Q150/mes y Q299/mes se parten | Normalizar estructura y alineación del precio; separar importe y periodicidad |
| F05 · V/C | La portada, a 375 × 812, reportó unos 16.632 px de alto; conserva 13 títulos h2 y una vitrina extensa | Es una fotografía de esta sesión, no un benchmark universal. Probar una versión más corta, midiendo comprensión y conversión |
| F06 · V/C | No se observaron scripts Umami/Plausible en la portada cargada; el código permite tenerlos apagados | Verificar medición activa. No concluyo que no exista ninguna analítica externa; sí falta evidencia de ese embudo en funcionamiento |
| F07 · C | Crear restaurante mantiene «Tu plan → Tu restaurante → Tu estilo → Confirmar» | Mucha decisión antes del primer resultado operativo |
| F08 · C | Primeros pasos: marca y categoría antes del primer platillo; compartir se considera hecho por tener visitas | Ordenar por valor obtenido; medir publicación y primer pedido, no inferirlos de una visita |
| F09 · V/C | En la ficha, tras seleccionar tocino, el botón «Agregar · Q62.00» tenía su borde inferior en ~878 px con viewport de 812; es contenido desplazable | El total y la acción deben permanecer visibles. La suma del extra sí fue correcta |
| F10 · V/C | La demo usa fondo oscuro, halos, superficies translúcidas y descripción en cursiva | Tiene carácter, pero la prioridad visual compite con la lectura. Probar una carta gastronómica más sólida y legible |
| F11 · C | `hoja-cobro.tsx` aclara que «partes iguales» calcula el reparto, pero cobra la cuenta completa; genera un único método por envío | La etiqueta promete más de lo que ese recorrido hace. Convertir cada parte en un cobro real o renombrar la función mientras se completa |
| F12 · C | La hoja de cobro ofrece sugerencias de bebidas/postres antes de los controles de pago | Vender complementos en la toma del pedido; al cobrar, priorizar exactitud y velocidad |
| F13 · C | El arqueo permite borrador mediante «Guardar y seguir después»; los cambios de conteo viven en estado local hasta esa acción | Mejorar protección frente a interrupción. No confundir el borrador manual de caja con el autoguardado existente en servicio |
| F14 · C | Caja comparte permiso `finanzas`; `permissions == null` para personal concede acceso amplio | Separar operación de caja y visión financiera. Migrar permisos con cuidado para no dejar personal fuera durante un turno |
| F15 · C | KDS calcula espera desde `created_at`; otras tarjetas tienen reloj por etapa | Distinguir espera de aceptación, preparación y entrega; mostrar qué mide cada tiempo |
| F16 · C | El costo congelado de venta contempla producto base; el código indica que extras/variantes no tienen costo propio | El margen puede ser parcial aunque haya costo base. Completar costeo y explicar cobertura |
| F17 · C | Un agotado manual puede volver automáticamente a las 12 h; stock cero sí prevalece | Dar intención explícita: hasta mañana, hasta reponer o hasta reactivar. Doce horas no representa todos los restaurantes |
| F18 · C | Copia de datos: cuatro hojas y hasta 5.000 pedidos; la UI sí anuncia el límite, pero también la llama «copia completa» | Es una exportación parcial, no recuperación integral del negocio. Precisar alcance y diseñar exportación/restauración completa |
| F19 · C | Series del superadmin traen filas con límites de 100.000; cobros usan límites de 20.000 | Riesgo de truncamiento/costo al crecer. No afirmo que hoy ya pierda datos; sustituir por agregaciones y paginación |
| F20 · C | El E2E visible contiene creación/anulación y aislamiento; crea dueños con `profiles.restaurant_id` | Hay CI y 90 archivos de pruebas unitarias, pero ese E2E no representa por sí solo altas con membresías, caja, desconexión y roles reales |
| F21 · C/H | Pedido se crea por RPC; cupón, contador de usos y canje de puntos se escriben después en llamadas separadas | Investigar consistencia ante carreras y fallos parciales. Riesgo concreto del flujo leído; no es un incidente reproducido |
| F22 · V | La pantalla de acceso muestra título de pestaña «Menú en línea» y explicación técnica del usuario `carlos@turestaurante` | Dar continuidad de marca y orientar por persona/local sin exigir comprender el identificador técnico |

### Lo que conservaría y perfeccionaría

La demo «Pídelo tú mismo» existe: no hay que reconstruirla desde cero. También existen división por platos, pagos parciales, correcciones de cobro, reautenticación, segundo factor, notificaciones, copia de datos, recetas, permisos y salud de clientes. Las tareas siguientes profundizan estas capacidades. Ninguna se considera terminada solo porque aparezca un botón o una pantalla.

## 3. Dirección de diseño propuesta

### Una identidad gastronómica, cálida y precisa

Mantendría la marca Leogin y su naranja. Propondría una estética inspirada en **una carta bien editada, una comanda clara y una estación de trabajo ordenada**: tipografía con personalidad en títulos, superficies sólidas, números alineados, fotografía real y movimientos breves que expliquen una acción.

La diferenciación debe reconocerse incluso en escala de grises: composición, jerarquía, lenguaje, estados y continuidad. Si solo se reconoce por el naranja o por el desenfoque del fondo, la identidad es demasiado superficial.

| Elemento | Especificación inicial para prototipar |
|---|---|
| Fondo | Marfil cálido `#F7F4EE`; blanco cálido `#FFFEFB` para zonas de trabajo |
| Texto | Carbón `#202420`; secundario `#5B625B`. Evitar gris tenue para información operativa |
| Marca | Naranja `#C74B24`; variantes oscuras para texto. Verificar contraste de cada combinación antes de aprobar |
| Estados | Verde `#25634A`, ámbar oscuro `#875900`, rojo `#AD3328`, azul `#255E85`. Siempre acompañados de palabra/icono |
| Tipografía | Conservar la tipografía distintiva para titulares cortos. Sans legible en formularios; cifras tabulares para importes. Cursiva solo como acento editorial |
| Tamaños | Comensal y formularios móviles: base 16 px. Panel: base 14–16 px; metadatos secundarios 12–13 px. Cocina: texto operativo 20–24 px sujeto a prueba a distancia |
| Espaciado | Escala 4, 8, 12, 16, 24, 32, 48. Misma alineación entre título, contenido y pie de acción |
| Radios | 10–12 px en controles; 16–20 px en contenedores. Píldoras para filtros/estados, sin convertir cada superficie en una cápsula |
| Elevación | Separación por espacio/borde; sombra para overlays. Evitar varios niveles de brillo y translucidez a la vez |
| Toque | Meta interna 48 px para controles importantes; 56 px para acciones de servicio/cocina. No confundir esta meta con el mínimo normativo de accesibilidad |
| Movimiento | 120–180 ms para respuesta; 180–240 ms para hojas. Sin animación de números durante un cobro. Respetar reducción de movimiento |
| Leo | Acompaña primeras tareas, logros y ayuda. Se retira de errores de dinero, incidentes y acciones urgentes |

Estos colores son una propuesta de partida, no una paleta ya validada con todas las combinaciones de contraste.

### Cuatro superficies con el mismo idioma, distintos ritmos

| Superficie | Sensación buscada | Composición |
|---|---|---|
| Web de venta | «Esto entiende mi restaurante» | Escenas reales, demostración temprana y pocas promesas verificables |
| Dueño | «Sé qué pasa y qué hacer» | Resumen breve, excepciones y acciones, con detalle disponible |
| Personal | «Puedo trabajar sin pensar en el software» | Pantalla persistente, controles grandes, posición estable y estados explícitos |
| Comensal | «Me provoca pedir y sé qué recibiré» | Comida protagonista, lectura clara y carrito accesible |
| Superadmin | «Puedo operar Leogin sin perseguir problemas» | Cola de trabajo, contexto de cuenta, historial y salud comercial/técnica |

El diseño del restaurante no debe alterar el significado de botones o estados del personal. La personalización pública es amplia; las superficies operativas conservan reglas estables.

### Seis pantallas que diseñaría primero

**1. Portada comercial.** A la izquierda, beneficio concreto y dos rutas: probar una situación o iniciar la prueba. A la derecha, una escena interactiva de pedido → cocina → cobro. En móvil, titular breve, escena y CTA sin exigir ver un video completo. Después: prueba de funcionamiento, situaciones de uso, evidencia de clientes y precio. La galería de 208 combinaciones pasa a una exploración opcional.

**2. Hoy.** Cabecera con restaurante, turno y estado de conexión. Primera fila: «Qué necesita atención», máximo tres asuntos. Segunda: ventas cobradas, pendiente y situación de caja, cada cifra con definición. Tercera: servicio actual. El resto va a detalle. Para un negocio nuevo, el espacio principal se dedica a su siguiente tarea, no a un tablero vacío.

**3. Servicio.** Conservar la base actual de tres columnas desde 900 px: salón/canales, carta y comanda. Refinarla con una comanda de ancho suficiente para notas y extras, estado de envío visible y acción principal fija. En móvil: una tarea a la vez; al volver a una mesa se conserva posición, borrador y contexto. Nada de reorganizar tarjetas bajo el dedo al llegar un pedido.

**4. Cobrar.** Hoja opaca. Arriba: mesa y saldo pendiente. Centro: «Todo / Por persona / Por productos / Importe», recibos previos y métodos. Abajo, fijo: importe exacto y «Registrar cobro». Ejemplo: cuenta Q200, persona A paga Q80 tarjeta, B paga Q50 efectivo y C paga Q70; la mesa conserva Q120, luego Q70, después Q0. Liberar mesa debe ser una decisión explícita cuando todavía hace falta limpiar o entregar algo.

**5. Ficha de comida.** Foto real arriba, nombre y descripción legibles, opciones agrupadas, extras opcionales compactos. Pie fijo: cantidad, total y «Agregar». Se puede consultar toda la información sin perder la acción ni ocultar el último campo detrás del pie. El precio base no desaparece hasta el final del desplazamiento.

**6. Superadmin.** Inicio dividido en «Servicio afectado», «Clientes por activar» y «Cobros por resolver». Cada fila muestra problema, duración, impacto, responsable y siguiente acción. El gráfico general y las métricas van después. En la ficha del restaurante, una línea temporal conecta alta, primer pedido, plan, pagos e incidencias.

## 4. Backlog de diseño: incluso los detalles pequeños

Prioridades: **P0** = corregir promesa/consistencia o validar riesgo antes de escalar; **P1** = siguiente ciclo de mejora; **P2** = después de asegurar los recorridos principales; **P3** = exploración. Esfuerzo orientativo: **S** = 0,5–2 jornadas, **M** = 3–5, **L** = 6–10, **XL** = más de 10 y exige dividir. Incluye implementación y verificación de la tarea, no esperas comerciales. No sumar estos rangos como un presupuesto cerrado.

### D01 · P1 · L — Sistema visual real, además de tokens

**Hacer:** inventariar las variantes actuales de botón, campo, pestaña, lista, tarjeta, hoja, aviso y tabla. Definir una versión por función con estados normal, foco, hover, pulsado, deshabilitado, cargando, éxito y error. Aplicar primero a caja, pedido y ficha de comida.

**Terminado cuando:** las tres pantallas usan el mismo lenguaje y cada control tiene sus estados; los controles críticos no dependen de estilos improvisados. Responsable: diseño + frontend. Dependencia: dirección visual.

### D02 · P1 · M — Jerarquía tipográfica y de números

**Hacer:** corregir importes y `/mes` de F04; alinear columnas monetarias a la derecha y decimales; reducir mayúsculas a rótulos breves; reservar tipografía decorativa para nombres/títulos. Revisar textos de 11–12 px del panel en dispositivos reales.

**Terminado cuando:** Q9.00 y Q99,999.99 no deforman filas; nombres largos no tapan importes; zoom al 200 % conserva acciones. Responsable: diseño + frontend.

### D03 · P1 · M — Menos vidrio en tareas operativas

**Hacer:** prototipar menú y panel con superficies sólidas, manteniendo acentos de marca. El fondo puede tener personalidad, pero los formularios, precios, alertas y comandas deben descansar sobre una base predecible. Conservar temas alternativos sin imponer vidrio a todos.

**Terminado cuando:** textos se leen con fotos claras/oscuras y brillo bajo; participantes encuentran precio y acción sin explorar. Comparar prototipo con la versión actual, no decidir solo por gusto.

### D04 · P1 · M — Acciones fijas y accesibles

**Hacer:** pie fijo en ficha, carrito y cobro; reservar espacio para teclado, área segura del teléfono y última fila. Mantener precio y botón como una sola unidad; mostrar progreso de envío sin mover su posición.

**Terminado cuando:** a 360, 375 y 390 px, con teclado abierto y texto ampliado, siempre se puede completar o corregir la tarea. F09 es el primer caso a resolver. Responsable: frontend + QA.

### D05 · P1 · M — Navegación móvil por trabajo

**Hacer:** probar máximo cuatro destinos principales más «Más» para dueño y superadmin; mantener acceso directo a tomar pedidos en el rol que lo usa. Hoy existen seis grupos de restaurante y siete destinos de superadmin: no reducirlos sin verificar el trabajo frecuente.

**Terminado cuando:** dueño, cajero y mesero localizan sus tres tareas frecuentes sin ayuda; permisos no producen botones que rebotan ni pantallas vacías. Responsable: diseño + frontend.

### D06 · P1 · M — Estados vacíos, carga y errores con salida

**Hacer:** para cada pantalla distinguir «sin datos todavía», «no coincide el filtro», «no tienes permiso», «está incluido pero falta configurar» y «falló cargar». Cada caso explica una acción concreta. Carga con estructura estable, sin cifras falsas de cero.

**Terminado cuando:** el error de una consulta nunca se presenta como «Todo en orden» ni como ventas Q0; reintentar conserva filtros y borradores. Responsable: frontend + backend.

### D07 · P2 · S — Lenguaje de una sola marca

**Hacer:** unificar platillo/producto según contexto; servido/cobrado/libre; cuenta de cliente/cuenta por pagar; pago registrado/pago confirmado. Corregir título «Menú en línea» del acceso. Sustituir jerga como KDS en textos de venta por «pantalla de cocina».

**Terminado cuando:** un glosario breve guía todos los textos y una búsqueda del repositorio detecta las variantes prohibidas. No renombrar entidades internas sin necesidad.

### D08 · P1 · M — Accesibilidad completa de los recorridos

**Hacer:** revisar foco de diálogos, restauración al cerrar, Escape, orden de tabulación, nombres accesibles, avisos de error y controles por teclado. En ficha de producto hay `role=dialog`; esa etiqueta sola no demuestra manejo correcto del foco. Revisar también tarjetas clicables que contienen otro botón.

**Terminado cuando:** se puede elegir, agregar, corregir y confirmar con teclado/lector de pantalla; ninguna acción importante depende solo de color, gesto o sonido.

### D09 · P2 · S — Movimiento, audio y celebraciones oportunas

**Hacer:** diferenciar pedido nuevo, atención y error; probar sonido sin depender de un pedido real; respetar preferencias del aparato. Celebraciones en logros del dueño, nunca encima de una tarea urgente. Reducir efectos de cursor y animaciones decorativas en móviles modestos.

**Terminado cuando:** el equipo entiende cada señal y el modo de movimiento reducido conserva toda la información. Responsable: diseño + frontend.

### D10 · P1 · M — Pasada de precisión visual

**Hacer:** revisar alineación de icono/texto, alturas de campo, bordes, espaciados, truncamientos, tablas, chips, hover, barras fijas, scroll y contraste en todas las pantallas prioritarias. Capturar antes/después por breakpoint y por estado.

**Terminado cuando:** cada observación tiene captura, medida y resolución. No marcar «alineación corregida» sin haber visto la pantalla autenticada. Responsable: diseño + QA.

## 5. Web comercial y activación

### W01 · P0 · S — Una promesa coherente

**Hacer:** resolver F01 y F03. Texto propuesto: «Prueba el sistema 30 días» para la prueba con pedidos; «Solo quiero mi menú gratis» como alternativa clara. Explicar En línea: 300 pedidos/mes, avisos anticipados, sin cortar pedidos y política explícita al excederlo.

**Terminado cuando:** portada, planes, FAQ, alta, suscripción, cotizador y documentos comerciales cuentan exactamente lo mismo. No inferir un cambio automático de tarifa si la operación real requiere intervención.

### W02 · P0 · S — Contacto que cumple lo anunciado

**Hacer:** resolver F02 mediante configuración del canal de ventas o texto condicional. Usar correo del dominio para mejorar continuidad de marca cuando esté disponible. Indicar horario y plazo de respuesta que realmente puedas sostener.

**Terminado cuando:** tocar WhatsApp abre WhatsApp con mensaje correcto; si solo hay correo, el botón dice correo. Medir clic y conversación iniciada cuando sea técnicamente verificable.

### W03 · P1 · M — Portada centrada en una demostración

**Hacer:** aprovechar «Pídelo tú mismo» y elevarla al recorrido principal; mostrar consecuencias en cocina y cobro, con datos de ejemplo identificados. Mantener video como alternativa. Probar una versión de 6–7 bloques frente a la actual, con la galería completa fuera del recorrido obligatorio.

**Terminado cuando:** en pruebas, 8 de 10 prospectos explican qué hace Leogin y para quién es tras una exploración breve; registrar demo iniciada/completada. Esa cifra es meta, no resultado actual.

### W04 · P1 · M — Vender por situaciones reconocibles

**Hacer:** tres entradas iniciales: restaurante con mesas, cafetería/mostrador y venta por redes. Cada una muestra una escena, hardware necesario y plan sugerido. Reutilizar `/vende-en-linea`; no multiplicar sitios ni bases funcionales.

**Terminado cuando:** el visitante reconoce su negocio, entiende qué trabajo desaparece y llega a una demo relevante. El mensaje nunca promete resolver una operación que el plan elegido no incluye.

### W05 · P1 · M — Planes fáciles de elegir

**Hacer:** recomendar plan a partir de tres preguntas de operación, con precio final visible y enlace a comparación. Explicar «caja», «mesero», usuarios, impresión y límite blando con ejemplos. La tabla completa queda como detalle, no como examen de entrada.

**Terminado cuando:** cinco dueños pueden elegir y explicar su plan sin ayuda; se respeta su elección si prefieren otro. Revisar coherencia de precios dinámicos: la web observada sirve Q150/Q299, mientras los defaults locales son Q199/Q349; eso puede ser un override válido, no prueba de un error.

### W06 · P1 · L — Prueba social verificable y venta con evidencia

**Hacer:** conseguir tres casos piloto con permiso: situación inicial, uso real, resultado y límites. Mostrar restaurante, fotos auténticas y testimonio aprobado. Medir tiempo de toma, cierre y entrenamiento; presentar ahorro como observado o estimado, claramente separado.

**Terminado cuando:** puedes enseñar evidencia reproducible sin inventar porcentajes, clientes ni «más vendido». Una calculadora de retorno muestra sus supuestos y no promete ventas nuevas por instalar un QR.

### W07 · P1 · M — Medir el recorrido de adquisición

**Hacer:** verificar la instalación de analítica y ampliar los cuatro eventos actuales: demo iniciada/completada, registro iniciado/terminado, menú publicado, pedido de prueba recibido, primer pedido real, primer cobro, activación y renovación. Distinguir eventos de prueba, duplicados y equipo interno.

**Terminado cuando:** una cuenta de prueba recorre el embudo y sus eventos se reconcilian; se puede medir abandono por paso y origen sin enviar notas de pedidos, teléfonos o datos innecesarios al proveedor.

### W08 · P2 · M — Material comercial consistente

**Hacer:** demo de 90 segundos por segmento, hoja de compatibilidad de impresoras/dispositivos, costos iniciales, importación asistida y preguntas difíciles: corte de internet, salida con datos, soporte y cambio de plan. Generar precios desde una fuente vigente para evitar documentos obsoletos.

**Terminado cuando:** lo que cotizas, muestras y cobras coincide. No vender integraciones fiscales o de terceros basándose solo en que existe código: exigir demostración de la configuración real.

### A01 · P1 · L — Llegar al primer valor antes de configurar todo

**Hacer:** experimentar con alta: nombre del negocio → primer platillo/importación → vista previa. Plan y estilo llegan preseleccionados según intención y se pueden cambiar. Evaluar una prueba completa para restaurantes elegibles, con vencimiento y consecuencias claras; no imponerla sin validar conversión y costos de soporte.

**Terminado cuando:** el tiempo mediano a menú útil baja frente a la línea base y nadie interpreta la prueba como un cobro ya aceptado. Depende de W01, W05 y W07.

### A02 · P1 · M — Primeros pasos por resultado

**Hacer:** reemplazar F08 por «Publica tus primeros platillos → Ábrelo como cliente → Recibe un pedido de prueba». Crear categoría por defecto cuando haga falta. Logo, horarios, entrega e impresión aparecen cuando su contexto los necesita.

**Terminado cuando:** cada paso se completa por un evento comprobable. El plan Básico nunca recibe el mensaje «tus clientes pueden pedir» si no tiene pedidos habilitados.

### A03 · P1 · L — Importar un menú con revisión

**Hacer:** ofrecer carga de archivo tabular y, después, foto/PDF asistido. Mostrar filas detectadas, precio, categoría y errores; marcar dudas para confirmación. Importación en borrador, comparación antes/después y capacidad de deshacer el lote antes de vender.

**Terminado cuando:** importar 50 platillos conserva precios y variantes y no publica datos ambiguos; se informa qué fotos faltan. La extracción automática no debe inventar ingredientes ni alérgenos. Responsable: producto + backend + frontend.

### A04 · P1 · M — «Hazlo por mí» para la marca

**Hacer:** con logo y fotos del negocio ofrecer tres composiciones completas; permitir aprobar una en un toque. Las 208 combinaciones permanecen en exploración avanzada. Vista previa con contenido real, incluidas fotos malas, textos largos y precios distintos.

**Terminado cuando:** alguien sin conocimientos de diseño publica una carta consistente sin tocar CSS, gradientes o terminología de interfaz.

### A05 · P1 · M — Entrenar con un turno de prueba

**Hacer:** recorrido aislado de cinco minutos: abrir mesa, agregar extra, enviar, marcar listo, cobrar y corregir. Usar almacenamiento de demostración separado y etiqueta persistente; los datos de práctica no cuentan en facturación, stock, puntos ni estadísticas reales.

**Terminado cuando:** un empleado repite la secuencia solo y entiende cómo salir del modo de práctica. Se puede reiniciar sin borrar información real. Depende de la demo existente y de la matriz de permisos.

### A06 · P1 · M — Configurar por aparato y por rol

**Hacer:** ofrecer «Caja / Cocina / Mesero / Dueño» al preparar el aparato, con inicio directo y prueba de conexión, sonido e impresora cuando corresponda. Usar el modo servicio existente. Cambiar modo es fácil para quien tenga autorización.

**Terminado cuando:** una tablet de cocina despierta en cocina, un mesero entra a sus mesas y el dueño conserva visión completa; recordar la pantalla nunca equivale a ampliar permisos.

## 6. Caja y cobro: estándar de excelencia

### C01 · P1 · L — Partes iguales que se cobran de verdad

**Hacer:** evolucionar F11 a participaciones independientes con saldo, método y recibo. Repartir centavos de forma determinista: Q100/3 = Q33.34 + Q33.33 + Q33.33. Permitir que alguien pague dos partes sin crear dobles cobros.

**Terminado cuando:** la suma cobrada siempre coincide con el total; una parte pagada no vuelve a cobrarse al recargar, cambiar de aparato o reintentar. Depende de T01. Responsable: backend + frontend + QA.

### C02 · P1 · L — Pago mixto y por importe en el mismo recorrido

**Hacer:** aprovechar el modelo de pagos existente y permitir, en la hoja principal, Q50 efectivo + Q70 tarjeta, o un abono arbitrario. Mostrar restante y cambio sin obligar a elegir productos. Aclarar que registrar tarjeta no significa procesar un cargo bancario.

**Terminado cuando:** el recibo, la mesa y caja muestran los mismos métodos y montos; el cambio corresponde solo al efectivo recibido. Verificar también propina, descuento y reembolso parcial.

### C03 · P1 · M — Cobro sin distracciones

**Hacer:** retirar sugerencias de consumo de la hoja de pago (F12); moverlas a la comanda antes de enviar o a una acción voluntaria. Mostrar consumo, descuentos, propina, pagado y pendiente. Añadir resumen del acto antes de registrar una corrección o devolución.

**Terminado cuando:** un cobro simple usa como meta hasta tres interacciones desde una cuenta lista; no hay promociones, animación de cifras ni enlaces de mejora de plan en ese recorrido.

### C04 · P1 · L — Cierre resistente a interrupciones

**Hacer:** autoguardar conteo por restaurante/turno/operador, con «Guardado a las…» y estado local/nube. Versionar borradores y detectar otro cajero editando. Recuperar tras cerrar pestaña sin mezclar turnos ni locales. Mantener «Guardar y seguir después» como acción explícita adicional.

**Terminado cuando:** recargar, perder red o cambiar de aparato no borra silenciosamente el conteo; los conflictos no sobrescriben el trabajo ajeno. Depende de T02.

### C05 · P1 · L — Permisos de caja por responsabilidad

**Hacer:** separar cobrar, abrir turno, registrar salida, cerrar, ver esperado, corregir, devolver y ver utilidades. Plantillas de cajero/encargado/dueño con vista previa de acceso. Ofrecer arqueo ciego donde el negocio lo prefiera, en lugar de imponerlo.

**Terminado cuando:** el cajero puede operar sin acceder a ganancias, exportar clientes o cambiar suscripción; los permisos se validan en servidor. Migración revisada de permisos antiguos, incluido `null`. F14.

### C06 · P1 · L — Cuadre explicable hasta el movimiento

**Hacer:** cada diferencia lleva a fondo, cobros, gastos, devoluciones, retiros y propinas. Distinguir total vendido de efectivo esperado. Añadir entrega de turno con responsable que entrega/recibe y observaciones; no borrar movimientos para «hacer cuadrar».

**Terminado cuando:** desde una diferencia de Q20 se puede reconstruir su origen o dejarla documentada como no explicada. Un ajuste posterior conserva el cierre original y su autor. Aprovechar correcciones ya existentes.

### C07 · P1 · M — Cerrar y liberar mesa son situaciones distintas

**Hacer:** mostrar pagada, por entregar, por limpiar y libre como estados operativos coherentes. Confirmar solo consecuencias relevantes: pendiente de dinero o productos sin enviar. Incluir reimpresión y reapertura autorizada en el contexto correcto.

**Terminado cuando:** pagar no oculta una entrega pendiente ni sienta otro grupo en una mesa todavía ocupada; liberar sin cobrar queda explícito, autorizado y trazable.

### C08 · P0 · L — Certificar el circuito de dinero

**Hacer:** ejecutar en entorno aislado la matriz de caja de la sección 11: concurrencia, última fracción, propinas, descuentos, anulaciones, cambios de método y cierre mientras entra un cobro. Revisar que cierre, vínculo de gastos y libro no queden parcialmente guardados (F21 es una señal similar en pedidos).

**Terminado cuando:** se cumplen invariantes de centavos y trazabilidad en DB real, no solo mocks. No afirmo una pérdida actual: la tarea es demostrar consistencia antes de ampliar ventas.

## 7. Operación y administración del restaurante

### O01 · P1 · M — Un Hoy que decide qué mostrar

**Hacer:** separar fase de arranque, turno abierto, servicio activo y cierre. Priorizar hasta tres excepciones; el dueño puede ver detalle. Evitar mezclar doce bloques de igual importancia. Comparar ventas con periodos equivalentes y mostrar cobertura temporal.

**Terminado cuando:** el dueño responde en 15 segundos «qué necesita atención, cuánto se cobró y cómo va el servicio». Meta de prueba con usuarios, no una promesa de rendimiento.

### O02 · P1 · L — Cocina por etapa, estación y producto

**Hacer:** partir del KDS existente: reloj desde aceptación para preparación, espera separada, filtros por estación y coordinación de platos. Desarrollar preparación parcial y pase cuando el restaurante lo requiera; aprovechar rutas de impresión ya presentes.

**Terminado cuando:** bebida lista no hace pasar toda una orden a lista; un cocinero reconoce modificaciones y pendientes a distancia. Probar 20–40 comandas sin saltos de posición ni saturación visual. F15.

### O03 · P1 · M — Servicio rápido sin perder contexto

**Hacer:** refinar la pantalla actual: favoritos por puesto, búsqueda tolerante a tildes, variantes legibles, última ronda existente accesible, notas destacadas, contador de pendiente de envío y error por línea. Mantener borradores por mesa y trabajador.

**Terminado cuando:** cambiar entre tres mesas con borradores, modificar una guarnición y regresar no pierde información ni envía dos veces. La misma acción tiene ubicación estable en tablet y atajo documentado en PC.

### O04 · P1 · M — Agotados con intención y reposición clara

**Hacer:** sustituir la regla implícita de 12 horas por opciones explícitas: «hasta próximo servicio», «hasta reponer» y «hasta que lo active». Stock real siempre manda. Mostrar cuándo volverá y permitir cambio masivo por categoría/ingrediente.

**Terminado cuando:** un ingrediente faltante bloquea los platillos afectados y no reaparecen por reloj sin que el negocio lo haya indicado. Servidor y cliente comparten la misma regla. F17.

### O05 · P1 · L — Inventario conectado con la cocina real

**Hacer:** mejorar recetas y kardex existentes con unidades y conversiones, rendimiento, merma y motivo de ajuste. Separar inventario teórico de conteo físico; añadir sesión de conteo y diferencias. Más adelante, lotes/caducidad y compras sugeridas según demanda, sin compra automática.

**Terminado cuando:** comprar 5 kg y vender recetas de 150 g descuenta correctamente; venta, anulación y merma tienen tratamientos distintos; el historial explica cada variación y su responsable.

### O06 · P1 · L — Rentabilidad que no exagera

**Hacer:** costear variantes, extras, empaque y descuentos, además de producto base (F16). Distinguir margen de productos, contribución y resultado después de gastos registrados. Mostrar porcentaje de ventas con costos completos y fecha de actualización.

**Terminado cuando:** una hamburguesa con tocino no aparece artificialmente más rentable por ignorar su costo; cuando faltan datos se muestra «estimación parcial», nunca ganancia total. La advertencia actual de costos incompletos es una base que debe ampliarse.

### O07 · P2 · L — Reservaciones y espera conectadas al salón

**Hacer:** revisar reservas/lista existentes como un solo recorrido: disponibilidad por duración y capacidad, confirmación, llegada, asiento, demora y ausencia. Contemplar mesas unidas y bloqueo manual con motivo. Dar estimaciones como rangos, no promesas exactas sin datos.

**Terminado cuando:** dos personas no asignan la misma capacidad; sentar una reserva actualiza el salón sin recapturar nombre y grupo. Las cancelaciones liberan capacidad y quedan registradas.

### O08 · P1 · L — Clientes y lealtad con resultado visible

**Hacer:** aprovechar historial y puntos para detectar primera compra, recurrencia y ausencia; recomendar acciones con importe/margen previsto. Campañas voluntarias con consentimiento, frecuencia limitada y exclusión de bajas. Medir ingresos asociados y, mediante prueba, si hubo incremento real.

**Terminado cuando:** el dueño sabe cuántos clientes volvieron y cuánto costaron los incentivos; puede parar una campaña. No equiparar todo ingreso de clientes contactados con ingreso causado por Leogin.

### O09 · P2 · L — Entregas y carga de trabajo

**Hacer:** mejorar zonas y repartidores existentes con estados de asignación/recogida/entrega, carga por repartidor y ruta visible. Separar preparar de salir: el reloj «en camino» no debe arrancar al estar listo. Ofrecer pausa temporal de pedidos y plazo ampliado cuando la cocina se satura.

**Terminado cuando:** local y comensal ven el mismo estado; una reasignación conserva historial; fuera de cobertura se informa antes de completar todo el formulario.

### O10 · P2 · L — Menú administrable en minutos

**Hacer:** edición en lote de precios, disponibilidad, categorías y horarios; duplicación de platillo/variantes; previsualización móvil y publicación con resumen. Para múltiples sucursales, plantilla compartida con excepciones explícitas y comparación antes de distribuir cambios.

**Terminado cuando:** actualizar diez precios toma un recorrido, no diez formularios; la vista previa coincide con lo publicado y una sucursal no pierde un precio local sin advertencia. Depende de D01 y T03.

## 8. Experiencia de comensales

### M01 · P1 · M — Entrar directo a la intención

**Hacer:** preservar acceso directo a carta desde QR de mesa, que ya existe. Para redes, abrir una portada breve con comida visible, estado de apertura y canal. Mantener identificación del restaurante y mesa sin pedirla de nuevo innecesariamente.

**Terminado cuando:** el cliente entiende dónde está, si puede pedir y para qué modalidad antes de llenar datos. El QR expirado o inválido tiene salida clara y no confunde mesas.

### M02 · P1 · L — Una carta que venda con la comida

**Hacer:** probar las ocho estructuras con fotografía real, platos claros, fondos oscuros y textos extensos. Limitar badges; diferenciar popularidad comprobada de selección del restaurante. Dar igual tratamiento cuidado a productos sin foto, sin inventar una imagen que prometa algo diferente.

**Terminado cuando:** nombre, precio, disponibilidad y acción son legibles en cada estructura; una carta con 100 productos permite llegar por categoría/búsqueda sin desplazamiento interminable. F10.

### M03 · P1 · M — Opciones inequívocas

**Hacer:** añadir default explícito definido por restaurante en vez de asumir siempre la primera opción. Mostrar requerido, mínimo, máximo y diferencia de precio. Advertir al cambiar una opción incompatible; no borrar silenciosamente lo elegido.

**Terminado cuando:** el resumen y la comanda conservan exactamente las selecciones; se puede corregir sin reconstruir el plato. Probar combos, cantidades, extra gratuito y variante que modifica precio. La preselección no debe decidir por el cliente una preferencia delicada sin indicarlo.

### M04 · P1 · M — Carrito editable y persistente

**Hacer:** editar extras desde cada línea, mostrar subtotal/cargos estimados y conservar carrito al navegar. Al volver después de un cambio de precio o stock, marcar la diferencia y solicitar decisión. Reducir recomendaciones repetidas entre ficha y carrito.

**Terminado cuando:** el usuario modifica una hamburguesa sin borrarla; dos versiones del mismo platillo se distinguen; ningún total cambia silenciosamente al confirmar.

### M05 · P1 · L — Checkout breve por modalidad

**Hacer:** evaluar datos estrictamente necesarios para mesa, retiro y entrega. Mantener compra invitada; autocompletar solo con datos autorizados; mostrar errores al lado del campo sin borrar lo demás. Mostrar total, propina y costo de entrega antes de confirmar.

**Terminado cuando:** pedido simple en mesa no exige un formulario de domicilio; errores de zona, teléfono o local cerrado tienen recuperación. Medir abandono por campo en pruebas, sin registrar su contenido personal.

### M06 · P1 · M — Seguimiento que distingue enviado de aceptado

**Hacer:** conservar página de seguimiento y hacer inequívocos «guardado en tu teléfono», «recibido», «aceptado», «preparando», «listo» y «entregado». Si se demora aceptación, explicar siguiente acción y forma real de contactar. Los tiempos estimados se presentan como rangos fundamentados.

**Terminado cuando:** nadie interpreta un pedido en cola offline como recibido en cocina; recargar no crea otro. Contacto y cancelación respetan el estado real.

### M07 · P2 · M — Lealtad que llega después de ayudar

**Hacer:** revisar la introducción Google de primera visita: ofrecer puntos después de agregar o al terminar, en una tarjeta discreta. Explicar por qué se identifica y si los puntos son de ese restaurante. Evaluar alternativa de acceso para quien no use Google, sin construirla antes de comprobar demanda.

**Terminado cuando:** quien solo quiere ver comida y pedir no debe cerrar una pantalla promocional; quien desea puntos entiende saldo, canje y vencimiento sin una explicación del personal.

### M08 · P1 · M — Accesibilidad y contenido útil de comida

**Hacer:** información de ingredientes/alérgenos confirmada por el restaurante, etiquetas escritas además de iconos, traducciones revisadas y botón de ayuda accesible. Asegurar que una nota relevante llegue a cocina y sea visible al preparar.

**Terminado cuando:** datos desconocidos se marcan como desconocidos; ninguna inferencia automática afirma ausencia de alérgenos. El lector de pantalla puede elegir variantes y oír su precio. Depende de D08.

## 9. Superadmin: operar y hacer crecer Leogin

### S01 · P1 · L — Cola de trabajo en vez de colección de alertas

**Hacer:** evolucionar salud existente a incidencias con responsable, prioridad, antigüedad, diagnóstico, estado y siguiente paso. Agrupar síntomas de la misma caída; permitir reconocer, posponer con razón y cerrar cuando se recupera.

**Terminado cuando:** una impresora caída no produce varias tareas desconectadas; conoces qué restaurante está afectado y qué hiciste. La alerta no desaparece solo por visitarla. Depende de T04.

### S02 · P1 · L — Activación y abandono por cohortes

**Hacer:** medir por semana de alta: menú publicado, primer pedido, primer cobro, uso recurrente y conversión a pago. Usar señales actuales de «sin platillos/sin pedidos» como inicio; distinguir vacaciones, cuenta de prueba y abandono probable.

**Terminado cuando:** puedes localizar el paso donde se atasca un grupo de cuentas y evaluar si un cambio mejoró la activación. No etiquetar «cliente perdido» por una regla de siete días sin contexto.

### S03 · P1 · L — Finanzas SaaS explicables

**Hacer:** ampliar MRR/cobrado/vencido existentes: nuevas altas, expansiones, bajas, morosidad y renovaciones; costo de soporte, infraestructura y mensajería por segmento. Separar mensualidad contratada de cobro recibido y de venta del restaurante.

**Terminado cuando:** toda cifra tiene definición, periodo, moneda y detalle reconciliable; puedes saber si Q99 es rentable para un perfil de uso. Decidir precios con esa evidencia, no solo por resultar baratos.

### S04 · P1 · L — Cobranza y cambios de plan sin sorpresas

**Hacer:** perfeccionar «Paga tu plan»: estados claros de comprobante, revisión, observación y aprobación; detectar reenvío duplicado, pagos parciales y moneda/periodo. Simular efecto de cambio de plan antes de aplicarlo y comunicar fecha efectiva.

**Terminado cuando:** una revisión doble no registra dos pagos, el restaurante sabe qué falta y una degradación no borra su trabajo. El vencimiento debe tener política de continuidad revisada para no interrumpir un servicio de forma inesperada.

### S05 · P1 · M — Ficha única con contexto de soporte

**Hacer:** reunir cuenta, restaurantes, plan, responsables, último acceso, última operación válida, dispositivos y cronología. Guardar notas de soporte con autor; vista del cliente en modo lectura y acceso temporal auditado para intervenciones autorizadas.

**Terminado cuando:** resolver «no puedo entrar» o «no imprime» no exige recorrer varias pantallas ni pedir al cliente que repita todo. No mostrar contraseñas ni secretos; no ampliar privilegios para facilitar soporte.

### S06 · P1 · L — Despliegues y funciones controlados

**Hacer:** estado de versión de web/desktop/agente, compatibilidad, migraciones y funciones por cohorte. Probar cambios de caja primero en entorno aislado y luego en pilotos acordados; definir rollback compatible con datos ya escritos.

**Terminado cuando:** sabes qué clientes usan cada versión y puedes detener una entrega problemática sin improvisar. La existencia de CI no reemplaza esa operación.

### S07 · P2 · L — Autoservicio que reduce dependencia de ti

**Hacer:** diagnóstico de impresora, asistente de arranque, recuperación de cuenta, actualización de datos de cobro y exportaciones desde el restaurante. Medir temas de soporte repetidos y convertir los frecuentes en tareas guiadas.

**Terminado cuando:** baja el tiempo de soporte por restaurante activo y el usuario resuelve los casos frecuentes sin llamarte. «Depender de Leogin» debe significar valor diario, no necesitar al fundador para operar.

### S08 · P2 · M — Panel comercial y recomendación

**Hacer:** embudo de prospecto → demo → piloto → activo → renovación; siguiente acción y motivo de pérdida. Referidos voluntarios tras un resultado real, con condiciones claras y seguimiento. Empezar simple, sin convertir superadmin en otro CRM enorme.

**Terminado cuando:** conoces origen, segmento y tasa de conversión, puedes dar seguimiento y medir recomendaciones. Los mensajes siempre requieren autorización y preferencias de contacto apropiadas.

## 10. Arquitectura y confiabilidad que sostienen la experiencia

### T01 · P0 · XL — Consistencia de pedido, descuento y pago

**Hacer:** inventariar invariantes monetarias y operaciones que deben ser atómicas. Investigar F21: cupón con último uso, puntos simultáneos y error tras crear pedido. Integrar reservas/consumo en transacción o diseñar compensación durable. Idempotencia por operación de cobro y devolución, no solo por pedido.

**Terminado cuando:** dos intentos con la misma clave no duplican dinero ni premios; un fallo intermedio deja resultado recuperable y visible. Probar contra Postgres real. Dividir en pedido/promoción, cobro, devolución y cierre.

### T02 · P0 · L — Guardado offline que no promete más de lo que logró

**Hacer:** `saveQueuedOrder` hoy absorbe fallos de almacenamiento. Cambiar el contrato para distinguir guardado durable, no guardado y conflicto; evaluar IndexedDB, expiración, versión y límite de cola. Reintentar con la misma identidad y conservar evidencia de confirmación.

**Terminado cuando:** almacenamiento lleno/denegado nunca muestra «guardado» falsamente; un pedido antiguo no se envía sin revisar precio, disponibilidad y vigencia. Definir qué sucede sin internet, sin LAN, sin PC y sin energía: son fallos diferentes.

### T03 · P1 · L — Datos completos al crecer

**Hacer:** reemplazar agregaciones de filas limitadas de F19 por consultas agregadas, índices y paginación; definir zona horaria de cada reporte. Mantener una prueba que cruce el límite histórico de filas y reconcilie resultado contra la base.

**Terminado cuando:** 100.001 registros no convierten una métrica en una muestra silenciosa; una consulta fallida no se interpreta como cero. Medir tiempos con datos representativos, sin extrapolar desde una demo vacía.

### T04 · P1 · L — Observabilidad de la cadena completa

**Hacer:** correlacionar creación, aceptación, comanda, impresión, pago y sincronización con identificadores. Usar la infraestructura de errores/salud existente; medir latencias y detectar operaciones atascadas. Confirmación de impresión y reimpresión claramente diferenciadas.

**Terminado cuando:** un pedido reportado puede localizarse sin leer datos personales innecesarios y se distingue «no llegó», «llegó sin aviso» y «falló la impresora». Alertar por impacto, no por cada log.

### T05 · P1 · L — Exportación completa y restauración probada

**Hacer:** renombrar la exportación actual según su alcance; diseñar exportación paginada con pedidos, líneas, pagos, descuentos, impuestos, recetas, stock, configuración y referencias de archivos. Separar portabilidad del cliente y backup operativo de plataforma.

**Terminado cuando:** restaurar en entorno aislado reproduce una muestra verificable de saldos y configuración; hay objetivo acordado de pérdida máxima de datos y tiempo de recuperación. Descargar un Excel de cuatro hojas no cumple por sí solo ese objetivo. F18.

### T06 · P0 · L — Pruebas del modelo de acceso actual

**Hacer:** extender el E2E existente a dueño con membresía y sin `restaurant_id`, empleado restringido, usuario con varios restaurantes y superadmin con segundo factor. Comprobar lectura, escritura, exportación, almacenamiento y acciones privilegiadas entre restaurantes.

**Terminado cuando:** la prueba reproduce las formas reales de alta y los límites se cumplen aunque se invoque directamente la acción. Conservar MFA/RLS/reautenticación existentes; no presentarlos como ausentes. F14/F20.

### T07 · P1 · L — Rendimiento percibido y medido

**Hacer:** medir portada, carta, ficha, checkout y servicio en móvil modesto y conexión limitada; presupuesto por ruta para JS, imágenes y trabajo de render. Medir respuestas de interacción, errores, carga y estabilidad, no solo una puntuación de laboratorio.

**Terminado cuando:** objetivos de campo al percentil 75: LCP ≤2,5 s, INP ≤200 ms y CLS ≤0,1; además, servicio responde con volumen real. Son metas por verificar, no cifras actuales. [Referencia de Web Vitals](https://web.dev/articles/vitals).

### T08 · P1 · M — Documentación viva y definición de terminado

**Hacer:** un registro por capacidad con estado: diseñada, implementada, probada, desplegada, activada y validada con clientes. Enlazar ticket, pruebas y versión; actualizar documentos cuando se retire una función. Los planes viejos no deben declarar vigente algo que el changelog quitó.

**Terminado cuando:** cualquier persona distingue «hay código» de «se puede vender». Un cambio solo cierra cuando su recorrido, error, permisos, accesibilidad y recuperación están verificados.

## 11. Matriz de aceptación: cómo exigir excelencia

No basta con pasar el caso feliz. Esta es la batería mínima para las funciones principales; ejecutar solo en entorno de pruebas aislado o pilotos expresamente acordados.

| Recorrido | Casos que deben pasar | Evidencia exigida |
|---|---|---|
| Alta | Dueño nuevo, membresía, segundo local, nombre largo, volver atrás, recargar, prueba vencida | Tiempo a primer valor y estado final consistente |
| Carta | 0, 1, 50 y 150 productos; foto fallida; búsqueda sin resultados; texto largo; local cerrado | Capturas por ancho y tarea completada |
| Opciones | Extra gratuito/de pago; requerido sin respuesta; máximo; dos versiones del plato; cambio desde carrito | Misma selección y total en cliente, servidor y comanda |
| Pedidos | Doble toque, timeout tras crear, reintento, dos clientes piden última unidad | Un pedido por identidad; stock nunca negativo por esa carrera |
| Promociones | Dos pedidos consumen último uso; saldo de puntos justo; cancelación y reversión | Uso/saldo/pedido consistentes y errores explicables |
| Cobro | Q100 entre 3; parcial por plato/importe; mixto; sobrepago; pago previo | Total exacto al centavo; ningún pago desaparece |
| Correcciones | Cambio de método, devolución parcial, permiso denegado, motivo y aprobación | Libro original conservado y ajuste trazable |
| Caja | Abrir, salida de efectivo, cobro al cerrar, dos aparatos cierran, noche cruza fecha, retomar borrador | Corte consistente con su periodo y movimientos |
| Cocina | 40 comandas, notas, cancelación parcial, plato listo antes que el resto, caída de socket | Estado visible correcto, acciones estables y recuperación |
| Salón | Sentada sin pedido, unir/separar, mover plato, cobro parcial, por limpiar, nueva sesión QR | Sin cobros ni llamadas atribuidas al grupo anterior |
| Offline | Cae WAN, cae LAN, PC apagada, navegador recarga, storage lleno, reconecta dos veces | Matriz de lo que funciona; nada falsamente confirmado |
| Impresión | Sin papel, desconexión, recibo duplicado, acuse perdido, reimpresión | Diferenciar original/reimpresión y conocer resultado pendiente |
| Inventario | Compras/unidades, merma, rendimiento, venta, devolución con o sin reposición | Conteo teórico/físico reconciliable |
| Lealtad | Invitado, Google, sesión caducada, puntos pendientes, canje y devolución | Reglas visibles; sin saldos inconsistentes |
| Suscripción | Alta, vencimiento, comprobante doble, cambio de plan, tope blando, varios locales | Importe/fecha/capacidades iguales en oferta, cuenta y cobro |
| Acceso | Dueño, cajero, cocina, mesero, grupo y superadmin; cambio de local | Solo datos/acciones autorizados; navegación útil por rol |
| Recuperación | Exportar más de 5.000 pedidos y restaurar una muestra aislada | Conteos, saldos y relaciones comprobados |

### Revisión visual por pantalla

- Anchos: 360, 375/390, 768, 1024 y 1440 px; vertical/horizontal donde el puesto lo use.
- Chrome Android y Safari iPhone reales; navegador/desktop usado por el restaurante; teclado virtual y mouse/teclado.
- Luz fuerte, brillo bajo, un uso con una mano y lectura de cocina a distancia.
- Tema claro/oscuro y tres marcas de restaurante muy distintas; foto blanca, foto oscura y foto ausente.
- Zoom al 200 %, texto largo, cantidades grandes, lista vacía, error y carga.
- Objetivos de texto: contraste 4,5:1 para texto normal y 3:1 para grande, con las condiciones del estándar. [W3C: contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- Objetivos táctiles internos de 48/56 px; WCAG 2.2 AA define un mínimo de 24 × 24 CSS px con excepciones de separación y contexto. No confundir «cumple el mínimo» con «cómodo en un restaurante». [W3C: tamaño de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Cada tarea principal debe probarse con al menos una persona que no conozca el sistema. Registrar dudas, errores y ayuda recibida; no orientar a la persona durante la medición.

## 12. Las capacidades avanzadas que sí podrían distinguirlo

Construirlas después de datos fiables y flujos claros, en experimentos pequeños.

| Apuesta | Versión inicial concreta | Dependencias | Señal para continuar |
|---|---|---|---|
| «Antes de abrir» | Resumen de reservas, existencias críticas, pendientes de ayer y comprobación de impresora | O04–O07, T04 | El dueño ejecuta tareas útiles desde el resumen |
| «Qué preparar hoy» | Estimación por día comparable y reservas; rango y explicación; sugerencia editable | Costos/stock y ventas fiables | Baja merma sin subir agotados en un piloto medido |
| «Lo que Leogin hizo por ti» | Pedidos procesados, cierres, minutos estimados con supuestos y clientes que volvieron | W07, O08, S03 | El dueño comprende el valor y renueva; sin atribuir causalidad no demostrada |
| «La cocina va cargada» | Aviso y propuesta de ampliar plazo/pausar un canal; encargado confirma | O02, O09 y tiempos fiables | Menos pedidos tardíos y menos cancelaciones |
| «Este plato vende, pero deja poco» | Rentabilidad por variante, costo actualizado y simulación de precio/porción | O05/O06 | El dueño identifica y corrige pérdidas con datos |
| «Tu restaurante ya se ve profesional» | Importación revisada + tres propuestas de marca + QR/material listo | A03/A04 | Menor tiempo a publicación y menos ayuda manual |
| Resumen de cierre compartible | Tarjeta privada para dueño/socio, con cobrado, pendiente y diferencia; ocultar información sensible al compartir | C06, T06 | Se consulta cada día y genera recomendaciones voluntarias |

IA, voz y automatización deben tener una función concreta. Hay base de dictado en servicio; primero verificar reconocimiento de nombres, cantidades y variantes en ruido real, con confirmación antes de enviar. Un «copiloto» no debe cambiar precios, comprar existencias, conceder descuentos o contactar clientes silenciosamente.

No priorizaría ahora: otra docena de temas, una red social de comensales, contabilidad empresarial completa, integraciones de delivery sin demanda validada, ni reconstruir toda la aplicación. Tampoco reintroduciría encargos/transferencia del comensal sin que cambie expresamente la decisión que los retiró.

## 13. Orden de ejecución propuesto

### Tramo 0: establecer verdad y cerrar contradicciones

**Primero:** W01, W02, W07 en su instrumentación mínima, T08 y diseño de pruebas C08/T01/T02/T06. Corregir textos no requiere esperar un rediseño completo. Validar los riesgos de dinero/cola antes de clasificarlos como incidentes.

**Entregables:** mensajes comerciales coherentes, mapa de métricas, inventario de estados y una base de pruebas aislada. **Salida:** sabemos qué está implementado, qué está desplegado y qué falta demostrar.

### Tramo 1: dirección visual y tres recorridos impecables

**Después:** D01–D04, D08, D10; prototipos de Hoy, ficha y cobro; C01–C05 y M03–M06 sobre la base técnica validada. Hacer el diseño antes de migrar componentes, y probarlo con personas antes de extenderlo a todas las pantallas.

**Entregables:** biblioteca visual y tres recorridos terminados, incluidos error y recuperación. **Salida:** comensal pide, personal cobra y cajero retoma una interrupción sin ayuda ni ambigüedad.

### Tramo 2: primera experiencia y operación diaria

**Después:** A01–A06, W03–W06, O01–O06 y C06–C07. Importación y arranque guiado deben reutilizar la base de producto, no crear otro sistema de demostración divergente.

**Entregables:** alta rápida, puesto preparado, cocina clara e inventario/costos explicables. **Salida:** un restaurante piloto puede arrancar y cerrar varios turnos con asistencia decreciente.

### Tramo 3: escalar tu trabajo como creador

**Después:** S01–S07, T03–T05 y T07, W08, O07–O10, M07–M08. Incluir medición de costo de soporte y restauración de prueba.

**Entregables:** operación SaaS, métricas confiables, soporte contextual y continuidad demostrada. **Salida:** aumentar restaurantes no multiplica proporcionalmente tu trabajo manual.

### Tramo 4: ventajas difíciles de reemplazar

**Después:** elegir una o dos apuestas de la sección 12 según pilotos; S08 y referidos; ampliar al siguiente segmento solo cuando el primero retenga y recomiende.

**Salida:** la mejora demuestra uso frecuente, impacto y disposición a pagar; si no, se ajusta o se retira.

### Primera iteración de diez días laborables

Es una propuesta de organización, no promesa de terminar todo el backlog. Para un equipo pequeño, limitar trabajo simultáneo a una mejora de recorrido y una de confiabilidad.

| Días | Resultado |
|---|---|
| 1–2 | W01/W02, contrato de planes, inventario de estados, métricas base y capturas autenticadas pendientes |
| 3–4 | Prototipos comparables de ficha y cobro; dirección visual aplicada a datos reales |
| 5 | Pruebas con 5 usuarios por perfil prioritario; elegir ajustes por errores observados |
| 6–8 | Implementar un recorrido acotado —preferencia: ficha con acción fija o mejora de cobro según riesgo validado— y sus estados |
| 9–10 | Verificación en dispositivo, regresiones y piloto; medir; preparar siguiente incremento |

Para el conjunto completo, la escala es de varios ciclos y probablemente meses, según equipo e integraciones. No comprometería una fecha responsable sin dimensionar C01/T01/T02 y la cobertura autenticada pendiente.

## 14. Cómo sabremos que está funcionando

| Objetivo | Medición | Criterio inicial propuesto |
|---|---|---|
| Se entiende | Prospecto explica beneficio/uso después de demo | 8/10 sin ayuda en prueba cualitativa |
| Se empieza rápido | Tiempo a menú útil y primer pedido de prueba | Meta inicial ≤15 min con una carta pequeña; medir aparte importación grande |
| Se aprende | Empleado completa tomar/enviar/cobrar/corregir | Sin guía en la segunda repetición; registrar errores |
| Se cobra bien | Duplicados, diferencias no explicadas, reintentos | Cero duplicación en matriz de pruebas; toda diferencia trazable |
| Se usa fácil | Éxito de tarea, pasos y tiempo | Mejora frente a línea base, sin esconder capacidad necesaria |
| Se vuelve valioso | Restaurantes activos por semana, cierres reales y uso por puesto | Comparar cohortes antes/después; separar pruebas y negocios estacionales |
| Se renueva | Conversión de prueba y renovación a 30/60/90 días | Establecer base primero; no inventar un porcentaje objetivo sin segmento |
| Se recomienda | Referidos voluntarios y pilotos originados en clientes | Crecimiento del canal con atribución simple |
| Se puede operar | Minutos de soporte y costo por restaurante activo | Tendencia descendente sin empeorar resolución |
| Se siente profesional | Errores visuales, accesibilidad y métricas de campo | Cero bloqueos críticos en recorridos principales y objetivos de la sección 11 |

El criterio más importante: que al dueño le resulte evidente qué mejoró esa semana gracias a Leogin, y que al equipo le resulte más fácil trabajar que antes. La estética debe reforzar esa experiencia, no exigirle atención adicional.

## 15. Mapa de evidencia para implementar

Referencias locales al código revisado; los números de línea corresponden a esta revisión y cambiarán al editar.

| Área | Archivos |
|---|---|
| Política comercial | [Planes](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/plans.ts:71), [FAQ y comparación](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/planes/page.tsx:45), [Tope blando](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/tope-pedidos.ts:1) |
| Web/contacto | [Portada](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/landing.tsx), [Canal de contacto](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/site-chrome.tsx:25), [Analítica](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/analytics.ts) |
| Alta | [Nuevo restaurante](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/mi-cuenta/nuevo/nuevo-restaurante.tsx:202), [Primeros pasos](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/admin/(protected)/page.tsx:235) |
| Diseño/navegación | [Navegación](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/admin-nav.ts), [CSS admin](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/admin.css), [CSS global](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/globals.css) |
| Carta | [Ficha](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/menu/product-sheet.tsx:187), [Carrito](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/menu/cart.tsx), [Introducción de lealtad](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/menu/google-loyalty-intro.tsx) |
| Cobro y caja | [Hoja de cobro](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/servicio/hoja-cobro.tsx:139), [Conteo y borrador](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/caja/cash-close.tsx:171), [Cierre servidor](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/actions/finanzas.ts:853) |
| Servicio/cocina | [Servicio](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/servicio/servicio-panel.tsx), [Cocina](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/kitchen-display.tsx:292), [Estados/reloj](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/order-status.ts) |
| Lógica | [Pedidos y efectos posteriores](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/actions/orders.ts:583), [Costos de extras](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/actions/orders.ts:156), [Cupones](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/db/cupones.ts), [Cola](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/order-queue.ts) |
| Administración | [Disponibilidad](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/product-availability.ts), [Recetas](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/recipe-editor.tsx), [Informe financiero](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/db/reports.ts:140) |
| Permisos | [Permisos](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/permissions.ts:61), [Segundo factor](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/auth/segundo-factor-policy.ts) |
| Superadmin | [Inicio](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/app/super/page.tsx), [Salud de clientes](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/client-health.ts), [Agregaciones](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/db/super-admin.ts:266), [Cobros](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/db/billing.ts:615) |
| Portabilidad | [Exportación](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/lib/actions/backup.ts:100), [Texto al usuario](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/src/components/admin/respaldo-panel.tsx) |
| Verificación/historial | [E2E actual](C:/Users/minec/Documents/Catalogos-Restaurantes/plataforma/tests/e2e/pedidos.spec.ts), [CI](C:/Users/minec/Documents/Catalogos-Restaurantes/.github/workflows/ci.yml), [Cambios vigentes](C:/Users/minec/Documents/Catalogos-Restaurantes/CHANGELOG.md:9) |

Sitios observados: [Portada pública](https://distleogin.com/), [Planes](https://distleogin.com/planes), [Demo](https://demo.distleogin.com/), [Acceso](https://distleogin.com/login).

### Trabajo pendiente para cerrar la auditoría visual autenticada

Recorrer con datos de prueba y roles reales: Hoy, caja de punta a punta, servicio, cocina, inventario, clientes, suscripción, alta de personal y las fichas/finanzas/cuentas del superadmin. Capturar estados vacíos, saturados, error y permisos recortados. Este pendiente no invalida los hallazgos de código; sí impide afirmar que se comprobó cada alineación del panel actual.

No emitiría un sello de «perfecto» al terminar una lista. Exigiría evidencia de que las tareas se completan con claridad, rapidez, consistencia y recuperación, y repetiría esa evaluación cuando cambie el producto.
