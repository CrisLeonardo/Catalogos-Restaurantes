// «Un solo lugar»: el video general de Leogin. Tiempos y guion.
//
// 30 fps y 100 pulsos por minuto (un pulso = 18 cuadros), igual que «Otra vez».
// La banda sonora (scripts/un-lugar/sonido.mjs) sigue este mismo mapa.
import type { PasoGuion } from '../otra-vez/guiones';

export const BLOQUE = 216; // 12 pulsos: cada tipo de negocio
export const CENTRO = 108; // 6 pulsos: cocina, caja y ventas
export const U = {
  lugares: 0, // el restaurante repartido en ocho lugares
  junta: 162, // «¿Y si viviera en uno solo?»
  titulo: 234,
  bloques: 306,
  centro: 954,
  ademas: 1278,
  cierre: 1422,
  fin: 1602,
} as const;

export type Lugar = { nombre: string; dibujo: 'libreta' | 'chats' | 'calculadora' | 'caja' | 'menu' | 'hoja' | 'agenda' | 'memoria' };

/** Dónde vive hoy un restaurante sin sistema. Entra uno por pulso. */
export const LUGARES: Lugar[] = [
  { nombre: 'La libreta de comandas', dibujo: 'libreta' },
  { nombre: 'Los chats de pedidos', dibujo: 'chats' },
  { nombre: 'La calculadora', dibujo: 'calculadora' },
  { nombre: 'El cuaderno de caja', dibujo: 'caja' },
  { nombre: 'El menú impreso', dibujo: 'menu' },
  { nombre: 'La hoja de cálculo', dibujo: 'hoja' },
  { nombre: 'La agenda de reservas', dibujo: 'agenda' },
  { nombre: 'Y tu memoria', dibujo: 'memoria' },
];

export type Bloque = { etiqueta: string; paso: PasoGuion };

const paso = (titulo: string, detalle: string, tomas: PasoGuion['tomas'], aparato: PasoGuion['aparato'] = 'telefono'): PasoGuion => ({ minutos: 0, titulo, detalle, aparato, tomas });

/** Un bloque por tipo de negocio. */
export const BLOQUES: Bloque[] = [
  {
    etiqueta: 'Si vendes en línea',
    paso: paso('Tus clientes piden solos.', 'Tu carta en un enlace, con mapa de entrega y seguimiento.', [
      { captura: 'd1-menu', toca: 'plato' },
      { captura: 'd2-ficha', toca: 'agregar' },
      { captura: 'd4-mapa', peso: 1.2, resalta: 'mapa' },
      { captura: 'd6-enviado', peso: 0.8 },
      { captura: 't4-en-camino', peso: 1.2, resalta: 'estado', ampliar: [80, 14, 240, 14] },
    ]),
  },
  {
    etiqueta: 'Si atiendes sin meseros',
    paso: paso('El QR de la mesa toma la orden.', 'El cliente pide desde su teléfono y ve cuándo está listo.', [
      { captura: 'c1-menu', toca: 'plato' },
      { captura: 'c2-ficha', toca: 'agregar' },
      { captura: 'c4-confirmar', toca: 'confirmar' },
      { captura: 'c5-enviado', peso: 0.8 },
      { captura: 't2-listo', peso: 1.2, resalta: 'estado', ampliar: [80, 14, 240, 14] },
    ]),
  },
  {
    etiqueta: 'Si tienes meseros',
    paso: paso('Tus meseros tocan. No escriben.', 'Mesa, platos y cuenta dividida, desde el teléfono.', [
      { captura: 'm0-plano', toca: 'mesa' },
      { captura: 'm1-carta', toca: 'plato' },
      { captura: 'm3-comanda', toca: 'enviar' },
      { captura: 'm6-cobrar', toca: 'partes' },
      { captura: 'm7-partes', peso: 1.2, resalta: 'partes' },
    ]),
  },
];

/** Venga de donde venga el pedido, termina en el mismo sistema. */
export const CENTROS: Bloque[] = [
  {
    etiqueta: 'Y todo llega a cocina',
    paso: paso('Cocina lo ve al instante.', 'Por estación y con la nota clara.', [{ captura: 'k1-cocina', resalta: 'comanda', ampliar: [40, 40, 690, 270] }], 'tableta'),
  },
  {
    etiqueta: 'A tu caja',
    paso: paso('La caja cuadra al centavo.', 'Cuentas los billetes y Leogin te dice si falta algo.', [{ captura: 'q1-cuadra', resalta: 'cuadra', ampliar: [830, 20, 20, 20] }]),
  },
  {
    etiqueta: 'Y a tu teléfono',
    paso: paso('Ves tu día completo.', 'Ventas, plato estrella y hora pico, estés donde estés.', [{ captura: 'h1-hoy', resalta: 'ventas', ampliar: [20, 10, 20, 200] }]),
  },
];
