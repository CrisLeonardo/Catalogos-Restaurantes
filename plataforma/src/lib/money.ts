/* ============================================================
   FORMATO DE DINERO — una sola forma de escribir un monto.
   ------------------------------------------------------------
   Nació para los cobros de la plataforma (mig. 028). La auditoría
   2026-10-02 (T-01) encontró el mismo monto escrito de tres
   maneras: `Q2,650.00` en Hoy, `Q2794.10` en Finanzas (un
   `Q${n.toFixed(2)}` sin separador de miles) y `Q1146,00` aquí
   mismo, porque esta función usaba el locale `'es'` — español
   genérico: coma decimal y sin agrupar los números de 4 cifras.
   Lo veían la Suscripción del dueño y todo el Super Admin.

   Ahora es `es-GT` (punto decimal, coma de miles), y las pantallas
   que tenían su propia copia la usan. Las que pintan con la moneda
   que configuró el restaurante (pedidos, cuenta de la mesa, Tomar
   pedidos) usan `fmtCurrency` con su `PanelCurrency` — antes eran
   cuatro copias de la misma función (REN-06).
   ============================================================ */

const LOCALE = 'es-GT';

const SYMBOLS: Record<string, string> = {
  GTQ: 'Q',
  MXN: '$',
  USD: '$',
  EUR: '€',
};

/** Símbolo de la moneda (Q, $, …); si no se conoce, el código + espacio. */
export function currencySymbol(currency = 'GTQ'): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

/** "Q1,250.00" — monto con el símbolo de la moneda. `decimals = 0` para
 *  precios redondos de planes ("Q349"). */
export function fmtMoney(n: number, currency = 'GTQ', decimals = 2): string {
  const sym = currencySymbol(currency);
  const num = Number.isFinite(n) ? n : 0;
  return `${sym}${num.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Cómo escribe los importes un restaurante (Ajustes › Pedidos y cobro):
 *  símbolo, delante o detrás, y los separadores de su país. */
export interface PanelCurrency {
  symbol: string;
  position: 'prefix' | 'suffix';
  locale: string;
}

/** Monto con la moneda REAL del restaurante (no "Q" fijo). Si el locale
 *  guardado no es válido, cae a es-GT. `decimals = 0` para el pin del
 *  plano, donde no caben los centavos («Q412»). */
export function fmtCurrency(n: number, c: PanelCurrency, decimals = 2): string {
  const num0 = Number.isFinite(n) ? n : 0;
  const opts = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  let num: string;
  try {
    num = num0.toLocaleString(c.locale, opts);
  } catch {
    num = num0.toLocaleString(LOCALE, opts);
  }
  return c.position === 'suffix' ? `${num}${c.symbol}` : `${c.symbol}${num}`;
}
