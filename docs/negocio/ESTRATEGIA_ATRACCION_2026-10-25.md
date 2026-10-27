# Estrategia de atracción: psicología, ganchos y lo visual (2026-10-25)

**Para qué sirve este documento:** decidir *por qué* un restaurante y un comensal van a querer usar Leogin aunque nadie se lo explique, y *cómo* se tiene que ver, moverse y sonar el sistema para que eso pase. Cubre la web (distleogin.com), el panel del restaurante y el lado del comensal (menú y billetera).

No es un plan de código. Cuando el dueño apruebe una parte, esa parte se convierte en un plan en `docs/planes/`. El prototipo de la intro animada está en [`docs/diseno/intro-animada/`](../diseno/intro-animada/).

---

## Resumen en 30 segundos

1. **Hay que vender lo que el dueño siente, no las funciones.** El dueño no compra un «sistema». Compra control: «que no se me pierda un pedido», «que la caja cuadre», «saber cuánto gano» y «que mi restaurante se vea de primera». La web de hoy habla del sistema. Debería hablar del dolor. **Promesa decidida (2026-10-26): «Tu restaurante, bajo control.»**
2. **El «sí o sí» se construye con tres cosas:** algo gratis que ya es suyo desde el primer día (el menú), un premio que vuelve todos los días (el resumen del día) y una red que crece sola (la billetera del comensal).
3. **«Porque se ve más bonito» es una razón válida.** Lo bonito se percibe como más fácil y de más calidad (efecto estético-usabilidad). Un menú precioso hace que la comida parezca mejor y que el precio duela menos. Hay que decirlo sin pena.
4. **Lo visual tiene dos idiomas:** el *antes* (caos, papel, cuadro por cuadro tipo stop-motion) y el *con Leogin* (fluido y en orden). El contraste entre los dos ya cuenta la historia, sin texto.
5. **Mascota sí, pero con correa:** Leo, la «L» del logo con ojos grandes, cejas, moño de mesero y la bandeja. Vive en los espacios de Leogin (web, panel, billetera, redes) y **nunca** dentro del menú del restaurante, porque ahí la estrella es el restaurante.
6. **El naranja es el color correcto** (análisis en §5.1), con tres condiciones: carbón como ancla de confianza, poco y donde importa, y reglas de contraste y de estados.

---

## 0. La verdad incómoda primero

Lo visual **multiplica**, no reemplaza. Si el dueño nunca ve Leogin, no importa qué tan bonito sea. El [análisis de negocio del 17 de agosto](ANALISIS_NEGOCIO_2026-08-17.md) ya lo dijo: el cuello de botella es el seguimiento después de la visita, no el producto.

Por eso, el primer uso de la intro animada **no es la web**. Es el WhatsApp del día siguiente: *«Don Luis, le dejo el video de un minuto que le comenté»*. Es la excusa perfecta para volver a escribir sin parecer insistente. Todo lo de este documento está pensado para que cada visita deje algo que se pueda reenviar.

---

## 1. A quién le hablamos: tres personas, tres cerebros

| | Dueño del restaurante | Personal (mesero, cocina, caja) | Comensal |
|---|---|---|---|
| **Le duele** | Pedidos perdidos en WhatsApp, errores en cocina, caja que no cuadra, no saber cuánto gana, que le roben | Correr a la cocina, letra que nadie entiende, que lo regañen por errores ajenos | Esperar la carta, esperar al mesero, no saber el precio, dividir la cuenta |
| **Le da miedo** | Que sea complicado, que el personal no lo use, que se caiga el internet, pagar por algo que no usa | Que lo vigilen, no saber usarlo y quedar mal | Descargar otra app, dar sus datos |
| **Quiere sentir** | Control, orgullo, «mi restaurante es de primera» | Que no es su culpa, que va más rápido | Rapidez, antojo, que lo reconozcan |
| **La frase que lo mueve** | «Que ningún pedido se te escape» | «Tu PIN y listo» | «Escanea, pide, disfruta» |

Regla práctica: **el dueño decide, el personal puede sabotear y el comensal le da la razón al dueño.** Si el comensal dice «qué bonito su menú», el dueño ya no lo suelta.

---

## 2. La psicología, principio por principio, y dónde se usa

Cada principio con su explicación en una línea y lo que significa en Leogin. Persuadir sí, engañar no: en un pueblo todos se conocen, y una reseña inventada o un contador falso de «quedan pocas» destruye la confianza para siempre.

### 2.1 Aversión a la pérdida (Kahneman y Tversky, 1979)
Perder duele cerca del doble de lo que alegra ganar lo mismo.
- **Web:** no decir «gana más pedidos», decir *«Cada pedido perdido es dinero que ya era tuyo»*.
- **Panel:** en el plan Básico, el resumen del día puede mostrar lo que se le escapa: *«23 personas vieron tu menú hoy y no pudieron pedir»*. Solo si el dato es real (ver §8).
- **Venta:** *«¿Cuántos pedidos de WhatsApp se le quedaron sin contestar esta semana?»*

### 2.2 El momento «ajá» (tiempo hasta el valor)
La gente decide si algo le sirve en los primeros minutos. Hay que llegar a «¡ese es MI restaurante!» lo antes posible.
- **Venta:** el guion de 90 s ya lo hace bien: el menú del propio dueño en su celular.
- **Web:** en computadora, un QR grande que dice *«Míralo en tu celular»* abre la demo. El ajá ocurre en su mano, no en la pantalla de otro.
- **Idea de función (a evaluar):** *«Tómale foto a tu carta de papel y te la armamos»*. Es el atajo más corto al ajá.

### 2.3 Efecto IKEA y efecto dotación (Norton, Mochon y Ariely, 2012)
Valoramos más lo que ayudamos a construir, y lo que ya es nuestro nos cuesta soltarlo.
- **Registro:** que el dueño elija él mismo colores y estilo en «Tu estilo». Ya existe; hay que celebrarlo con una animación al final: *«Así se ve TU restaurante»*.
- **Lenguaje:** «tu menú», «tus clientes», «tus números». Nunca «el sistema».
- **Plan Básico gratis:** es la mejor herramienta de dotación que hay. Una vez que el menú está en las mesas, ya es suyo.

### 2.4 Efecto estético-usabilidad (Kurosu y Kashimura, 1995)
Lo bonito se percibe como más fácil de usar y más confiable, aunque funcione igual.
- Es la base científica de «el mío es más bonito». Un panel que se ve cuidado da la sensación de que no se va a romper.
- **Efecto halo en el menú:** un menú bonito hace que la comida parezca de mejor calidad, más limpia y que valga lo que cuesta. El dueño compite por percepción, no solo por sabor.

### 2.5 Superioridad de la imagen
Recordamos mucho mejor una imagen que una frase.
- Es la regla de «sin mucho texto». Cada idea de la web debe tener una imagen o animación que la diga sola. Si el texto se borra y la imagen sigue contando la idea, está bien hecha.

### 2.6 Ley de Hick y carga mental
Entre más opciones, más se tarda en decidir y más ganas dan de no decidir.
- **Web:** una idea y un botón por pantalla. La lista de 17 herramientas va escondida detrás de «Ver todo lo que incluye».
- **Panel:** ya se hizo (35 destinos → 6). Mantener esa disciplina en todo lo nuevo.

### 2.7 Regla del pico y el final (Kahneman, 1993)
De una experiencia recordamos el momento más intenso y el último, no el promedio.
- **Comensal:** el pico es *«pedido enviado»* y el final es la pantalla de despedida (puntos ganados, «te avisamos cuando esté listo»). Esos dos momentos merecen la mejor animación del sistema.
- **Dueño:** el pico es *«¡llegó un pedido!»* y el final del día es el cierre de caja. Ahí va la celebración: *«Hoy vendiste Q3,420. Tu mejor martes del mes.»*

### 2.8 Progreso dotado (Nunes y Drèze, 2006)
En un lavado de carros, una tarjeta de 10 sellos con 2 ya puestos se completó el 34 % de las veces. Una de 8 sellos vacía, solo el 19 %. Es el mismo esfuerzo, pero se siente más cerca.
- **Lealtad:** la tarjeta de puntos empieza con sellos regalados (*«Te regalamos los primeros 2»*).
- **Panel:** la lista de «Termina de armar tu restaurante» empieza en 20 % (*«Ya creaste tu cuenta»*), nunca en 0 %.

### 2.9 Gradiente de la meta (Kivetz, Urminsky y Zheng, 2006)
Entre más cerca está el premio, más rápido se avanza.
- **Comensal:** *«Te faltan 2 visitas para tu postre gratis»* con la barra casi llena. Se muestra al final del pedido, que es cuando más pega.

### 2.10 Recompensa variable (Skinner; modelo «Hook» de Nir Eyal, 2014)
Lo que engancha no es el premio, es no saber cuándo llega.
- **Comensal:** de vez en cuando, una sorpresa que configura el restaurante (*«Hoy el postre va por la casa»*). No todos los días: así se arruina.
- **Dueño:** el resumen del día. Cada noche hay algo nuevo que ver: el plato estrella, un récord, una hora pico.

### 2.11 Reciprocidad (Cialdini)
Cuando alguien nos da algo primero, sentimos que le debemos.
- *«Se lo dejo armado hoy, gratis»* no es un descuento: es un regalo. Igual el QR impreso para las mesas. El dueño siente que le debe al menos una conversación más.

### 2.12 Prueba social local
Nos fijamos en lo que hace gente parecida a nosotros. «1,000 restaurantes» no le dice nada a un dueño de Jutiapa. *«La Fonda de doña Mari, a dos cuadras, ya lo usa»* le dice todo.
- Solo con restaurantes reales y con su permiso. Mejor tres vecinos que cien logos.

### 2.13 Exposición repetida y efecto red (Zajonc, 1968)
Lo que vemos seguido nos da confianza. Y lo que usa más gente vale más para todos.
- El comensal ve la «L» chiquita en el QR de cinco restaurantes distintos y empieza a confiar sin saber por qué.
- La billetera convierte eso en red: el restaurante que no está en Leogin **no aparece en el bolsillo de sus clientes**. Para que funcione hay que llenar un pueblo primero (Jutiapa o El Progreso) antes de abrir otro.

### 2.14 Escalera del sí (compromiso y coherencia)
Quien dijo sí a algo chico dice sí a algo grande con más facilidad.
- Ver su menú (sí) → ponerlo en las mesas (sí) → recibir pedidos (Estándar) → mesero y caja (Premium). Nunca pedir el sí grande primero.

### 2.15 Lo que viene puesto (efecto por defecto)
La mayoría se queda con lo que ya viene configurado.
- Todo lo bueno viene encendido: billetera, lealtad con sellos regalados, sonido del pedido. El dueño solo tiene que no apagarlo.

---

## 3. El «sí o sí»: ganchos que no dependen de convencer

Un gancho de verdad funciona aunque nadie explique nada. Lo de abajo está ordenado de lo más barato a lo más ambicioso.

### Para el restaurante

| # | Gancho | Qué siente el dueño | Principio | Estado |
|---|---|---|---|---|
| R1 | **Menú gratis, armado por nosotros, hoy** | «Ya es mío» | Reciprocidad, dotación | Ya se ofrece en el guion |
| R2 | **QR de mesa bonito, impreso con su marca** | «Se ve de cadena grande» | Estética, presencia diaria | Ver `PLAN_TARJETAS_NFC_QR.md` |
| R3 | **El resumen del día** por notificación al cerrar: ventas, plato estrella, récords. En Básico: visitas y plato más visto | «Quiero ver cómo me fue» (todas las noches) | Recompensa variable, pérdida | Nuevo |
| R4 | **«Comparte tu plato del día»**: imagen lista para Instagram o el estado de WhatsApp, con su marca y una «L» chiquita | «Me resuelve las redes» | Reciprocidad, y cada imagen compartida hace publicidad | Nuevo |
| R5 | **Cuentas claras, amistades largas**: anulaciones con motivo y PIN de quien autoriza, caja por turnos, inventario con alertas y costo por plato. Se cuenta sin acusar al personal: lo anotado también protege al empleado honrado | «Por fin tengo control» | Pérdida, necesidad de control | Ya existe; ahora es el paso 4 de la intro |
| R6 | **Tus clientes te llevan en el bolsillo** (billetera) | «Si no estoy, mis clientes no me ven» | Efecto red | En construcción |
| R7 | **«Tu año con Leogin»**: resumen anual para compartir (pedidos, plato estrella, mejor día), estilo Spotify Wrapped | Orgullo | Pico-final, viralidad | Nuevo |

### Para el comensal

| # | Gancho | Qué siente | Estado |
|---|---|---|---|
| C1 | **Sin esperar la carta ni al mesero.** Escanea y ya | «Qué rápido» | Ya existe |
| C2 | **Ves lo que pides:** fotos grandes | Antojo | Ya existe |
| C3 | **Tus puntos de todos tus restaurantes, en un solo lugar** | «Lo mío está guardado» | Billetera, Fase 2 |
| C4 | **«Lo de siempre» en un toque** | «Me conocen» | Billetera, Fase 4 |
| C5 | **Tus alergias, recordadas** | Tranquilidad | Billetera, Fase 3 |
| C6 | **Haz fila desde tu carro:** te avisamos | «No pierdo el tiempo» | Billetera, Fase 5 |
| C7 | **«Tu pepián va saliendo»:** el estado de cada plato en vivo | Confianza, menos ansiedad | Billetera, Fase 6 |
| C8 | **Premio por pedir por el QR** (que configura el restaurante: bebida, postre o el doble de puntos en el primer pedido) | «Me conviene» | Nuevo; encendido por defecto |

### Para el personal

- **Tu PIN y listo.** Cuatro números, nada que recordar.
- **Menos vueltas a la cocina.** La comanda llega sola.
- **Si sale mal, no fue tu letra.** Todo queda escrito, y eso protege al mesero tanto como al dueño.
- **Tus propinas, claras.** Cada quien ve lo suyo.

### Y si no hay un porqué: «porque se ve mejor» también vale

Hay dueños que no tienen el dolor todavía: pocos pedidos, todo en la cabeza. A ellos no se les vende orden, se les vende **orgullo**:

> *«Tu comida se ve buenísima. Tu menú debería verse igual.»*
> *«Los clientes comen primero con los ojos.»*
> *«Que tu restaurante se vea como de cadena grande, por Q0.»*

Esto no es superficial. Es efecto halo (§2.4): un menú bonito sube el precio que el cliente está dispuesto a pagar sin pensarlo.

---

## 4. Los mensajes: menos texto, más golpe

### Reglas
1. **Una idea por pantalla.** Si hay dos, son dos pantallas.
2. **Titulares de 7 palabras o menos.** Con verbo.
3. **Quetzales y números concretos.** «Q0», «0 % de comisión», «hoy mismo». Nunca «bajo costo».
4. **Hablar del resultado, no de la herramienta.** No «pantalla de cocina», sino «la cocina entiende el pedido».
5. **Cero tecnicismos.** Tabla de traducción:

| No decir | Decir |
|---|---|
| Sistema, plataforma, software | Leogin, tu restaurante |
| KDS | Pantalla de cocina |
| PWA, app web | Sin descargar nada |
| Offline, sincronizar | Sin internet sigue vendiendo · se sube solo |
| Dashboard, analítica | Tus números, tu resumen |
| Módulo | Herramienta |
| GMV | Lo que vendes |
| Seguridad RLS, nube | Nadie más ve tus datos |
| Onboarding | Te ayudamos a arrancar |

### La frase de marca (decidida el 2026-10-26)

**Promesa: «Tu restaurante, bajo control.»** El dueño señaló que en su zona el dolor más grande es no tener control: dinero que se va sin saber por dónde, inventario que se acaba sin aviso, caja que no cuadra. Esta frase lo cubre todo, habla del dueño y promete tranquilidad, no funciones.

- **«Pide. Cocina. Cobra.»** pasa a explicar **cómo** se logra ese control (en la intro va debajo de la promesa, más chica).
- «Que ningún pedido se te escape.» queda como mensaje de apoyo para anuncios sobre pedidos.
- «Menos papelitos, más pedidos.» sigue sirviendo para redes y el QR.

### Banco de frases cortas

**Dueño:** Que ningún pedido se te escape · La cocina entiende el pedido · La caja cuadra sola · Si se va el internet, sigues vendiendo · Sin comisión: lo que vendes es tuyo · Tu menú, tan rico como tu comida · Gratis para empezar, hoy mismo · Sabes quién anuló qué.

**Comensal:** Escanea, pide, disfruta · Sin esperar la carta · Tus puntos, en todos lados · Lo de siempre, en un toque · Te avisamos cuando esté listo · Tus alergias, recordadas.

**Personal:** Tu PIN y listo · Menos vueltas · No fue tu letra · Tus propinas, claras.

### Ejemplo: la portada de hoy contra la propuesta

| | Hoy | Propuesta |
|---|---|---|
| Titular | Todo tu restaurante, en un solo sistema. | **Tu restaurante, bajo control.** |
| Bajada | Menú digital con QR, pedidos en línea, pantalla de cocina, panel de mesero, inventario y corte de caja. Una mensualidad fija y cero comisión sobre lo que vendes. | Pedidos, cocina, caja e inventario en tu celular. **Te armamos tu menú hoy, gratis.** |
| Imagen | Maqueta del panel | La intro animada: el caos se ordena solo |
| Botones | Crear mi restaurante gratis · Ver demo en vivo | **Crear mi menú gratis** · Míralo en tu celular (QR) |

La de hoy habla del sistema (funciones). La propuesta habla del dueño (su dolor) y cabe en un vistazo.

---

## 5. Sistema visual

### 5.1 Color: ¿son los correctos para Leogin? (análisis a fondo, 2026-10-26)

**Veredicto: sí. El naranja coral es el color correcto para Leogin.** No por moda, sino porque es el que mejor junta lo que la marca tiene que transmitir. Pero solo funciona con tres condiciones; sin ellas, el naranja se vuelve «barato» o «comida rápida»:

1. **Carbón como ancla de confianza.** El naranja solo atrae; el carbón le da seriedad. Juntos se leen «premium», como el ícono de la app.
2. **Poco y donde importa** (regla 60 · 30 · 10).
3. **Reglas de contraste y de estados** (abajo, con números reales).

La hoja visual con la paleta, el contraste y la prueba de daltonismo está en [`docs/diseno/marca/leo-y-color.html`](../diseno/marca/leo-y-color.html) (página privada: <https://claude.ai/artifact/DFH8bToV8GETyCchubjqRk>).

#### Lo que dice la evidencia, y lo que no

- **Mito:** «el naranja da hambre» o «el azul da confianza» siempre y en todos lados. Los efectos del color dependen del contexto (Elliot y Maier, 2014). No hay un color mágico.
- **Lo que sí está sólido:**
  - **El encaje con la categoría importa más que el color en sí.** La gente juzga si un color «queda» con lo que se vende, y eso pesa más que el color solo (Grossman y Wisenblit, 1999). Bottomley y Doyle (2006) vieron que los productos funcionales piden colores funcionales (como el azul) y los sensoriales y sociales piden colores cálidos (como el rojo). **Leogin vende las dos cosas:** comida (sensorial, social) y control del dinero (funcional). Por eso necesita naranja **y** carbón, no uno solo.
  - **El color cambia la personalidad percibida de la marca.** El tono, la saturación y la claridad mueven la percepción entre «emocionante», «competente» y «sofisticada» (Labrecque y Milne, 2012). Saturado y cálido se lee emocionante y cercano; oscuro se lee sofisticado y serio. Leogin quiere las dos lecturas, cada una en su lugar.
  - **La saturación activa más que el tono.** En emociones, pesan más el brillo (agrado) y la saturación (activación) que el tono en sí (Valdez y Mehrabian, 1994). Brasa y Mango son muy saturados: perfectos para el botón y la celebración, malos para pintar pantallas enteras porque cansan.
  - **Lo distinto se recuerda** (efecto aislamiento o de Von Restorff). Un solo botón naranja en una pantalla neutra se ve y se toca. Si todo es naranja, nada destaca.
  - **La constancia crea memoria** (exposición repetida). El mismo degradado en el ícono, el QR, la intro y la billetera termina siendo «Leogin» sin texto.

#### Qué tiene que sentir cada público

| Público | Emoción buscada | Colores que la logran |
|---|---|---|
| Dueño | Confianza y control; orgullo en los logros | Carbón, blanco, Albahaca para «todo cuadra». Degradado solo en logros (primer pedido, récord). |
| Personal | Calma bajo presión | Neutros. Color solo para el estado de cada pedido, siempre con ícono y palabra. |
| Comensal | Antojo y alegría | Cálidos y fotos grandes, con los colores **del restaurante**. Leogin solo pone su «L» chiquita. |

#### Cada color, uno por uno

| Color | Lo bueno | El riesgo | Veredicto |
|---|---|---|---|
| **Brasa** `#E8534A` (coral) | Energía, apetito, calidez, urgencia amable. Más cercano que un rojo puro. | Se confunde con error; texto blanco encima solo da 3.6 : 1. | Se queda: acción principal, la «L», logros. Nunca para errores ni texto pequeño. |
| **Mango** `#F5A030` | Alegría, sol, maíz, sociabilidad. | Si domina, se ve infantil o barato. Texto blanco encima: 2.1 : 1. | Se queda: celebraciones y «en espera», siempre con texto carbón (8.1 : 1). |
| **Carbón** `#1C1C1E` | Seriedad, control, premium. Es lo que hace que el naranja se vea profesional. | Si se abusa, se ve frío o «tecnológico». | Co-protagonista: ícono, textos grandes, pantalla de cocina. |
| **Masa** `#FBF6EE` | Calidez, hogar, tortilla; menos frío que el blanco puro. | Mal usado, se ve sucio o genérico. | Fondo de la web y de la billetera. El panel sigue en neutros (decisión ya tomada). |
| **Albahaca** `#2F9E6B` | «Listo», «el dinero cuadra», crecimiento. | Se confunde con Brasa en daltonismo; texto blanco encima: 3.4 : 1. | Se queda, con su versión oscura `#23855A` (4.6 : 1) cuando lleva texto blanco. |
| **Terracota oscura** `#B4492A` (nuevo) | Acento legible sobre claro: 5.0 : 1 sobre Masa, 5.3 : 1 sobre blanco. | — | Para texto de acento sobre fondos claros. El Terracota actual `#C2542F` da 4.2 : 1 sobre Masa (no alcanza para texto normal). |

**¿Falta algún color? ¿Azul para la confianza?** No. El azul haría a Leogin «otra app de banco o de tecnología» y enfría la conexión con la comida. La confianza no sale del azul: sale del carbón, de la claridad y de que todo se vea igual siempre.

#### La historia que se puede contar: son los colores de la cocina chapina

| Color | Viene de |
|---|---|
| Brasa | El achiote y el comal encendido |
| Mango | El maíz y la fruta madura |
| Carbón | El comal y el frijol negro |
| Masa | La tortilla recién hecha |
| Albahaca | Las hierbas: chipilín, cilantro |
| Terracota oscura | El barro de las ollas |

Esto convierte una decisión de diseño en un argumento de venta: *«Leogin se ve así porque se ve como tu comida.»*

#### Cuánto de cada uno (60 · 30 · 10)

| Superficie | Base | Apoyo | Acento |
|---|---|---|---|
| Web | Masa o blanco, 60 % | Carbón, 30 % | Brasa y Mango, 10 % |
| Panel | Neutros claros, 70 % | Carbón y grises, 25 % | Brasa, 5 % (solo el botón principal) |
| Billetera (casa de Leo) | Masa, 55 % | Carbón, 25 % | Brasa y Mango, 20 % |
| Menú del comensal | Lo decide el restaurante | — | La «L» chiquita del pie |

#### Contraste: lo que sirve para texto (WCAG)

Para texto normal hace falta 4.5 : 1 y para texto grande (24 px, o 19 px en negrita), 3 : 1.

| Combinación | Contraste | Uso |
|---|---|---|
| Blanco sobre Brasa | 3.6 : 1 | Solo texto grande (botones grandes, titulares) |
| Blanco sobre Mango | 2.1 : 1 | Nunca para texto |
| Carbón sobre Mango | 8.1 : 1 | Cualquier texto |
| Brasa sobre Carbón | 4.7 : 1 | Cualquier texto |
| Mango sobre Carbón | 8.1 : 1 | Cualquier texto |
| Brasa sobre Masa | 3.4 : 1 | Solo texto grande |
| Terracota oscura sobre Masa | 5.0 : 1 | Cualquier texto |
| Blanco sobre Albahaca | 3.4 : 1 | Solo texto grande |
| Blanco sobre Albahaca oscura | 4.6 : 1 | Cualquier texto |

La web ya oscurece el acento para texto con `--brand-accent-ink`; la regla es mantenerlo así. En el prototipo de la intro, la etiqueta «Listo» de la cocina usa blanco sobre Albahaca: al pasarlo al panel real va en `#23855A`.

#### Daltonismo

Cerca de 1 de cada 12 hombres distingue mal el rojo del verde. En la pantalla de cocina, «urgente» (Brasa) y «listo» (Albahaca) se ven casi iguales para ellos. **Regla:** todo estado lleva color + ícono + palabra. La hoja visual tiene la simulación.

#### La categoría

Casi toda la comida tira a cálido: Toast (el sistema para restaurantes más grande de EE. UU.) es naranja; Rappi, DoorDash y PedidosYa van de naranja a rojo; Glovo es amarillo. Eso **confirma** que el naranja pone a Leogin en la categoría correcta sin explicar nada. Por lo mismo, el color solo no lo distingue: lo que es solo de Leogin es **el degradado brasa → mango sobre carbón, y Leo**.

#### Los tres riesgos del naranja y cómo evitarlos

1. **Verse «barato» o de comida rápida.** Pasa cuando rojo, naranja y amarillo saturados llenan superficies grandes. *Evitarlo:* fondos neutros y naranja junto a carbón.
2. **Confundirse con alarma.** *Evitarlo:* los errores van en un rojo distinto y más oscuro (`#C62828`), siempre con ícono y texto. Brasa nunca es error.
3. **Cansar en el panel.** *Evitarlo:* en el panel, el naranja solo va en el botón principal y la marca (≈ 5 %).

### 5.2 Movimiento

El movimiento llama la atención antes que cualquier otra cosa. Por eso se usa **con significado**, nunca de adorno. Cada animación debe responder a una de estas cuatro preguntas:

1. **¿Pasó?** (respuesta): el botón se hunde, el producto salta al carrito.
2. **¿A dónde fue?** (continuidad): el pedido vuela hacia la cocina.
3. **¡Lo lograste!** (celebración): primer pedido, récord del día.
4. **¿Cuánto falta?** (progreso): sellos, barra de «arma tu restaurante».

**Tiempos:**

| Tipo | Duración | Curva |
|---|---|---|
| Respuesta a un toque | 100 – 180 ms | Salida rápida (`ease-out`) |
| Cambio de pantalla | 220 – 360 ms | Suave (`cubic-bezier(.2,.8,.2,1)`) |
| Celebración | 600 – 1,200 ms | Con rebote leve |
| Números que suben | 800 – 1,400 ms | Desacelerando |

**Los cinco movimientos de firma** (siempre iguales, para que se vuelvan marca):
1. **«El pedido vuela»:** al enviar, la tarjeta se encoge y vuela hacia la cocina.
2. **«El ding»:** el pedido nuevo cae con un rebote suave, un sonido y una vibración.
3. **«La caja cuadra»:** al cerrar, los números suben solos. Confeti solo en récords reales.
4. **«El sello»:** el punto se estampa como un sello de goma (aplasta y rebota).
5. **«Listo»:** la palomita se dibuja sola en verde albahaca.

**Reglas de rendimiento:** solo se anima `transform` y `opacity`, para que vaya fluido en un Android barato. Se respeta `prefers-reduced-motion`. En **Tomar pedidos** (el mesero con prisa) nada pasa de 150 ms: ahí la velocidad le gana al encanto.

### 5.3 Estilo «stop-motion» o de papel

Sí se puede hacer, y tiene un uso muy claro: **contar el antes.** El caos de hoy (papelitos, chats, gritos a la cocina) se anima cuadro por cuadro, a 10 cuadros por segundo, con textura de papel y líneas que tiemblan como dibujadas a mano. Cuando aparece Leogin, todo pasa a 60 cuadros por segundo, limpio y fluido.

**El cambio de ritmo cuenta la historia sin palabras:** el antes se siente torpe y el después se siente fácil. Ese es el recurso central de la intro.

- **Dónde sí:** la intro, las redes, las ilustraciones de bienvenida y las pantallas vacías.
- **Dónde no:** en la operación diaria del panel. Ahí todo es fluido y rápido.

### 5.4 Sonido y vibración

- **El «ding» del pedido nuevo es el logo sonoro de Leogin.** El personal lo va a oír cien veces al día, así que tiene que ser alegre (dos notas que suben) y nunca de alarma. Con el tiempo, ese sonido *es* Leogin, como el «ta-dum» de Netflix.
- **Pedido enviado** (comensal): un «pop» suave más una vibración corta en Android.
- Siempre respetar el silencio del aparato y los ajustes de sonido que ya existen («un dueño por sonido»).

### 5.5 Mascota: Leo v2 (2026-10-26)

| A favor | En contra |
|---|---|
| Se recuerda mucho más que un logo (Duolingo, Michelin, Mailchimp) | A un dueño serio le puede parecer infantil |
| Le pone cara amable a los errores y a las pantallas vacías | En el menú le roba protagonismo al restaurante |
| Da contenido para TikTok y los estados de WhatsApp | Una mascota mal hecha es peor que ninguna |

**Veredicto: sí, con reglas.** El dueño aprobó la idea de Leo y pidió que se viera menos simple. La v1 era el logo con ojos. La **v2** toma lo que hace funcionar a mascotas como Duo de Duolingo, sin copiarla:

- **Ojos grandes con brillo, cabeza redonda, brazo y pies cortos.** Es el «esquema infantil» de Konrad Lorenz: esos rasgos disparan la respuesta de «qué tierno» y, con ella, atención y simpatía automáticas.
- **Cejas y boca expresivas.** Las caras se detectan antes que cualquier otra cosa, y las emociones se contagian: cuando Leo celebra un récord, el dueño lo siente suyo.
- **Moño de mesero** (recomendado frente a gorro de chef o nada): dice «servicio» y se entiende aun en 32 px.
- **Volumen** (luz arriba, sombra abajo) para que se sienta como un objeto, no como un dibujo plano.
- **Sigue siendo la «L».** Cabeza ancha y punta recta para que se lea como letra y no como bota. Al final del video se vuelve el logo.

**Ocho expresiones, cada una con su momento:** contento (inicio), ¡hola! (registro), ¡récord! (primer pedido, mejor día), ¿eh? (página no encontrada), orgulloso (resumen del día), sin internet (suda, pero guarda todo), cerrado (duerme) y guiño (redes y sorpresas).

**Personalidad y voz:** servicial, orgulloso de su restaurante, un poco dramático cuando algo sale mal. Frases cortas, de tú, con humor chapín y sin burlarse nunca del dueño. Ejemplos: *«Todavía no hay pedidos. Yo aquí, listo con la bandeja.»*, *«Se fue el internet… tranquilo, yo guardo todo y lo subo solito.»*

**Dónde aparece:** la web, el registro y la bienvenida, las pantallas vacías del panel, las celebraciones, la billetera del comensal, las redes y el material impreso.

**Dónde NUNCA aparece:** dentro del menú del restaurante (solo la «L» chiquita del pie), en momentos de presión (el mesero tomando un pedido) y en errores que cuestan dinero, como un cobro fallido.

El diseño, las expresiones, las variantes y la voz están en [`docs/diseno/marca/leo-y-color.html`](../diseno/marca/leo-y-color.html). Leo v2 está hecho en código (SVG), así que se puede animar y cambiar de expresión en la web y en el panel sin archivos pesados. Antes de imprimirlo o de pasarlo a la app conviene una última pasada de ilustración.

**Actualización (2026-10-27): Leo v3 aplicado.** El dueño eligió la silueta **S2** (pie más largo y campanita en la punta, el «ding» de pedido nuevo hecho dibujo) con los ojos **E1** (blancos con pupila) entre cinco siluetas y cinco pares de ojos ([`leo-v3-propuesta.html`](../diseno/marca/leo-v3-propuesta.html) y [`leo-v3-variantes.html`](../diseno/marca/leo-v3-variantes.html)). Cambia respecto a la v2: ceja derecha siempre alzada, sonrisa con dientes en vez de lengua, dos brazos y **tres niveles de detalle** según el tamaño (completo, compacto y mínimo, con color plano en los chicos). El componente es `plataforma/src/components/leo.tsx` y la intro lleva la misma cara. La campanita no va en la intro: ahí el hueco de la L lo ocupa la bandeja. Sigue pendiente la prueba con gente («¿qué es?») y la pasada de un ilustrador.

---

## 6. Qué cambia en cada lado

### 6.1 Web (distleogin.com)
**Hecho (2026-10-26):** titular «Tu restaurante, bajo control.» y, al lado, una tarjeta con el gancho («¿Sabes cuánto dinero se te fue hoy?») que abre la intro de 54 s en una ventana: horizontal en computadora, vertical en el celular, con sonido. La intro se sirve en la ruta `/intro` con el nonce de la CSP; GSAP, el sonido (Opus) y la imagen de la tarjeta viven en `plataforma/public/intro/`. Se regenera con `node docs/diseno/intro-animada/publicar-en-web.mjs` cada vez que cambie `intro.html`. Lo de abajo queda como propuesta:

- **Portada:** la intro animada en bucle corto (6 a 8 s, sin sonido) más un botón *«Míralo en 1 minuto»* para la versión completa. Es animación en código, no video pesado: carga al instante con datos móviles.
- **Cinco pantallas, no quince:** dolor → cómo funciona (3 pasos animados) → vecinos que ya lo usan → precio (Gratis) → botón. La lista completa de herramientas se abre aparte.
- **En computadora:** QR grande de *«Míralo en tu celular»*.

### 6.2 Panel del restaurante
- **«Termina de armar tu restaurante»** con barra que arranca en 20 % (§2.8). Leo señala el siguiente paso.
- **El primer pedido es una fiesta:** pantalla especial, una sola vez en la vida del restaurante. Es el pico que el dueño le va a contar a otros.
- **Resumen del día** al cierre (R3).
- **Pantallas vacías con Leo** en lugar de «No hay datos».
- **Hitos:** 100 pedidos, primer mes, mejor día. Con medida: si se celebra todo, nada importa.

### 6.3 Comensal (menú)
- El protagonista es el restaurante: fotos grandes, sus colores.
- **La rapidez es la mejor animación:** que abra al instante y con esqueletos de carga, nunca una pantalla en blanco.
- **El pico:** «pedido enviado» con el movimiento de firma, sonido y vibración.
- **El final:** puntos ganados con el sello, *«te faltan 2»* y *«te avisamos cuando esté listo»*.

### 6.4 Billetera
- Aquí sí vive Leo: es la casa de Leogin para el comensal.
- Los restaurantes como tarjetas de una billetera de verdad, con sellos que se estampan.

---

## 7. La intro animada (el video)

**Prototipo:** [`docs/diseno/intro-animada/intro.html`](../diseno/intro-animada/intro.html), publicado también como página privada en <https://claude.ai/artifact/2RKxg6ZbKPSn7ese84Xn8f> (para compartirla hay que darle acceso desde su menú «Compartir»). Formato 16:9 y 9:16, capítulos y **banda sonora de marimba** que suena en la página al tocar «Sonido».

**Grabarlo como video y sonido** (usa el Playwright y el ffmpeg que ya trae `plataforma/`; sale en la carpeta temporal y al final imprime las rutas; con `--carpeta` se elige otra fuera del repo):

```bash
node docs/diseno/intro-animada/grabar-video.mjs --formato h
node docs/diseno/intro-animada/grabar-video.mjs --formato v
```

Cada corrida deja el video WebM (sin audio) y la banda sonora `intro-leogin-sonido.wav`, que empieza en el mismo segundo. El ffmpeg de Playwright no maneja audio. Si hay un `ffmpeg` completo en el PATH, el script arma además el **MP4 con sonido** para WhatsApp. Si no, en Clipchamp (viene con Windows 11) se ponen el WebM y el WAV en el segundo 0 y se exporta el MP4.

### Concepto: «Del caos al orden»
Dos idiomas visuales: el antes cuadro por cuadro, como papel recortado, y el después fluido. No hace falta voz para entenderlo.

### Guion actual: versión «Las tres fugas» (54 s, 2026-10-26)

**Por qué cambió.** En la versión anterior («control», 51 s) el cuerpo enseñaba el camino del comensal: escanea, pide desde la mesa, la cocina lo ve. El dueño notó que «Pide desde la mesa» era lo más flojo, porque cualquier menú QR lo hace. Ahora el cuerpo **cierra, una por una, las tres fugas que abre el gancho**, y la libreta de la cuenta de hoy se queda en pantalla tachándolas: Q295 → Q210 → Q90 → Q0. Después vienen lo que solo Leogin junta (cliente en vivo, sin internet, domicilio, lealtad) y la noche en la que ya no se fue nada. Solo sale lo que ya funciona: la impresión por estación (sin publicar), la factura electrónica FEL (apagada) y los porcentajes de comisión de la competencia se quedan fuera.

| Tiempo | Imagen | Texto en pantalla |
|---|---|---|
| 0 – 5.4 s | Desde el primer cuadro: teléfono sonando, chat lleno, comandas, «¡se acabó el queso!», «¿quién anuló esto?», la caja que no cuadra; la cámara tiembla | «¿Sabes cuánto dinero **se te fue** hoy?» |
| 5.4 – 8 s | Todo se congela; la cámara se clava en la comanda de la Mesa 4, que se cae; latido. Una libreta suma las fugas | «La cuenta de hoy (ejemplo): pedido perdido Q85 · la caja no cuadró Q120 · queso que nadie anotó Q90 → **Hoy se te fueron Q295.** Al mes, unos Q8,850.» |
| 8 – 12 s | Leo cae, el golpe barre el papel y entra la luz; despierta, mira a cámara y saluda | «Respira. Esto es Leogin.» |
| 12 – 17.5 s | Mesa (QR), WhatsApp, teléfono, mesero y domicilio caen en una sola lista; un solo «ding» y las comandas salen impresas. En la libreta se tacha Q85 | «Fuga 1 · Pedidos perdidos» · «Ningún pedido se **pierde.**» + «Esta vez, la **Mesa 4** sí comió.» |
| 17.5 – 21 s | El celular del cliente: Recibido → En cocina → ¡Listo!; le llega el aviso y la burbuja «¿Ya viene mi pedido?» se tacha | «Para tu cliente» · «Ve su pedido **en vivo.**» |
| 21 – 26.5 s | La caja: anular la Mesa 2 pide motivo y el PIN del encargado; el corte del turno da diferencia Q0.00, se estampa «Caja cuadrada» y Leo celebra. Se tacha Q120 | «Fuga 2 · La caja» · «La caja **cuadra.**» |
| 26.5 – 32 s | Se vende una Doble Bacon: la hamburguesa se desarma y cada ingrediente baja su renglón del inventario; «Queso: quedan 2 kg · pide hoy» y «+Q39 te deja cada plato». Se tacha Q90 y la cuenta queda en Q0 | «Fuga 3 · El inventario» · «Cada venta descuenta **lo que gastaste.**» |
| 32 – 35.5 s | Se va el internet: la caja sigue guardando pedidos e imprime la comanda; vuelve la señal y todo sube solo | «Si se va el internet» · «Tú **sigues vendiendo.**» |
| 35.5 – 40 s | El cliente marca su casa en el mapa, el envío de su zona (Q15) se suma solo y el repartidor sale por la ruta | «A domicilio» · «El domicilio, **sin enredos.**» · «…y el envío se cobra solo. Y sin comisión.» |
| 40 – 43 s | Billetera: el sello se estampa | «Y tus clientes **vuelven.**» |
| 43 – 47 s | La libreta llega a Q0 y suelta confeti; Leo voltea el letrero a CERRADO, apaga la luz y se duerme | «9:00 p. m.» · «Hoy no se te fue **nada.**» · «La caja cuadró, el inventario está al día y tú, ya en tu casa.» |
| 47 – 54 s | Leo guiña y se vuelve el logo | «**Tu restaurante, bajo control.**» · Pide. Cocina. Cobra. · «Te armamos tu menú hoy, gratis.» · QR |

Los montos de la libreta son un **ejemplo** y así lo dice en pantalla: sirven para que el dueño haga su propia cuenta, no son una estadística.

**El mesero no es el villano:** en la fuga 1 su tablet es uno de los cinco canales que llegan a la lista, igual que el QR o el WhatsApp.

**El restaurante del video es Rincón 502** (desde el 2026-10-26; antes era «La Ceiba», de cocina chapina): el mismo de la demo en vivo y de la web, con su carta de hamburguesas y pizzas, su menú oscuro con coral y las mismas ilustraciones de los platillos. Ver [`PLAN_EXPERIENCIA_VIVA_2026-10-26.md`](../planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md) §7.

**Formatos:** horizontal 16:9 (web) y vertical 9:16 (WhatsApp, TikTok, Reels). El vertical es el más importante para este mercado.

### Cortes para redes: 30 s y 15 s (2026-10-26)

Los cortes no son videos aparte: son **listas de edición** sobre la misma animación (en `intro.html`, `CUTS`). Cada una toma tramos de la versión completa, acelera algunos y esconde los saltos con un barrido. Si se cambia algo de la animación, los tres cortes lo heredan. La música se compone para cada duración y **los cortes caen en el pulso** (cada medio segundo desde el golpe de Leo), así que el ritmo nunca se rompe.

**Reels y TikTok · 30 s (30.2 s).** Las tres fugas, el domicilio y la noche; se quita lo que no cierra una fuga:

| Tiempo | Tramo de la completa | Qué cuenta |
|---|---|---|
| 0 – 7.6 s | 0 – 7.6 s | Gancho, caos y la cuenta de lo que se fue |
| 7.6 – 10.7 s | 7.85 – 10.95 s | Leo cae, despierta y se presenta |
| 10.7 – 14.2 s | 12 – 16.9 s, a 1.4× | Fuga 1: todo cae en una sola lista y se tacha Q85 |
| 14.2 – 17.7 s | 21 – 25.95 s, a 1.4× | Fuga 2: anular con PIN, «Caja cuadrada» y se tacha Q120 |
| 17.7 – 21 s | 26.5 – 31.05 s, a 1.4× | Fuga 3: el inventario baja solo, se tacha Q90 y la cuenta queda en Q0 |
| 21 – 23.6 s | 35.5 – 39.6 s, a 1.6× | El domicilio: el mapa, el envío que se cobra solo y el repartidor que llega |
| 23.6 – 25.8 s | 43 – 46.6 s, a 1.6× | Tu noche: Q0 con confeti, CERRADO y Leo se duerme |
| 25.8 – 30.2 s | 47 – 51.4 s | Guiño, logo, la promesa y el regalo |

Fuera quedan el pedido en vivo del cliente, «sin internet» y la billetera.

**Estado de WhatsApp · 15 s (14.9 s).** La historia mínima: se te va el dinero, llega Leo, se tachan las tres fugas y la cuenta queda en Q0.

| Tiempo | Tramo de la completa | Qué cuenta |
|---|---|---|
| 0 – 2.5 s | 0 – 2.5 s | La pregunta y el caos |
| 2.5 – 4.75 s | 5.35 – 7.6 s (salto seco, sin barrido) | Se congela y la libreta suma Q295 |
| 4.75 – 7.75 s | 7.95 – 10.95 s | Llega Leo |
| 7.75 – 10.15 s | 15.95 – 16.75 s · 25.35 – 26.15 s · 30.35 – 31.15 s | Las tres fugas se tachan una tras otra: la lista, la caja cuadrada y la ganancia por plato |
| 10.15 – 10.95 s | 43.4 – 44.2 s | La cuenta en Q0 con confeti |
| 10.95 – 14.9 s | 47 – 51.35 s, a 1.1× | Guiño, logo, la promesa y el regalo con el QR |

**Por qué así:**
- **Mismo gancho en los tres.** Lo que decide si alguien sigue mirando son los primeros 3 segundos; eso no se recorta nunca.
- **El problema y la solución siempre se tocan.** Aun en 15 s, la libreta dice cuánto se fue y la misma libreta termina en Q0: principio, problema y final con un solo objeto.
- **Menos es más en redes.** Un video corto se ve completo más veces, y el final con el regalo es lo que lleva a la acción.
- **Para grabarlos:** `node docs/diseno/intro-animada/grabar-video.mjs --corte 30 --formato v` (o `--corte 15`). Cada uno deja su WebM y su WAV (`intro-leogin-sonido-30s.wav`, `-15s.wav`).

### Voz (opcional)
La mejor voz es la del dueño de Leogin, con su acento: la confianza local vale más que una voz de locutor. Guion de voz para la versión de 54 s (entra sobre la música):

> «¿Sabes cuánto dinero se te fue hoy? … Respira. Con Leogin ningún pedido se pierde: mesa, WhatsApp, teléfono o domicilio, todo cae en una sola lista. La caja cuadra. Y cada venta descuenta del inventario lo que gastaste. Aunque se vaya el internet, sigues vendiendo. Y a las nueve, hoy no se te fue nada. Leogin: tu restaurante, bajo control. Te armamos tu menú hoy, gratis.»

### Qué se puede hacer desde aquí y qué no
- **Sí:** animación en código (movimiento de marca, personaje 2D, efecto stop-motion simulado, cámara virtual, tipografía cinética), música y efectos sintetizados (la marimba también es código), y grabar todo como video y WAV.
- **No:** grabar video real, voz humana o música con licencia, ni stop-motion con objetos físicos. Eso último sí se puede combinar: si alguien toma fotos cuadro por cuadro de comandas reales sobre una mesa, se montan con la animación.

### ¿El video atrapa clientes? Primera evaluación (2026-10-26)

La primera versión (62 s) atrapaba a quien ya la estaba mirando, sobre todo a un dueño que vive ese caos, pero no a quien va pasando en redes.

| # | Principio | Versión 1 | Versión 2 (51 s) |
|---|---|---|---|
| 1 | Gancho en los primeros 3 s | Débil: papel casi vacío | **Arreglado:** pregunta que duele y caos desde el cuadro 0 |
| 2 | «Ese soy yo» (identificación) | Fuerte | Fuerte |
| 3 | Dolor concreto (aversión a la pérdida) | Fuerte | Más fuerte: la cámara se clava en la Mesa 4 y suena un latido |
| 4 | Alivio por contraste | Fuerte | Más fuerte: la música entra justo cuando Leo aterriza |
| 5 | Personaje con emoción | Fuerte con Leo v2 | Además mira a cámara y guiña |
| 6 | Claridad del «cómo» | Fuerte | Fuerte, con la palabra clave de cada paso resaltada |
| 7 | Duración y ritmo | Mejorable: 62 s, parte media lenta | **Mejor:** 51 s, un cambio visual cada 1 a 3 s, barridos entre pasos |
| 8 | El dueño como protagonista | Faltaba | **Arreglado:** «Tú, ya en tu casa» |
| 9 | Prueba social | Falta | Falta (no hay clientes reales todavía) |
| 10 | Llamado a la acción | Bueno | **Mejor:** «Te armamos tu menú hoy, gratis» |
| 11 | Sonido | Solo efectos sueltos | **Banda sonora completa de marimba** |
| 12 | Final memorable | Bueno | Bueno, con guiño y golpe de cámara |

### Más dinámico y más atrapante: psicología y marketing (2026-10-26)

El dueño preguntó si el video podía ser más dinámico o si ya estaba en su punto. **Sí se podía, pero con método:** «más rápido» a secas cansa y baja la confianza. Lo que se aplicó, principio por principio:

1. **El gancho decide todo.** En redes, la gente decide en uno a tres segundos si sigue mirando. Un gancho que funciona combina movimiento desde el cuadro 0, texto grande y una pregunta que toca una pérdida propia. → *«¿Cuántos pedidos se te perdieron hoy?»* con el teléfono ya sonando, y la palabra «perdieron» subrayada en rojo.
2. **Romper el patrón cada pocos segundos.** El cerebro deja de atender lo que no cambia (habituación) y vuelve a atender ante cualquier novedad (reflejo de orientación). → Cámara virtual: temblor de cámara en mano en el caos, acercamientos lentos en cada escena, golpes de cámara en los momentos pico y barridos con desenfoque entre pasos. Hay un cambio visible cada 1 a 3 segundos.
3. **Dejar una pregunta abierta** (vacío de curiosidad, Loewenstein, 1994; efecto Zeigarnik). Lo que queda sin cerrar mantiene la mirada hasta que se cierra. → La Mesa 4: su pedido se pierde en el segundo 6 y se cierra en el 16 con *«Esta vez, la Mesa 4 sí comió.»* Y la libreta de Q295 queda abierta en una esquina hasta llegar a Q0 (versión «Las tres fugas»).
4. **Ritmo musical.** Los cortes que caen al compás se sienten más fluidos y con más energía, y la música sube la activación y el recuerdo. → Banda sonora a 120 pulsos por minuto: el caos no tiene ritmo, solo zumbido y reloj; el ritmo entra en el golpe de Leo y los cambios de paso caen en el pulso.
5. **Sonido con identidad.** La marimba es Guatemala en un segundo: lo familiar se siente cercano y confiable (exposición repetida e identidad cultural). Y el «ding» de dos notas queda como logo sonoro. → La música es de marimba, con trémolo como la marimba chapina.
6. **Arco emocional: problema, agitación, solución y transformación.** El congelado con latido agita el dolor, Leo lo resuelve y «Tu noche» muestra la transformación que el dueño sí siente: tiempo y tranquilidad.
7. **Mirada a cámara.** Unos ojos que nos miran capturan la atención más que cualquier otro estímulo. → Leo mira a cámara al presentarse y guiña al final.
8. **Picos marcados** (regla del pico y el final). → El «ding» de la lista, el «¡Listo!» del cliente, el sello de «Caja cuadrada», cada fuga tachada, la cuenta en Q0 y el logo llevan golpe de cámara, destello o confeti, y sonido. El final cierra con un regalo concreto.
9. **Llamado con reciprocidad, inmediatez y concreción.** → *«Te armamos tu menú hoy, gratis.»*
10. **Dinámico no es caótico** (fluidez de procesamiento). Lo que se entiende sin esfuerzo se siente más confiable. Por eso el caos se queda solo en el «antes»: el «después» tiene ritmo, pero cada pantalla dice una sola cosa. Para un dueño que va a confiarle su caja, el sistema tiene que verse en control.

**¿Hasta dónde subir la intensidad?** Este es un buen punto para un público de dueños. Más cortes o más efectos harían que el «después» se sintiera tan agitado como el «antes», que es justo lo que se vende como resuelto.

**Lo que queda pendiente:**

- ~~**V4 · Cortes para redes**~~: hechos el 2026-10-26 (ver «Cortes para redes» arriba).
- **V5 · Voz:** la del dueño de Leogin, sobre la música, en Clipchamp.
- **V6 · Prueba social:** en cuanto haya un restaurante real, 3 s con su nombre y su zona.
- **Medirlo:** subir dos versiones del gancho como estado de WhatsApp o anuncio y quedarse con la que retenga más a los 3 segundos.

---

## 8. Cómo saber si funciona

| Lado | Qué medir |
|---|---|
| Web | Cuántos ven la intro completa, clics en «Crear mi menú gratis», minutos hasta tener el menú en vivo |
| Venta | Respuestas al WhatsApp de seguimiento con video contra sin video (anotarlo en `SEGUIMIENTO_PROSPECTOS.xlsx`) |
| Panel | Cuántos completan «Termina de armar», días activos por semana, cuántos abren el resumen del día |
| Comensal | Pedidos por QR contra pedidos por mesero, cuántos vuelven en 30 días, cuentas en la billetera |

⚠️ Hoy la analítica de la web está **apagada por decisión** (auditoría de pulido, 2026-10-02). Para medir lo de la web hay que decidir antes qué se enciende y cómo, sin rastrear de más. El ejemplo de R3 («23 personas no pudieron pedir») solo se puede decir si ese dato se mide de verdad.

---

## 9. Orden sugerido (sin pisar el trabajo en curso)

| Fase | Qué | Código |
|---|---|---|
| **A** | Mensajes nuevos en el guion de venta y la intro como video para el WhatsApp de seguimiento | Ninguno: se usa ya |
| **B** ✅ | Portada nueva de la web con la intro animada y los mensajes de §4. **Hecha el 2026-10-26** (rama `feat/portada-bajo-control`): titular «Tu restaurante, bajo control.», tarjeta con el gancho que abre la intro de 54 s y el menú de ejemplo movido a «Dos lados, un sistema» | Solo la web pública |
| **C** ✅ | Momentos pico: primer pedido, pedido enviado, cierre de caja y «el ding». **Hecha el 2026-10-26** (rama `feat/momentos-pico`) | Panel y menú |
| **D** ✅ | Leo en las pantallas vacías, la bienvenida y la billetera. **Hecha el 2026-10-26** | Panel y billetera |
| **E** ✅ | Ganchos con datos: resumen del día, «Comparte tu plato del día», «Tu año con Leogin» y premio por pedir por QR. **Hecha el 2026-10-26** con los datos que ya se guardan; medir la web sigue esperando decisión (§8) | Panel, menú y web |

Cada fase, cuando se apruebe, se vuelve un `PLAN_*.md` en `docs/planes/`. Las fases C, D y E, junto con lo pendiente de la web (§6.1) y del menú (§6.3), viven en [`PLAN_MOMENTOS_PICO_2026-10-26.md`](../planes/PLAN_MOMENTOS_PICO_2026-10-26.md).

**2026-10-26:** el dueño pidió que navegar se sienta vivo en todo Leogin (web, menú y panel), que la gente descubra cuánto puede diseñar su menú y que Rincón 502 sea el único restaurante de ejemplo. Eso vive en [`PLAN_EXPERIENCIA_VIVA_2026-10-26.md`](../planes/PLAN_EXPERIENCIA_VIVA_2026-10-26.md).

---

## Decisiones pendientes del dueño

- [x] Frase de marca: **«Tu restaurante, bajo control.»** (2026-10-26). «Pide. Cocina. Cobra.» explica el cómo.
- [x] Titular de la portada: «Tu restaurante, bajo control.» (2026-10-26), para cuando se haga la Fase B.
- [x] ¿Mascota Leo? Sí: al dueño le encantó la idea y pidió que se viera menos simple (2026-10-26). Hecho: Leo v2.
- [ ] ¿Leo v2 con moño de mesero? (Recomendado frente a gorro de chef o sin accesorio.)
- [ ] ¿Nombres de la paleta (Brasa, Mango, Carbón, Masa, Albahaca) y la nueva Terracota oscura?
- [x] Mejoras del video V1, V2 y V3: aplicadas el 2026-10-26, junto con cámara virtual, tipografía cinética, la historia de la Mesa 4 y banda sonora de marimba.
- [x] Cortes de 30 y 15 s para redes (V4): hechos el 2026-10-26.
- [ ] ¿Voz propia sobre la música (V5)?
- [ ] ¿Voz en el video: la propia o ninguna?
- [ ] ¿Qué fase arranca primero? (Recomendada: A, porque no toca código y ayuda a vender esta semana.)
