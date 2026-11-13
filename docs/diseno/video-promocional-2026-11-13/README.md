# Video promocional · Del caos al control

Video vertical de **30 segundos, 1080 × 1920, 30 fps**, dirigido a dueños de restaurantes en Guatemala. Archivo para publicar: [`videos/Leogin-Promocional-30s-1080x1920.mp4`](videos/Leogin-Promocional-30s-1080x1920.mp4). H.264, audio AAC estéreo y cabecera de reproducción rápida.

La pieza abre con el problema desde el primer cuadro, sin introducción de marca. Sigue una misma orden ficticia, la #128, desde el menú hasta la cocina y el cobro. Cierra con la acción elegida por el dueño: **«Prueba Leogin gratis»**. Las escenas del sistema están identificadas como demostración ilustrada y usan datos de ejemplo; no son una grabación del producto ni un testimonio.

| Tiempo | Contenido |
| --- | --- |
| 0–3 s | Fotografía gastronómica, movimiento de cámara y «¿Otro pedido perdido?» |
| 3–6.5 s | Pedido disperso en chat, papel y avisos de cocina |
| 6.5–9 s | Conexión entre cliente, cocina y caja; presentación de Leogin |
| 9–13 s | Menú y envío de una orden por Q132.00 |
| 13–17 s | La misma orden llega a cocina y cambia de estado |
| 17–21 s | Cobro registrado y ventas ilustrativas desde el celular |
| 21–24 s | Cero comisión por pedido; mensualidad según plan |
| 24–30 s | Prueba de 30 días sin tarjeta, condiciones y distleogin.com |

## Oferta y destino

Oferta comprobada el 13 de noviembre de 2026 en la [web pública](https://distleogin.com/) y el [registro](https://distleogin.com/registro): 30 días de prueba sin tarjeta para planes con pedidos y cero comisión por pedido. Al terminar aplica la tarifa del plan elegido. El dominio anterior, leogin.online, redirige a distleogin.com; por eso el anuncio muestra el dominio actual. Revisar estas condiciones antes de reutilizar la pieza en otra campaña. No se añadieron cifras de ahorro, resultados garantizados, testimonios ni cupos inventados.

## Recursos y edición

- Identidad: sistema visual vigente de Leogin, Geist y marca oficial del repositorio.
- Fotografías: `assets/cocina.png`, creada con la herramienta integrada de generación de imágenes. No representa a un restaurante cliente.
- Platillos: ilustraciones del restaurante de demostración Rincón 502 que ya existen en `plataforma/public/demo/rincon502/`.
- Locución: voz sintética `es-GT-AndresNeural`, generada con `edge-tts`. «Leoguin» en el texto de síntesis guía la pronunciación; en pantalla se conserva **Leogin**.
- Música y efectos: síntesis original por código en `audio.py`; no se usaron canciones de terceros.
- Montaje: `video.html`, lienzo con línea de tiempo determinista, tipografía integrada y movimiento desde el segundo cero. No modifica las pantallas de la aplicación.

Prompt final de la fotografía, usado en modo integrado de la skill `imagegen`:

> Use case: ads-marketing. Create a premium photorealistic vertical 9:16 commercial background photograph for a Guatemalan restaurant software ad. Extreme appetizing close-up of a freshly cooked double smash cheeseburger, molten cheddar, glossy brioche bun, steam rising in warm amber backlight, on a dark ceramic plate at a restaurant kitchen pass. A hand of a Latin American cook slides the plate urgently toward camera at lower right, slight natural motion blur only on hand. Some crumpled blank kitchen order tickets on the counter to the left, no legible writing. Deep dark charcoal kitchen background, warm cinematic practical lights with bokeh. Burger occupies center-lower half of frame, upper 40 percent is mostly dark negative space for headline added separately. Strong tactile textures, professional real food photography, shot on 50mm cinema lens, contrasty editorial lighting, sophisticated color grade with warm terracotta highlights, realistic not illustration. No text, no logos, no watermark, no letters, no UI. This is a single still background plate that will be animated with camera moves.

## Volver a exportar

Desde la raíz del repositorio, con Node, Python y las dependencias de `plataforma` instaladas:

```powershell
python -m pip install -r docs/diseno/video-promocional-2026-11-13/requirements.txt
python docs/diseno/video-promocional-2026-11-13/audio.py
node docs/diseno/video-promocional-2026-11-13/render.mjs
python docs/diseno/video-promocional-2026-11-13/verificar.py
```

El render abre un servidor temporal limitado a `127.0.0.1`, carga los recursos del repositorio y lo cierra al terminar. No requiere claves de API. La síntesis de nuevas frases necesita conexión a internet. Los MP3 de las frases originales se conservan para reproducir el montaje sin volver a solicitarlas.

Para revisar encuadres sin exportar todo el video, agregar `--fotos` al comando de render. Para reproducir la fuente con su audio, generar primero la banda sonora, servir la raíz del repositorio con `python -m http.server 8765 --bind 127.0.0.1` y abrir `/docs/diseno/video-promocional-2026-11-13/video.html` en ese servidor.

## Comprobación

Se revisaron visualmente once encuadres, incluido el primer fotograma y el cierre, en el render real de Chromium. Se comprobó el recorrido completo del archivo exportado, resolución, duración, número de cuadros, pista de audio y nivel sonoro. Las comprobaciones técnicas se conservan en `videos/verificacion.json`. La revisión de encuadres está en `videos/revision.jpg` como apoyo local; no se versionan los cuadros intermedios ni la banda WAV regenerable.

La retención y la conversión de una campaña requieren medición con audiencia real; no se han medido en esta producción.
