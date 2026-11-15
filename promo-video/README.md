# Video promocional de Leogin

Anuncio vertical de 40 s (1080×1920, 30 fps, H.264) para TikTok y Reels, dirigido a la **cafetería o el restaurante pequeño que empieza**. Muestra la app de verdad: las pantallas se graban de la app local con Playwright y se montan con [Remotion](https://www.remotion.dev).

El guion, los ganchos y las decisiones están en [`docs/negocio/GUION_VIDEO_PROMO_2026-11-14.md`](../docs/negocio/GUION_VIDEO_PROMO_2026-11-14.md).

Esta carpeta no toca el código de la app. Solo lee la app local y siembra datos **ficticios** en la base **local**.

## Qué sale

| Archivo en `out/` | Qué es |
|---|---|
| `leogin-40s-A-dolor.mp4` | El video principal, con el gancho recomendado («Cierras la caja… ¿y no cuadra?») |
| `leogin-40s-B-resultado.mp4` | El mismo video con el gancho B («Cerrar el día al centavo») |
| `leogin-40s-C-cronometro.mp4` | El mismo video con el gancho C (cronómetro del celular al panel) |
| `gancho-*-3s.mp4` | Solo los primeros 3 s de cada gancho, para pruebas A/B |
| `grabacion/*.webm` | La toma corrida de cada pantalla, con el dedo visible |

## Cómo se reproduce

Requisitos: Node 20 o más, Docker Desktop y el entorno local de `plataforma/` (ver `docs/guias/GUIA_ENTORNO_LOCAL.md`), con el restaurante de ejemplo Rincón 502 sembrado (`plataforma/supabase/seed_demo_rincon502.sql`).

```bash
# 1. La app local, en modo producción (el modo dev es demasiado lento para grabar)
cd plataforma && npx supabase start && npx next build && npx next start -p 3000

# 2. Aquí
cd promo-video
npm install
npm run seed      # día de ventas ficticio en Rincón 502 (solo base local)
npm run grabar    # Playwright graba el flujo → public/capturas y out/grabacion
npm run render    # los 6 MP4 en out/  (genera la música si falta)
npm run verificar # fotogramas 0, 1, 3, 10, 20 s y final + ffprobe
```

`npm run dev` abre Remotion Studio para ver y ajustar el video cuadro a cuadro.

## Cómo está hecho

- **`seed/preparar-demo.sql`**: deja a Rincón 502 (restaurante ficticio) con el tema de la demo web, las ilustraciones propias de los platillos, un sábado de ventas creíble y tres pedidos en curso. También siembra los mismos días de las cuatro semanas anteriores, para que «vs. un sábado normal» compare contra algo parecido. Se niega a correr si la base no parece la local.
- **`scripts/grabar.mjs`**: recorre el flujo estrella en tres aparatos: el cliente pide desde la Mesa 4, suena en el panel, la cocina lo ve, el cliente sigue su pedido, la caja cuadra y el dueño ve el día. Guarda cada estado en alta resolución, con la caja de cada elemento que el video resalta. También mide el tiempo real del toque en «Confirmar pedido» a la aparición en el panel (gancho C).
- **`src/`**: la composición. El dedo, el zoom y el resaltado se animan en Remotion sobre las capturas, por eso el texto sale nítido.
- **Música y efectos**: `scripts/musica.mjs` los sintetiza con código (marimba en Sol mayor, «ding», sello). No hay material de terceros. Para usar otra pista, ponla en `public/audio/` y cambia la prop `musica` en `src/datos.ts`.
- **Marca**: paleta Brasa, Mango, Carbón y Masa, tipografías Unbounded y Geist, logo y Leo, tomados del propio proyecto (`src/marca.ts`).

## Rodeo que usa la grabación (ya corregido en la app)

Antes de la migración 181 (PR #118), un pedido recién creado nacía con `orders.updated_at` vacío. El panel usa ese campo como versión al «Enviar a cocina», así que respondía **«Operación de pedido inválida.»**. `grabar.mjs` todavía le pone la hora de creación **solo en la base local**, para poder grabar contra una base que aún no tenga la 181. Con la 181 aplicada, ese paso no cambia nada.

## Licencia de Remotion

Remotion es gratis para personas y empresas de hasta 3 personas. Si Leogin crece por encima de eso, hace falta su licencia de empresa: pon la clave en `REMOTION_LICENSE_KEY` y `npm run render` la usa sola.

---

# Serie «Otra vez» — el mismo domingo, dos veces

Tres videos de 45,6 s, uno por tipo de negocio, cada uno en **vertical** (1080×1920, TikTok y Reels) y **horizontal** (1920×1080, para mostrarlo en una PC o tableta al visitar un restaurante). No muestran precios ni prueba gratis. El guion y las decisiones están en [`docs/negocio/GUION_VIDEO_OTRA_VEZ_2026-11-15.md`](../docs/negocio/GUION_VIDEO_OTRA_VEZ_2026-11-15.md).

| Video | Para quién |
|---|---|
| `leogin-otra-vez-meseros-*.mp4` | Restaurante con meseros |
| `leogin-otra-vez-comedor-*.mp4` | Negocio pequeño, sin meseros: el cliente pide desde su mesa |
| `leogin-otra-vez-domicilio-*.mp4` | Quien vende en línea, a domicilio o para llevar |

## Cómo se reproduce

Con Supabase local arriba y la app en `http://localhost:3000` en modo producción (igual que arriba):

```bash
cd promo-video
npm install
npm run otra-vez:grabar   # siembra Rincón 502 (solo base local) y graba las 44 pantallas
npm run otra-vez:render   # los 6 MP4 en out/otra-vez/ (genera banda y QR si faltan)
```

`npm run otra-vez:grabar -- meseros` regraba solo una sección (`meseros`, `comedor`, `domicilio`, `cierre`, `extras`). `npm run otra-vez:render -- comedor vertical` exporta solo uno. `node scripts/otra-vez/revisar.mjs <composición> <carpeta> <cuadros>` saca fotogramas sueltos para revisar sin exportar todo.

## Cómo está hecho

- **`src/otra-vez/guiones.ts`**: todo el texto de los tres videos (gancho, molestias del caos, los cinco pasos y qué pantalla muestra cada uno). Para otro público se agrega un guion; el motor no cambia.
- **`src/otra-vez/Caos.tsx`**: el domingo sin Leogin. Depende solo del número de cuadro, por eso el rebobinado es la misma escena recorrida hacia atrás.
- **`src/otra-vez/Pasos.tsx`**: las pantallas reales dentro del teléfono o la tableta, con el dedo, el resaltado y el acercamiento animados sobre las capturas.
- **`scripts/otra-vez/sonido.mjs`**: la banda sonora, sintetizada con código (sin material de terceros), a 100 pulsos por minuto; el video corta en los mismos pulsos (`src/otra-vez/base.ts`).
- **`scripts/otra-vez/qr.mjs`**: el QR del cierre. Para apuntarlo a otra dirección: `node scripts/otra-vez/qr.mjs https://…`.

La grabación deja a Rincón 502 **local** como un restaurante que ya paga su plan (sin avisos de prueba) y con ubicación, para que salga el mapa de entrega. Los pedidos de la grabación cambian de estado directo en la base local para mostrar el seguimiento («Listo», «En camino»).
