# Sistema visual de Leogin · ficha 1.0

La [maqueta comparativa](./MAQUETAS_SISTEMA_VISUAL_2026-11-05.html) presenta **Hoy, Cobro y Carta del comensal** con los mismos datos ficticios en ambas direcciones. Los controles permiten cambiar de pantalla, tema, ancho y estado. El estudio continúa la [dirección visual de la auditoría](../auditorias/AUDITORIA_INTEGRAL_2026-11-03.md#5-dirección-visual-concreta-hospitalidad-precisa) y documenta las dos opciones del [plan](../planes/PLAN_AUDITORIA_INTEGRAL_2026-11-04.md#3-decisiones).

| Dirección | Claro | Oscuro | Tipografía y superficie |
|---|---|---|---|
| Identidad actual depurada | Fondo `#F2F1EE`, tarjeta `#FFFFFF`, tinta `#17161A`, coral `#C2542F` | Fondo `#0C0B0A`, tarjeta `#1A1917`, tinta `#F5F3EF` | Títulos de palo seco, tarjeta de 18 px y sombra leve. Los colores base vienen del panel actual. |
| Hospitalidad precisa | Fondo `#F7F4EE`, tarjeta `#FFFEFB`, tinta `#202420`, terracota `#C74B24` | Fondo `#181B18`, tarjeta `#222722`, tinta `#F7F4EE` | Titulares editoriales, tarjeta de 12 px y separación por borde. El tema oscuro y los radios son propuestas de esta ficha. |

La carta usa un restaurante ficticio para comparar la jerarquía sin que cambien el menú o los importes. Los títulos de la maqueta usan fuentes del sistema. La aplicación conserva sus fuentes y la configuración de marca del restaurante como puntos de partida para la implementación que se apruebe.

## Componentes y estados

| Pieza | Referencia actual | Contrato candidato |
|---|---|---|
| Botón | `ui/button.tsx` y acciones particulares de Servicio | Principal, secundaria, discreta y destructiva según función. Texto con verbo. Foco visible, hover, pulsado, deshabilitado y progreso. Objetivo de 48 px y 56 px para la acción principal. |
| Campo | `ui/input.tsx`, `adm-field` y entradas de efectivo | Etiqueta asociada, ayuda y error junto al campo. Cifras tabulares en dinero. Un importe insuficiente conserva la corrección a mano y deshabilita el cobro. |
| Pestaña o selección | `sv-seg` en `servicio/hoja-cobro.tsx` | Estado seleccionado visible y anunciado. Métodos de pago con nombre completo. El cálculo de partes tiene su propia explicación. |
| Tarjeta y lista | `ui/card.tsx`, `ui/list.tsx`, superficies de carta | Base sólida en zonas de trabajo, borde y espacio entre regiones. Los datos largos pueden envolver. El valor queda alineado y legible. |
| Hoja o diálogo | `ui/dialog.tsx`, hoja de cobro y ficha del plato | Título y foco inicial claros, fondo inerte, Escape y vuelta al disparador. Acción móvil visible con espacio para alcanzar el último campo. |
| Aviso y estado | `ui/badge.tsx`, `ui/toast.tsx`, `ui/empty-state.tsx` | Mensaje con texto e icono. Se distinguen vacío, carga, error, parcial, permiso, conexión, confirmación y éxito. En error se indica la última lectura válida. |
| Tabla e importes | `ui/table.tsx`, `ui/stat.tsx` | Importes a la derecha, cifras tabulares y período indicado. Muestras Q9.00 y Q99,999.99. Precio y periodicidad en piezas separadas. |

El coral o la terracota indican marca y acción principal. Verde, ámbar, rojo y azul conservan los significados de resultado, atención, error e información. En la dirección editorial, la tipografía serif se reserva para títulos. Los campos y el dinero conservan tipografía operativa.

## Aplicación en el PR #91

El usuario pidió continuar con la implementación. Como no indicó una paleta concreta, la base usa **Identidad actual depurada** y las variables de tema existentes. Hospitalidad precisa queda disponible en la comparación. La Carta sigue leyendo la marca configurada por el restaurante.

- **Hoy.** Acciones de 48 px con `Button`, foco visible y ventas como primera cifra. Los importes se adaptan al ancho de la celda y las filas alinean el importe a la derecha.
- **Cobro.** La hoja mantiene «Por cobrar» y la acción de 56 px a la vista. El selector anuncia el modo y permite navegar con flechas. «Calcular partes» explica que el importe individual es una referencia. El botón de cobro continúa usando el saldo y las acciones existentes.
- **Carta.** La misma hoja mantiene a la vista cantidad y total. La foto, las opciones y la descripción se desplazan en su contenido. Se conserva la navegación del historial. La ventana modal evita enfocar el fondo, conserva el ciclo de Tab y devuelve el foco al disparador al cerrar.

La ficha 1.1 desarrolla el cobro completo, la 1.2 la caja y la 1.11 el recorrido de la ficha del comensal. Para N09, los seis indicadores de superadmin deben poder verse en 3×2 a 1280 px o reducirse a las cifras prioritarias. Esa pantalla se revisa con 4.9. Las pruebas con personas y lectores de pantalla de los recorridos completos se registran por separado.

## Extensión aprobada · navegación inferior (2026-11-07)

El usuario aprobó la reconstrucción de su referencia para este componente y su integración en comensal y superadmin. Se incorpora a **Identidad actual depurada** como una extensión acotada. La fuente de sus reglas es el [componente compartido](../../plataforma/src/components/ui/capsule-navigation.tsx) y su [hoja de estilos](../../plataforma/src/components/ui/capsule-navigation.module.css).

| Aspecto | Sistema vigente | Aplicación en la cápsula |
|---|---|---|
| Color | Variables de tema, coral para marca y acción principal; Carta según la marca del restaurante. | Superficie gris clara y selección carbón constantes, también sobre temas oscuros. Esta paleta pertenece a la cápsula y a su resumen de carrito. |
| Forma y profundidad | Tarjeta de 18 px y sombra leve en la dirección implementada. | Radio completo, borde elevado claro y sombra neutra exterior con luz interior, según la referencia aprobada. |
| Interacción | Objetivo de 48 px, foco visible y selección anunciada. | Destinos de 48 px, icono y etiqueta horizontal, foco visible y estado actual mediante `aria-current="page"`. |

### Reglas reutilizables del componente

- **Color.** Superficie (`#ebebeb`), borde (`#f7f7f7`), tinta (`#242424`), selección (`#202020`, canto `#2c2c2c`) y texto seleccionado (`#eee`). El foco usa un contorno azul (`#365b98`, 2 px). Los colores semánticos de avisos y acciones del resto del producto conservan sus reglas.
- **Geometría.** Rail de altura mínima (64 px), ancho máximo (460 px), separación lateral del viewport (12 px), relleno interior (8 px vertical y 9 px horizontal) y borde claro (3 px). Los destinos distribuyen el ancho según su contenido y mantienen etiquetas completas.
- **Tipografía.** Geist con Arial y sans-serif de respaldo, peso (550), interlínea (1.2) y espaciado (`-.03em`). Tres destinos usan texto entre 14 y 19 px e iconos de 24 px; cuatro usan texto entre 12 y 15 px e iconos de 20 px, reducidos a 18 px por debajo de 360 px.
- **Posición.** La navegación fija ocupa (84 px) más el área segura inferior. El contenido y las acciones flotantes deben reservar ese espacio una sola vez. El comensal comparte la medida entre `NAV_HEIGHT` y `--m-nav-h`; superadmin la aplica en `--adm-nav-h` hasta 820 px.
- **Selección.** Una sola pieza carbón se desplaza al destino actual en (220 ms), con curva `cubic-bezier(.22, 1, .36, 1)`. Se vuelve a medir tras cambios de ancho y carga de la fuente. Con movimiento reducido, el cambio es inmediato. Antes de la medición, el propio destino conserva el fondo seleccionado.
- **Resumen del carrito.** Sólo el comensal añade cantidad, producto e importe reales sobre la navegación. Es un único botón con piezas de altura mínima (44 px); el importe conserva cifras tabulares y el nombre largo se recorta. Sin navegación baja al área segura; al abrir el carrito o consultar un platillo se oculta según el estado de la pantalla.

### Integración por superficie

El [comensal](../../plataforma/src/components/menu/bottom-nav.tsx) conserva la disponibilidad de sus módulos. Las variantes revisadas son **Pedidos · Menú · Cuenta** y **Menú · Pedidos · Mis puntos · Cuenta**. El [resumen](../../plataforma/src/components/menu/cart.tsx) abre la hoja del carrito existente. Vitrina conserva su navegación superior propia.

[Superadmin](../../plataforma/src/components/super/shell.tsx) usa **Inicio · Locales · Cuentas · Más** hasta 820 px. «Más» abre la hoja operativa con **Grupos, Métricas, Finanzas y Ajustes**, mantiene la selección de esas rutas y devuelve el foco al cerrar con Escape. Por encima de ese ancho siguen visibles los siete destinos laterales. El panel del restaurante conserva su navegación operativa actual por elección autorizada, según trabajos y permisos. Las pestañas superiores de «Mi cuenta» quedan fuera de esta extensión.

### Evidencia y alcance

La revisión independiente emitió **ship**, sin correcciones materiales, tras comparar la referencia y las 13 capturas finales locales: ocho del comensal (tres y cuatro destinos a 320, 390, 768 y 1280 px), cuatro de superadmin a esos anchos y una de «Más» a 390 px. Los archivos son `capsula-real-{tres,cuatro}-{ancho}.png`, `capsula-real-super-{ancho}.png` y `capsula-real-super-mas-390.png`, dentro de `.impeccable/review` de la muestra local; no se versionan. `capsula-real-medidas.json` registra en las ocho variantes del comensal una selección, etiquetas completas, altura de 48 px y ausencia de desborde; `capsula-detector.json` devuelve `[]`.

La [verificación de integración](../registros/ESTADO_AUDITORIA_INTEGRAL_2026-11-04.md#27-navegación-inferior-aprobada--complemento-visual) registra tipos, lint, compilación y cuatro pruebas locales de consumidor y superadmin correctas, incluido segundo factor real. Este complemento **no cierra 1.11 ni 1.12** ni acredita una revisión integral de temas, accesibilidad, entrada, checkout o seguimiento.
