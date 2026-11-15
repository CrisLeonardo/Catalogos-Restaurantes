// Video 1 · Restaurante con meseros (plan Premium).
// Mesero → cocina → caja → dueño.
import { easeOut } from '../base';
import { ESCALA, clavesFinales } from '../mundo';
import { enTab, enTel, salto, type Guion } from '../guion';
import { PantallaCaja, PantallaCocina, PantallaDuenio, PantallaMesero } from '../pantallas';
import { EscenaComanda } from '../ganchos/comanda';
import T from '../tiempos-meseros.json';

const M = { x: 0, y: 0 }, K = { x: 1150, y: -20 }, C = { x: 1250, y: 1150 }, D = { x: 0, y: 1150 }, L = { x: 625, y: 565 };
const P = {
  enviar: enTel(M, 195, 793),
  tarjeta: enTab(K, 879, 600),
  listo: enTab(K, 879, 716),
  total: enTel(C, 195, 262),
  cuadra: enTel(C, 195, 681),
  ventas: enTel(D, 150, 304),
};
const me = T.mesero, co = T.cocina, ca = T.caja, du = T.duenio;

export const MESEROS: Guion = {
  id: 'meseros',
  T,
  Escena: EscenaComanda,
  pregunta: { vertical: ['¿Tu cocina', 'también *adivina?'], horizontal: ['¿Tu cocina', 'también', '*adivina?'] },
  frase: ['Se acabaron', 'los papelitos.'],
  lugares: [
    { id: 'mesero', tipo: 'tel', ...M, Pantalla: PantallaMesero, etiqueta: 'Mesero', brilla: [me.sale] },
    { id: 'cocina', tipo: 'tab', ...K, Pantalla: PantallaCocina, etiqueta: 'Cocina', brilla: [co.llega] },
    { id: 'caja', tipo: 'tel', ...C, Pantalla: PantallaCaja, etiqueta: 'Caja', brilla: [ca.llega] },
    { id: 'duenio', tipo: 'tel', ...D, Pantalla: PantallaDuenio, etiqueta: 'Tú', brilla: [du.llega] },
  ],
  logo: L,
  saltos: [
    salto(me.sale, co.llega, P.enviar, P.tarjeta, [300, -620], [-520, -520]),
    salto(co.sale, ca.llega, P.listo, P.total, [420, 260], [380, -260]),
    salto(ca.sale, du.llega, P.cuadra, P.ventas, [-260, 420], [380, 520]),
    salto(T.revela.aLogo, T.cierre.inicio, P.ventas, L, [120, -300], [-260, 80]),
  ],
  aterrizajes: [{ en: co.llega, p: P.tarjeta }, { en: ca.llega, p: P.total }, { en: du.llega, p: P.ventas }],
  claves: (v) => {
    const e = ESCALA(v);
    const tarj = v ? 1.55 : 0.92;
    const kx = v ? 0 : -40;
    return [
      { f: T.gancho.iris, x: M.x, y: M.y + 60, s: e.tel * 0.42 },
      { f: T.drop + 22, x: M.x, y: M.y, s: e.tel, curva: easeOut },
      { f: me.sale, x: M.x, y: M.y + 8, s: e.tel * 1.04 },
      { f: co.llega, x: K.x + kx, y: K.y, s: e.tab, hueco: 0.75 },
      { f: co.acerca, x: K.x + (v ? 15 : kx), y: K.y, s: e.tab * 1.02 },
      { f: co.acerca + 28, x: v ? P.tarjeta.x : K.x + kx, y: v ? P.tarjeta.y + 20 : K.y + 10, s: tarj },
      { f: co.sale, x: v ? P.tarjeta.x : K.x + kx, y: v ? P.tarjeta.y + 30 : K.y + 20, s: tarj * 1.03 },
      { f: ca.llega, x: C.x, y: C.y, s: e.tel, hueco: 0.6 },
      { f: ca.sale, x: C.x, y: C.y + 8, s: e.tel * 1.04 },
      { f: du.llega, x: D.x, y: D.y, s: e.tel, hueco: 0.6 },
      ...clavesFinales(T, D, L, v),
    ];
  },
  grupos: [
    { de: T.drop + 6, a: me.sale + 10, chica: 'El mesero', grandes: [
      { en: T.drop + 10, texto: 'toca.', acento: true },
      { en: me.tapMedio, texto: 'elige.' },
      { en: me.notaDesde, texto: 'anota.' },
      { en: me.tapEnviar, texto: 'envía.', acento: true },
    ] },
    { de: co.llega - 2, a: co.acerca + 30, chica: 'Llega a cocina', grandes: [{ en: co.llega + 4, texto: 'al instante.', acento: true }] },
    { de: co.acerca + 30, a: co.sale + 6, chica: 'Y se lee', grandes: [{ en: co.acerca + 36, texto: 'clarito.', acento: true }] },
    { de: ca.llega - 2, a: ca.corte + 18, chica: 'En caja', grandes: [{ en: ca.llega + 6, texto: 'cobras.', acento: true }] },
    { de: ca.corte + 18, a: ca.sale + 8, chica: 'Y al cerrar', grandes: [{ en: ca.corte + 22, texto: 'cuenta…' }, { en: ca.cuadra, texto: 'cuadra.', acento: true }] },
    { de: du.llega - 4, a: T.revela.inicio, chica: 'Y tú', grandes: [{ en: du.llega, texto: 'lo ves todo.', acento: true }], extra: { en: du.suma + 12, texto: 'desde donde estés.' } },
  ],
  remate: ['Nadie adivina.', 'Todo cuadra.'],
  cierre: {
    oferta: 'Todo tu restaurante',
    ofertaAcento: ['en un solo', 'sistema.'],
    detalle: 'Sin contrato y sin comisión por pedido.',
    url: 'distleogin.com',
    qr: 'https://distleogin.com/planes',
  },
};
