// Video 2 · Comedor o cafetería sin meseros (plan Estándar).
// El cliente pide solo desde el QR de la mesa → mostrador → el cliente se
// entera de que está listo → el dueño lo ve.
import React from 'react';
import { easeOut } from '../base';
import { ESCALA, clavesFinales } from '../mundo';
import { enTab, enTel, salto, type Guion } from '../guion';
import { PantallaHoy } from '../pantallas';
import { PantallaCliente, PantallaMostrador } from '../pantallas-cliente';
import { EscenaGritos } from '../ganchos/gritos';
import T from '../tiempos-comedor.json';

const C = { x: 0, y: 0 }, K = { x: 1150, y: -20 }, D = { x: 560, y: 1150 }, L = { x: 640, y: 600 };
const P = {
  enviar: enTel(C, 195, 789),
  nueva: enTab(K, 301, 276),
  boton: enTab(K, 879, 376),
  listo: enTel(C, 195, 417),
  ventas: enTel(D, 150, 304),
};
const cl = T.cliente, mo = T.mostrador, vu = T.vuelve, du = T.duenio;

const Cliente: React.FC = () => (
  <PantallaCliente g={{ modo: 'mesa', agrega: [[0, cl.tapA], [2, cl.tapB]], tapCarrito: cl.tapCarrito, hoja: cl.hoja, tapEnviar: cl.tapEnviar, aceptado: mo.tapCocina + 2, ultimo: vu.llega + 2 }} />
);
const Mostrador: React.FC = () => (
  <PantallaMostrador g={{ modo: 'mesa', llega: mo.llega, tapCocina: mo.tapCocina, tapFinal: mo.tapListo, final: mo.listo, lineas: ['1× Rincón Clásica', '1× Limonada con Menta'], total: 70 }} />
);
const Duenio: React.FC = () => (
  <PantallaHoy suma={du.suma} antes={1834.5} mas={70} pedidos={18} ticketAntes="Q101.92" ticketDespues="Q100.24" estrella="Rincón Clásica" />
);

export const COMEDOR: Guion = {
  id: 'comedor',
  T,
  Escena: EscenaGritos,
  pregunta: { vertical: ['¿Todavía se *gritan', 'los pedidos?'], horizontal: ['¿Todavía', 'se *gritan', 'los pedidos?'] },
  frase: ['Que tus clientes', 'pidan solos.'],
  lugares: [
    { id: 'cliente', tipo: 'tel', ...C, Pantalla: Cliente, etiqueta: 'Tu cliente', brilla: [cl.sale, vu.llega] },
    { id: 'mostrador', tipo: 'tab', ...K, Pantalla: Mostrador, etiqueta: 'Mostrador', brilla: [mo.llega] },
    { id: 'duenio', tipo: 'tel', ...D, Pantalla: Duenio, etiqueta: 'Tú', brilla: [du.llega] },
  ],
  logo: L,
  saltos: [
    salto(cl.sale, mo.llega, P.enviar, P.nueva, [300, -620], [-400, -500]),
    salto(mo.sale, vu.llega, P.boton, P.listo, [200, 520], [620, 300]),
    salto(vu.sale, du.llega, P.listo, P.ventas, [-320, 420], [-420, 260]),
    salto(T.revela.aLogo, T.cierre.inicio, P.ventas, L, [120, -300], [-260, 80]),
  ],
  aterrizajes: [{ en: mo.llega, p: P.nueva }, { en: vu.llega, p: P.listo }, { en: du.llega, p: P.ventas }],
  claves: (v) => {
    const e = ESCALA(v);
    const kx = v ? 0 : -40;
    const izq = enTab(K, 301, 330), der = enTab(K, 879, 330);
    const tablet = v
      ? [
          { f: mo.llega, x: izq.x, y: izq.y, s: 1.05, hueco: 0.75 },
          { f: mo.tapCocina, x: izq.x, y: izq.y, s: 1.15 },
          { f: mo.tapCocina + 18, x: der.x, y: der.y, s: 1.15 },
          { f: mo.sale, x: der.x, y: der.y + 10, s: 1.2 },
        ]
      : [
          { f: mo.llega, x: K.x + kx, y: K.y, s: e.tab, hueco: 0.75 },
          { f: mo.sale, x: K.x + kx, y: K.y + 10, s: e.tab * 1.04 },
        ];
    return [
      { f: T.gancho.iris, x: C.x, y: C.y + 60, s: e.tel * 0.42 },
      { f: T.drop + 22, x: C.x, y: C.y, s: e.tel, curva: easeOut },
      { f: cl.sale, x: C.x, y: C.y + 8, s: e.tel * 1.04 },
      ...tablet,
      { f: vu.llega, x: C.x, y: C.y, s: e.tel, hueco: 0.6 },
      { f: vu.sale, x: C.x, y: C.y + 8, s: e.tel * 1.04 },
      { f: du.llega, x: D.x, y: D.y, s: e.tel, hueco: 0.6 },
      ...clavesFinales(T, D, L, v),
    ];
  },
  grupos: [
    { de: T.drop + 6, a: cl.sale + 10, chica: 'Tu cliente', grandes: [
      { en: T.drop + 10, texto: 'escanea.', acento: true },
      { en: cl.tapA, texto: 'elige.' },
      { en: cl.tapEnviar, texto: 'pide solo.', acento: true },
    ] },
    { de: mo.llega - 4, a: mo.tapCocina - 2, chica: 'Te llega', grandes: [{ en: mo.llega + 4, texto: 'al instante.', acento: true }] },
    { de: mo.tapCocina - 2, a: mo.sale + 6, chica: 'Un toque y', grandes: [{ en: mo.tapCocina, texto: 'a cocina.' }, { en: mo.listo, texto: '¡listo!', acento: true }] },
    { de: vu.llega - 6, a: vu.sale + 8, chica: 'Y tu cliente', grandes: [{ en: vu.llega + 2, texto: 'se entera.', acento: true }], extra: { en: vu.llega + 24, texto: 'sin que nadie grite.' } },
    { de: du.llega - 4, a: T.revela.inicio, chica: 'Y tú', grandes: [{ en: du.llega, texto: 'lo ves todo.', acento: true }], extra: { en: du.suma + 12, texto: 'desde donde estés.' } },
  ],
  remate: ['Nadie grita.', 'Todo cuadra.'],
  cierre: {
    oferta: 'Que tus clientes',
    ofertaAcento: ['pidan solos', 'desde hoy.'],
    detalle: 'Tu menú digital con QR, gratis para siempre.',
    url: 'distleogin.com',
    qr: 'https://distleogin.com/planes',
  },
};
