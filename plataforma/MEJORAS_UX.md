# Mejoras UX y personalización — sesión nocturna (2026-06-19)

Rama: **`mejoras-ux-personalizacion`** (no se tocó `main`).
Trabajo autónomo sobre los 6 puntos que pediste. Aquí está **qué se hizo**, **por qué**, y **cómo probarlo**. Al final, hallazgos del replanteo (#5) con cosas que conviene decidir tú.

---

## 1. El glass del admin ya no se ve "siempre negro" (#1)

**Problema:** al agregar/editar un platillo, el modal usaba la clase `.glass-solid`, que tenía un
gradiente casi-negro **fijo** (`rgba(28,28,31)…`). No respetaba la paleta del restaurante → siempre negro.

**Solución:** `.glass-solid` ahora se **deriva de la paleta** (`--brand-bg`) con `color-mix`:
- En tema oscuro toma el color de fondo del restaurante (un café da glass acafetado, un vino da glass vinoso…).
- En tema claro se vuelve casi-blanco tintado.
- Variables nuevas en `globals.css`: `--glass-solid-from/-to/-stroke/-hi`. Cambiar la paleta cambia el modal.
- El modal de platillo además usa `var(--scrim)` (velo configurable) y `var(--surface-1)` en vez de blancos fijos.

Archivos: `src/app/globals.css`, `src/components/admin/catalog-panel.tsx`.

**Más personalizable:** en **/admin/personalizacion → pestaña Catálogo** hay una sección nueva
**"Checkout y pago"** (color activo, glass en pago, glass en formulario, sombra de texto). Antes esto solo
existía en tu editor de Super Admin.

---

## 2 y 3. Legibilidad del checkout: sombra de texto + glass en pago

**Sombra de texto por elemento (#2):** se agregó el campo `shadow` a `TextStyle` (motor de temas).
- 5 presets: Sin sombra / Suave / Media / Fuerte / Halo.
- La tinta de la sombra **se invierte por esquema** (negra en oscuro, blanca/halo en claro) vía `--shadow-ink`.
- Se aplica a **cada rol de texto** del menú (títulos, precios, nombres, etc.) y por **elemento concreto**.
- Control en tu editor de Super Admin (`theme-editor.tsx → TextStyleCtl`) y resumen global del checkout
  (`checkoutTextShadow`, default **Suave**) aplicado a las etiquetas del checkout.

**Glass en opciones de pago (#3):** las tarjetas de **Efectivo / Tarjeta** ahora tienen fondo glass + blur
(`checkoutPayGlass`, default **on**), y la opción seleccionada gana un **aro de acento + sombra**. Así se
distinguen con cualquier paleta (resuelve el "no se ve qué dice"). El texto de las opciones subió de peso y de
contraste (`--u-text-2` en vez de `--u-text-3`).

Archivos: `src/lib/theme/defaults.ts`, `src/lib/theme/resolve.ts`, `src/app/globals.css`,
`src/components/checkout-form.tsx`, editores super y admin.

> Defaults + controles, como pediste: arregla la legibilidad por defecto **y** puedes ajustar todo.

---

## 4. Panel admin con menos ruido: secciones desplegables

- **Sidebar (escritorio):** los grupos del menú (Operación / Negocio / Cuenta) ahora son **desplegables**.
  La sección **"Cuenta"** (suscripción, personalizar, perfil, QR, soporte…) **arranca plegada** para no abrumar.
  La elección se recuerda en `localStorage`. Si una sección plegada tiene la página activa, muestra un punto
  de acento. En móvil la barra inferior **no se ve afectada** (siempre muestra todo).
- **Editor de personalización (admin):** los paneles (`Section`) ahora son **acordeones** (clic en el título
  para plegar/desplegar), con estado recordado por sección.

Archivos: `src/components/admin/shell.tsx`, `src/app/globals.css`, `src/components/admin/admin-theme-editor.tsx`.

---

## 6. Emojis básicos → íconos SVG (solo interfaz visible)

Se reemplazaron emojis decorativos por componentes `<Icon>` en las pantallas:
- **Cliente:** banner de instalar app (🍽️), checkout zona-fuera (😔).
- **Catálogo admin:** botones editar (✎), guardar (✓), cancelar (×), placeholder de producto sin foto (🍽).
- **Pedidos admin (order-card):** teléfono 📱, tipo de pedido 🥡🍽🛵, dirección 📍🪑, mesero 🙋, cupón 🏷,
  pago 💳💵, notas 📝, mapa 🗺, imprimir 🖨.
- **Tomar pedidos (mesero):** 🙋📋🪑✓🛎. **Panel de pedidos:** toast 🔔, export ⬇ (Excel/PDF).
- **Personal:** badge 🙋 Mesero. **Notificaciones:** toast 🔔.
- Ícono nuevo `download` agregado al set (`icons.tsx`).

**Se dejaron a propósito** (ahí el emoji ayuda y tú elegiste no tocarlos):
- Mensajes de **WhatsApp** (checkout, mesero, order-card builder).
- **Recibos / tickets impresos** (HTML de impresión en `order-card.tsx`).
- **Notificaciones del sistema operativo** (`showNotification('🛎 …')`) — como WhatsApp, resaltan en la bandeja.
- Campo de **ícono de categoría** (acepta emoji a propósito — ver hallazgo abajo).
- Checkmarks tipográficos en textos de éxito ("Guardado ✓", "Número válido ✓").

---

## 5. Replanteo — hallazgos para que decidas

Cosas que vi "con ojos de usuario nuevo" y que conviene resolver (no las toqué para no romper sin tu visto bueno):

1. **Doble sistema de íconos → RESUELTO (2026-06-20).** El input de emoji estaba en `category-manager.tsx`,
   que resultó ser **código muerto** (lo reemplazó `catalog-panel.tsx`, no se importa en ningún lado). La
   gestión real (`/admin/categorias` → `categories-panel.tsx`) ya derivaba un ícono SVG del nombre, pero el
   usuario **no podía elegirlo** y al editar el nombre **se pisaba** el ícono guardado. Ahora hay un **selector
   de íconos SVG** (con opción "Automático") en alta y edición; `pickIcon` (catálogo cliente) valida contra
   `ICON_PATHS` y cae a `utensils` si el valor guardado es un emoji viejo. **Pendiente menor:** `category-manager.tsx`
   sigue siendo código muerto (se puede borrar junto con las acciones legacy de `categories.ts`).

2. **Código muerto en checkout.** En `checkout-form.tsx` el bloque de **propina** está detrás de
   `const showTip = false` y `tipAmount = 0` (nunca se renderiza). O se conecta a `config.tipEnabled`/`tipPercent`
   (que ya existen) o se elimina. Hoy es ruido.

3. **Dos editores de personalización que se solapan.** `admin-theme-editor.tsx` (dueño, /admin/personalizacion)
   y `theme-editor.tsx` (Super Admin). El de admin no tenía controles de checkout (ya le agregué la sección).
   Conviene decidir el alcance de cada uno para no duplicar mantenimiento.

4. **Sombra como herramienta de legibilidad sobre fondos con imagen.** Ahora que existe `shadow` por texto,
   los temas con `backgroundType: 'image'` se benefician mucho. Sugerencia: en las plantillas con imagen,
   activar sombra "Media" por defecto en títulos.

5. **Primer vistazo del dueño:** el panel sigue teniendo muchas entradas. Con las secciones plegables se alivia,
   pero a futuro valdría un **dashboard de inicio** (`/admin`) con 3–4 accesos rápidos (Pedidos de hoy, Agregar
   platillo, Ver mi menú, Personalizar) en vez de caer directo a una lista. Quedó fuera de alcance esta noche.

---

## Cómo probar

1. `npm run dev` (Supabase local arriba). Entra a la **demo** (`demo.localhost`) → carrito → **Ir a pagar**:
   - Las opciones **Efectivo / Tarjeta** se ven como tarjetas glass; la seleccionada con aro de acento.
   - Las etiquetas tienen una sombra sutil (cámbiala en el editor: Sin sombra / Suave / … / Halo).
2. Entra al **admin** (`azucarnegra@gmail.com`) → **Catálogo** → **Nuevo platillo**: el modal toma el color de
   la paleta, ya no es negro fijo. Cambia la paleta en Personalización y vuelve a abrir el modal.
3. **Sidebar:** la sección **Cuenta** arranca plegada; clic en los títulos pliega/despliega (se recuerda).
4. **/admin/personalizacion → Catálogo → "Checkout y pago"**: prueba los nuevos controles. Las secciones
   del editor ahora son acordeones.

Verificado: `tsc --noEmit` limpio en cada paso.

---

## Seguimiento (2026-06-20): íconos de categoría + dashboard de inicio

- **Íconos de categoría a SVG (#5 hallazgo 1):** selector de íconos en `/admin/categorias` (alta y edición)
  con opción "Automático" (sigue sugiriendo por el nombre) y 12 íconos. Arregla que editar el nombre pisara
  el ícono. `pickIcon` del catálogo valida contra `ICON_PATHS`. *Verificado en navegador*: popover con 13
  opciones, elegir "coffee" guarda `icon=coffee`.
- **Dashboard de inicio (`/admin`):** antes redirigía a `/admin/menu`; ahora es un tablero con saludo,
  números de hoy (pedidos / ventas / ticket, si hay pedidos en línea) y 6 accesos rápidos (Pedidos, Agregar
  platillo, Catálogo, Categorías, Personalizar, Ver mi menú). El logo del sidebar enlaza al inicio; el topbar
  dice "Inicio". *Verificado en navegador* (login dueño → /admin renderiza KPIs + tarjetas, sin errores).
- `build` de producción ✓ (`✓ Compiled successfully`, /admin ahora dinámica), `tsc` ✓.
