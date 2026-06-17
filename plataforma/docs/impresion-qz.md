# Impresión directa (cocina y recibos) con QZ Tray

Guía para configurar la impresión automática en el panel del restaurante.
Se hace **una sola vez por computadora** (la del mostrador/caja).

## ¿Qué resuelve?

- **Comanda de cocina**: al confirmar un pedido sale sola en la impresora de cocina.
- **Recibo**: sale en otra impresora distinta, sin diálogo.
- Sin QZ (o desde un celular/tablet) la impresión sigue funcionando, pero con el
  diálogo normal del navegador y a una sola impresora.

> QZ Tray solo existe para **PC/Mac/Linux**. Desde un celular no hay impresión
> silenciosa: la app que confirma los pedidos debe correr en una computadora.

## Instalación (una vez por equipo)

1. Descarga QZ Tray desde **https://qz.io/download/** e instálalo.
2. Ábrelo. Verás su ícono junto al reloj (bandeja del sistema). Déjalo abierto;
   se inicia solo con Windows.
3. Conecta las impresoras térmicas (cocina y recibos) y verifica que Windows las
   vea en *Configuración → Bluetooth y dispositivos → Impresoras*.

## Configuración en el panel

1. Entra al panel → **Perfil → Impresión (cocina y recibos)**.
2. Activa **«Imprimir comanda de cocina al confirmar»** si quieres la comanda
   automática.
3. En **«Impresión directa (sin diálogo) · QZ Tray»** pulsa **«Conectar con QZ Tray»**.
   - La primera vez, QZ mostrará una ventana pidiendo permiso para el sitio.
     Marca **«Recordar / Remember»** y pulsa **«Permitir / Allow»**.
4. Cuando conecte, elige en los desplegables la impresora de **🍳 cocina** y la de
   **🧾 recibos**. Se guardan en ese equipo.
5. Usa **«Probar cocina»** y **«Probar recibo»** para confirmar que salen bien.

Para cambiar de impresora más adelante, vuelve a esta pantalla y elige otra.

## Si dice «No pudimos conectar con QZ Tray»

Aunque esté instalado, suele ser uno de estos:

1. **QZ Tray no está abierto.** Ábrelo (busca «QZ Tray» en el menú inicio) y
   reintenta. Su ícono debe estar junto al reloj.
2. **No aceptaste el permiso.** QZ muestra una ventana de «sitio no confiable»
   (porque usamos un certificado propio). Marca «Recordar» y pulsa «Permitir».
   Si la bloqueaste antes: abre QZ → *Advanced → Site Manager*, borra el bloqueo
   del sitio y reintenta.
3. **La página es `https://` y el navegador bloquea la conexión local.** Abre QZ
   Tray una vez para que registre su certificado de `localhost`; si persiste,
   reinstala QZ Tray (su instalador añade el certificado de confianza).
4. Mira la línea **«Detalle técnico»** del aviso o la consola del navegador
   (F12 → Console): ahí aparece el error exacto de QZ.

La impresión **nunca se bloquea**: si QZ no conecta, se usa el diálogo del navegador.

## Nota técnica (para el equipo de Leogin)

- La firma de QZ está implementada (RSA-SHA512). El certificado **público** está
  en `src/lib/qz-cert.ts`; la clave **privada** va en la env `QZ_PRIVATE_KEY_B64`
  (solo servidor) y firma en `POST /api/print/sign`. **Falta agregar esa env en
  Render** para producción.
- La firma es **opcional en runtime**: si el endpoint de firma no responde
  (sin sesión, sin clave), la conexión a QZ se hace sin firma y sigue funcionando.
- El certificado es self-signed → QZ muestra el aviso «no confiable» una vez por
  equipo (se quita con «Recordar»). Para eliminarlo en todos los equipos sin tocar
  cada uno habría que usar un certificado emitido por QZ (licencia comercial).
