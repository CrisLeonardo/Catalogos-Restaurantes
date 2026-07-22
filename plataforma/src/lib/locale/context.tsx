'use client';

/* ============================================================
   IDIOMA DEL MENÚ (Fase 3 auditoría de lanzamiento)
   ------------------------------------------------------------
   Selector de idioma del catálogo público (ES siempre disponible + los que
   el dueño activó en restaurants.menu_languages, hoy solo 'en'). Separado
   de ThemeContent (textos fijos de la UI que el dueño personaliza en un solo
   idioma): esto solo afecta name_en/description_en de productos/categorías,
   con fallback automático al español si no hay traducción capturada — el
   dueño no tiene que traducir todo su catálogo para poder activarlo.
   ============================================================ */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type MenuLocale = 'es' | 'en';

interface LocaleCtxValue {
  locale: MenuLocale;
  setLocale: (l: MenuLocale) => void;
  /** Idiomas disponibles para este restaurante (['es'] si no activó ninguno extra). */
  available: MenuLocale[];
}

const LocaleCtx = createContext<LocaleCtxValue>({ locale: 'es', setLocale: () => {}, available: ['es'] });

function storageKey(restaurantId: string): string {
  return `menu-locale:${restaurantId}`;
}

export function LocaleProvider({
  restaurantId,
  extraLanguages,
  children,
}: {
  restaurantId: string;
  extraLanguages: string[];
  children: ReactNode;
}) {
  const available: MenuLocale[] = ['es', ...extraLanguages.filter((l): l is MenuLocale => l === 'en')];
  const [locale, setLocaleState] = useState<MenuLocale>('es');

  // Se lee de localStorage solo en el cliente (tras montar) para no desincronizar
  // el HTML del servidor (siempre 'es' en el primer render).
  useEffect(() => {
    if (available.length < 2) return;
    try {
      const saved = localStorage.getItem(storageKey(restaurantId));
      if (saved === 'en' && available.includes('en')) setLocaleState('en');
    } catch { /* no-op */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function setLocale(l: MenuLocale) {
    setLocaleState(l);
    try { localStorage.setItem(storageKey(restaurantId), l); } catch { /* no-op */ }
  }

  return <LocaleCtx.Provider value={{ locale, setLocale, available }}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): LocaleCtxValue {
  return useContext(LocaleCtx);
}

/** Traducción con fallback automático al español si no hay traducción capturada. */
export function useLocalized(base: string, translated: string | null | undefined): string {
  const { locale } = useLocale();
  if (locale === 'en' && translated && translated.trim()) return translated;
  return base;
}
