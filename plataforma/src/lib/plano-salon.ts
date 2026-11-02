/* ============================================================
   EL PLANO EN CUALQUIER PANTALLA — geometría pura
   ------------------------------------------------------------
   El salón se dibujaba en dos sitios (Pedidos › Mesas y el plano de
   Tomar pedidos) y los dos resolvían el teléfono igual de mal: un
   lienzo de ancho mínimo fijo (620 y 460 px) en una pantalla de 375,
   con la página entera corriéndose de lado y la barra escondida, y
   mesas de tamaño fijo que se encimaban en cuanto el local era
   apretado. Además cada uno usaba una proporción distinta (16:10 y
   4:3) y la de Tomar pedidos no era la del editor, así que el plano
   salía estirado respecto a como lo dibujó el dueño.

   Aquí se decide, sin tocar el DOM:

     · qué trozo del local se enseña (el ENCUADRE, la mejor idea del
       plano viejo, con sus mismos números);
     · si conviene GIRARLO 90° para llenar una pantalla vertical — un
       local casi siempre es más ancho que hondo, y un teléfono es al
       revés;
     · de qué tamaño van las mesas para que NO se encimen: se mide la
       distancia mínima entre dos mesas ya colocadas en píxeles y la
       mesa ocupa una fracción de ella, con un suelo táctil;
     · y, sin plano dibujado, la rejilla que mejor llena la pantalla.

   Es lo que hacen Toast, Lightspeed o TouchBistro en el aparato de
   mano: el plano se acomoda a la pantalla, nunca la pantalla al plano.
   ============================================================ */

/** Proporción del lienzo del editor (Ajustes › Salón dibuja en 1000 × 625). */
export const PLANO_W = 16;
export const PLANO_H = 10;

export interface Encuadre { x: number; y: number; w: number; h: number }
export interface Caja { x0: number; y0: number; x1: number; y1: number }

export const COMPLETO: Encuadre = { x: 0, y: 0, w: 1, h: 1 };
/** Aire alrededor de lo dibujado, en fracción del lienzo. */
const MARGEN = 0.09;
/** Por debajo de esto el recorte amplía demasiado y desorienta. */
const MIN_LADO = 0.36;
/** Con menos vacío que esto no vale la pena recortar. */
const MAX_APROVECHADO = 0.72;

function tramo(a: number, b: number): readonly [number, number] {
  let lo = a - MARGEN;
  let hi = b + MARGEN;
  if (hi - lo < MIN_LADO) {
    const centro = (lo + hi) / 2;
    lo = centro - MIN_LADO / 2;
    hi = centro + MIN_LADO / 2;
  }
  // Empujar hacia dentro antes de recortar: así el ancho se conserva
  // cuando el contenido está pegado a un canto.
  if (lo < 0) { hi -= lo; lo = 0; }
  if (hi > 1) { lo -= hi - 1; hi = 1; }
  return [Math.max(0, lo), Math.min(1, hi)] as const;
}

/** El trozo del local que tiene algo dibujado, con aire alrededor. */
export function encuadrar(cajas: Caja[]): Encuadre {
  if (cajas.length === 0) return COMPLETO;
  const [x0, x1] = tramo(Math.min(...cajas.map((c) => c.x0)), Math.max(...cajas.map((c) => c.x1)));
  const [y0, y1] = tramo(Math.min(...cajas.map((c) => c.y0)), Math.max(...cajas.map((c) => c.y1)));
  const enc = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return enc.w * enc.h >= MAX_APROVECHADO ? COMPLETO : enc;
}

/** Qué hacer con el giro: decidirlo solo o lo que pidió quien mira. */
export type Giro = 'auto' | 'normal' | 'girado';

export type Densidad = 'mini' | 'media' | 'completa';

export interface OpcionesPlano {
  /** Lado mínimo de una mesa: por debajo, el dedo no acierta. */
  mesaMin?: number;
  /** Lado máximo: con pocas mesas no tienen por qué comerse la pantalla. */
  mesaMax?: number;
  /** Ancho ÷ alto de la mesa (las fichas de Mesas son más anchas que altas). */
  proporcion?: number;
  giro?: Giro;
}

export interface Rect { left: number; top: number; width: number; height: number }

export interface Disposicion {
  girado: boolean;
  /** Tamaño del lienzo, en px, sin zoom. */
  ancho: number;
  alto: number;
  /** Ancho de cada mesa, en px, sin zoom (alto = ancho ÷ proporción). */
  mesa: number;
  /** Centro de un punto del LOCAL (0..1), en px dentro del lienzo. */
  punto: (x: number, y: number) => { left: number; top: number };
  /** Una zona fija (centro + ancho/alto en coordenadas del local), en px. */
  caja: (f: { x: number; y: number; w: number; h: number }) => Rect;
}

const MESA_MIN = 44;
const MESA_MAX = 96;
/** Fracción de la distancia mínima entre mesas que ocupa cada una. */
const SEPARACION = 0.84;

/** La mayor caja de proporción `aspecto` (ancho ÷ alto) que cabe en w × h. */
function caber(aspecto: number, w: number, h: number): { ancho: number; alto: number } {
  if (w / h > aspecto) return { ancho: h * aspecto, alto: h };
  return { ancho: w, alto: w / aspecto };
}

/** Distancia mínima entre dos puntos (Infinity con menos de dos). */
export function distanciaMinima(puntos: { left: number; top: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < puntos.length; i++) {
    for (let j = i + 1; j < puntos.length; j++) {
      const d = Math.hypot(puntos[i].left - puntos[j].left, puntos[i].top - puntos[j].top);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Cuánto puede crecer el lienzo más allá del hueco para no encimar mesas. */
const AMPLIAR_MAX = 2.5;

interface Armado extends Disposicion {
  /** Ancho de mesa que permitiría la vecina más cercana con el lienzo ajustado. */
  porVecina: number;
  /** Área del lienzo ajustado al hueco, antes de ampliar. */
  area: number;
}

function armar(
  enc: Encuadre, puntos: { x: number; y: number }[], w: number, h: number,
  girado: boolean, op: Required<Omit<OpcionesPlano, 'giro'>>,
): Armado {
  const aspecto = (PLANO_W * enc.w) / (PLANO_H * enc.h);
  const base = caber(girado ? 1 / aspecto : aspecto, w, h);

  /* Girar 90° en el sentido del reloj, no reflejar: un espejo pondría la
     barra a la derecha cuando el mesero la tiene a la izquierda, y ahí
     ya no es su local. (u, v) → (1 − v, u). */
  const colocar = (ancho: number, alto: number) => (x: number, y: number) => {
    const u = (x - enc.x) / enc.w;
    const v = (y - enc.y) / enc.h;
    return girado ? { left: (1 - v) * ancho, top: u * alto } : { left: u * ancho, top: v * alto };
  };

  /* La mesa ocupa una fracción de la distancia a su vecina más cercana.
     Con la proporción de por medio: dos fichas más anchas que altas una
     al lado de la otra chocan antes que dos cuadradas. */
  const enBase = colocar(base.ancho, base.alto);
  const sep = distanciaMinima(puntos.map((p) => enBase(p.x, p.y)));
  const porVecina = sep * SEPARACION * Math.min(1, op.proporcion);

  /* Si ni con el suelo táctil caben sin chocar, el lienzo CRECE (y el visor
     se desplaza) antes que encimar mesas: una mesa tapada por otra no se
     puede tocar. Con tope, para no convertir el plano en un mural. */
  const ampliar = porVecina < op.mesaMin ? Math.min(AMPLIAR_MAX, op.mesaMin / porVecina) : 1;
  const ancho = base.ancho * ampliar;
  const alto = base.alto * ampliar;
  const punto = colocar(ancho, alto);
  const caja = (f: { x: number; y: number; w: number; h: number }): Rect => {
    const c = punto(f.x, f.y);
    const fw = (f.w / enc.w) * (girado ? alto : ancho);
    const fh = (f.h / enc.h) * (girado ? ancho : alto);
    const width = girado ? fh : fw;
    const height = girado ? fw : fh;
    return { left: c.left - width / 2, top: c.top - height / 2, width, height };
  };

  // Con dos o tres mesas no hay vecina que limite: tope por el lienzo.
  const porLienzo = Math.min(base.ancho, base.alto * op.proporcion) / 2.4;
  const mesa = Math.max(op.mesaMin, Math.min(op.mesaMax, porVecina * ampliar, porLienzo));

  return { girado, ancho, alto, mesa, punto, caja, porVecina, area: base.ancho * base.alto };
}

/**
 * Coloca un plano dibujado dentro de un contenedor de w × h px.
 *
 * Con `giro: 'auto'` se gira cuando gana de verdad: mesas un 15 % más
 * grandes, o el mismo tamaño en un lienzo un 30 % mayor. Por debajo de eso
 * se conserva la orientación del dibujo, que es la que el dueño reconoce.
 */
export function disponerPlano(
  enc: Encuadre,
  puntos: { x: number; y: number }[],
  w: number,
  h: number,
  opciones: OpcionesPlano = {},
): Disposicion {
  const op = {
    mesaMin: opciones.mesaMin ?? MESA_MIN,
    mesaMax: opciones.mesaMax ?? MESA_MAX,
    proporcion: opciones.proporcion ?? 1,
  };
  const giro = opciones.giro ?? 'auto';
  if (giro !== 'auto') return armar(enc, puntos, w, h, giro === 'girado', op);

  const normal = armar(enc, puntos, w, h, false, op);
  const girado = armar(enc, puntos, w, h, true, op);
  // Se compara lo que permite la vecina SIN suelo ni techo: con las dos
  // opciones en el mínimo táctil, gana la que menos tiene que ampliar.
  const tope = (d: Armado) => Math.min(op.mesaMax, d.porVecina);
  const gana = tope(girado) > tope(normal) * 1.15
    || (tope(girado) >= tope(normal) && girado.area > normal.area * 1.3);
  return gana ? girado : normal;
}

export interface Rejilla {
  cols: number;
  filas: number;
  /** Lado de cada celda, en px. */
  celda: number;
  ancho: number;
  alto: number;
  mesa: number;
  /** Centro de la mesa i-ésima, en px. */
  punto: (i: number) => { left: number; top: number };
}

/**
 * Sin plano dibujado: la rejilla que deja las celdas más grandes en w × h.
 * Si ni así llegan al mínimo táctil, se fijan las columnas que caben a lo
 * ancho y el lienzo crece hacia ABAJO: en un teléfono se desplaza en
 * vertical, que es lo natural, y nunca de lado.
 */
export function disponerRejilla(n: number, w: number, h: number, opciones: OpcionesPlano = {}): Rejilla {
  const mesaMin = opciones.mesaMin ?? MESA_MIN;
  const mesaMax = opciones.mesaMax ?? MESA_MAX;
  const proporcion = opciones.proporcion ?? 1;
  const total = Math.max(1, n);

  let cols = 1;
  let celda = 0;
  for (let c = 1; c <= total; c++) {
    const filas = Math.ceil(total / c);
    const lado = Math.min(w / c, (h / filas) * proporcion);
    if (lado > celda) { celda = lado; cols = c; }
  }
  const celdaMin = mesaMin / SEPARACION;
  if (celda < celdaMin) {
    cols = Math.max(1, Math.floor(w / celdaMin));
    celda = w / cols;
  }
  const filas = Math.ceil(total / cols);
  const celdaAlto = celda / proporcion;
  const ancho = cols * celda;
  const alto = filas * celdaAlto;
  const mesa = Math.max(mesaMin, Math.min(mesaMax, celda * SEPARACION));
  return {
    cols, filas, celda, ancho, alto, mesa,
    punto: (i) => ({
      left: ((i % cols) + 0.5) * celda,
      top: (Math.floor(i / cols) + 0.5) * celdaAlto,
    }),
  };
}

/** Cuánto cabe dentro de una mesa de ese ancho. */
export function densidadDeMesa(ancho: number): Densidad {
  if (ancho < 64) return 'mini';
  if (ancho < 92) return 'media';
  return 'completa';
}
