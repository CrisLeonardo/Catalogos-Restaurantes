/* ============================================================
   IDENTIFICACIÓN DEL RECEPTOR · NIT, CUI y consumidor final
   ------------------------------------------------------------
   Un DTE se emite a nombre de alguien, y ese "alguien" es la única
   parte del documento que escribe una persona con prisa frente a un
   cliente que espera. Es, con diferencia, donde más se equivoca.

   El certificador rechaza un NIT inexistente, pero NO rechaza un NIT
   ajeno bien formado: si el cajero teclea 1234568 en vez de 1234567,
   la factura se certifica a nombre de otro contribuyente. Eso ya no se
   arregla anulando desde el panel — hay dos contribuyentes con un
   documento que no les corresponde. Por eso la validación vive aquí, en
   el borde, y no se delega al certificador.

   ── Qué valida cada cosa ──
   NIT: dígito verificador módulo 11. Atrapa la enorme mayoría de los
        errores de tecleo (un dígito cambiado, dos transpuestos) antes
        de que salgan del local.
   CUI: el número del DPI. Desde que el SAT obliga a identificar al
        comprador arriba del tope de consumidor final, un restaurante
        necesita poder facturar contra DPI, no solo contra NIT.
   ============================================================ */

/** Cómo se identifica al receptor en el DTE (atributo TipoEspecial del XSD). */
export type TipoIdReceptor =
  | 'CF'   // Consumidor final: IDReceptor = "CF", sin TipoEspecial
  | 'NIT'  // NIT guatemalteco, sin TipoEspecial
  | 'CUI'  // Número de DPI, TipoEspecial="CUI"
  | 'EXT'; // Extranjero (pasaporte u otro), TipoEspecial="EXT"

export interface ReceptorId {
  tipo: TipoIdReceptor;
  /** Valor ya normalizado, tal como debe ir en IDReceptor. */
  valor: string;
}

/** Quita espacios, guiones y pasa a mayúsculas. */
export function limpiar(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/[\s.-]/g, '');
}

/**
 * Dígito verificador del NIT guatemalteco (módulo 11).
 *
 * Se ponderan los dígitos del cuerpo de derecha a izquierda con pesos
 * 2, 3, 4… El resto de dividir entre 11 se resta de 11; 10 se escribe
 * como "K" y 11 equivale a 0. Es el mismo cálculo que usa el registro
 * tributario, así que un NIT que pasa aquí existe con altísima
 * probabilidad — aunque solo el SAT sabe a nombre de quién.
 */
export function digitoVerificadorNit(cuerpo: string): string | null {
  if (!/^\d+$/.test(cuerpo) || cuerpo.length === 0) return null;

  let suma = 0;
  let peso = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * peso;
    peso++;
  }

  const resto = suma % 11;
  const dv = 11 - resto;
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/** ¿Es un NIT guatemalteco bien formado y con dígito verificador correcto? */
export function esNitValido(raw: string): boolean {
  const nit = limpiar(raw);
  // Mínimo: un dígito de cuerpo + el verificador.
  if (!/^\d+[0-9K]$/.test(nit) || nit.length < 2) return false;
  const cuerpo = nit.slice(0, -1);
  const dv = nit.slice(-1);
  return digitoVerificadorNit(cuerpo) === dv;
}

/**
 * ¿Es un CUI (DPI) válido?
 *
 * 13 dígitos: 8 de correlativo, 1 verificador, 2 de departamento y 2 de
 * municipio. Se valida el verificador (módulo 11 con pesos 2..9) y que el
 * departamento esté en el rango real (01–22).
 *
 * A propósito NO se valida el municipio contra una tabla de cuántos tiene
 * cada departamento: esa tabla cambia cada vez que se crea un municipio, y
 * una tabla vieja rechazaría el DPI legítimo de un cliente que está parado
 * frente a la caja. El verificador ya atrapa el error de tecleo, que es
 * para lo que sirve esto.
 */
export function esCuiValido(raw: string): boolean {
  const cui = limpiar(raw);
  if (!/^\d{13}$/.test(cui)) return false;

  const correlativo = cui.slice(0, 8);
  const verificador = Number(cui[8]);
  const departamento = Number(cui.slice(9, 11));

  if (departamento < 1 || departamento > 22) return false;
  if (Number(cui.slice(11, 13)) < 1) return false;

  let suma = 0;
  for (let i = 0; i < 8; i++) suma += Number(correlativo[i]) * (i + 2);
  return suma % 11 === verificador;
}

/**
 * Interpreta lo que se tecleó y decide con qué se está identificando.
 *
 * Vacío o "CF" → consumidor final. 13 dígitos que pasan el verificador →
 * CUI. Lo demás se intenta como NIT. Un pasaporte no tiene forma
 * comprobable, así que EXT solo se usa cuando el usuario lo elige
 * explícitamente (ver `receptorExtranjero`).
 */
export function interpretarReceptorId(raw: string): ReceptorId | null {
  const v = limpiar(raw);
  if (v === '' || v === 'CF') return { tipo: 'CF', valor: 'CF' };
  if (/^\d{13}$/.test(v) && esCuiValido(v)) return { tipo: 'CUI', valor: v };
  if (esNitValido(v)) return { tipo: 'NIT', valor: v };
  return null;
}

/** Receptor extranjero: el pasaporte no se puede verificar, solo exigir no vacío. */
export function receptorExtranjero(raw: string): ReceptorId | null {
  const v = limpiar(raw);
  if (v.length < 3 || v.length > 25) return null;
  return { tipo: 'EXT', valor: v };
}

/**
 * Mensaje de por qué no sirve lo que se escribió.
 *
 * Se devuelve texto en vez de un booleano porque "NIT inválido" no le dice
 * nada a un cajero: necesita saber si le falta un dígito, si debe poner CF,
 * o si el cliente le dio un DPI en vez de un NIT.
 */
export function explicarIdInvalido(raw: string): string {
  const v = limpiar(raw);
  if (v === '') return 'Escribe el NIT del cliente, o CF si no lo da.';
  if (/^\d{13}$/.test(v)) {
    return 'Ese DPI no es válido. Revisa los 13 dígitos; si el cliente tiene NIT, úsalo mejor.';
  }
  if (/^\d+[0-9K]$/.test(v)) {
    const cuerpo = v.slice(0, -1);
    const esperado = digitoVerificadorNit(cuerpo);
    return esperado
      ? `Ese NIT no existe: con ${cuerpo} el último carácter sería ${esperado}, no ${v.slice(-1)}. Verifícalo con el cliente.`
      : 'Ese NIT no es válido.';
  }
  return 'El NIT solo lleva números y, a veces, una K final. Usa CF si el cliente no da NIT.';
}
