// Los tres guiones de «Otra vez». Un video por tipo de negocio; el motor es
// el mismo. Para otro público basta con agregar un guion aquí.
import type { Publico } from './base';

export type Molestia = { tipo: 'grito' | 'papel' | 'chat' | 'chatMio' | 'sello'; texto: string };

export type Toma = {
  captura: string;
  /** Peso de la toma dentro del paso (se reparten los cuadros). */
  peso?: number;
  /** Caja que el dedo toca al final de la toma. */
  toca?: string;
  /** Caja que se resalta: queda nítida con un anillo y el resto se desenfoca. */
  resalta?: string;
  /** Agranda la caja resaltada: píxeles de la captura a la izquierda, arriba, derecha y abajo. */
  ampliar?: [number, number, number, number];
};

export type PasoGuion = {
  /** Minutos desde el mediodía: 107 = 1:47 p. m. */
  minutos: number;
  titulo: string;
  detalle: string;
  aparato: 'telefono' | 'tableta';
  tomas: Toma[];
};

export type Guion = {
  gancho: [string, string];
  molestias: Molestia[];
  pasos: PasoGuion[];
  cierre: string;
};

const CUADRE: PasoGuion = {
  minutos: 540,
  titulo: 'La caja cuadra al centavo.',
  detalle: 'Cuentas los billetes y Leogin te dice si falta algo.',
  aparato: 'telefono',
  tomas: [{ captura: 'q0-caja', peso: 0.5 }, { captura: 'q1-cuadra', peso: 1.5, resalta: 'cuadra', ampliar: [830, 20, 20, 20] }],
};

export const GUIONES: Record<Publico, Guion> = {
  // Restaurante con meseros
  meseros: {
    gancho: ['Lleno total.', 'Y todo en papel.'],
    molestias: [
      { tipo: 'papel', texto: 'Mesa 6 — 2 hamb. s/ceb ??' },
      { tipo: 'grito', texto: '¿Era la 9 o la 6?' },
      { tipo: 'papel', texto: 'M4: 1 pizza, 2 limon…' },
      { tipo: 'grito', texto: '¡Falta la orden de la 4!' },
      { tipo: 'grito', texto: '¿Quién pidió esto?' },
      { tipo: 'papel', texto: 'M7 cuenta separada!!' },
      { tipo: 'grito', texto: '¡La 12 lleva media hora!' },
      { tipo: 'grito', texto: 'No entiendo esta letra' },
      { tipo: 'papel', texto: 'Mesa 2 — YA SE FUERON' },
      { tipo: 'grito', texto: '¿Quién cobró la 7?' },
      { tipo: 'sello', texto: 'PLATO DEVUELTO' },
      { tipo: 'grito', texto: '¡Se acabó la pizza y nadie avisó!' },
      { tipo: 'sello', texto: 'MESA SIN COBRAR' },
      { tipo: 'sello', texto: 'LA CAJA NO CUADRA' },
    ],
    pasos: [
      {
        minutos: 107,
        titulo: 'El mesero toca. No escribe.',
        detalle: 'Mesa, platos, término y nota, en segundos.',
        aparato: 'telefono',
        tomas: [
          { captura: 'm0-plano', toca: 'mesa' },
          { captura: 'm1-carta', toca: 'plato' },
          { captura: 'm2-termino', toca: 'agregar' },
          { captura: 'm3-comanda', toca: 'enviar' },
          { captura: 'm4-enviado', peso: 0.8 },
        ],
      },
      {
        minutos: 107,
        titulo: 'Cocina lo lee al instante.',
        detalle: 'Por estación y con la nota clara. Sin gritos.',
        aparato: 'tableta',
        tomas: [{ captura: 'k1-cocina', resalta: 'comanda', ampliar: [40, 40, 690, 270] }],
      },
      {
        minutos: 155,
        titulo: 'La cuenta se divide sola.',
        detalle: 'Efectivo, tarjeta, transferencia o por partes.',
        aparato: 'telefono',
        tomas: [
          { captura: 'm5-mesa', toca: 'cobrar' },
          { captura: 'm6-cobrar', toca: 'partes' },
          { captura: 'm7-partes', peso: 1.2, resalta: 'partes' },
        ],
      },
      CUADRE,
      {
        minutos: 545,
        titulo: 'Y tú lo ves todo, estés donde estés.',
        detalle: 'Ventas, plato estrella y hora pico, en tu teléfono.',
        aparato: 'telefono',
        tomas: [{ captura: 'h1-hoy', resalta: 'ventas', ampliar: [20, 10, 20, 200] }],
      },
    ],
    cierre: 'Tu próximo domingo puede ser este.',
  },

  // Negocio pequeño, sin meseros
  comedor: {
    gancho: ['Fila hasta la puerta.', 'Y tú solo.'],
    molestias: [
      { tipo: 'grito', texto: '¡Dos con todo!' },
      { tipo: 'grito', texto: '¡El mío sin cebolla!' },
      { tipo: 'papel', texto: '3 almuerzos · 2 jugos · ¿?' },
      { tipo: 'grito', texto: '¿Cuál era el mío?' },
      { tipo: 'grito', texto: '¿Ya me toca?' },
      { tipo: 'grito', texto: '¡Yo pedí primero!' },
      { tipo: 'papel', texto: 'Mesa del fondo: ???' },
      { tipo: 'grito', texto: '¿Me cobra, por favor?' },
      { tipo: 'grito', texto: '¡Llevo 20 minutos!' },
      { tipo: 'papel', texto: 'fiado: don Beto Q35' },
      { tipo: 'grito', texto: '¿Cuánto era?' },
      { tipo: 'sello', texto: 'PEDIDO OLVIDADO' },
      { tipo: 'sello', texto: 'CLIENTE SE FUE' },
      { tipo: 'sello', texto: '¿CUÁNTO VENDÍ HOY?' },
    ],
    pasos: [
      {
        minutos: 107,
        titulo: 'Tu cliente pide solo, desde su mesa.',
        detalle: 'Escanea el QR, elige y confirma. Sin descargar nada.',
        aparato: 'telefono',
        tomas: [
          { captura: 'c1-menu', toca: 'plato' },
          { captura: 'c2-ficha', toca: 'agregar' },
          { captura: 'c3-carrito', toca: 'carrito' },
          { captura: 'c4-confirmar', toca: 'confirmar' },
          { captura: 'c5-enviado', peso: 0.8 },
        ],
      },
      {
        minutos: 107,
        titulo: 'Te llega completo: mesa, platos y nota.',
        detalle: 'Nadie apunta nada. Nada se pierde.',
        aparato: 'telefono',
        tomas: [{ captura: 'p1-vivo', resalta: 'nota' }],
      },
      {
        minutos: 108,
        titulo: 'Cocina lo ve. Nadie grita.',
        detalle: 'Cada pedido con su reloj y su nota.',
        aparato: 'tableta',
        tomas: [{ captura: 'k2-cocina', resalta: 'nota', ampliar: [87, 267, 26, 200] }],
      },
      {
        minutos: 119,
        titulo: 'Y él sabe cuándo está listo.',
        detalle: 'Sigue su pedido en vivo, desde su teléfono.',
        aparato: 'telefono',
        tomas: [{ captura: 't1-en-cocina', resalta: 'estado' }, { captura: 't2-listo', resalta: 'estado', ampliar: [80, 14, 240, 14], peso: 1.2 }],
      },
      {
        minutos: 540,
        titulo: 'Cierras, y la caja cuadra.',
        detalle: 'Y ves cuánto vendiste hoy, sin sumar a mano.',
        aparato: 'telefono',
        tomas: [{ captura: 'q1-cuadra', resalta: 'cuadra', ampliar: [830, 20, 20, 20] }, { captura: 'h1-hoy', resalta: 'ventas', ampliar: [20, 10, 20, 200] }],
      },
    ],
    cierre: 'Tu próximo domingo puede ser este.',
  },

  // Vende en línea, a domicilio o para llevar
  domicilio: {
    gancho: ['47 chats sin leer.', 'Y solo dos manos.'],
    molestias: [
      { tipo: 'chat', texto: '¿Tienen menú?' },
      { tipo: 'chat', texto: 'Precio de la pizza?' },
      { tipo: 'chat', texto: '¿Hacen envíos a El Carmen?' },
      { tipo: 'chat', texto: 'Hola??' },
      { tipo: 'chatMio', texto: 'Sí, ya le mando el menú…' },
      { tipo: 'chat', texto: '¿Cuánto es con envío?' },
      { tipo: 'chat', texto: 'Ya le transferí, ¿lo vio?' },
      { tipo: 'chat', texto: '¿Cuánto falta?' },
      { tipo: 'chat', texto: 'Era SIN cebolla' },
      { tipo: 'chat', texto: 'Sigo esperando…' },
      { tipo: 'chat', texto: 'Mejor ya no, gracias' },
      { tipo: 'sello', texto: 'PEDIDO PERDIDO' },
      { tipo: 'sello', texto: 'CLIENTE PERDIDO' },
      { tipo: 'sello', texto: '¿CUÁNTO VENDÍ HOY?' },
    ],
    pasos: [
      {
        minutos: 107,
        titulo: 'Tu carta en un enlace.',
        detalle: 'Con fotos y precios. Lo pegas en tus redes y listo.',
        aparato: 'telefono',
        tomas: [
          { captura: 'd0-portada', toca: 'ver' },
          { captura: 'd1-menu', toca: 'plato' },
          { captura: 'd2-ficha', toca: 'agregar' },
          { captura: 'd3-carrito', peso: 0.9, resalta: 'carrito' },
        ],
      },
      {
        minutos: 108,
        titulo: 'El cliente pide solo. Sin escribirte.',
        detalle: 'Marca su casa en el mapa y confirma.',
        aparato: 'telefono',
        tomas: [
          { captura: 'd4-mapa', peso: 1.3, resalta: 'mapa' },
          { captura: 'd5-confirmar', toca: 'confirmar' },
          { captura: 'd6-enviado', peso: 0.8 },
        ],
      },
      {
        minutos: 108,
        titulo: 'A ti solo te suena.',
        detalle: 'El pedido completo: qué, para quién y dónde.',
        aparato: 'telefono',
        tomas: [{ captura: 'p0-aviso', resalta: 'aviso' }, { captura: 'p2-vivo', peso: 1.1, resalta: 'pedido', ampliar: [42, 1568, 903, -355] }],
      },
      {
        minutos: 125,
        titulo: 'Y él ve su pedido en camino.',
        detalle: 'Se acabó el «¿cuánto falta?».',
        aparato: 'telefono',
        tomas: [{ captura: 't3-en-cocina' }, { captura: 't4-en-camino', peso: 1.3, resalta: 'estado', ampliar: [80, 14, 240, 14] }],
      },
      {
        minutos: 540,
        titulo: 'Al cierre, sabes cuánto vendiste.',
        detalle: 'Sin sumar chats ni cuadernos.',
        aparato: 'telefono',
        tomas: [{ captura: 'h1-hoy', resalta: 'ventas', ampliar: [20, 10, 20, 200] }, { captura: 'x-negocio', peso: 0.9 }],
      },
    ],
    cierre: 'Tu próximo domingo puede ser este.',
  },
};

/** Lo demás que trae el mismo sistema (todo existe hoy en Leogin). */
export const ADEMAS = [
  'Inventario',
  'Cupones',
  'Puntos de lealtad',
  'Reservaciones',
  'Lista de espera',
  'QR por mesa',
  'Comandas impresas',
  'Sigue sin internet',
  'Finanzas',
  'Repartidores',
  'Varias sucursales',
  'Carta con tu marca',
];
export const ADEMAS_PANTALLAS = ['x-inventario', 'x-cupones', 'x-reservas', 'x-analitica', 'x-mesas', 'x-menu', 'x-finanzas', 'x-qr'];
