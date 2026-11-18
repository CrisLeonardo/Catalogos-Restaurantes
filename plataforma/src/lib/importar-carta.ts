/* ============================================================
   IMPORTAR UNA CARTA (ficha 2.4 de la auditoría integral)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_IMPORTAR_CARTA_2026-11-16.html

   Dos entradas —la lista pegada y la hoja de cálculo— terminan en
   las mismas filas, que se comparan con la carta actual antes de
   publicar nada. Reglas puras, con pruebas en importar-carta.test.ts.
   No se inventa nada: ni descripciones, ni alérgenos, ni fotos.
   ============================================================ */

export type Duda = 'sin-precio' | 'precio-raro' | 'repetido';

export interface FilaImportada {
  /** Línea o fila de origen (1 = primera), para decir dónde está. */
  linea: number;
  categoria: string | null;
  nombre: string;
  precio: number | null;
  descripcion: string | null;
  duda: Duda | null;
}

export type Accion = 'nuevo' | 'cambia-precio' | 'igual';

export interface FilaRevisada extends FilaImportada {
  accion: Accion;
  /** El platillo que ya existe con ese nombre. */
  existente: { id: string; precio: number } | null;
  /** Va marcada para publicar: sin dudas y con algo que hacer. */
  marcada: boolean;
}

export const MAX_FILAS = 500;
/** Un precio desde aquí probablemente es otra cosa (ml, gramos, un código). */
export const PRECIO_RARO = 1000;

const cent = (n: number) => Math.round(n * 100) / 100;

/** Para comparar nombres: sin tildes, sin mayúsculas y sin espacios de más. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** «DESAYUNOS» → «Desayunos»; lo demás se respeta como lo escribió. */
function nombreDeCategoria(linea: string): string {
  const limpio = linea.replace(/[:：]\s*$/, '').trim();
  const soloMayusculas = limpio === limpio.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(limpio);
  return soloMayusculas ? limpio.charAt(0) + limpio.slice(1).toLowerCase() : limpio;
}

/** Quita viñetas y numeración del inicio: «- », «• », «1. », «2) ». */
function sinViñeta(linea: string): string {
  return linea.replace(/^\s*(?:[-–—•*·]+|\d{1,3}[.)])\s+/, '');
}

/** El precio al final de la línea y lo que queda antes como nombre. */
function separarPrecio(linea: string): { nombre: string; precio: number } | null {
  const m = linea.match(/^(.*?)(?:[\s.\-–—:|·…]+)(?:Q\s*\.?\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*$/i)
    ?? linea.match(/^(.*?)Q\s*\.?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*$/i);
  if (!m) return null;
  const nombre = m[1].replace(/[\s.\-–—:|·…]+$/, '').trim();
  if (!nombre) return null;
  return { nombre, precio: cent(Number(m[2].replace(',', '.'))) };
}

/**
 * La lista pegada, tal como la tienen en WhatsApp o Word: un platillo por
 * línea con su precio al final. Una línea sin precio abre una categoría si
 * está en mayúsculas, termina en «:» o va después de una línea en blanco;
 * si no, es un platillo al que le falta el precio.
 */
export function leerLista(texto: string): FilaImportada[] {
  const filas: FilaImportada[] = [];
  let categoria: string | null = null;
  let anteriorEnBlanco = true;
  const lineas = texto.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lineas.length && filas.length < MAX_FILAS; i++) {
    const cruda = lineas[i].trim();
    if (!cruda) { anteriorEnBlanco = true; continue; }
    const linea = sinViñeta(cruda);
    const conPrecio = separarPrecio(linea);
    if (conPrecio) {
      filas.push({
        linea: i + 1, categoria, nombre: conPrecio.nombre.slice(0, 120), precio: conPrecio.precio, descripcion: null,
        duda: conPrecio.precio <= 0 || conPrecio.precio >= PRECIO_RARO ? 'precio-raro' : null,
      });
    } else {
      const pareceTitulo = (linea === linea.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(linea)) || /[:：]\s*$/.test(linea) || anteriorEnBlanco;
      if (pareceTitulo && linea.length <= 40) categoria = nombreDeCategoria(linea);
      else filas.push({ linea: i + 1, categoria, nombre: linea.slice(0, 120), precio: null, descripcion: null, duda: 'sin-precio' });
    }
    anteriorEnBlanco = false;
  }
  return marcarRepetidos(filas);
}

const COLUMNAS: Record<'categoria' | 'nombre' | 'precio' | 'descripcion', string[]> = {
  categoria: ['categoria', 'category', 'seccion'],
  nombre: ['producto', 'platillo', 'nombre', 'name', 'product'],
  precio: ['precio', 'price', 'valor'],
  descripcion: ['descripcion', 'description', 'detalle'],
};

/**
 * Una hoja de cálculo ya leída como filas de celdas (la primera fila son
 * los encabezados). Basta con «Producto» y «Precio»; «Categoría» y
 * «Descripción» son opcionales. Son las columnas de la exportación del
 * catálogo, así que exportar e importar se entienden.
 */
export function leerHoja(celdas: unknown[][]): { filas: FilaImportada[] } | { error: string } {
  const encabezados = (celdas[0] ?? []).map((c) => normalizar(String(c ?? '')));
  const col = (k: keyof typeof COLUMNAS) => encabezados.findIndex((h) => COLUMNAS[k].includes(h));
  const iNombre = col('nombre');
  const iPrecio = col('precio');
  if (iNombre < 0 || iPrecio < 0) {
    return { error: 'La hoja necesita las columnas «Platillo» y «Precio» en la primera fila. Descarga la plantilla para ver el formato.' };
  }
  const iCategoria = col('categoria');
  const iDescripcion = col('descripcion');
  const filas: FilaImportada[] = [];
  for (let r = 1; r < celdas.length && filas.length < MAX_FILAS; r++) {
    const fila = celdas[r] ?? [];
    const nombre = String(fila[iNombre] ?? '').trim().slice(0, 120);
    const precioCrudo = String(fila[iPrecio] ?? '').replace(/q/gi, '').replace(/\s/g, '').replace(',', '.');
    if (!nombre && !precioCrudo) continue;
    const precioNum = precioCrudo ? Number(precioCrudo) : NaN;
    const precio = Number.isFinite(precioNum) ? cent(precioNum) : null;
    filas.push({
      linea: r + 1,
      categoria: iCategoria >= 0 ? (String(fila[iCategoria] ?? '').trim().slice(0, 60) || null) : null,
      nombre,
      precio,
      descripcion: iDescripcion >= 0 ? (String(fila[iDescripcion] ?? '').trim().slice(0, 500) || null) : null,
      duda: precio === null ? 'sin-precio' : precio <= 0 || precio >= PRECIO_RARO ? 'precio-raro' : null,
    });
  }
  return { filas: marcarRepetidos(filas) };
}

/** Un CSV a celdas: comas o punto y coma, con comillas. */
export function leerCsv(texto: string): unknown[][] {
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const primera = limpio.split('\n', 1)[0] ?? '';
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

/** El mismo platillo dos veces en la lista: el segundo queda en duda. */
function marcarRepetidos(filas: FilaImportada[]): FilaImportada[] {
  const vistos = new Set<string>();
  return filas.map((f) => {
    const k = normalizar(f.nombre);
    if (vistos.has(k)) return { ...f, duda: f.duda ?? 'repetido' };
    vistos.add(k);
    return f;
  });
}

/**
 * Compara con la carta actual: si el nombre ya existe no se duplica, se
 * ofrece cambiarle el precio (decisión del dueño, 2026-11-16). Lo dudoso y
 * lo que ya está igual no va marcado.
 */
export function revisar(
  filas: FilaImportada[],
  existentes: { id: string; name: string; price: number }[],
): FilaRevisada[] {
  const porNombre = new Map(existentes.map((p) => [normalizar(p.name), p]));
  return filas.map((f) => {
    const e = porNombre.get(normalizar(f.nombre)) ?? null;
    const accion: Accion = !e ? 'nuevo' : f.precio !== null && cent(f.precio) !== cent(Number(e.price)) ? 'cambia-precio' : 'igual';
    return {
      ...f,
      accion,
      existente: e ? { id: e.id, precio: Number(e.price) } : null,
      marcada: f.duda === null && f.precio !== null && accion !== 'igual',
    };
  });
}

/** Lo que dice el botón: «Agregar 5 y cambiar 1 precio». */
export function resumenDeImportacion(filas: FilaRevisada[]): { nuevos: number; precios: number; texto: string } {
  const marcadas = filas.filter((f) => f.marcada);
  const nuevos = marcadas.filter((f) => f.accion === 'nuevo').length;
  const precios = marcadas.filter((f) => f.accion === 'cambia-precio').length;
  const partes = [
    nuevos ? `Agregar ${nuevos} ${nuevos === 1 ? 'platillo' : 'platillos'}` : null,
    precios ? `${nuevos ? 'cambiar' : 'Cambiar'} ${precios} ${precios === 1 ? 'precio' : 'precios'}` : null,
  ].filter(Boolean);
  return { nuevos, precios, texto: partes.length ? partes.join(' y ') : 'Nada que agregar' };
}
