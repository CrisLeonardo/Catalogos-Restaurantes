# Auditoría de experiencia y venta — 2026-10-27

**Pregunta del dueño:** ¿el panel, la web y el catálogo digital son lo más fácil de entender y de usar para *cualquier* persona (filosofía Nintendo / Apple), y se venden solos con solo echarles un vistazo?

**Alcance y cómo se revisó**

| Superficie | Cómo se revisó |
|---|---|
| Web pública (`distleogin.com`, `/registro`) | En producción, en el navegador, en teléfono (375 px) y en PC. |
| Catálogo digital (`demo.distleogin.com`, Rincón 502) | En producción, en teléfono: portada, carta, ficha de un platillo. |
| Panel del restaurante (43 pantallas) | **Solo en el código** (`lib/admin-nav.ts`, `shell.tsx`, Hoy, Ajustes, Personalizar, formulario de platillo, asistente de alta). Docker Desktop no arrancó (ver al final), así que **esta vez no se vio el panel en pantalla**. Lo que dice este documento sobre el panel es de estructura, textos y flujo, no de aspecto. |

---

## 1. El veredicto, corto

**El detalle está muy pulido; lo que falla es la cantidad.** Después de una docena de auditorías, el panel ya habla claro (casi no queda jerga), «Hoy» responde una sola pregunta, los candados viven donde se buscan y hay momentos de alegría (fiesta del primer pedido, hitos, Leo). A nivel de pantalla suelta hay poco que corregir.

Lo que separa a Leogin de un producto «estilo Nintendo» no está en ninguna pantalla en particular: está en **cuántas cosas hay que entender antes de sentir la magia**. Nintendo y Apple no ganan por explicar mejor, ganan porque **quitan decisiones**:

- Una consola sale de la caja y en 30 segundos estás jugando. Los ajustes existen, pero nadie te obliga a verlos.
- Un iPhone no te pregunta qué plan de iCloud quieres antes de enseñarte la pantalla de inicio.

Hoy, un dueño de restaurante que llega a Leogin tiene que decidir **plan → modos de pedido → nombre → estilo (200 combinaciones)** antes de ver su menú, y después encuentra **6 grupos, 43 pantallas, 9 funciones activables y 3 estados posibles para cada una** (incluida, sin activar, bloqueada por plan). Cada pieza tiene sentido por separado; todas juntas son mucho.

**Y lo más importante para vender:** el momento que de verdad convence —*pido desde mi celular y suena en el panel*— **no se puede vivir en ningún lado sin crear cuenta**. La demo enseña la carta, pero no tiene botón para pedir.

---

## 2. Lo que ya está bien (y no hay que tocar)

Para que las propuestas de abajo no se lean como «empezar de cero»:

1. **Seis destinos en vez de 35** (`lib/admin-nav.ts`), agrupados por la pregunta del dueño y no por el módulo. Es exactamente el principio de Apple de «navegar por intención».
2. **«Hoy» con tres bloques con jerarquía** (atención → resumen → en curso) y el bloque de avisos que **desaparece si no hay nada**. Muy Nintendo: la pantalla calla cuando todo va bien.
3. **Comparar con «un martes normal»** en vez de con ayer. Es la cifra que un dueño entiende sin pensar.
4. **Progreso dotado** en los primeros pasos (arranca en 20 %, no en 0 %). Psicología bien aplicada.
5. **Momentos pico**: primer pedido, hitos, récord del día, compartir el plato estrella. Esto es lo que hace que alguien le *cuente* a otro dueño.
6. **Lenguaje**: casi no queda jerga. Se dice «La PC del local», no «agente de impresión»; «Copia de tus datos», no «respaldo».
7. **Web pública**: el titular «Tu restaurante, bajo control.» es de beneficio y no de función, el relato «una noche normal → entra Leogin → tú, bajo control» es muy bueno, y la identidad (Unbounded, naranja, video a mano de 54 s) se distingue de cualquier POS de la región.
8. **Catálogo**: la ficha de platillo es de las mejores que hay en la región (opciones como botones grandes, «Elige uno», tiempo de preparación, «Recién hecho»).

---

## 3. Hallazgos, por prioridad

Cada hallazgo dice **qué pasa**, **por qué importa** (psicología o venta) y **qué haría**.

### P0 — Lo que más dinero cuesta

#### EV-01 · La demo no deja pedir: el «¡ajá!» no existe antes de registrarse
- **Qué pasa:** en `demo.distleogin.com` se abre un platillo, se elige «Término medio» y extras… y no hay botón para agregar. La ficha termina en el precio. Es un callejón: el visitante hace el trabajo de elegir y no recibe nada. (La demo corre sin base de datos y con `ordersEnabled=false`.)
- **Por qué importa:** la venta de Leogin no es «un menú bonito» (eso lo tiene cualquiera con un PDF o con OlaClick). Es **«el pedido entra solo y suena»**. Mientras eso solo se cuente, compite con promesas; cuando se *vive*, se vende solo. Es el «toca la pantalla» de las tiendas de Apple: no te explican el iPhone, te lo ponen en la mano.
- **Qué haría — «Pídelo tú mismo»:**
  1. En la web, en PC: un QR grande «Escanéalo y pide algo». El visitante pide desde su celular, y **en la misma página de la PC, el panel de mentira suena** y aparece su pedido con su nombre («Mesa 4 · Cristopher · hace 2 s»).
  2. En el teléfono (sin PC al lado): al confirmar el pedido, la demo cambia sola a la vista del panel con el sonido: «Así le llegó a la cocina».
  3. Técnicamente no necesita base de datos: un canal de Supabase Realtime *broadcast* con un código de sesión de un solo uso basta, sin guardar nada.
- Es la mejora de más impacto de todo este documento, porque **es demo de venta y guía de primeros pasos a la vez** (ver EV-04).

#### EV-02 · El registro pide elegir plan antes de enseñar nada
- **Qué pasa:** el asistente de alta (`mi-cuenta/nuevo/nuevo-restaurante.tsx`) es `Tu plan → Tu restaurante → Tu estilo → Confirmar`. El primer paso son tres tarjetas de precio y, si se elige Estándar, un acertijo extra: «elige 2 de 3 modos de pedido».
- **Por qué importa:** pedir una decisión de dinero **antes de dar valor** es la fricción más cara que existe en un alta. Además, quien no sabe todavía si va a usar mesas o domicilio no puede elegir bien, y una mala elección temprana es una mala primera impresión del producto («me quedé corto»).
- **Qué haría — «prueba inversa»:**
  - Todos empiezan con **30 días de todo** (Premium), sin elegir nada. El alta queda en dos pasos: *nombre* y *estilo*.
  - Al día 23–25, Leogin **recomienda el plan según lo que usó de verdad**: «Usaste mesas y para llevar, nunca domicilio → Estándar con esos dos te alcanza (Q150)». La persona elige con datos, no a ciegas.
  - Psicológicamente, perder algo que ya usaste pesa el doble que no ganarlo (aversión a la pérdida): la prueba inversa convierte más que la prueba elegida.
  - Básico gratis sigue existiendo como destino al terminar la prueba, no como puerta de entrada.

#### EV-03 · La promesa del titular y el botón no dicen lo mismo
- **Qué pasa:** el titular promete **«pedidos, cocina, caja e inventario… bajo control»**. El botón principal dice **«Crear mi menú gratis»**, y el plan gratis es justo el que **no tiene pedidos, ni cocina, ni caja, ni inventario**.
- **Por qué importa:** el visitante que se emocionó con «control» llega al panel gratis y no encuentra nada de lo prometido. La disonancia entre promesa y entrega es la causa número uno de abandono en la primera semana.
- **Qué haría:** con EV-02, el botón pasa a ser **«Probarlo 30 días gratis»** (o «Ponlo bajo control gratis») y entra a la prueba completa. «Menú gratis para siempre» se queda como frase de apoyo debajo, que es donde funciona: quita el miedo, no es la promesa.

### P1 — Lo que hace que el panel se sienta grande

#### EV-04 · La guía de primeros pasos va en el orden de la configuración, no en el de la emoción
- **Qué pasa:** los pasos de Hoy son `Creaste tu cuenta → Personaliza tu marca → Crea una categoría → Agrega tu primer platillo → Comparte tu menú → Elige la PC del local`.
- **Por qué importa:** «Crea una categoría» es trabajo de bibliotecario: nadie quiere organizar un menú que todavía no existe. Y «Personaliza tu marca» antes de tener un platillo es decorar una casa vacía. Nintendo enseña jugando: en el primer minuto de cualquier Mario ya saltaste.
- **Qué haría — tres pasos, en el orden del «¡ajá!»:**
  1. **Tu primer platillo** — foto con la cámara del teléfono, nombre y precio. La categoría se crea sola («Platillos») y se renombra después.
  2. **Míralo en tu celular** — un QR en pantalla; se abre su menú con su platillo. Primer «wow».
  3. **Haz un pedido de prueba** — desde ese celular; el panel suena, se acepta, sale la comanda si hay impresora. Segundo «wow», y ahora entiende el producto entero.
  - Marca, QR para imprimir y «La PC del local» pasan a sugerencias *después* del primer pedido, cuando ya hay motivo.

#### EV-05 · Tres maneras de «tener» una función confunden
- **Qué pasa:** una función puede estar **incluida en tu plan**, **incluida pero sin activar** (pantalla «Funciones» en Ajustes) o **bloqueada por plan** (pestaña con candado que lleva a «Mi suscripción»). Además «Funciones» y «Mi suscripción» son dos filas distintas en Ajustes.
- **Por qué importa:** la pregunta del dueño es una sola: *¿puedo usar esto?* Tener que entender un modelo de dos ejes (plan × activación) es carga mental que no aporta nada a su negocio.
- **Qué haría:** fundir «Funciones» dentro de cada función: lo que está en el plan **ya está prendido**, con un interruptor «Mostrar a mis clientes» dentro de su propia pantalla (lealtad, encuestas, reservaciones…). Una sola pantalla de cuenta: «Mi plan», con lo que tienes y lo que te falta. Regla de Apple: si lo ves, funciona.

#### EV-06 · «Negocio» tiene cinco pestañas que se parecen
- **Qué pasa:** Resumen, Analítica, Finanzas, Caja y Facturación. Las tres primeras son «números» y una persona sin formación contable no sabe cuál abrir para saber «¿gané este mes?».
- **Por qué importa:** cuando dos puertas parecen llevar al mismo lugar, la gente no elige: se va.
- **Qué haría:**
  - **Una sola pantalla «Números»** con un selector de periodo (hoy · semana · mes · año) y bloques que bajan en profundidad: *cuánto vendí → cuánto gané → qué se vende más → cuándo*. Analítica y Finanzas pasan a ser secciones de esa pantalla, no destinos.
  - **Caja no es un reporte, es una tarea** (la última de la noche). Su lugar natural es Pedidos o un botón «Cerrar el día» en Hoy a partir de cierta hora.

#### EV-07 · Personalizar el sitio tiene ~60 controles y 200 combinaciones
- **Qué pasa:** cinco pestañas; entre los controles: «CSS del gradiente», «Cantidad de glass», «Grano / textura», «Brillo que sigue al cursor», «Texto sobre acento», «Ícono de app instalada (PWA)», «Marca de agua girando», «Modo lanzamiento (drop)».
- **Por qué importa:** es la paradoja de la elección: con 200 opciones la gente o no elige o elige y se queda con la duda. Además, el vidrio translúcido («glass») contradice el gusto declarado de la marca por superficies sólidas.
- **Qué haría — «Hazlo por mí»:**
  - Primera pantalla: **sube tu logo** → Leogin saca los colores del logo y propone **tres** menús ya armados con *su* nombre y *sus* platillos. Uno, se toca, listo.
  - «Avanzado» se queda, pero **plegado y con una advertencia amable** («para quien quiera afinar cada detalle»). Quitar la palabra «glass», «PWA», «drop», «watermark», «badge» de las etiquetas.
  - En la web, «ocho estructuras» se vende muy bien; en el panel hay que *elegir por la persona*.

#### EV-08 · Un mismo panel para cuatro trabajos distintos
- **Qué pasa:** Pedidos reúne En vivo, Cocina, Mesas y Tomar pedidos. El dueño, el cajero, el cocinero y el mesero entran al mismo armazón y ven un subconjunto según permisos.
- **Por qué importa:** un cocinero no necesita *navegar*, necesita *ver comandas*. Ya existe el «Modo servicio» y la Cocina tiene su propio diseño: la idea está, falta hacerla la regla.
- **Qué haría:** la primera vez que un aparato entra, una sola pregunta con cuatro dibujos grandes: **«¿Para qué es este aparato? Caja · Cocina · Mesero · Para mí (dueño)»**. Se queda recordado y el aparato arranca directo ahí, sin menú. El dueño sigue viendo todo. Es el modelo de la Switch: la misma consola, otra forma según cómo la agarras.

### P2 — Web pública: venderse con un vistazo

#### EV-09 · La portada mide 20 pantallas de teléfono
- **Qué pasa:** 13 secciones con título. Varias repiten la misma idea: «Un panel que trabaja contigo» y «Para ti, el dueño»; «Crece sin cambiar de sistema» y «Dos lados, un sistema».
- **Por qué importa:** la mayoría decide en los primeros 5–8 segundos y casi nadie llega a la mitad de una página así en el teléfono. Lo que va después de la tercera pantalla lo lee quien ya está convencido.
- **Qué haría:** dejarla en **7 bloques**, un mensaje cada uno: (1) titular + video, (2) la noche normal → bajo control, (3) **«Pídelo tú mismo»** (EV-01), (4) ocho maneras de recorrer la carta, (5) aguanta sin internet, (6) precio, (7) dudas + botón. Lo demás a `/funciones`.

#### EV-10 · La barra de cifras no dice nada a quien no conoce el producto
- **Qué pasa:** «Q0 · 0 % · **7** herramientas incluidas en Premium · Hoy».
- **Por qué importa:** «7 herramientas» es un número de catálogo interno; no despierta nada. Las cifras de esa barra deberían ser las que el dueño siente en el bolsillo.
- **Qué haría:** reemplazar el «7» por algo como **«Q0 de comisión: lo que vendes es tuyo»** o el tiempo («en 10 minutos tienes tu menú en vivo»). Y medirlo: hoy la analítica de la web está apagada, así que cualquier cambio de la portada se decide a ojo.

#### EV-11 · «Más popular» sin clientes que lo respalden
- **Qué pasa:** Premium lleva la etiqueta «MÁS POPULAR» (`lib/plans.ts`).
- **Por qué importa:** funciona como ancla, pero si un prospecto pregunta «¿cuántos lo usan?» y la respuesta no respalda la etiqueta, se rompe la confianza en todo lo demás. En el mercado guatemalteco la venta es de boca en boca y la confianza es el activo.
- **Qué haría:** cambiarla por **«Recomendado»** o **«Todo incluido»** mientras no haya clientes suficientes que la respalden. Y sustituir la prueba social que no existe por una **garantía de fundador**: «Si en 30 días no te ordena el negocio, te ayudamos a irte con tus datos».

### P3 — Catálogo digital

#### EV-12 · La portada del menú se interpone entre el QR y la comida
- **Qué pasa:** en el teléfono, la primera pantalla de Rincón 502 es logo, nombre, lema y «Ver el menú»: **ningún platillo a la vista**.
- **Por qué importa:** quien escaneó el QR desde la mesa ya decidió comer ahí. Cada toque extra antes de ver comida es un pequeño freno (y en pedidos para llevar, abandono).
- **Ya existe la solución, pero como ajuste:** la portada «Directo» (`components/menu/portada.tsx`) hace justo esto, pero el dueño tiene que descubrirla en Personalizar › Portada.
- **Qué haría:** que se elija sola según de dónde viene el comensal: si entra con `?mesa=` (QR de mesa), **portada «Directo» siempre**, sin importar la que eligió el dueño; la portada grande se queda para quien llega por Instagram o Google. Nadie tiene que saber que existe la opción.

#### EV-13 · Los nombres de los platillos van encima de la imagen
- **Qué pasa:** en la estructura de la demo, nombre y precio se pintan sobre la ilustración. Con ilustraciones funciona; con fotos reales de restaurante (fondos claros, platos blancos) el texto se pierde.
- **Qué haría:** verificarlo con fotos reales en las ocho estructuras antes de venderlas como «se ve todavía mejor con tus fotos». Si hace falta, un degradado inferior automático solo cuando la foto es clara.

---

## 4. Lo «revolucionario»: dónde está y cómo enseñarlo

Lo que hace distinto a Leogin no es una función (todas las tienen los demás de alguna forma), son **tres posturas**:

1. **No te cobramos por vender.** Sin comisión, en un mercado donde las apps de domicilio se llevan 25–30 %.
2. **Habla como persona.** «Igual que un martes normal», «La PC del local dejó de responder», «Tu menú no tiene lema». Ningún POS de la región escribe así.
3. **Celebra contigo.** Primer pedido, cien pedidos, récord del día. Un sistema administrativo que se alegra es raro y memorable.

La propuesta para que eso «se vea con medio vistazo»:

- **«Pídelo tú mismo»** (EV-01) como centro de la web: es la prueba de las tres a la vez.
- **Que el panel hable en frases**: el bloque de Hoy puede abrir con una oración que Leo dice — «Vas Q1,240, un 12 % arriba de un martes normal. La Rincón Clásica va ganando.» — en vez de tres tarjetas de números. Un dashboard se *lee*; una frase se *entiende*. Es la diferencia entre un tablero de avión y el «todo bien» de un copiloto.
- **El resumen de la noche como algo que se comparte**: el corte de caja ya manda un aviso; convertirlo en una tarjeta bonita («Tu martes: 32 pedidos, Q1,240, tu mejor hora fue las 8») que el dueño quiera mandarle a su socio o subir a historias es publicidad gratis con la marca de Leogin en una esquina.

---

## 5. Orden sugerido

| Orden | Hallazgo | Tamaño | Por qué primero |
|---|---|---|---|
| 1 | EV-01 «Pídelo tú mismo» | Mediano | Vende, enseña y sirve de primeros pasos a la vez. |
| 2 | EV-02 + EV-03 prueba inversa y botón | Mediano (toca cobros: probar contra Postgres real) | Quita la fricción más cara y la promesa rota. |
| 3 | EV-04 primeros pasos en tres | Chico | Reutiliza el pedido de prueba de EV-01. |
| 4 | EV-09 + EV-10 + EV-11 portada | Chico | Solo textos y orden. |
| 5 | EV-12 portada «Directo» con `?mesa=` | Chico | La variante ya existe; es una condición. |
| 6 | EV-05 + EV-06 funciones y Números | Grande | Mueve pantallas; requiere diseño antes. |
| 7 | EV-07 «Hazlo por mí» | Grande | Requiere sacar paleta del logo. |
| 8 | EV-08 «¿Para qué es este aparato?» | Mediano | Mucho ya existe (Modo servicio, Cocina). |
| — | EV-13 | Verificación | Antes de prometer «con tus fotos se ve mejor». |

---

## 6. Pendiente de esta auditoría

- **Pasada visual del panel.** Docker Desktop 4.84 falló al arrancar («initializing Inference manager: … dockerInference: The file cannot be accessed by the system»). Se renombró la carpeta `%LOCALAPPDATA%\Docker\run` a `run.viejo-20261027` (no se borró nada; Docker crea una nueva) y aun así el motor no respondió. Probablemente se arregla reiniciando Windows; después se puede borrar `run.viejo-20261027`. Con Docker arriba, falta recorrer en pantalla Hoy, Pedidos, Menú, Ajustes y Personalizar con Rincón 502 en teléfono y en PC, y confirmar o corregir lo dicho en EV-04 a EV-08.
- **Medir antes de cambiar la portada.** La analítica de la web está apagada; sin ella EV-09 y EV-10 se deciden a criterio.
