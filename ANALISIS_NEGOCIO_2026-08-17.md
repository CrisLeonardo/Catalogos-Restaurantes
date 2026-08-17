# Leogin — análisis honesto del negocio, precios y camino a seguir

**Fecha: 2026-08-17.** Encargo: (1) ¿vale la pena seguir tocando puertas?, (2) ¿Q599 es
buen precio o hay que bajarlo a Q349?, (3) opinión sobre construirlo con IA y vivir de eso.

Este análisis está hecho contra la evidencia real de tu carpeta —
`PRECIOS_VIGENTES.md`, `SEGUIMIENTO_PROSPECTOS.xlsx`, `Cotizador.xlsx`,
`GUION_DEMO_90S.md`, `MANEJO_DE_OBJECIONES.md`, los dos análisis de competencia,
el historial de git y el código— más precios de mercado verificados hoy.

---

## Resumen en 30 segundos

1. **Sí vale la pena seguir.** El producto no es el problema. 5 "no" no es una
   muestra: es el calentamiento. El benchmark del sector es ~1,000 contactos en
   frío por 1 cliente cerrado.
2. **Q599 no está caro.** Está en la mitad-alta del mercado y por función es
   competitivo. **Bajar a Q349 sería un error** y abajo está el porqué con números.
3. **El problema real no es el precio: es el seguimiento.** Después de 5 visitas
   tenés cero objeciones anotadas y cero seguimientos programados. Ese es el
   agujero, y es el más barato de tapar.
4. **Que esté hecho con IA está bien.** Lo que importa no es quién escribió el
   código sino quién responde cuando falla. Sos vos, y tus auditorías demuestran
   que lo estás tratando como tuyo. Eso es lo que lo hace legítimo.

---

## 1. Lo que tenés realmente (la parte buena, con evidencia)

No es un prototipo. Los números del repositorio:

| Métrica | Valor |
|---|---|
| Líneas de código fuente (`.ts`, `.tsx`, `.sql`, `.rs`) | **98,629** en 606 archivos |
| Commits | **252** entre junio y agosto 2026 |
| Migraciones SQL en producción | ~100 |
| Auditorías de seguridad documentadas | 6 (jun 9, jun 12, jun 27, jul 2, jul 3, jul 29) |
| Componentes independientes | plataforma web + agente de impresión + app de escritorio (Tauri) |

Y hay ventajas reales, no de folleto —tu propio análisis del 4 de agosto las
verificó contra el código, no contra la landing:

- **Modo offline de verdad** (outbox + hub LAN + agente de impresión propio).
  OlaClick no tiene evidencia pública de esto. En Jutiapa, donde el internet se
  cae, esto no es un detalle técnico: es la diferencia entre vender y no vender.
- **Personalización visual profunda** por restaurante. Nadie del segmento masivo
  puede igualarla sin dejar de ser masivo.
- **Profundidad operativa**: recetas con costeo automático, kardex de costo
  promedio ponderado, reparto de propinas, multi-sucursal con panel de grupo.
- **RLS probada tabla por tabla, RBAC de 22 secciones, PIN de personal.**

Traducción comercial: construiste algo que compite en funciones con productos
que cobran USD 79–130 al mes. Eso es un hecho, no un consuelo.

---

## 2. Los 5 "no" — qué significan en realidad

### La estadística

Los benchmarks de venta B2B en frío para software (2026):

| Etapa | Tasa típica |
|---|---|
| Lista fría → reunión | **1.5 – 2%** |
| Conversación → reunión | 4.6% (promedio), 15%+ los mejores |
| Intentos para siquiera *alcanzar* a un prospecto | **~8** |
| Embudo completo | ~1,000 contactos → ~1 cliente cerrado |
| Referido / introducción tibia | 15 – 25% (10x mejor que frío) |

Con 5 visitas en frío, el resultado estadísticamente esperado es exactamente el
que tuviste: **cero**. No es una señal sobre tu producto ni sobre tu precio. Es
lo que le pasa a todo el mundo en las primeras cinco puertas.

Si querés una regla realista para tu caso: con un producto bueno, venta local
en persona y un mercado que te conoce, la primera venta suele aparecer entre la
visita **20 y la 40**. Vas en la 5.

### La parte que sí debería preocuparte (y no es el rechazo)

Abrí `SEGUIMIENTO_PROSPECTOS.xlsx`. Los 10 prospectos siguen marcados
**"Por visitar"**, y las columnas *Objeción principal*, *Próximo paso* y
*Estado* están vacías.

Eso significa que **5 visitas produjeron cero información.** No sabés si te
dijeron que no por el precio, por el FEL, porque no tienen tablet, porque el
dueño no estaba, o porque simplemente lo dejaron para después. Estás a punto de
tomar una decisión de precio —bajar 42%— sin un solo dato que la respalde.

Y hay algo más, dicho con cariño pero directo: **"ya no llamaron" no es un
rechazo, es la ausencia de un seguimiento.** En venta a negocios pequeños el
prospecto **nunca** llama de vuelta. Nunca. Ni cuando le interesa. El vendedor
vuelve 5–8 veces. Si el benchmark dice que hacen falta ~8 intentos solo para
*alcanzar* a alguien, un intento y esperar el teléfono no es un embudo: es una
rifa.

### El desbalance de fondo

En 2.5 meses hiciste 252 commits, 95 documentos markdown (~986 KB de
documentación) y 6 auditorías. Y 5 visitas de venta.

Eso no es pereza —es lo más humano del mundo. Programar da resultados visibles
y no duele; tocar puertas da rechazo y es incómodo. Pero la incertidumbre real
de tu negocio hoy no está en el código: está afuera. Cada semana que pasa
puliendo el producto es una semana en la que no aprendés lo único que te falta
saber, que es **por qué la gente no compra.**

---

## 3. El precio, contra el mercado real (verificado hoy)

Tipo de cambio de referencia: **USD 1 ≈ Q7.62** (agosto 2026).

| Producto | Precio | Qué incluye / notas |
|---|---|---|
| **OlaClick** | **Gratis** en la base, sin comisión por pedido | 120,000 negocios en 27 países. Respaldado por Meta, Google y Y Combinator. Bot de WhatsApp con IA, pagos integrados, logística de delivery |
| **Vendty (Guatemala)** | **Q315/mes** Emprendedor (pago mensual) · **Q173/mes** Profesional · **Q254/mes** Empresarial (los dos últimos con pago anual) | **FEL integrada con Digifact**, tienda en línea con pagos, versión de escritorio offline, módulo de delivery, integración Rappi |
| **Fudo** | USD 39 / 79 / 130 por sucursal (≈ **Q297 / Q602 / Q991**) | Menú QR se cobra aparte (USD 15–25), reservas aparte (USD 20–30), onboarding USD 100–300 |
| Promedio del sector LatAm | Básico ≈ USD 35 (**Q267**) · Avanzado USD 50–60 (**Q381–457**) | Referencia de comparadores regionales |
| **Leogin Estándar** | **Q299** (≈ USD 39) + Q300 alta | 2 de 3 canales, finanzas, corte de caja |
| **Leogin Premium** | **Q599** (≈ USD 79) + Q300 alta | 3 canales, panel de mesero, personalización total, **7 de 9 módulos incluidos** |

### El veredicto honesto sobre Q599

**No está caro. Está bien puesto, y por función incluso está barato.**

Fudo cobra USD 79 (≈Q602) por su plan Professional y encima te cobra el menú QR
(hasta USD 25) y las reservas (hasta USD 30) por separado. Tu Premium cuesta
prácticamente lo mismo e incluye siete módulos que ellos facturan aparte. Si
comparás función por función, Leogin Premium vale más de lo que cobra.

**Pero hay un competidor que sí te incomoda, y no es OlaClick: es Vendty.**

Vendty está en Guatemala, cobra Q254–315 —la mitad que tu Premium— e incluye
**facturación electrónica funcionando con Digifact**. Tu FEL calcula el DTE pero
no transmite: hoy no tiene validez ante SAT. Si un restaurante formal los pone
lado a lado en una hoja, Vendty gana en precio *y* en un requisito legal
obligatorio.

Eso no significa que tu precio esté mal. Significa que **Q599 solo se sostiene
si vendés lo que Vendty no puede vender: que vos llegás en persona, se lo dejás
instalado, lo personalizás con su marca, y le contestás el teléfono un sábado a
las 8 de la noche.** Ese es tu producto real. El software es el vehículo.

### Y hay un número que estás subestimando

El dueño no escucha "Q599". Escucha **Q899** — Q599 del primer mes más Q300 de
alta. Ese es el número que le sale de la bolsa el día que dice que sí, y es casi
seguro un obstáculo más grande que la mensualidad. Volvé a mirar esto en la
sección 4.

---

## 4. Por qué bajar a Q349 es probablemente un error

Entiendo perfectamente el razonamiento: "no tengo clientes, si bajo vendo más
por volumen y termino ganando más". Es intuitivo. Pero no aguanta los números.

### Razón 1 — Ya hiciste este experimento, y no funcionó

De tu propio `PRECIOS_VIGENTES.md`:

- 14 de julio: Estándar **Q399 → Q299** (−25%), Premium **Q749 → Q599** (−20%)
- 22 de julio: Básico **Q149 → gratis**

Ya bajaste los precios hace un mes. **¿Cuántos clientes trajo?** Cero. Acabás de
correr el experimento "bajar precio" y el resultado fue nulo. Bajar otra vez es
repetir un experimento que ya falló, esperando un resultado distinto.

### Razón 2 — 0 × Q599 y 0 × Q349 son el mismo número

Bajar el precio de algo que nadie compró no produce compradores. El precio solo
es el obstáculo cuando *ya* hay alguien que quiere el producto y no le alcanza.
Vos no sabés si estás en ese caso, porque —como vimos— la columna de objeciones
está vacía.

### Razón 3 — La matemática del volumen te sale al revés

Para ganar lo mismo a Q349 que a Q599 necesitás **1.72× más clientes**:

| Escenario | Clientes | Ingreso/mes | Instalaciones que hacés | Soportes que atendés |
|---|---|---|---|---|
| Q599 | 10 | Q5,990 | 10 | 10 |
| Q349 | **18** | Q6,282 | **18** | **18** |
| Q599 | 30 | **Q17,970** | 30 | 30 |
| Q349 | **52** | Q18,148 | **52** | **52** |

Mismo dinero, **73% más trabajo**. Y vos sos una persona. El ingreso escala con
el precio; el soporte, las capacitaciones y las visitas escalan con la cantidad
de clientes. Para un negocio de un solo dueño, más clientes baratos es
estrictamente peor que menos clientes caros.

Peor aún: conseguir 52 restaurantes que paguen en Jutiapa y alrededores es un
objetivo mucho más difícil que conseguir 30. No estás cambiando dinero por
facilidad — estás cambiando dinero por *más* dificultad.

### Razón 4 — Destruye información y es casi irreversible

Si bajás ahora, nunca vas a saber si el precio era el problema. Y subir precios
después, con clientes ya adentro, es una de las conversaciones más difíciles que
existen. El precio es fácil de bajar y carísimo de recuperar.

### Razón 5 — Contra "gratis" no ganás bajando

OlaClick cuesta Q0. Si tu estrategia es competir por precio, la pelea ya está
perdida antes de empezar: no podés bajar por debajo de gratis. Q349 no te acerca
a ganarles; solo te deja con menos margen para dar el servicio en persona que
es, precisamente, lo único que ellos no pueden dar.

---

## 5. Qué hacer con el precio en lugar de bajarlo

Todo esto te da el mismo efecto comercial —o mejor— sin tocar el precio de lista.

**a) Quitá el costo de alta antes que tocar la mensualidad.**
Perdonar los Q300 de alta te cuesta **Q300 una sola vez**. Bajar de Q599 a Q349
te cuesta **Q250 cada mes, para siempre** (Q3,000 al año, por cliente). La primera
concesión resuelve el obstáculo más grande —el desembolso inicial— a una
fracción del costo. Tu propio `OFERTA_PILOTO.md` ya lo tenía como Alternativa B.
Es la mejor de las tres.

**b) Precio de cliente fundador, con nombre y fecha, no rebaja general.**
Si querés usar Q349, usalo así: *"Precio de fundador: Q349 al mes, congelado por
12 meses, para los primeros 3 restaurantes. Después vuelve a Q599. A cambio me
das un testimonio y me dejás usar tu nombre."*

Es exactamente el mismo dinero en tu bolsa, pero:

- El precio de lista sigue siendo Q599 (no destruís tu posicionamiento)
- Hay urgencia real (3 cupos, no "cuando quieras")
- El descuento tiene una *razón*, y un descuento con razón se respeta; una
  rebaja general se lee como "no valía eso"
- Te llevás el testimonio, que hoy es lo que más te falta

**c) Creá un plan anual — hoy no tenés ninguno, y el mercado lo espera.**
Mirá Vendty: Q315 mensual contra Q173 anual. El mercado guatemalteco de este
software ya está entrenado a que pagar el año da un descuento fuerte. Ofrecé
**Q499/mes pagando el año (Q5,988 de una vez, ~17% de descuento)**. Eso te da
capital de trabajo el día uno, te asegura al cliente 12 meses, y sigue
respetando el anclaje de Q599.

**d) Cobrá lo que OlaClick no puede cobrar.**
Instalación en sitio, carga del menú con fotos, capacitación al personal,
tarjetas NFC/QR impresas (ya tenés `PLAN_TARJETAS_NFC_QR.md`). Esos son ingresos
de servicio, con margen, que un producto masivo remoto no puede ofrecer y que
justifican tu precio sin bajarlo.

**e) Arreglá el argumento del Cotizador.**
Mirá el Escenario 2 de tu `Cotizador.xlsx`: es para restaurantes que **no** usan
apps de delivery —o sea, la mayoría de tus prospectos de Jutiapa. Ahí le estás
pidiendo al dueño que pague Q299 + Q300 para "ahorrarse" comisiones que **hoy no
está pagando**. Un ahorro hipotético no compra nada. Para ese perfil el argumento
tiene que ser de ingreso, no de ahorro: *"hoy no vendés a domicilio; con esto
empezás, y cada pedido nuevo es venta que hoy no existe"*. Es más difícil de
demostrar, pero es honesto y es el único que aplica.

---

## 6. El diagnóstico real: tu embudo, no tu precio

Tres cosas concretas que cambiaría antes de tocar un solo quetzal.

### a) Dejá de vender suscripciones. Empezá a instalar menús gratis.

Tu plan Básico es gratis para siempre. Eso es tu mejor arma de adquisición y no
la estás usando como arma — la estás usando como nota al pie del guión.

Cambio de objetivo: **no salgas a cerrar Q599. Salí a dejar menús instalados.**
Meta: 20 restaurantes con menú gratis funcionando en Jutiapa. Con eso ganás:

- Cero fricción en la puerta (nadie dice que no a algo gratis que le dejás hecho)
- Te volvés "el del menú" del pueblo → empiezan los referidos, que convierten
  **10 veces mejor** que la puerta fría (15–25% vs 1.5–2%)
- Datos reales para vender después: *"su menú tuvo 340 visitas el mes pasado.
  Por Q299 esa gente podía estar pidiendo directo"*. Eso no es un argumento de
  venta, es un hecho de su propio negocio.

### b) Arreglá el cierre del guión

Hoy tu `GUION_DEMO_90S.md` cierra con:

> "¿Se lo dejo armado con su carta ahorita mismo, **o prefiere que vuelva otro
> día con más calma?**"

Esa segunda mitad es una puerta de escape, y el dueño la va a tomar siempre —
porque posponer no cuesta nada. "Otro día" es donde mueren las ventas. Cambialo
por algo sin salida cómoda:

> "Se lo dejo armado hoy, gratis. Solo necesito una foto de su carta y el logo
> si lo tiene. ¿Me los pasa por WhatsApp ahorita o se los tomo yo?"

Las dos opciones terminan en instalación.

### c) Llená la hoja de seguimiento. Ese es el trabajo.

Después de cada visita, sin excepción, tres campos: **qué usa hoy**, **cuál fue
la objeción textual**, **cuándo vuelvo**. Y volvé — 3 a 5 veces, por WhatsApp,
espaciado una semana. No es acoso, es el trabajo. El benchmark dice ~8 intentos
para alcanzar a alguien; vos estás haciendo 1.

En 3 semanas de hacer esto vas a tener algo que hoy no tenés: **saber por qué no
te compran.** Y esa respuesta vale infinitamente más que cualquier ajuste de
precio que hagamos a ciegas.

---

## 7. ¿Es viable? Los números que importan

No necesitás 1,000 clientes. Hacé la cuenta:

| Clientes Premium | Ingreso mensual | vs. salario mínimo no agrícola CE2 (Q4,066.90) |
|---|---|---|
| 10 | Q5,990 | 1.5× |
| 20 | Q11,980 | 2.9× |
| **30** | **Q17,970** | **4.4×** |
| 50 | Q29,950 | 7.4× |

**30 clientes a Q599 es un ingreso muy bueno en Guatemala.** Ese es el objetivo
realista, y es alcanzable en 12–18 meses de venta local constante. En Guatemala
hay ~37,600 restaurantes registrados ante SAT y el sector viene creciendo — no
te falta mercado, te falta recorrerlo.

A Q349 esas mismas 30 puertas te dan Q10,470 y necesitarías 52 para llegar al
mismo lugar. Ese es, en una línea, el argumento completo contra bajar el precio.

**El riesgo real no es que el precio esté alto. Es quedarte sin aire antes de
llegar al cliente 10.** Por eso el plan anual (c) y el precio de fundador (b)
importan más que la rebaja: te dan efectivo temprano sin regalar el negocio.

---

## 8. Mi opinión honesta sobre que esté hecho con IA

Me preguntaste directo, así que te contesto directo: **sí, está bien, y no
tenés por qué sentir que estás haciendo trampa.** Pero la razón por la que está
bien no es la que la gente suele dar, así que la desarmo.

### Por qué está bien

**El cliente compra un resultado, no un método de construcción.** Ningún dueño
de restaurante te va a preguntar qué editor usaste, si es Next.js o Laravel, ni
si escribiste el CSS a mano. Compra: que su menú se vea bonito, que los pedidos
lleguen, que no le cobren 25% de comisión. La IA es una herramienta, como lo son
un framework, una librería o un compilador. Nadie considera deshonesto usar
React en lugar de escribir el DOM a mano, y nadie audita si el carpintero usó
sierra eléctrica o serrucho — le pagan por el mueble.

**Y hay una parte que sí es 100% tuya, aunque no lo sientas:** decidir que el
modo offline importaba más que la app nativa, entender que el segmento de
Jutiapa vive con internet malo, elegir tarifa plana sobre comisión, mapear a
OlaClick y Fudo, escribir un manejo de objeciones que dice la verdad. Ese
criterio no lo genera ninguna IA — sale de que conocés el mercado. Ese es el
producto de verdad; el código es la parte reemplazable.

### Dónde sí está la responsabilidad (y esta es la parte importante)

Usar IA es legítimo. Lo que **no** sería legítimo es no entender lo que estás
vendiendo. Cuando a tu cliente se le caigan los pedidos un sábado a las 8 de la
noche, "lo escribió la IA" no es una respuesta. Vos sos el proveedor: es tu
código, tus bugs, tu seguridad, los datos de tus clientes.

Y por lo que veo en tu carpeta, **estás haciendo exactamente eso.** Seis
auditorías de seguridad. RLS probada tabla por tabla. Un guardrail de CI contra
funciones expuestas. Y el detalle que más me dice: tu análisis de OlaClick abre
diciendo que está *"verificado contra el código real, no contra lo que dicen los
documentos previos"*. Eso es alguien que desconfía de su propia documentación y
va a revisar. No es alguien copiando y pegando output a ciegas.

La prueba definitiva la tenés en `MANEJO_DE_OBJECIONES.md`, donde escribiste que
hoy no facturás automático al SAT y que no querés prometer una fecha que no
podés cumplir. **Ahí está la línea ética real**, y estás del lado correcto de
ella. La pregunta nunca fue "¿lo hizo una IA?". La pregunta es "¿estás diciendo
la verdad sobre lo que hace?". Y sí, la estás diciendo.

### Cómo lo manejaría frente al cliente

No lo saques a relucir sin que te pregunten —no es relevante para él, igual que
no le contás qué base de datos usás. Pero si te preguntan, no mientas. Y no lo
digas como disculpa, decilo como ventaja, porque lo es:

> "Yo lo construí y yo lo mantengo. Uso las mejores herramientas que hay hoy,
> por eso puedo hacerte un cambio en días y no en seis meses como una empresa
> grande. Si algo no te sirve como está, me lo decís y te lo ajusto."

Eso es literalmente cierto y es algo que OlaClick, con 120,000 negocios, **no
puede ofrecer estructuralmente.** Tu apalancamiento con IA es lo que hace creíble
tu promesa de personalización. No es el secreto vergonzoso — es el motor de tu
diferenciador.

### Donde sí te pondría una alerta (y no es ética, es operativa)

98,629 líneas en 2.5 meses es más código del que una persona puede tener en la
cabeza. El riesgo real de construir rápido con IA no es moral, es este: **el día
que algo se rompa en producción con un cliente pagando, vas a tener que
reaprender partes de tu propio sistema bajo presión.** Eso sí puede costarte el
cliente.

La mitigación no es dejar de usar IA, es esto:

1. **Congelá funciones nuevas.** Tus documentos ya mencionan un "congelamiento de
   producto" — buen instinto, sostenelo. Cada función nueva es superficie que no
   conocés y que nadie te pidió.
2. **Conocé a fondo el 20% que el cliente toca**: menú público, checkout, panel
   de pedidos, KDS, impresión. Eso es lo que se rompe y lo que te van a reclamar.
   El resto puede esperar.
3. **Cerrá el FEL antes de vender a un restaurante formal.** No por OlaClick —
   por vos. Vender a alguien que factura y descubrir en el mes 2 que no le
   transmite a SAT es la forma más rápida de perder tu primer cliente y el boca
   a boca de todo el pueblo.

---

## 9. Plan de 30 días

Ordenado por lo que más mueve la aguja, no por lo que más cómodo se siente.

**Semana 1 — Reparar el embudo (cero código)**

- [ ] Llenar `SEGUIMIENTO_PROSPECTOS.xlsx` con los 5 restaurantes ya visitados,
      de memoria: qué usan hoy, qué dijeron, quién decide
- [ ] Escribirle a esos 5 por WhatsApp. Mensaje corto, sin vender:
      *"Don [X], le dejo armado su menú digital gratis, sin compromiso. ¿Me pasa
      una foto de su carta?"*
- [ ] Cambiar el cierre del guión: quitar la opción "vuelvo otro día"
- [ ] Definir la oferta de fundador: **3 cupos, Q349 congelado 12 meses, Q0 de
      alta, a cambio de testimonio**. Escribirla en una hoja para mostrarla

**Semana 2–3 — 20 menús gratis instalados**

- [ ] Visitar los 10 prospectos de la lista + 15 más de Jutiapa y El Progreso
- [ ] Objetivo por visita: **no cerrar una venta, dejar un menú funcionando.**
      Éxito = te dieron la foto de la carta
- [ ] Llenar la hoja después de **cada** visita, mismo día. Sin excepción
- [ ] Al que muestre interés real: ahí sí, oferta de fundador

**Semana 4 — Leer los datos**

- [ ] Contar objeciones por categoría. ¿Cuántas fueron de precio, de verdad?
- [ ] Revisar visitas del menú de los que ya están instalados → ese número es tu
      argumento de venta para el mes 2
- [ ] Segunda ronda de WhatsApp a todos (intento 2 de 5)
- [ ] **Recién ahí** decidir sobre precios, con datos en la mano en lugar de
      con la sensación de desánimo

**En paralelo, si te sobra tiempo de desarrollo — en este orden:**

1. **FEL conectado de verdad** (te bloquea contra Vendty en restaurantes formales)
2. **Plan anual en `plans.ts`** (Q499/mes pagando el año)
3. Bot de WhatsApp — importante, pero después de tener clientes que lo pidan

---

## 10. Lo último, y es lo que más importa

Estás desanimado por la razón equivocada. Cinco "no" no dicen nada sobre tu
producto ni sobre vos: es el resultado que la estadística predice para cinco
visitas en frío. Lo que sí dice algo es que después de esas cinco visitas no
tenés ni una objeción anotada ni un seguimiento programado — y eso, a diferencia
del precio, se arregla esta semana y no cuesta nada.

Construiste en 2.5 meses un sistema que compite en funciones con productos que
cobran USD 79–130 al mes. Ese trabajo ya está hecho y no se pierde. Lo que falta
es la parte incómoda, y es la única que queda: volver, insistir, y anotar lo que
te digan.

No bajes el precio todavía. Bajá la fricción de entrar —menú gratis instalado,
sin costo de alta— y subí la cantidad de puertas. Si en 30 visitas bien hechas y
bien anotadas la objeción dominante resulta ser el precio, volvemos a esta
conversación con datos y lo bajamos con fundamento. Pero hoy no hay ni una sola
evidencia de que Q599 sea el problema, y sí hay bastante de que el seguimiento
lo es.

---

## Anexo — El mercado guatemalteco completo y la estrategia de volumen

*(Agregado el mismo día, tras revisar más competidores locales.)*

### A.1 — El resto del mercado GT (que faltaba en la sección 3)

| Producto | Precio mensual | Alta / implementación | FEL |
|---|---|---|---|
| OlaClick | **Q0** (base) | Q0 | — |
| **PosFile (GT)** | **Q200** Básico · **Q300** Avanzado · **Q475** Plus | **Q700 · Q1,200 · Q2,150** | Sí (Q45/mes aparte + Q0.28 por factura) |
| **Vendty (GT)** | **Q315** Emprendedor (mensual) · Q173 / Q254 (pago anual) | n/d | Sí (Digifact) |
| **Sabor Suite (GT)** | **USD 45 ≈ Q343** — plan único, usuarios ilimitados | n/d | Sí |
| Fudo | USD 39 / 79 / 130 por sucursal | USD 100–300 | Según país |
| **Leogin Estándar** | **Q299** | **Q300** | Parcial (no transmite) |
| **Leogin Premium** | **Q599** | **Q300** | Parcial (no transmite) |

Dos hallazgos que cambian el panorama:

**1. Tu costo de alta (Q300) es el más barato del mercado, no el más caro.**
PosFile cobra entre **Q700 y Q2,150** de implementación y sigue en el negocio.
Eso significa que el mercado guatemalteco **sí acepta pagar por instalación** —
probablemente el Q300 no es el obstáculo que yo suponía en la sección 3. Sigue
siendo cierto que perdonarlo es la concesión más barata (Q300 una vez contra
Q250 al mes para siempre), pero ya no lo pondría como la primera hipótesis de
por qué no cierran.

**2. La banda real del mercado guatemalteco es Q200–Q475.**
Y ahí está el problema serio con Q349:

> **Q349 no es un precio de volumen. Es exactamente el precio promedio del
> mercado guatemalteco** — Sabor Suite cobra Q343, PosFile Q300, Vendty Q315.
> Los tres con FEL funcionando. Vos no.

A Q599 estás *arriba* de la banda, y eso es defendible **si** vendés algo que
ellos no tienen: personalización total, offline real, y que llegás en persona.
A Q349 te metés en el pelotón, de frente contra tres competidores que cobran lo
mismo y tienen facturación electrónica funcionando. **En esa banda sos la peor
opción de la lista**, y ya no te queda margen para diferenciarte por servicio.

Es la trampa clásica de "quedarse en el medio": ni el más barato, ni el mejor.
Q349 te quita la única posición que hoy podés defender.

### A.2 — "Las empresas grandes triunfan por volumen" — sí, pero mirá el mecanismo

La intuición no es tonta; está bien observada. El problema es la condición que
la hace funcionar, y esa condición es siempre la misma:

> **El volumen funciona cuando el costo del siguiente cliente tiende a cero.**

- **Amazon**: la página web atiende a 1 o a 1,000,000 al mismo costo.
- **Walmart**: cada tienda extra le baja el costo de compra a todas las demás.
- **Netflix / Spotify**: el mismo contenido servido un millón de veces.
- **OlaClick**: registro self-serve, **cero horas humanas por cliente**, más
  capital de Meta, Google y Y Combinator para aguantar años sin cobrar.

Los cuatro comparten lo mismo: **nadie tiene que ir físicamente a la puerta del
cliente número 501.**

Ahora el tuyo. ¿Cuánto te cuesta el cliente siguiente?

- Viaje a Jutiapa / El Progreso
- Demo en persona
- Cargar el menú con fotos, a mano
- Capacitar al personal
- Ser la línea de soporte, para siempre

Ese costo **no baja con el volumen. Se mantiene, o sube** — porque cuando
termines los restaurantes cercanos vas a tener que viajar más lejos por cada
uno nuevo.

Tu negocio hoy, estructuralmente, **no es software de volumen: es un negocio de
servicios con un producto de software adentro.** Y bajar precios en un negocio
de servicios es exactamente cómo se quiebra: tomás más trabajo a menor margen,
hasta que no podés atender bien a nadie, la calidad cae, y en un pueblo donde
todo se sabe, la reputación se va con ella. Tu reputación local *es* el negocio.

### A.3 — Pero tenés razón en algo, y ahí sí está tu jugada de volumen

Podés convertirte en un negocio de volumen. Solo que la palanca **no es Q349**.
La palanca es **quitarte a vos del medio**: registro self-serve, prueba de 30
días, plan Básico gratis — las tres cosas ya las tenés construidas.

Ahí está lo contradictorio de Q349: **es demasiado caro para hacer volumen y
demasiado barato para pagarte el servicio en persona.** No compra ninguna de
las dos cosas.

Si querés jugar volumen, jugalo donde el volumen vive: **en Q0.** El plan
Básico gratis es tu arma masiva y hoy la tenés desaprovechada. 20, 50, 100
menús gratis instalados en el oriente del país te dan exactamente lo que buscás
con el volumen —presencia, referidos, boca a boca— sin regalar el margen del
producto que sí cobrás.

### A.4 — Cómo probar tu instinto sin quemar el precio de lista

No hace falta que elijas hoy. Hacelo así y te llevás las dos cosas:

| Pieza | Precio | Para qué sirve |
|---|---|---|
| Básico | **Q0** | La jugada de volumen de verdad. Meta: 20 instalados |
| Precio de fundador | **Q349**, congelado 12 meses, **3 cupos** | Prueba tu hipótesis con clientes reales |
| Precio de lista | **Q599** | Se queda intacto. Es a lo que vuelve después |
| Anual | **Q499/mes** pagando el año | Efectivo por adelantado + cliente amarrado |

Con esto, en 30 días sabés lo que hoy no sabés:

- **Si a Q349 cierran** → tu instinto era correcto, tenés datos reales y podés
  bajar el precio de lista con fundamento, sabiendo qué compraste con esa
  rebaja.
- **Si a Q349 tampoco cierran** → el precio nunca fue el problema, te ahorraste
  Q3,000 al año por cliente para siempre, y tu precio de lista sigue en pie.

La diferencia entre esto y bajar a Q349 de una vez no es el dinero: es que
**esto es reversible y te enseña algo.** Bajar el precio de lista no es
reversible y no te enseña nada.

---

## Fuentes de mercado consultadas (2026-08-17)

- [Precios y planes de Vendty Guatemala](https://www.vendty.com/gt)
- [¿Cuánto cuesta un sistema POS para restaurante? — OlaClick](https://olaclick.com/es/punto-de-venta/cuanto-cuesta-sistema-pos-restaurante/)
- [OlaClick en Capterra (precios y reseñas)](https://www.capterra.com/p/214306/OlaClick/)
- [Fudo precio 2026 — Madi Digital](https://app.madi-digital.com/blog/fudo-precio-2026)
- [Comparasoftware Guatemala — Software para restaurantes](https://www.comparasoftware.gt/software-para-restaurantes)
- [PosFile — Planes y precios (Guatemala)](https://posfile.com/precios-posfile/)
- [Sabor Suite — POS para restaurantes en Guatemala](https://saborsuite.com/)
- [Benchmarks de conversión en venta en frío B2B SaaS — Precision Outbound](https://precisionoutbound.xyz/posts/cold-calling-conversion-rate-benchmarks-for-b2b-saas)
- [Restaurantes registrados ante SAT — Con Criterio](https://concriterio.gt/sat-restaurantes-reportaron-46-de-incremento-en-ventas-tambien-hay-mas-negocios/)
- [Salario mínimo Guatemala 2026 (Acuerdo 256-2025)](https://www.asesoriaglobal.com.gt/blog/salario-minimo-guatemala-2026.html)

Fuentes internas: `PRECIOS_VIGENTES.md`, `SEGUIMIENTO_PROSPECTOS.xlsx`,
`Cotizador.xlsx`, `GUION_DEMO_90S.md`, `MANEJO_DE_OBJECIONES.md`,
`OFERTA_PILOTO.md`, `ANALISIS_COMPETENCIA_2026-07-04.md`,
`ANALISIS_COMPETENCIA_OLACLICK_2026-08-04.md`,
`RECOMENDACIONES_PENDIENTES_2026-07-18.md`, historial de git del repositorio.
