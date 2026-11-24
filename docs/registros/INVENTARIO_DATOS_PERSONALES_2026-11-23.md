# Inventario de datos personales, retención y borrado · 23 de noviembre de 2026

Auditoría de lanzamiento, **LZ-10** ([auditoría](../auditorias/AUDITORIA_LANZAMIENTO_LEOGIN_2026-11-23.md), §4). Sirve para responder tres preguntas por cada dato personal: dónde está, cuánto tiempo se guarda y cómo se borra si alguien lo pide. Está hecho a partir del código y las migraciones hasta la 193. Lo marcado **por confirmar** depende de un panel externo (Supabase, Render) y no se puede ver desde el repositorio.

## Proveedores que tratan los datos

| Proveedor | Qué guarda | Retención | Estado |
| --- | --- | --- | --- |
| Supabase (base de datos, Auth, archivos) | Todo lo de las tablas de abajo, cuentas y archivos | Mientras exista la fila. Copias de seguridad según el plan | Plan y copias: **por confirmar** en el panel |
| Render (servidor) | Registros (`console.*`) del servidor | Según el plan | Retención y quién tiene acceso: **por confirmar**. Los registros no llevan teléfono, correo, dirección, NIT ni nombre de comensal (`logs-sin-datos-personales.test.ts`) |
| Cloudflare (caché de fotos en `/img`) | Fotos públicas de la carta | Caché del borde | Sin datos personales |
| Google (inicio de sesión) | Cuenta de Google del dueño, del personal o del comensal que entra con Google | De Google | Leogin recibe el correo y el nombre |
| Proveedor FEL (si se activa) | Facturas con NIT, nombre y dirección del receptor | De la SAT | FEL está apagado hoy |

## Comensales

| Dato | Dónde | Quién lo ve | Se guarda hoy | Cómo se borra |
| --- | --- | --- | --- | --- |
| Ficha de cliente: nombre, teléfono, correo, dirección y coordenadas | `customers` | El restaurante | Sin plazo | `leogin_olvidar_comensal` (migración 192), o con el local |
| Puntos de lealtad | `loyalty_accounts`, `loyalty_transactions` | El restaurante y el comensal | Sin plazo | Caen con la ficha |
| Pedido: nombre, teléfono, dirección, coordenadas y notas | `orders` | El restaurante. El seguimiento público muestra solo el nombre | Sin plazo | La 192 en los pedidos cerrados: deja «Cliente eliminado» y conserva los totales |
| Reseña: nombre y comentario | `order_ratings` | El restaurante | Sin plazo | La 192 borra nombre y comentario, y deja la calificación |
| Reservas y lista de espera: nombre, teléfono y notas | `reservations`, `waitlist_entries` | El restaurante | Sin plazo | La 192 |
| Conversación de WhatsApp: número y mensajes | `whatsapp_conversations`, `whatsapp_messages` | El restaurante | Sin plazo | La 192 las borra |
| Factura: NIT, nombre, dirección y correo del receptor | `fel_documents` | El restaurante | Se conserva | **No se borra**: obligación fiscal. La 192 la informa como conservada |
| Nombres en la cuenta compartida de la mesa | `mesa_cuenta_lineas.nombre` | La mesa y el restaurante | Sin plazo | Solo con el local. Es un nombre de pila escrito por la mesa, sin teléfono que lo enlace |
| Cuenta de Google del comensal | Supabase Auth | Leogin | Sin plazo | El superadmin, desde Cuentas |
| Identificador anónimo del aparato (`visitor_id`) | `page_visits`, `menu_embudo` | Métricas del restaurante | Sin plazo | Solo con el local. No identifica a nadie por sí solo |
| En su teléfono: nombre, teléfono, dirección, carrito, sus pedidos e identificador anónimo | `localStorage` del navegador (`customer-<local>`, `myorders-<local>`, `leogin-visitor-id`) | Solo ese navegador | Hasta que borre los datos del sitio | Lo borra el propio comensal (la política lo dice) |

## Restaurantes, dueños y personal

| Dato | Dónde | Se guarda hoy | Cómo se borra |
| --- | --- | --- | --- |
| Cuenta del dueño o del personal: correo y nombre | Supabase Auth, `profiles` | Sin plazo | Superadmin → Cuentas → Borrar. Se niega si es el único dueño de un local |
| PIN del personal | `staff_pins` (solo hash y sal) | Mientras exista la persona | Al quitarla del equipo |
| Datos del local: dirección, coordenadas, correo de contacto y logo | `restaurants`, `restaurant_themes` | Sin plazo | Superadmin → borrar restaurante (cascada en las tablas del local; `profiles` y `ayuda_sin_respuesta` solo pierden el enlace) |
| Nombres en caja, anulaciones, propinas y traspasos | `cash_counts`, `order_voids`, `tip_distribution_shares`, `caja_traspasos` | Sin plazo | Con el local. Son registro contable y antifraude |
| Repartidores: nombre y teléfono | `drivers` | Sin plazo | El panel solo los desactiva. Se borran con el local |
| Comprobante de pago de la mensualidad (puede llevar datos bancarios) | Bucket privado `payment-proofs` y `payment_proofs` | Hasta que suba otro (reemplaza el anterior) o sin plazo | Al borrar el local se borra su carpeta (`lib/archivos-del-local.ts`) |
| Avisos del navegador (suscripción push) | `push_subscriptions`, `super_push_subscriptions` | Hasta que el navegador la invalide | Se purgan solas al fallar el envío |
| Bitácora de accesos al panel: IP y navegador | `panel_access_log` | **180 días** | Purga diaria automática (migración 109) |
| Bitácora del superadmin: correo e IP | `super_admin_log` | Sin plazo | No tiene purga |
| Límites de peticiones (pueden llevar IP) | `rate_limit_buckets` | 1 día después de vencer | Purga cada hora (migración 100) |
| Puentes de inicio de sesión | `cuenta_puentes` | 1 día después de vencer | Purga diaria (migración 146) |
| Fotos de la carta | Bucket público `restaurant-assets` | Sin plazo | Al borrar el local se borran las que nadie más usa. Se conservan las que nombra una copia del local, una plantilla o un grupo (migración 193) |
| Recibos de gastos | `cash_expenses.receipt_url` | — | Columna sin uso: ninguna pantalla sube recibos |

## Cómo atender una solicitud de borrado de un comensal

La política de privacidad le pide al comensal dirigirse al restaurante. El restaurante la pasa a Leogin, que la atiende en el editor SQL de Supabase:

1. Confirmar con el restaurante el local y el teléfono con el que pidió.
2. Ensayo, que no cambia nada:
   `select public.leogin_olvidar_comensal('<id del local>', '<teléfono>');`
   Devuelve cuántas fichas, pedidos, reservas, conversaciones y facturas encontró.
3. Si hay `pedidos_abiertos`, esperar a que se cierren y repetir.
4. Borrar: `select public.leogin_olvidar_comensal('<id del local>', '<teléfono>', true);`
5. Si el comensal también pidió borrar su cuenta de Google en Leogin: superadmin → Cuentas → Borrar.
6. Responderle al restaurante qué se borró y qué se conserva (facturas, por ley) y anotar la fecha en el registro de solicitudes.

El teléfono se compara solo por sus dígitos, y basta con que coincidan los últimos 8 («+502 5555-1234» y «55551234» son el mismo). Por eso conviene revisar el ensayo antes de confirmar.

## Brechas y decisiones pendientes

- **Plazos (decisión del dueño).** Hoy casi todo se guarda mientras exista el local, y la política dice «mientras sean necesarios». Hay que decidir si los datos de contacto de los pedidos cerrados se anonimizan solos después de un plazo (por ejemplo, 24 meses), y si `super_admin_log` lleva purga.
- **Facturas al borrar un local (decisión del dueño).** Borrar un restaurante borra en cascada sus documentos FEL (`fel_documents`) y las facturas de Leogin a ese local (`invoices`, `payment_proofs`). Los FEL se deben conservar por obligación fiscal, y las facturas son la contabilidad de Leogin. Hay que exportarlos antes de borrar, o cambiar el borrado por un cierre que los conserve (se relaciona con el «cierre definitivo» pendiente de LZ-08).
- **Solicitud desde el panel.** Hoy la atiende Leogin con la función de la 192. Si se quiere que el dueño la haga solo, va en una pantalla, con maqueta según la guía de diseño.
- **Por confirmar en paneles externos:** plan y antigüedad de las copias de Supabase, retención y acceso de los registros de Render, y quién en Leogin tiene acceso a cada panel.
- **Ensayo real:** correr el procedimiento completo con una solicitud ficticia en producción y anotar el tiempo de respuesta.
- **Escritorio:** la copia local del agente de impresión y su borrado al desinstalar o revocar el aparato quedan para LZ-07.
