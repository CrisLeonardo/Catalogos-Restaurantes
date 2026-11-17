'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';
import { importarCarta, leerHojaDeCalculo, leerPdfDeCarta } from '@/lib/actions/importar-carta';
import { leerFotoDeCarta } from '@/lib/ocr-carta';
import {
  leerLista, resumenDeImportacion, revisar, PRECIO_RARO,
  type FilaImportada, type FilaRevisada,
} from '@/lib/importar-carta';
import { fmtMoney } from '@/lib/money';
import s from './importar-carta.module.css';

/* ============================================================
   IMPORTAR UNA CARTA (ficha 2.4)
   ------------------------------------------------------------
   Maqueta aprobada: docs/diseno/MAQUETA_IMPORTAR_CARTA_2026-11-16.html

   Dos caminos —pegar la lista o subir una hoja de cálculo— y una sola
   revisión antes de publicar. En el teléfono la revisión es una lista;
   en la PC, una tabla que se corrige en la misma fila. Lo dudoso no va
   marcado; lo que ya existe no se duplica, se ofrece cambiarle el precio.
   ============================================================ */

const EJEMPLO = 'DESAYUNOS\nHuevos rancheros ........ Q35\nDesayuno chapín  42.00\n\nALMUERZOS\nPepián de pollo   Q45';

const PLANTILLA = 'Categoría,Producto,Precio,Descripción\nDesayunos,Huevos rancheros,35,\nAlmuerzos,Pepián de pollo,45,Con arroz y tortillas\n';

const DUDA: Record<NonNullable<FilaImportada['duda']>, string> = {
  'sin-precio': 'No encontramos el precio',
  'precio-raro': `¿Seguro? Pasa de ${fmtMoney(PRECIO_RARO)}`,
  repetido: 'Está repetido en la lista',
};

function queHara(f: FilaRevisada): { texto: string; tono: 'ok' | 'info' | 'warn' | 'mute' } {
  if (f.precio === null) return { texto: DUDA['sin-precio'], tono: 'warn' };
  if (f.duda) return { texto: DUDA[f.duda], tono: 'warn' };
  if (f.accion === 'cambia-precio' && f.existente) {
    return { texto: `Cambia de ${fmtMoney(f.existente.precio)} a ${fmtMoney(f.precio)}`, tono: 'info' };
  }
  if (f.accion === 'igual') return { texto: 'Ya está igual en tu carta', tono: 'mute' };
  return { texto: 'Nuevo', tono: 'ok' };
}

export default function ImportarCarta({
  restaurantId, existentes,
}: {
  restaurantId: string;
  existentes: { id: string; name: string; price: number }[];
}) {
  const router = useRouter();
  const base = panelBaseFrom(usePathname());
  /* Foto o PDF primero: es lo que el dueño tiene a mano y lo que pidió
     (2026-11-16). La lista pegada se queda como tercera vía. */
  const [modo, setModo] = useState<'foto' | 'hoja' | 'lista'>('foto');
  /* Lo leído de una foto o PDF llega a la lista como texto, para que el
     dueño lo corrija antes de la revisión: el OCR se equivoca. */
  const [notaLectura, setNotaLectura] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ porcentaje: number; que: string } | null>(null);
  const fotoPdf = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [filas, setFilas] = useState<FilaRevisada[] | null>(null);
  const [soloDudas, setSoloDudas] = useState(false);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);

  function aRevision(leidas: FilaImportada[]) {
    if (leidas.length === 0) { setError('No encontramos platillos. Revisa que cada línea tenga nombre y precio.'); return; }
    setError('');
    setSoloDudas(false);
    setFilas(revisar(leidas, existentes));
    window.scrollTo({ top: 0 });
  }

  function subirHoja(file: File) {
    setError('');
    const fd = new FormData();
    fd.set('archivo', file);
    fd.set('restaurantId', restaurantId);
    start(async () => {
      const r = await leerHojaDeCalculo(fd);
      if ('error' in r) { setError(r.error); return; }
      aRevision(r.filas);
    });
  }

  function leerFotoOPdf(file: File) {
    setError('');
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    start(async () => {
      try {
        let leido: string;
        if (esPdf) {
          setProgreso({ porcentaje: 0, que: 'Leyendo tu PDF…' });
          const fd = new FormData();
          fd.set('archivo', file);
          fd.set('restaurantId', restaurantId);
          const r = await leerPdfDeCarta(fd);
          if ('error' in r) { setError(r.error); return; }
          leido = r.texto;
        } else {
          if (!file.type.startsWith('image/')) { setError('Sube una foto (JPG o PNG) o un PDF.'); return; }
          leido = await leerFotoDeCarta(file, (porcentaje, que) => setProgreso({ porcentaje, que }));
        }
        if (leido.replace(/\s/g, '').length < 5) {
          setError('No encontramos texto. Prueba con una foto más cerca, derecha y con buena luz.');
          return;
        }
        setTexto(leido);
        setNotaLectura(esPdf
          ? 'Esto es lo que leímos de tu PDF. Corrige lo que haga falta y toca «Revisar».'
          : 'Esto es lo que leímos de tu foto. Revisa nombres y precios: el lector puede confundir letras.');
        setModo('lista');
      } catch {
        setError('No pudimos leer el archivo. Inténtalo de nuevo o usa una hoja de cálculo.');
      } finally {
        setProgreso(null);
      }
    });
  }

  function descargarPlantilla() {
    const url = URL.createObjectURL(new Blob(['﻿' + PLANTILLA], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-carta-leogin.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Editar una fila: un precio válido quita la duda de «sin precio» y la marca. */
  function cambiar(i: number, cambio: Partial<Pick<FilaRevisada, 'nombre' | 'precio' | 'marcada' | 'categoria'>>) {
    setFilas((prev) => {
      if (!prev) return prev;
      const siguiente = prev.map((f, j) => (j === i ? { ...f, ...cambio } : f));
      const f = siguiente[i];
      if ('precio' in cambio) {
        const valido = f.precio !== null && f.precio > 0;
        const recalculada = revisar([{ ...f, duda: f.duda === 'sin-precio' && valido ? null : f.duda }], existentes)[0];
        siguiente[i] = { ...recalculada, marcada: valido && f.duda !== 'repetido' && recalculada.accion !== 'igual' };
      }
      return siguiente;
    });
  }

  const resumen = useMemo(() => (filas ? resumenDeImportacion(filas) : null), [filas]);
  const dudas = filas?.filter((f) => f.duda !== null || f.precio === null).length ?? 0;
  const visibles = (filas ?? []).map((f, i) => ({ f, i })).filter(({ f }) => !soloDudas || f.duda !== null || f.precio === null);

  function publicar() {
    if (!filas) return;
    const marcadas = filas.filter((f) => f.marcada && f.precio !== null);
    setError('');
    start(async () => {
      const r = await importarCarta({
        restaurantId,
        filas: marcadas.map((f) => ({ categoria: f.categoria, nombre: f.nombre, precio: f.precio!, descripcion: f.descripcion })),
      });
      if ('error' in r) { setError(r.error); return; }
      router.push(panelHref(base, `/admin/menu?importado=${r.lote}&n=${r.nuevos}&p=${r.precios}`));
    });
  }

  /* ── Revisión ── */
  if (filas) {
    return (
      <div className={s.pagina}>
        <div className={s.filaMandos}>
          <div className={s.pildoras} role="tablist" aria-label="Qué filas ver">
            <button type="button" role="tab" aria-selected={!soloDudas} className={s.pildora} onClick={() => setSoloDudas(false)}>
              Todas <small>{filas.length}</small>
            </button>
            {dudas > 0 && (
              <button type="button" role="tab" aria-selected={soloDudas} className={`${s.pildora} ${s.pildoraAviso}`} onClick={() => setSoloDudas(true)}>
                Con dudas <small>{dudas}</small>
              </button>
            )}
          </div>
          <div className={s.soloPc}>
            <Button type="button" variant="secondary" size="touch" onClick={() => setFilas(null)}>Volver a la lista</Button>
            <Button type="button" size="touch" disabled={pending || !resumen || (resumen.nuevos + resumen.precios === 0)} onClick={publicar}>
              {pending ? 'Agregando…' : resumen?.texto}
            </Button>
          </div>
        </div>

        {error && <p role="alert" className={s.error}>{error}</p>}

        <div className={s.tabla} role="table" aria-label="Revisión de la carta">
          <div className={s.encabezado} role="row">
            <span role="columnheader" className={s.cCheck} aria-label="Agregar" />
            <span role="columnheader" className={s.cCategoria}>Categoría</span>
            <span role="columnheader" className={s.cNombre}>Producto</span>
            <span role="columnheader" className={s.cPrecio}>Precio</span>
            <span role="columnheader" className={s.cQue}>Qué pasará</span>
          </div>
          {visibles.map(({ f, i }) => {
            const q = queHara(f);
            const puedeMarcar = f.precio !== null && f.precio > 0 && f.accion !== 'igual';
            return (
              <div key={i} className={s.fila} role="row" data-marcada={f.marcada || undefined}>
                <span role="cell" className={s.cCheck}>
                  <input
                    type="checkbox"
                    checked={f.marcada}
                    disabled={!puedeMarcar}
                    onChange={(e) => cambiar(i, { marcada: e.target.checked })}
                    aria-label={`Agregar ${f.nombre}`}
                  />
                </span>
                <span role="cell" className={s.cCategoria}>{f.categoria ?? 'Platillos'}</span>
                <span role="cell" className={s.cNombre}>
                  <input
                    value={f.nombre}
                    onChange={(e) => cambiar(i, { nombre: e.target.value })}
                    aria-label={`Nombre de la línea ${f.linea}`}
                    className={s.campo}
                  />
                </span>
                <span role="cell" className={s.cPrecio}>
                  <span className={s.precio}>
                    <span aria-hidden>Q</span>
                    <input
                      defaultValue={f.precio !== null ? f.precio.toFixed(2) : ''}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Precio de ${f.nombre}`}
                      onBlur={(e) => {
                        const n = Math.round(Number(e.target.value.replace(',', '.')) * 100) / 100;
                        cambiar(i, { precio: e.target.value.trim() && Number.isFinite(n) ? n : null });
                      }}
                    />
                  </span>
                </span>
                <span role="cell" className={s.cQue}>
                  <span className={s.que} data-tono={q.tono}>{q.texto}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className={s.pieMovil}>
          <Button type="button" size="action" className="w-full" disabled={pending || !resumen || (resumen.nuevos + resumen.precios === 0)} onClick={publicar}>
            {pending ? 'Agregando…' : resumen?.texto}
          </Button>
          <button type="button" className={s.enlace} onClick={() => setFilas(null)}>Volver a editar la lista</button>
        </div>
      </div>
    );
  }

  /* ── De dónde viene ── */
  return (
    <div className={s.pagina}>
      <div className={s.pildoras} role="tablist" aria-label="Cómo traer la carta">
        <button type="button" role="tab" aria-selected={modo === 'foto'} className={s.pildora} onClick={() => setModo('foto')}>Foto o PDF</button>
        <button type="button" role="tab" aria-selected={modo === 'hoja'} className={s.pildora} onClick={() => setModo('hoja')}>Excel</button>
        <button type="button" role="tab" aria-selected={modo === 'lista'} className={s.pildora} onClick={() => setModo('lista')}>Pegar lista</button>
      </div>

      {modo === 'foto' ? (
        <div className={s.bloque}>
          <p className={s.ayuda}>
            Sube una <strong>foto</strong> de tu carta o el <strong>PDF</strong>. Leemos el texto aquí mismo, sin mandarlo a
            ningún lado, y te lo enseñamos para que lo corrijas antes de publicar.
          </p>
          <button type="button" className={s.soltar} onClick={() => fotoPdf.current?.click()} disabled={pending} aria-busy={pending}>
            <Icon name="image" size={26} />
            <strong>{progreso ? progreso.que : 'Elegir foto o PDF'}</strong>
            <span>{progreso && progreso.porcentaje > 0 ? `${progreso.porcentaje} %` : 'JPG, PNG o PDF · una página por foto'}</span>
          </button>
          <input
            ref={fotoPdf}
            type="file"
            accept="image/*,.pdf,application/pdf"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leerFotoOPdf(f); e.target.value = ''; }}
          />
          {error && <p role="alert" className={s.error}>{error}</p>}
          <p className={s.nota}>Para que se lea bien: la foto derecha, de cerca y con buena luz. La primera vez descarga el lector (unos 6 MB).</p>
        </div>
      ) : modo === 'lista' ? (
        <div className={s.bloque}>
          {notaLectura ? (
            <p role="status" className={s.leido}>{notaLectura}</p>
          ) : (
            <label htmlFor="lista-carta" className={s.ayuda}>
              Pega tu carta como la tienes: un platillo por línea con su precio. Una línea sin precio se toma como categoría.
            </label>
          )}
          <textarea
            id="lista-carta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={EJEMPLO}
            rows={12}
            className={s.area}
          />
          <p className={s.nota}>Sirven los puntos, guiones, «Q» y la coma decimal.</p>
          {error && <p role="alert" className={s.error}>{error}</p>}
          <Button type="button" size="action" className={s.cta} disabled={!texto.trim()} onClick={() => aRevision(leerLista(texto))}>
            Revisar {texto.trim() ? `${texto.trim().split(/\n+/).length} líneas` : 'la lista'}
          </Button>
        </div>
      ) : (
        <div className={s.bloque}>
          <p className={s.ayuda}>
            Excel o CSV con las columnas <strong>Categoría</strong>, <strong>Producto</strong> y <strong>Precio</strong>.
            «Descripción» es opcional. Son las mismas columnas que tu exportación del catálogo.
          </p>
          <button type="button" className={s.soltar} onClick={() => archivo.current?.click()} disabled={pending}>
            <Icon name="upload" size={26} />
            <strong>{pending ? 'Leyendo el archivo…' : 'Elegir archivo'}</strong>
            <span>.xlsx o .csv · hasta 500 filas</span>
          </button>
          <input
            ref={archivo}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subirHoja(f); e.target.value = ''; }}
          />
          {error && <p role="alert" className={s.error}>{error}</p>}
          <button type="button" className={s.enlace} onClick={descargarPlantilla}>
            <Icon name="download" size={16} /> Descargar la plantilla
          </button>
        </div>
      )}
    </div>
  );
}
