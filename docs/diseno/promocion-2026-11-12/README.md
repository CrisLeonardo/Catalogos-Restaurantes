# Prueba promocional · Leogin

Propuesta creativa del 2026-11-12 para negocios que venden comida por mensajes. No modifica pantallas de Leogin ni publica publicidad.

- `video.html`: reproductor local, línea de tiempo, dos ganchos y superposición de zona segura. Abrir en navegador desde este checkout, con las dependencias de `plataforma` instaladas para cargar Geist.
- `menu-demo.png` y `producto-demo.png`: capturas del menú público de demostración de Rincón 502. No contienen clientes ni ventas reales. No se envió ningún pedido a la demo.
- `render.mjs`: exportación reproducible a 1080×1920, 30 fps, H.264/AAC, con sonido original sintetizado. No añade paquetes a la app.
- Estrategia y guion: [ESTRATEGIA_MARKETING_2026-11-12.md](../../negocio/ESTRATEGIA_MARKETING_2026-11-12.md).

## Exportar

Requiere Node, dependencias de `plataforma`, Chromium de Playwright y un FFmpeg completo en PATH o indicado con `--ffmpeg`. `--salida` debe ser una carpeta destinada a exportaciones, fuera del repositorio. Los archivos con el mismo nombre en esa carpeta se reemplazan al repetir una exportación.

```powershell
node docs/diseno/promocion-2026-11-12/render.mjs --salida C:/ruta/exportaciones --ffmpeg C:/ruta/ffmpeg.exe
node docs/diseno/promocion-2026-11-12/render.mjs --salida C:/ruta/exportaciones --ffmpeg C:/ruta/ffmpeg.exe --variante b
node docs/diseno/promocion-2026-11-12/render.mjs --salida C:/ruta/exportaciones --solo-fotos
```

La variante A abre con «El chat te come el día» y la B con «¿Otra vez enviando el menú?». El cuerpo permanece igual para comparar el gancho. Se exportan también fotogramas, storyboard y WAV. Las exportaciones finales se guardan fuera de Git para evitar binarios de producción grandes en el repositorio.

## Revisión

Verificar el primer fotograma, lectura desde teléfono, cortes, audio, precios de los productos de ejemplo, totales y cierre. El pedido ilustrado suma 2×Q68 + Q35 = Q171. Las conversaciones y el pedido están rotulados como ejemplos; la demo no es un testimonio de cliente. El mensaje de comisión aclara que los planes con pedidos tienen mensualidad.

El prototipo permite revisar área segura y ambos ganchos. Comprobar además las superposiciones reales en la plataforma elegida antes de publicar. El exportador no inicia campañas, sube archivos ni manda mensajes.

Verificación realizada: revisión visual del storyboard y de fotogramas extraídos del MP4 A; reproductor a 390 y 1280 px sin desborde horizontal ni errores de JavaScript; exportación de ambas variantes; decodificación completa y comprobación de formato, duración y audio. Esto valida los archivos, no su rendimiento comercial. No se ejecutó la aplicación ni se alteraron sus dependencias.
