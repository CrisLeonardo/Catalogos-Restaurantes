'use client';

/* ============================================================
   CÓDIGO QR (ficha 2.10, R33)
   ------------------------------------------------------------
   Eliges para qué es (Redes, Imprimir o Solo el código) y la vista
   previa es el archivo: el mismo canvas que se descarga. Lo impreso
   apunta a la dirección estable `/m/<slug>`, que sobrevive a un cambio
   de nombre; el enlace corto queda escrito para que se pueda teclear.
   Reglas en `lib/qr-material.ts`; dibujo en `lib/documents/qr-art.ts`.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from '@/components/admin/panel-link';
import { Button } from '@/components/ui/button';
import { useToastManager } from '@/components/ui/toast';
import { direccionLegible, esDireccionDePrueba, nombreDeArchivo, type Frase, type IdFrase, type Uso } from '@/lib/qr-material';
import s from './qr/qr.module.css';

interface Props {
  restaurantName: string;
  restaurantId: string;
  /** Color de acento del restaurante (detalles de la tarjeta y el cartel). */
  accent: string;
  /** Tiene logo: el QR lo lleva al centro. */
  hasLogo: boolean;
  /** Lo que codifica el QR: la dirección estable de la carta general. */
  urlEstable: string;
  /** El enlace corto, el que se lee y se teclea. */
  enlaceCorto: string;
  /** Las frases que el cartel puede decir (la primera, por defecto). */
  frases: Frase[];
}

const USOS: { id: Uso; label: string }[] = [
  { id: 'redes', label: 'Redes' },
  { id: 'imprimir', label: 'Imprimir' },
  { id: 'codigo', label: 'Solo el código' },
];

const BOTON: Record<Uso, string> = {
  redes: 'Descargar la tarjeta',
  imprimir: 'Descargar el cartel (PDF)',
  codigo: 'Descargar el código',
};

const ALT: Record<Uso, string> = {
  redes: 'Vista previa de la tarjeta para redes',
  imprimir: 'Vista previa de la hoja con dos carteles',
  codigo: 'Vista previa del código QR',
};

export default function QRDisplay({ restaurantName, restaurantId, accent, hasLogo, urlEstable, enlaceCorto, frases }: Props) {
  const toast = useToastManager();
  const [uso, setUso] = useState<Uso>('redes');
  const [fraseId, setFraseId] = useState<IdFrase>(frases[0].id);
  const [previa, setPrevia] = useState<string | null>(null);
  const [armando, setArmando] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCopia, setErrorCopia] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const logo = useRef<Promise<HTMLImageElement | null> | null>(null);
  const turno = useRef(0);

  const frase = frases.find((f) => f.id === fraseId) ?? frases[0];
  const direccion = direccionLegible(enlaceCorto);
  const prueba = esDireccionDePrueba(urlEstable);

  const armar = useCallback(async (u: Uso, texto: string) => {
    const art = await import('@/lib/documents/qr-art');
    if (!logo.current) logo.current = hasLogo ? art.cargarLogo(restaurantId) : Promise.resolve(null);
    const m = { url: urlEstable, direccion, restaurantName, accent, frase: texto, logo: await logo.current };
    if (u === 'redes') return art.dibujarTarjeta(m);
    if (u === 'imprimir') return art.dibujarHojaCartel(m);
    return art.dibujarCodigo(m);
  }, [accent, direccion, hasLogo, restaurantId, restaurantName, urlEstable]);

  // La vista previa es el canvas que se va a descargar: se rearma al
  // cambiar el uso o la frase, y la respuesta vieja se descarta.
  useEffect(() => {
    const yo = ++turno.current;
    let url: string | null = null;
    setArmando(true);
    setError(null);
    (async () => {
      try {
        const canvas = await armar(uso, frase.texto);
        const art = await import('@/lib/documents/qr-art');
        const href = await art.vistaPrevia(canvas);
        if (yo !== turno.current) { URL.revokeObjectURL(href); return; }
        url = href;
        lienzo.current = canvas;
        setPrevia(href);
      } catch {
        if (yo !== turno.current) return;
        lienzo.current = null;
        setPrevia(null);
        setError('No se pudo armar la vista previa. Revisa tu conexión y vuelve a intentarlo.');
      } finally {
        if (yo === turno.current) setArmando(false);
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [armar, uso, frase.texto]);

  async function descargar() {
    const canvas = lienzo.current;
    if (!canvas) return;
    setBajando(true);
    setError(null);
    const base = nombreDeArchivo(restaurantName);
    const nombre = uso === 'redes' ? `qr-redes-${base}.png` : uso === 'imprimir' ? `qr-cartel-${base}.pdf` : `qr-${base}.png`;
    try {
      const art = await import('@/lib/documents/qr-art');
      if (uso === 'imprimir') await art.descargarHojaPdf(canvas, nombre);
      else await art.descargarPng(canvas, nombre);
      toast.add({ title: 'Archivo listo', description: nombre, type: 'success' });
    } catch {
      setError(uso === 'imprimir'
        ? 'No se pudo armar el cartel. Revisa tu conexión y vuelve a intentarlo.'
        : 'No se pudo guardar la imagen. Vuelve a intentarlo.');
    } finally {
      setBajando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlEstable);
      setErrorCopia(false);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      setErrorCopia(true);
    }
  }

  return (
    <div className={s.qr}>
      {prueba && (
        <p className={s.aviso} data-tono="prueba" role="note">
          <b>Estás en una copia de prueba.</b> Este QR apunta a esta computadora y no abrirá en el restaurante. No lo imprimas.
        </p>
      )}

      <div className={s.destino} data-tour-step="qr-enlace">
        <span className="min-w-0 flex-1">
          <b>Abre tu carta general</b>
          <code>{direccionLegible(urlEstable)}</code>
        </span>
        <Button type="button" variant="secondary" size="md" onClick={copiar} className="shrink-0">
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      {errorCopia && (
        <p className={s.aviso} data-tono="error" role="alert">No se pudo copiar. Mantén presionado el enlace y elige «Copiar».</p>
      )}

      <div className={s.seg} role="radiogroup" aria-label="Para qué lo quieres">
        {USOS.map((u) => (
          <button key={u.id} type="button" role="radio" aria-checked={uso === u.id} onClick={() => setUso(u.id)}>{u.label}</button>
        ))}
      </div>

      <div className={s.previa} data-uso={uso} aria-busy={armando}>
        {previa
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={previa} alt={ALT[uso]} style={armando ? { opacity: 0.5 } : undefined} />
          : <span className={s.cargando} aria-label="Armando la vista previa" />}
      </div>

      <p className={s.ayuda}>
        {uso === 'redes' && 'Imagen de 1080 × 1350 px para Instagram, Facebook o WhatsApp.'}
        {uso === 'imprimir' && <>Hoja carta · 2 carteles de 10.5 × 14.8 cm para recortar. Imprime en <b>«Tamaño real»</b> o al 100 %, no en «Ajustar a la página»: así el código mide 7 cm y se lee hasta a 70 cm.</>}
        {uso === 'codigo' && `Imagen de 1200 × 1200 px${hasLogo ? ' con tu logo' : ''}, igual que aquí. Para tu imprenta o un diseño propio: deja un margen blanco alrededor.`}
      </p>

      {uso !== 'codigo' && frases.length > 1 && (
        <div className={s.campo}>
          <label htmlFor="qr-frase">Texto {uso === 'redes' ? 'de la tarjeta' : 'del cartel'}</label>
          <select id="qr-frase" className="adm-field adm-field-lg" value={frase.id} onChange={(e) => setFraseId(e.target.value as IdFrase)}>
            {frases.map((f) => <option key={f.id} value={f.id}>{f.texto}</option>)}
          </select>
        </div>
      )}

      {error && <p className={s.aviso} data-tono="error" role="alert">{error}</p>}

      <Button type="button" size="touch" className="w-full" disabled={!previa || armando || bajando} onClick={descargar} data-tour-step="qr-descargar">
        {bajando ? 'Preparando el archivo…' : BOTON[uso]}
      </Button>

      <Link href="/admin/ajustes/salon" className={s.mesas}>
        QR de cada mesa <span>Ajustes › Salón ›</span>
      </Link>
    </div>
  );
}
