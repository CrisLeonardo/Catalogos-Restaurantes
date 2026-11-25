# Auditoría de experiencia de la web pública de Leogin

**24 de noviembre de 2026 · Producción · Usabilidad 23/40 · Calidad técnica 11/20**

Leogin tiene una identidad reconocible y una demostración capaz de explicar el producto. La portada de escritorio presenta la promesa, la demo, la creación de cuenta y los precios por tipo de negocio en la primera pantalla. En el teléfono, donde un dueño puede llegar desde redes o WhatsApp, el video ocupa 350 px antes de la acción principal. Dos tarjetas prometen una experiencia específica y abren la misma carta del comensal. La oferta más concreta, En línea, invita a comenzar antes de mostrar la mensualidad.

**Prioridad comercial.** La primera pantalla debe explicar qué hace Leogin para mi negocio, cuánto me cuesta y cómo lo pruebo. Conservar la promesa «Tu restaurante, bajo control», los ejemplos de operación en Guatemala y el modo de demostración entre dos aparatos. La siguiente revisión debería comprobar si un dueño puede entender y elegir por su cuenta, y si la demo le enseña el trabajo que escogió.

## Alcance y método

Recorrido público desde la portada por Planes, Vende en línea, demo, Registro, Descargas, Acceder, Términos y Privacidad. El panel privado, la carta de restaurantes reales y los cobros efectivos quedan cubiertos por sus auditorías respectivas. La visita usó navegación, teclado, toque emulado, validación de formulario vacío y un pedido simulado sin sala externa. [Auditoría de lanzamiento](AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md) · [Auditoría de la carta](AUDITORIA_CARTA_QUE_VENDE_2026-11-18.md).

La medición `y` indica la distancia en píxeles CSS desde el inicio del documento a la parte superior del elemento, con la fuente cargada. Se comprobó la presentación en Chromium a 320, 390, 768, 844 en horizontal, 1024, 1280 y 1920 px. La evaluación visual independiente confirmó las nueve rutas a 390 × 844 y 1280 × 900. En WebKit y Firefox, Portada, Planes, Vende en línea, Registro y demo cargaron a 390 × 844, 844 × 390 y 1280 × 900, sin desborde horizontal. La preferencia en oscuro se cubrió en Chromium en móvil y escritorio. Las páginas comerciales conservan el tema claro por decisión de diseño. La carta de muestra usa su propia paleta. [Sistema visual de Leogin](../diseno/SISTEMA_VISUAL_2026-11-05.md) · [Guía de diseño](../guias/GUIA_DISENO_NADA_SATURADO.md).

## Recorridos desde el teléfono

| Quién llega y qué quiere | Recorrido observado | Qué debería poder comprobar |
| --- | --- | --- |
| Dueño con mesas. Quiere ver cómo pasa una comanda a cocina y cómo cobra caja. | Baja a «Tengo mesas y meseros» y toca una vez. Abre la carta desde la perspectiva del comensal. | En un toque desde su caso, ver mesero → cocina → caja o recibir una explicación visible de qué va a probar. |
| Persona que atiende el mostrador. Quiere saber si puede tomar y cobrar un pedido sin mesero. | Baja a «Cafetería o mostrador» y toca una vez. Llega al mismo destino que Mesas. | Ver un ejemplo de mostrador y el plan Estándar con sus modalidades de pedido. |
| Persona que vende por redes. Quiere saber si su cliente puede pedir sin chatear y cuál es el costo mensual. | Un toque en «Vendo por redes» abre una página específica. En esa página, el primer CTA de alta comienza en y=432 y la frase con el precio en y=5822 a 390 × 844. | Entender cómo funciona el enlace y ver la mensualidad junto a la primera acción. |
| Dueña que solo quiere un menú compartible. Quiere confirmar que la carta es gratis, con su QR. | El texto lo indica en la portada. El enlace «Básico, gratis» queda debajo de los tres perfiles y abre Registro con Básico seleccionado. | Alcanzar Básico en un toque desde la primera decisión y entender que el plan publica la carta sin tomar pedidos. |
| Dueño que quiere comparar o hablar antes de registrarse. | Menú → Planes en dos toques. Elegir el perfil toma uno más. La invitación de ventas de la portada está cerca del final y abre el correo anunciado. | Acceder a precios desde el primer recorrido y encontrar el canal de contacto atendido sin recorrer toda la portada. |

## Hallazgos y criterios de cierre

Se detectaron seis hallazgos **P1**, que conviene corregir antes de impulsar la captación, y cinco **P2**, con alternativas disponibles o de impacto más acotado.

### WEB-UX-01 · P1 · Las tarjetas por negocio pierden el contexto en la demo

Mesas y Mostrador muestran un plan y un resultado de trabajo distintos, pero los dos enlaces abren la misma carta. Desde la carta, «Crea el tuyo» vuelve a la portada. La entrada «Demo» de escritorio en la cabecera también abre la carta directamente, mientras «Probar la demo» ofrece un QR con una pantalla de cocina. Son recorridos distintos bajo nombres muy parecidos. [Portada](https://distleogin.com/) · [Demo](https://demo.distleogin.com/) · [Casos y destinos](../../plataforma/src/components/landing.tsx#L179) · [Cabecera](../../plataforma/src/components/site-chrome.tsx#L45).

En el teléfono sí se puede comprobar el recorrido en el mismo aparato. Desde el CTA de portada son cinco toques hasta ver el pedido en la cocina simulada. Se pudo aceptar y marcar listo. El CTA final llega a `/registro` sin caso ni plan. El resultado «Así le llegó a la cocina» comunica mejor el producto que la carta sola. [Flujo de prueba](../../plataforma/src/components/pidelo/pedido-demo.tsx#L48) · [Carrito de muestra](../../plataforma/src/components/menu/cart.tsx#L90).

**Cierre.** Dar a cada caso un destino que explique o muestre su operación y su plan. Distinguir «Ver carta de ejemplo» de «Probar un pedido» donde coexistan. Tras la demo, proporcionar un siguiente paso que conserve el caso y el plan cuando el visitante los haya elegido. Probar ida, vuelta y alta para los cuatro perfiles.

### WEB-UX-02 · P1 · El orden móvil retrasa el momento de entender y actuar

A 390 × 844, el video ocupa y=254–604, «Probar la demo» comienza en y=626, «Crear mi restaurante» en y=684 y el título de perfiles en y=860. La acción visible desde arriba es «Crear cuenta» en la cabecera. Al inicio, «Salón, cocina y caja» orienta bien a un restaurante con mesas. Un comercio que vende por encargo o solo necesita su QR tiene que bajar para reconocerse. El mismo conjunto funciona mejor a 1280 × 900, donde los perfiles y sus precios caben en la primera pantalla. [Portada](https://distleogin.com/) · [Orden del encabezado](../../plataforma/src/components/landing.tsx#L134) · [Orden de la cuadrícula móvil](../../plataforma/src/app/globals.css#L3136).

**Cierre.** Maquetar el texto de categoría y el resultado concreto antes del video, con «Probar la demo» como acción principal y acceso visible a Planes. A 390 px, la explicación y la primera acción deben comenzar en el primer tercio conforme a la guía. Iniciar las opciones de negocio dentro de la primera pantalla de 390 × 844. Mantener una sola fila de navegación y comprobar el resultado a 320 px y en horizontal.

### WEB-UX-03 · P1 · Se invita a empezar antes de explicar lo que cuesta

En Vende en línea, Q99/mes aparece a y=5822 en teléfono y y=4684 en escritorio, por debajo de varias secciones. La página de registro con el plan En línea seleccionado sí resume el precio y explica que el plan se confirma después. Planes dice que la mensualidad es fija «sin importar cuántos pedidos recibas» y que no subes por vender más. El recomendador sugiere Estándar por encima de 300 pedidos al mes y la FAQ de Vende en línea indica aviso y cambio al mes siguiente. El negocio tiene que deducir la diferencia entre comisión, precio mensual y la regla de volumen. [Vende en línea](https://distleogin.com/vende-en-linea) · [Planes](https://distleogin.com/planes) · [Descripción y condición de volumen](../../plataforma/src/app/vende-en-linea/page.tsx#L138) · [Nota de Planes](../../plataforma/src/app/planes/page.tsx#L148).

**Cierre.** Poner mensualidad, costo de alta si corresponde y momento de activación al lado del primer CTA de plan. Usar una explicación idéntica para la referencia de 300 pedidos en el recomendador, la comparativa, la página En línea y el alta. Confirmar con el dueño la política exacta de cambio y el tarifario efectivo antes de escribir las condiciones. Mantener la distinción entre el pago que recibe el restaurante y la mensualidad de Leogin. [Auditoría de lanzamiento, LZ-01](AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md).

### WEB-UX-04 · P2 · La comparativa necesita un recorrido móvil propio

«Ver los cuatro planes lado a lado» en la portada enlaza a `/planes`. La comparativa sigue cerrada y queda más abajo. Al abrirla a 390 px, la tabla mide 620 px dentro de una caja de 352 px. El primer cuadro enseña la función, Básico y parte de En línea. Para leer Premium hay que descubrir el desplazamiento horizontal y se pierde la etiqueta de la fila. En escritorio, la tabla cabe dentro de la tarjeta. Las funciones se marcan con celdas de datos, por lo que falta el encabezado semántico de fila. [Enlace de origen](../../plataforma/src/components/landing-planes.tsx#L94) · [Comparativa](../../plataforma/src/app/planes/page.tsx#L182).

**Cierre.** Hacer que el enlace abra la comparativa en su destino. En móvil, priorizar diferencias clave y permitir comparar los dos planes que le interesan al dueño, manteniendo visibles las etiquetas. Si se conserva el desplazamiento, debe ser evidente, usable con teclado y conservar los encabezados de fila. El recomendador de cuatro perfiles ya orienta bien y puede seguir como primer paso.

### WEB-UX-05 · P2 · El registro genérico oculta parte del último campo en la vista inicial

A 390 × 844, el pie adhesivo comienza en y≈767 y cubre parte de Contraseña y del control para mostrarla. El campo se descubre al bajar. Las etiquetas de los tres campos ya están asociadas y la URL contextual muestra el plan seleccionado. Los enlaces genéricos de cabecera ofrecen una alta sin selección, incluso en páginas que ya enseñan una oferta concreta. [Registro](https://distleogin.com/registro) · [Pie adhesivo](../../plataforma/src/components/signup/wizard-ui.tsx#L115) · [CTA de cabecera](../../plataforma/src/components/site-chrome.tsx#L56).

**Cierre.** Mostrar cada campo, su ayuda y el control asociado sin solapamiento al enfocarlo. Probar teclado abierto, error y corrección en Safari iOS y Chrome Android. Conservar el plan al avanzar desde una acción de esa oferta, explicar que se crea la cuenta primero y facilitar el regreso a precios sin perder la elección.

### WEB-UX-06 · P2 · La ayuda y la confianza llegan tarde en dos decisiones

En la portada, la invitación a ventas queda cerca de y=5312 a 390 px, fuera de la navegación móvil. La invitación dice correo y abre correo, de acuerdo con la corrección de lanzamiento. En Descargas, la primera acción visible ofrece Windows. El aviso de firma pendiente e instalación acompañada aparece más abajo. Términos y Privacidad tienen lectura directa y nombres reconocibles en el pie. [Portada](https://distleogin.com/) · [Descargas](https://distleogin.com/descargas) · [Términos](https://distleogin.com/terminos) · [Privacidad](https://distleogin.com/privacidad).

**Cierre.** Dar acceso al canal comercial atendido desde la decisión de plan y desde la navegación compacta. Contrastar el impacto de una prueba real de menú con el de la demo ficticia. Usar testimonio o caso local solo cuando esté verificado y autorizado. En Descargas, presentar junto al primer CTA la disponibilidad para Windows, la opción web y la instalación acompañada mientras exista la advertencia descrita. [Canal configurado y pie](../../plataforma/src/components/site-chrome.tsx#L22) · [Aviso del instalador](../../plataforma/src/app/descargas/page.tsx#L159).

### WEB-UX-07 · P1 · El video decorativo de la portada se repite sin control propio

La tarjeta incluye un bucle silenciado de 5,4 s en la versión cuadrada observada. Se reproduce al estar a la vista y respeta la preferencia de movimiento reducido. Abrir la película pausa el bucle, pero la tarjeta no da una opción para detener el movimiento conservando la lectura de la portada. La película principal tiene controles nativos y no ofrece pistas de texto seleccionables. La explicación del sitio debe permitir entender los pasos y beneficios sin depender del sonido o de texto incrustado. [Bucle y controles](../../plataforma/src/components/landing-intro.tsx#L55) · [WCAG 2.2, pausar, detener, ocultar](https://www.w3.org/TR/WCAG22/#pause-stop-hide).

**Cierre.** Usar portada fija con reproducción voluntaria o añadir un control visible de pausa para el bucle. Verificar movimiento reducido, teclado, lectura de la alternativa textual y control del audio al abrir y cerrar.

### WEB-UX-08 · P1 · El menú pierde el foco y se corta en horizontal

Abrir el menú, enfocar «Producto» y pulsar Escape lo cierra y deja el foco en `BODY`. A 667 × 375 el panel abierto termina en y=389 y su último enlace en y=382, con `overflow-y: visible`. Parte del último enlace queda fuera de la vista. Entre 861 y 1080 px se repiten destinos al abrir el menú que complementa la cabecera. El botón móvil y los enlaces del panel tienen 44 px de alto, una buena base para el toque. [Control del menú](../../plataforma/src/components/site-menu.tsx#L28) · [Dimensiones del panel](../../plataforma/src/app/globals.css#L3061) · [Navegación intermedia](../../plataforma/src/app/globals.css#L3091).

**Cierre.** Regresar el foco al botón al cerrar con Escape. Limitar la altura del panel al espacio visible y permitir recorrerlo sin desplazar el documento. Comprobar teclado, toque, orientación horizontal y los anchos a ambos lados de cada corte de la cabecera.

### WEB-UX-09 · P1 · Hay barreras al saltar al contenido e identificar enlaces

Planes carece de un elemento principal `main`. En las páginas con cabecera repetida no hay un enlace visible al enfocar para saltar al contenido. Axe encontró un enlace dentro de un párrafo en Términos y otro en Privacidad que se distinguen sólo por color, con 1,51:1 frente al texto cercano y sin subrayado. La portada crea dos diálogos con el mismo ID de título. Escape y el retorno de foco funcionaron en el diálogo de escritorio. En la hoja de pedido de prueba de la demo, abrir dejó el foco en `BODY` y Escape no cerró la hoja. [Planes](../../plataforma/src/app/planes/page.tsx#L124) · [Cabecera compartida](../../plataforma/src/components/site-chrome.tsx#L41) · [Título de demo](../../plataforma/src/components/landing-demo.tsx#L70) · [Hoja de pedido](../../plataforma/src/components/pidelo/pedido-demo.tsx#L76) · [Privacidad](https://distleogin.com/privacidad) · [Términos](https://distleogin.com/terminos) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/#use-of-color).

**Cierre.** Incorporar un destino principal y un salto de contenido común, distinguir los enlaces de párrafo con un subrayado y dar un identificador propio a cada diálogo. Gestionar foco inicial, Escape y retorno del foco en la hoja de pedido. Probar la portada, Planes y la demo de principio a fin con teclado y con lector de pantalla. [Navegación con teclado, WCAG 2.2](https://www.w3.org/TR/WCAG22/#bypass-blocks).

### WEB-UX-10 · P2 · La primera impresión se retrasa con una conexión limitada

En tres cargas por ruta con caché fría y red/CPU limitadas, el elemento principal de portada tardó una mediana de 6,8 s y la demo 7,1 s. La portada transfirió cerca de 512 KiB completos en la ventana medida, incluidos 265–266 KiB de JavaScript y 131 KiB de fuentes. La demo transfirió 830 KiB, con 414 KiB de imágenes. Planes presentó desplazamiento visual de 0,180 en una de las tres cargas limitadas y 0,184 en la visita directa. La variación es una señal para investigar tiempos de servidor, aparición de fuentes y prioridad de recursos por separado. [Core Web Vitals](https://web.dev/articles/vitals) · [Fuentes de la plataforma](../../plataforma/src/app/layout.tsx#L28).

**Cierre.** Medir qué partes de portada, demo, fuentes y precargas son necesarias antes del primer toque. Repetir con el mismo perfil tras reducir el presupuesto inicial y aislar la fuente del salto en Planes. Usar como objetivos de campo p75 ≤2,5 s de LCP y ≤0,1 de CLS cuando haya muestras suficientes.

### WEB-UX-11 · P2 · Las vistas previas compartidas tienen espacio para explicar la oferta

Portada, Planes, Vende en línea y Registro ya declaran su dirección canónica y texto social específico. En las cuatro la imagen social es el icono cuadrado de Leogin. Descargas tiene título y descripción propios, y en la visita carecía de imagen social específica. El icono identifica la marca, mientras la vista previa puede explicar qué encontrará el destinatario antes de abrir el enlace. [Portada](https://distleogin.com/) · [Planes](https://distleogin.com/planes) · [Vende en línea](https://distleogin.com/vende-en-linea) · [Registro](https://distleogin.com/registro) · [Descargas](https://distleogin.com/descargas).

**Cierre.** Presentar el beneficio de cada destino en la tarjeta de enlace y verificar su lectura, recorte y destino compartiendo a un chat de prueba consentido. Priorizar portada y Vende en línea.

## Qué mostrar primero

Propuesta de contenido para la maqueta. Las frases describen funciones ya publicadas y el valor para quien llega de primera vez.

| Momento | Contenido o acción |
| --- | --- |
| Primera pantalla | «Tu restaurante, bajo control». Debajo, «Crea tu carta con QR y recibe pedidos en un solo lugar. Conecta a tu equipo de cocina y caja según el plan que elijas». Acciones «Probar la demo» y «Ver planes y precios». |
| Elegir por caso | «Solo quiero mi carta», «Vendo por redes», «Atiendo en mostrador», «Tengo mesas y meseros». Un resultado, un precio visible y un destino coherente por caso. |
| Probar | «Haz un pedido de prueba y mira cómo llega a cocina». Texto de estado visible y anunciado. En escritorio conservar QR y «Abrir en esta computadora». En teléfono explicar qué parte del trabajo se puede ver en el mismo aparato. |
| Decidir | Mensualidad, qué incluye, cuándo se confirma y cómo hablar con alguien. Preguntas sobre cobro, 300 pedidos, usuarios y hardware cerca de la oferta correspondiente. |

La maqueta debe mostrar el antes y la propuesta a 390 y 1280 px, con medidas, la comparativa móvil y el traspaso a Registro. La guía del dueño pide validarla antes de construir el cambio visual. [Regla de diseño](../guias/GUIA_DISENO_NADA_SATURADO.md).

## Cómo comprobar si se entiende y vende mejor

Hacer una ronda con cinco personas que no hayan visto Leogin, incluyendo negocios de QR, redes, mostrador y mesas. En cinco segundos deben poder decir qué ofrece y para quién. Sin instrucciones, pedirles que encuentren precio y condiciones, prueben el flujo que les corresponde, regresen al sitio y expliquen qué esperan que ocurra al crear la cuenta. Registrar qué interpretaron, número de toques, tiempo y desvíos. La meta propuesta es que al menos cuatro de cinco identifiquen su caso, el precio y el próximo paso sin ayuda.

La medición comercial debe seguir cada caso desde visita → demo → selección → cuenta → restaurante publicado → primer pago, con origen y plan. El código ya conserva parte de la intención y registra eventos de alta cuando se habilita la medición. El abandono real, la tasa de conversión y el efecto de cada cambio requieren datos de uso. [Medición por origen, LZ-11](AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md#L151).

## Evaluación heurística

| Criterio | /4 | Evaluación |
| --- | --- | --- |
| Estado visible | 3 | El selector revela la recomendación y Registro indica el paso. |
| Lenguaje del negocio | 3 | Habla de comandas, caja y montos en quetzales. «Tu caso» y los nombres de demo requieren contexto. |
| Control | 3 | El diálogo de demo se cierra con Escape y permite usar solo una computadora. |
| Consistencia | 2 | La cabecera es estable. Las tarjetas, el CTA de demo y el enlace directo tienen alcances distintos. |
| Prevención | 2 | El registro contextual conserva el plan. Precio, volumen y algunas acciones genéricas generan incertidumbre. |
| Facilidad de reconocer opciones | 2 | Los perfiles se entienden. La primera pantalla móvil y la comparativa esconden parte de la decisión. |
| Eficiencia | 2 | Dos toques a Planes y un toque a la carta. La demo de operación y ventas tardan en aparecer para quien entra por teléfono. |
| Jerarquía y limpieza | 2 | La composición de escritorio tiene buen equilibrio. En móvil, el video desplaza la primera acción comercial. |
| Recuperación | 2 | Hay avisos de error en el alta. El retorno de demo y los enlaces genéricos pierden la intención. |
| Ayuda | 2 | Las preguntas frecuentes tratan condiciones importantes. El canal comercial cuesta encontrar en móvil. |
| **Total** | **23/40** | Evaluación experta en modo Convencer. |

## Comprobaciones técnicas

| Dimensión | /4 | Resultado |
| --- | --- | --- |
| Accesibilidad | 2 | Etiquetas de Registro, controles nativos y foco de la demo funcionales. Faltan salto al contenido, retorno de foco del menú y distinción visual en enlaces legales. |
| Rendimiento | 2 | Carga diferida y tamaños adaptativos presentes. La portada, la demo y la respuesta bajo red limitada requieren reducción y medición repetida. |
| Tema | 3 | Tema claro consistente en la web comercial, color de marca reconocible y preferencia de movimiento respetada. Quedan contrastes bajos en ilustraciones. |
| Diseño adaptable | 2 | Sin desborde del documento en las vistas medidas. Comparativa, registro y menú en horizontal necesitan ajustes. |
| Coherencia de implementación | 2 | Cabecera y pie compartidos, navegación inconsistente entre las entradas de demo y condiciones repartidas por ruta. |
| **Total** | **11/20** | Aceptable con correcciones de impacto comercial y de accesibilidad. |

- **Axe-core a 390 y 1280 px.** Se revisaron nueve rutas en reposo. Los enlaces de Términos y Privacidad se marcaron en ambos anchos. Como recomendaciones de estructura, Planes reportó contenido fuera de una región principal y la demo reportó su franja superior fuera de región. En portada, Vende en línea, Registro, Descargas e inicio de sesión la pasada inicial quedó sin incidencias. El alta vacía enfocó «Tu nombre» y mostró «Escribe tu nombre». Abrir y cerrar el diálogo de escritorio confirmó que el foco vuelve a «Probar la demo». [Guía de comprobación](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).
- **Detector Impeccable y revisión visual independiente.** Se registraron 50 señales en cuatro URL. Las relevantes para leer son tres contrastes bajos en ilustraciones, etiquetas ilustradas cercanas a 10 px y la ayuda de contraseña de 11,5 px. Geist y los grupos de burbujas pertenecen al diseño vigente. La pasada estática de 13 componentes salió sin señales. [Ayuda de contraseña](../../plataforma/src/components/signup/wizard-ui.tsx#L47) · [Ilustración de portada](../../plataforma/src/components/landing.tsx#L424) · [Ilustración de chat](../../plataforma/src/app/vende-en-linea/page.tsx#L415).
- **Prueba de red.** Chromium emuló 390 × 844, 1,6 Mb/s de bajada, 0,75 Mb/s de subida, 150 ms de latencia y CPU ×4, con caché fría y tres visitas por ruta. La mediana de LCP fue de 6,8 s en Portada (4,6–11,5), 3,4 s en Planes (2,1–18,9), 4,1 s en Vende en línea (4,0–8,4), 4,9 s en Registro (2,0–7,0) y 7,1 s en la demo (5,6–8,1). Son mediciones de laboratorio tomadas durante la auditoría. [Diferencias entre datos de campo y laboratorio](https://web.dev/articles/lab-and-field-data-differences).

Quedan pendientes Android y iPhone físicos, lector de pantalla con voz activa, teclado del sistema, autenticación completa, alta con pago, vista previa dentro de WhatsApp y recorrido con dueños reales. Las tasas de conversión y los Core Web Vitals de campo requieren datos de uso.
