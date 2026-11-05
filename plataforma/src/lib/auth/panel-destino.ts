import { authPathFor } from '@/lib/tenant';

/** Conserva únicamente rutas de panel locales. El destino vuelve a pasar sus candados. */
export function destinoDePanel(value: unknown): string | null {
  if (typeof value !== 'string' || /[\\\r\n]/.test(value)) return null;
  if (!/^\/panel\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9/_-]*)?$/i.test(value)) return null;
  return value;
}

export function accesoAlPanel(slug: string | null, pathname: string | null): string {
  const login = authPathFor('/admin/login', slug);
  const next = destinoDePanel(pathname);
  return next ? `${login}?next=${encodeURIComponent(next)}` : login;
}

export function segundoFactorPara(value: unknown): string {
  const next = destinoDePanel(value);
  return next ? `/admin/dos-pasos?next=${encodeURIComponent(next)}` : '/admin/dos-pasos';
}
