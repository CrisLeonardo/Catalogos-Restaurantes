/* ============================================================
   CÓDIGO QR: QUÉ DICE Y CÓMO SE IMPRIME (ficha 2.10)
   ------------------------------------------------------------
   Reglas puras, sin navegador:
     · frasesDelCartel .. lo que el cartel puede prometer según lo que
                          el restaurante tiene encendido.
     · esDireccionDePrueba  el QR apunta a una computadora (local).
     · CARTEL ........... medidas de la hoja carta con dos carteles.
   El dibujo está en `lib/documents/qr-art.ts`.
   ============================================================ */

export type Uso = 'redes' | 'imprimir' | 'codigo';
export type IdFrase = 'carta-y-pide' | 'carta' | 'para-llevar';

export interface Frase { id: IdFrase; texto: string }

/** Lo que el restaurante tiene encendido y le importa al cartel. */
export interface Encendido {
  pedidos: boolean;
  orderTypes: readonly string[];
}

/** Pedidos en línea: el módulo encendido y al menos para llevar o a domicilio. */
export function pidenEnLinea(e: Encendido): boolean {
  return e.pedidos && (e.orderTypes.includes('pickup') || e.orderTypes.includes('delivery'));
}

/**
 * Las frases que el cartel puede decir sin prometer lo apagado. La primera
 * es la que sale si nadie elige otra.
 */
export function frasesDelCartel(e: Encendido): Frase[] {
  const carta: Frase = { id: 'carta', texto: 'Mira nuestra carta' };
  if (!pidenEnLinea(e)) return [carta];
  const llevar = e.orderTypes.includes('pickup');
  const domicilio = e.orderTypes.includes('delivery');
  return [
    { id: 'carta-y-pide', texto: 'Mira la carta y pide' },
    carta,
    { id: 'para-llevar', texto: llevar && domicilio ? 'Pide para llevar o a domicilio' : llevar ? 'Pide para llevar' : 'Pide a domicilio' },
  ];
}

/** La frase elegida si sigue valiendo; si no, la primera que vale. */
export function fraseValida(e: Encendido, id: string | null | undefined): Frase {
  const frases = frasesDelCartel(e);
  return frases.find((f) => f.id === id) ?? frases[0];
}

/** El QR apunta a esta computadora: en el restaurante no abrirá. */
export function esDireccionDePrueba(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h.endsWith('.localhost') || h.startsWith('127.') || h === '0.0.0.0' || h.endsWith('.local') || h.endsWith('.test');
  } catch {
    return true;
  }
}

/** La dirección sin «https://» ni la barra final, para leerla en papel. */
export function direccionLegible(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Hoja carta (8.5 × 11 in = 215.9 × 279.4 mm) con dos carteles de
 * 105 × 148 mm lado a lado, como un A6, y el código de 70 mm. A 70 mm el
 * código se lee hasta a unos 70 cm (regla de 10 a 1). Se dibuja a 200 ppp:
 * la vista previa y el PDF son la misma imagen.
 */
export const CARTEL = {
  hojaMm: { w: 215.9, h: 279.4 },
  cartelMm: { w: 105, h: 148 },
  codigoMm: 70,
  lecturaCm: 70,
  ppp: 200,
} as const;

export const mmAPx = (mm: number, ppp: number = CARTEL.ppp) => Math.round((mm / 25.4) * ppp);

/** Nombre de archivo sin acentos ni espacios. */
export function nombreDeArchivo(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurante';
}
