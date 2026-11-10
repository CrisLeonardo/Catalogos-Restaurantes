---
name: leogin-diseno
description: Sistema visual propio de Leogin (panel del restaurante, superadmin, comensal, Mi cuenta, web pública). Úsala ANTES de diseñar, revisar o tocar cualquier pieza de interfaz de este repo, desde un botón, un color, un texto o un espacio hasta una pantalla completa, y antes de presentar una maqueta. Fija los tokens reales, los componentes que ya existen, las decisiones aprobadas o rechazadas por el dueño y la forma de comprobar el resultado en pantalla.
---

# Diseño en Leogin

Leogin es un sistema para restaurantes en Guatemala: lo usan meseros con prisa, cocina a distancia, caja con dinero real, el dueño en el teléfono y el comensal desde un QR. **Moderno, práctico, agradable, rápido y fácil de entender.** El dueño ha rechazado lo genérico y lo que «parece plantilla», pero también lo llamativo que estorba al trabajo. Precisión antes que adorno.

Esta skill manda sobre cualquier skill genérica de diseño. Si otra skill sugiere «tomar riesgos estéticos», cambiar tipografías o una paleta nueva, **no aplica** a superficies de trabajo salvo que el dueño lo pida.

## 1 · Antes de tocar nada

1. Lee [`docs/diseno/SISTEMA_VISUAL_2026-11-05.md`](../../../docs/diseno/SISTEMA_VISUAL_2026-11-05.md) y la ficha de auditoría correspondiente (IDs en `docs/auditorias/`).
2. Mira la pantalla **real** tal como está hoy (navegador, móvil 390 px y escritorio 1280 px). Ver el código no basta.
3. Identifica el **modo** de la superficie:
   - **Operar** (panel, Servicio, Cocina, Caja, superadmin, Mi cuenta): escaneo, consistencia, objetivos grandes. La marca vive en los detalles.
   - **Pedir** (carta del comensal, checkout, seguimiento): la marca del restaurante manda (`--brand-*`, plantillas y paletas); claridad del precio y del siguiente paso.
   - **Convencer** (web pública, `/planes`, registro): aquí sí cabe más expresión, con el tema claro vigente.
4. Busca primero si ya existe el componente en `plataforma/src/components/ui/`. **No crees otro** si ya existe: `button`, `input`, `select`, `textarea`, `switch`, `dialog`, `confirm-dialog`, `hoja-operativa`, `dropdown-menu`, `card`, `list`, `section`, `stat`, `table`, `badge`, `toast`, `empty-state`, `chart-readout`, `rodillo`, `capsule-navigation`.
5. **Cambio visual nuevo = maqueta primero** (artefacto o HTML con datos realistas, móvil y escritorio, claro y oscuro) y aprobación del dueño. Lo ya aprobado se conserva tal cual.

## 2 · Decisiones vigentes (no reabrir sin que el dueño lo pida)

- Dirección global: **Identidad actual depurada**. «Hospitalidad precisa» quedó como alternativa, no como reemplazo.
- **Superficies sólidas.** Nada de tarjetas, etiquetas o marcos translúcidos («chafas»). Tarjeta = `var(--adm-card)` + `--adm-border`/`--adm-border-2` + `--adm-shadow-*`. Nunca `color-mix(... transparent)` como fondo de tarjeta ni vidrio.
- **Nada saturado (principio rector, dueño, 2026-11-10).** Cada pantalla enseña en primer plano solo lo que su usuario usa en cada visita. Por cada elemento fijo pregunta: ¿se toca siempre? Si no, va a «⋯», a la búsqueda o desaparece en el teléfono. Una fila de mandos sobre el contenido; ningún título que repita la barra superior; ningún pie fijo para una acción ocasional; ningún resumen en cero. Aplica igual en PC. Ponte en el papel de quien la usa y cuenta cada toque.
- **Paridad comensal ↔ mesero.** Lo que el comensal puede elegir en la ficha de un plato, el mesero lo elige igual: las reglas viven en `lib/menu/opciones.ts` y un plato personalizable abre su hoja al tocarlo.
- **Navegación inferior del comensal**: barra sólida con la paleta del restaurante, icono arriba y nombre abajo, sección activa con pastilla de tinta (`menu/bottom-nav.*`). El resumen del carrito es un solo botón encima. La cápsula gris (`ui/capsule-navigation.*`) fue **rechazada para el comensal** el 2026-11-10 y hoy solo la usa el superadmin. **El panel del restaurante conserva su barra operativa.**
- Carta del comensal: ancho de columna fijo (techo de 460/760/1120 según `layoutWidth`); en PC se ve como en el teléfono. **No ensanchar** sin rediseñar antes las piezas.
- 8 estructuras × 26 paletas de carta: no se sustituyen; un cambio debe funcionar en todas.

## 3 · Tokens: usa variables, nunca valores sueltos

| Para | Usa | Evita |
|---|---|---|
| Fondo, tarjeta, borde del panel | `--adm-bg`, `--adm-bg-2`, `--adm-card`, `--adm-card-hover`, `--adm-border`, `--adm-border-2` | `#fff`, `white`, `rgba(255,255,255,x)` |
| Texto del panel | clases `text-adm-text`, `-2`, `-3`, `-4` (salen de `--u-text*`) | grises inventados |
| Marca / acción principal | `--adm-accent-fill` (+ `-hover`), `--brand-accent-ink` (clase `adm-accent-ink`) para texto o foco | coral escrito a mano |
| Resultado / atención / error / información | `--c-ok*`, `--c-warn*`, `--c-danger*`, `--c-info*` (variantes `-bg`, `-line`, `-solid`, `-fill`) | `#4ade80`, `#f87171`, `#fbbf24` |
| Comensal | `--brand-*`, `--u-text*`, `--surface-*`, `--brand-on-accent` (de `config.onAccent`) para texto sobre el acento | `color: '#fff'` sobre `var(--brand-accent)` |
| Sombras | `--adm-shadow-xs/sm/md/lg/xl`, `--adm-shadow-accent` | sombras de color o difusas enormes |

Valores de referencia: claro `#F2F1EE` fondo · `#FFFFFF` tarjeta · `#17161A` tinta · coral `#C2542F`; oscuro `#0C0B0A` · `#1A1917` · `#F5F3EF`. Excepciones intencionales que **no** se tocan: botón de Google blanco, verde WhatsApp `#25D366`, pines de Leaflet, marco del teléfono de muestra.

El color nunca va solo: todo estado lleva **texto o icono** además del color.

## 4 · Tipografía

- Interfaz y dinero: **Geist** (`--font-sans`). Display de marca (`--font-display`, `--font-poster`, `--font-serif`) sólo en titulares de carta o web pública, nunca en campos, tablas ni importes.
- **Escala cerrada** en panel, superadmin y Mi cuenta: 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40 px; pesos 400–800. La prueba `src/lib/type-scale.test.ts` lo vigila: **no la amplíes para que pase**, corrige el tamaño.
- Jerarquía con tamaño y peso, no con cinco grises. Cuerpo mínimo 14 px en móvil; 12 px sólo para metadatos; 11 px sólo para etiquetas mínimas.
- Dinero con cifras tabulares (`tabular-nums`), alineado a la derecha, formato `Q1,234.50`. Prueba siempre con `Q9.00` y `Q99,999.99`.
- En el comensal usa `roleSize(config, rol)`, no `config.typography.<rol>.size` directo (respeta la escala global).

## 5 · Botones y controles

- `Button` de `ui/button.tsx`. Variantes por **función**: `primary` (una por zona), `secondary`, `outline`, `ghost`, `destructive`, `link`.
- Tamaños: `md` 40 px para escritorio denso; **`touch` (48 px) por defecto en pantallas táctiles de trabajo**; **`action` (56 px) para la acción principal** de una hoja (cobrar, enviar a cocina, cerrar caja). `sm` (32 px) sólo en barras densas de escritorio, nunca como único camino en móvil.
- Etiqueta = **verbo + objeto** («Cobrar Q240.00», «Enviar a cocina»), no «Aceptar»/«OK». Iconos solos llevan `aria-label` y tooltip.
- Estados obligatorios: reposo, hover, pulsado, foco visible (contorno 2 px con `outline-adm-accent-ink`), deshabilitado **con motivo visible**, y progreso (texto «Cobrando…» y bloqueo de doble envío).
- Acciones destructivas o de dinero: confirmación con `confirm-dialog` que diga qué pasa y si se puede deshacer.
- Separación mínima de 8 px entre objetivos táctiles.

## 6 · Espacio, forma y composición

- Ritmo de 4 px (4, 8, 12, 16, 20, 24, 32, 40). Más espacio entre grupos que dentro del grupo.
- Radios: tarjeta 18 px, controles `rounded-adm-lg`, cápsula completa. No mezcles radios distintos en una misma pieza.
- Una idea por tarjeta; no anides tarjeta dentro de tarjeta: usa `List`/`ListRow` y divisorias.
- Móvil primero: 320, 390, 768, 1280 px. Nada de desborde horizontal; textos largos envuelven o se recortan con el valor completo accesible.
- Reserva una sola vez la altura de la navegación fija (`--adm-nav-h`, `--m-nav-h`, `NAV_HEIGHT`) más el área segura.

## 7 · Texto de interfaz (español de Guatemala)

- Frases cortas, tú, voz activa, sin tecnicismos («No se pudo guardar. Revisa la conexión e inténtalo de nuevo.»).
- Un texto **no promete** lo que la función no hace (ficha 0.1). Si algo depende de plan, configuración o permiso, dilo.
- Errores junto al campo, con la causa y cómo arreglarlo. Una lectura fallida **no** se muestra como vacío ni como Q0 (ficha 0.3: `lib/db/lectura.ts` y `components/admin/aviso-lectura.tsx`, hoy sólo en la rama del PR #75).
- Sin duplicados («3 platos · 3 platos») ni mayúsculas sostenidas en párrafos.

## 8 · Estados que toda pantalla debe cubrir

Carga (esqueleto con la forma real), vacío (con acción: `empty-state` exige `action`), error con última lectura válida, parcial, sin permiso (explica quién puede darlo), sin conexión/cola offline, confirmación y éxito. Prueba con datos largos, cero, uno y muchos.

## 9 · Movimiento

- Corto y con propósito: 150–220 ms para estado, hasta 300 ms para hojas. Curva de la casa `cubic-bezier(.22,1,.36,1)`.
- Anima `transform` y `opacity`, no `height`/`width`/`top`.
- Respeta `prefers-reduced-motion` (cambio inmediato).
- Trampa de LightningCSS: `animation: linear both;` **sin nombre** se compila como `none`. Si el nombre va aparte, usa propiedades sueltas.

## 10 · Accesibilidad mínima

- Contraste 4.5:1 en texto, 3:1 en iconos, bordes de control y foco. Comprueba **claro y oscuro** y las paletas de carta.
- Etiqueta asociada en cada campo; `aria-current="page"` en navegación; selección anunciada en controles segmentados (flechas para moverse).
- Diálogos y hojas: título, foco inicial, fondo inerte, Escape, vuelta del foco al disparador.
- Todo se puede usar con teclado; el orden de Tab sigue el visual.

## 11 · Comprobar antes de decir «listo»

Pruebas verdes no dicen nada del aspecto. Para cada cambio visual:

1. Renderízalo de verdad (`http://localhost:3000`; panel local con `/api/dev-login` sólo con `DEV_LOGIN=1` y Supabase local). Si la ruta pide sesión, monta una página temporal `src/app/dev-*/page.tsx` con datos de prueba y bórrala al terminar. Nunca escribas contraseñas ni PIN.
2. Captura 390 px y 1280 px (y 320/768 si hay navegación o tablas), claro y oscuro.
3. Compara contra la maqueta aprobada pieza por pieza: color, medida, peso, espacio, texto.
4. Revisa consola sin errores, foco con teclado y movimiento reducido.
5. Corre `npm run typecheck`, `npm run lint` y `npx vitest run src/lib/type-scale.test.ts` desde `plataforma/`.
6. Pasa la revisión de `better-interface` (pantalla) o `interface-review` (rama/PR) como segunda opinión; no sustituye mirar.

## 12 · Skills que acompañan a esta (instaladas en `.claude/skills/`)

Esta skill decide **qué** es Leogin; las demás dicen **cómo** pulirlo. Si chocan, gana esta y lo aprobado por el dueño.

| Skill | Para qué | Ajuste en Leogin |
|---|---|---|
| `emil-design-eng` (Emil Kowalski) | Sensación al tocar: cuándo animar, curvas, duraciones, pulsado, hojas y gestos | La curva de la casa `cubic-bezier(.22,1,.36,1)` sigue para lo existente. En pantallas de uso intenso (Servicio, Cocina, Caja) casi nada se anima: se repite cientos de veces al día. |
| `better-interface` (Jakub Krehel) | Revisión completa de una pantalla o flujo con evidencia `archivo:línea` y severidad | Sus reglas respetan las convenciones documentadas: las decisiones de §2 no son hallazgos. |
| `interface-review` | Revisión de una rama o PR: qué empeoró o introdujo el cambio | Sólo la invoca el usuario (`/interface-review`). Nunca cambia de rama. |
| `better-accessibility`, `better-layout`, `better-typography`, `better-colors`, `better-ui`, `better-writing` | Reglas de cada dominio que usa `better-interface`; también sirven solas | `better-writing` está en inglés: aplica sus principios en el español de §7. `better-ui` pide pulsado a `scale(.96)`; hoy `Button` usa `active:translate-y-px`: cambiarlo es decisión visual con maqueta. |

Las de ChatGPT (`frontend-design`, `impeccable`, `web-design-guidelines`) siguen en `.agents/skills/`, pero ya no están enlazadas aquí. `frontend-design` empuja a «arriesgar» la estética y no sirve para superficies de trabajo. Si alguna vez se quiere el detector automático de Impeccable, se vuelve a enlazar a propósito.

También están disponibles desde la cuenta: plugin `design:` (`accessibility-review`, `ux-copy`, `design-critique`, `design-handoff`) y `ui-ux-pro-max` como catálogo de ideas. Ninguna de estas reemplaza la maqueta aprobada.
