/* Formato de moneda para los cobros de la plataforma (mig. 028). */

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

/** "Q1,250.00" — monto con el símbolo de la moneda. */
export function fmtMoney(n: number, currency = 'GTQ'): string {
  const sym = currencySymbol(currency);
  return `${sym}${(n ?? 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
