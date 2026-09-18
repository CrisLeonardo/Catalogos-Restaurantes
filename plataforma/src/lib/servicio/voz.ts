/* ════════════════════════════════════════════════════════════
   DICTAR LA COMANDA
   ------------------------------------------------------------
   «Dos pepián y una limonada sin hielo» tiene que acabar siendo dos
   líneas en la comanda. Aquí vive la parte que se puede probar sin
   navegador: partir lo dictado en trozos, leer los números en letra y
   emparejar cada trozo con un plato de la carta.

   El prototipo del handoff traía esto SIMULADO —un `setTimeout` de 1,7 s
   y dos platos quemados—, así que de aquí no se copió nada: la
   interpretación es nuestra y el reconocimiento lo pone el navegador
   (Web Speech API).

   QUÉ NO HACE. No adivina modificadores contra la carta del
   restaurante: «sin hielo» se guarda como NOTA del plato, que es lo que
   cocina lee en el papel. Emparejarlo con el grupo de opciones correcto
   exigiría saber que «sin hielo» es del grupo «Cómo» de las bebidas, y
   eso cambia en cada carta. Una nota siempre es verdad; una opción
   adivinada, no.
   ════════════════════════════════════════════════════════════ */

import { coincide, normalizar } from '@/lib/servicio/comanda';

/** Los números que alguien dice en voz alta al pedir. */
const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

/** Palabras que separan un plato del siguiente. */
const SEPARADORES = /\s*(?:,|;|\by\b|\btambién\b|\btambien\b|\bademás\b|\bademas\b|\bmás\b|\bmas\b)\s*/gi;

/** Lo que arranca una nota para cocina dentro del mismo trozo. */
const NOTA = /\b(sin|con|extra|poco|bien|muy|al|a la)\b/i;

export interface TrozoDictado {
  qty: number;
  /** Lo que hay que buscar en la carta. */
  term: string;
  /** Lo que se dijo después y no es el nombre del plato: «sin hielo». */
  nota: string;
}

/**
 * Parte lo dictado en trozos con cantidad, plato y nota.
 *
 * «dos pepián y una limonada sin hielo» →
 *   [{qty:2, term:'pepián'}, {qty:1, term:'limonada', nota:'sin hielo'}]
 */
export function partirDictado(texto: string): TrozoDictado[] {
  const limpio = (texto ?? '').trim();
  if (!limpio) return [];

  const crudos = limpio
    .split(SEPARADORES)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((trozo) => {
      let qty = 1;
      let resto = trozo;

      const enCifra = resto.match(/^(\d{1,2})\s+(.*)$/);
      if (enCifra) {
        qty = Math.min(99, Number(enCifra[1]));
        resto = enCifra[2];
      } else {
        const primera = normalizar(resto).split(/\s+/)[0] ?? '';
        if (NUMEROS[primera] != null) {
          qty = NUMEROS[primera];
          resto = resto.split(/\s+/).slice(1).join(' ');
        }
      }

      /* Dónde acaba el nombre del plato y empieza la nota: en la primera
         palabra de las que abren una aclaración («sin», «con», «extra»…).
         Si el trozo EMPIEZA por una de ellas no hay plato ninguno —«sin
         hielo» a secas—, y eso se resuelve más abajo. */
      let term = resto.trim();
      let nota = '';
      const corte = term.search(NOTA);
      if (corte > 0) {
        nota = term.slice(corte).trim();
        term = term.slice(0, corte).trim();
      } else if (corte === 0) {
        nota = term;
        term = '';
      }

      return { qty, term, nota };
    });

  /* Una nota sin plato delante es del plato ANTERIOR: «una limonada, sin
     hielo» es lo mismo que «una limonada sin hielo», y quien dicta hace
     esa pausa todo el rato. Si no hay nada delante, se descarta: inventar
     un plato a partir de «sin hielo» sería peor que perder la frase. */
  const out: TrozoDictado[] = [];
  for (const t of crudos) {
    if (t.term.length > 1) { out.push(t); continue; }
    if (!t.nota) continue;
    const previo = out[out.length - 1];
    if (previo) previo.nota = [previo.nota, t.nota].filter(Boolean).join(' · ');
  }
  return out;
}

export interface LineaDictada<P> {
  producto: P;
  qty: number;
  nota: string;
}

/**
 * Empareja lo dictado con la carta.
 *
 * Solo entra lo que se puede pedir: un plato agotado dictado por voz
 * entraría en la comanda sin que nadie lo hubiera visto en pantalla, y
 * ese es justo el caso en que el mesero necesita enterarse.
 */
export function emparejarDictado<P extends { name: string; is_available?: boolean }>(
  trozos: TrozoDictado[],
  productos: P[],
): LineaDictada<P>[] {
  const out: LineaDictada<P>[] = [];
  for (const t of trozos) {
    const candidatos = productos.filter((p) => p.is_available !== false && coincide(p.name, t.term));
    if (candidatos.length === 0) continue;
    // El nombre más corto que contiene lo dicho: «limonada» antes que
    // «limonada con soda y menta», que es lo que la gente dice.
    const elegido = candidatos.reduce((a, b) => (a.name.length <= b.name.length ? a : b));
    out.push({ producto: elegido, qty: t.qty, nota: t.nota });
  }
  return out;
}

/* ── El reconocimiento del navegador ─────────────────────────── */

interface ReconocimientoLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type ConstructorReconocimiento = new () => ReconocimientoLike;

/**
 * ¿Este navegador sabe escuchar?
 *
 * Chrome y Edge sí; Safari de iOS **no** expone `SpeechRecognition`, así
 * que ahí el botón del micrófono sencillamente no se dibuja. Un botón que
 * no puede funcionar es peor que no tenerlo: el mesero lo toca en mitad
 * del servicio y no pasa nada.
 */
export function reconocimientoDisponible(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof (w.SpeechRecognition ?? w.webkitSpeechRecognition) === 'function';
}

export function crearReconocimiento(lang = 'es-GT'): ReconocimientoLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as ConstructorReconocimiento | undefined;
  if (typeof Ctor !== 'function') return null;
  const rec = new Ctor();
  rec.lang = lang;
  /* Una comanda se dicta de un tirón y se revisa antes de agregarla: con
     `continuous` el reconocimiento se queda abierto esperando más y la
     hoja nunca llega a enseñar lo que entendió. */
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

/** Junta los trozos que va soltando el reconocimiento en una sola frase. */
export function textoDeResultado(e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }): string {
  let out = '';
  for (let i = 0; i < e.results.length; i++) {
    const alt = e.results[i][0];
    if (alt?.transcript) out += ` ${alt.transcript}`;
  }
  return out.trim();
}
