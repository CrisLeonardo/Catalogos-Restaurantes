import type { MetadataRoute } from 'next';
import { rootDomainForUrls } from '@/lib/tenant';

/* Sitemap del sitio comercial (dominio raíz). Los menús de cada restaurante
   viven en subdominios dinámicos y se indexan por su propia metadata. */
function marketingBase(): string {
  const root = rootDomainForUrls();
  const isLocal = root.includes('localhost') || root.startsWith('127.');
  return `${isLocal ? 'http' : 'https'}://${root}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = marketingBase();
  const now = new Date();
  return [
    { url: `${base}/`,          lastModified: now, changeFrequency: 'weekly',  priority: 1 },
    { url: `${base}/planes`,    lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/registro`,  lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/terminos`,  lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${base}/privacidad`,lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];
}
