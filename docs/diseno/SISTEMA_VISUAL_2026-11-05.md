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
