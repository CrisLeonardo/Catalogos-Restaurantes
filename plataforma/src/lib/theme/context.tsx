'use client';

/* Provee config + textos resueltos a los componentes del cliente.
   El layout (server) inyecta las variables CSS; este contexto entrega
   los VALORES (textos, flags, moneda) que los componentes necesitan en JS. */

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_CONFIG, DEFAULT_CONTENT, type ThemeConfig, type ThemeContent, type TypographyRole } from './defaults';
import { formatAmount, elementStyleVars, roleSize } from './resolve';

interface ThemeCtx {
  config: ThemeConfig;
  content: ThemeContent;
}

const Ctx = createContext<ThemeCtx>({ config: DEFAULT_CONFIG, content: DEFAULT_CONTENT });

export function ThemeProvider({
  config,
  content,
  children,
}: {
  config: ThemeConfig;
  content: ThemeContent;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ config, content }), [config, content]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeConfig(): ThemeConfig {
  return useContext(Ctx).config;
}

export function useThemeContent(): ThemeContent {
  return useContext(Ctx).content;
}

/**
 * Tipografía de un texto temable. Aplica la clase de rol (`ct-<role>`) y, si se
 * pasa `elementKey`, inyecta las vars del override individual (inline) más el
 * multiplicador de tamaño efectivo para los componentes que fijan px.
 *
 *   const t = useText('heading', 'portadaTitle');
 *   <h1 className={t.className} style={{ ...t.vars, fontSize: `calc(${t.size} * 40px)` }}>
 */
const ROLE_CLASS: Record<TypographyRole, string> = {
  heading: 'ct-heading', poster: 'ct-poster', serif: 'ct-serif', kicker: 'ct-kicker',
  body: 'ct-body', productName: 'ct-product-name', productDesc: 'ct-product-desc',
  price: 'ct-price', button: 'ct-button', tag: 'ct-tag',
};

export function useText(role: TypographyRole, elementKey?: string) {
  const config = useThemeConfig();
  return useMemo(() => ({
    className: ROLE_CLASS[role],
    vars: (elementKey ? elementStyleVars(config, elementKey) : {}) as CSSProperties,
    size: roleSize(config, role, elementKey),
  }), [config, role, elementKey]);
}

/** Helpers de moneda según la config del tenant. */
export function usePrice() {
  const config = useThemeConfig();
  return useMemo(
    () => ({
      symbol: config.currencySymbol,
      position: config.currencyPosition,
      format: (amount: number) => formatAmount(amount, config),
    }),
    [config],
  );
}
