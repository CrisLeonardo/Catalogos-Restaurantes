'use client';

import Image, { type ImageProps } from 'next/image';
import { assetLoader, assetPath } from '@/lib/asset-image';

/**
 * `next/image` para las fotos del restaurante (bucket `restaurant-assets`).
 *
 * Si la fuente es una foto nuestra en un formato que /img sabe reducir,
 * el srcset apunta a /img/<ancho>/… (Cloudflare la guarda cerca del
 * cliente y el navegador un año — ver lib/asset-image.ts). Cualquier otra
 * fuente sigue por el optimizador de Next, como antes.
 *
 * El cargador se fija AQUÍ, en un componente de cliente, y no con
 * `images.loaderFile` en next.config: el cargador global apaga
 * `/_next/image` para toda la aplicación (next-server.js lo responde con
 * 404), y las fuentes que no son nuestras lo siguen necesitando.
 */
export default function AssetImage({ alt, ...props }: ImageProps) {
  const own = typeof props.src === 'string' && assetPath(props.src) !== null;
  if (!own) return <Image alt={alt} {...props} />;
  return <Image alt={alt} {...props} loader={assetLoader} />;
}
