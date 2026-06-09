'use client';

/* Provee config + textos resueltos a los componentes del cliente.
   El layout (server) inyecta las variables CSS; este contexto entrega
   los VALORES (textos, flags, moneda) que los componentes necesitan en JS. */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_CONFIG, DEFAULT_CONTENT, type ThemeConfig, type ThemeContent } from './defaults';
import { formatAmount } from './resolve';

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
