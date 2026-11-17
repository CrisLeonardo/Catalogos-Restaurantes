'use client';

/* ============================================================
   ESTE APARATO (ficha 2.6 de la auditoría, A06)
   ------------------------------------------------------------
   Tres piezas para que una tablet de cocina despierte en Cocina:

     · HojaAparato ........ «¿Para qué es este aparato?», una vez.
     · InicioDelAparato ... al abrir el panel en Hoy, lleva a esa
                            pantalla a pantalla completa (una vez por
                            apertura) si la persona la tiene.
     · AvisoAparatoListo .. justo después de elegir: probar el sonido
                            y la impresora.
   ============================================================ */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useToastManager } from '@/components/ui/toast';
import { guardarUsoDelAparato } from '@/lib/actions/aparato';
import { sendTestPrint } from '@/lib/actions/print-agent';
import { destinoDelAparato, MARCA_INICIO, ORDEN_USOS, USOS, type UsoAparato } from '@/lib/aparato';
import { playKitchenSound, playOrderSound, primeAudio } from '@/lib/sounds';
import s from './este-aparato.module.css';

const NOMBRE_SUGERIDO: Record<UsoAparato | 'panel', string> = {
  cocina: 'Tablet de cocina', caja: 'Caja', mesero: 'Tablet de meseros', panel: '',
};

function marcarPantallaCompleta(uso: UsoAparato) {
  try { localStorage.setItem(USOS[uso].kioskKey, '1'); } catch { /* sin almacenamiento */ }
}

/* ── La hoja ─────────────────────────────────────────────────── */
export function HojaAparato({ restaurantId, uso, nombre, enlace, onClose }: {
  restaurantId: string;
  uso: UsoAparato | null;
  nombre: string | null;
  /** Traduce una ruta interna del panel al origen actual. */
  enlace: (ruta: string) => string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [elegido, setElegido] = useState<UsoAparato | 'panel'>(uso ?? 'panel');
  const [nombreAparato, setNombre] = useState(nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, start] = useTransition();
  const tocoNombre = useRef(!!nombre);

  function elegir(v: UsoAparato | 'panel') {
    setElegido(v);
    if (!tocoNombre.current) setNombre(NOMBRE_SUGERIDO[v]);
  }

  function guardar() {
    setError(null);
    start(async () => {
      const r = await guardarUsoDelAparato(restaurantId, elegido === 'panel' ? null : elegido, nombreAparato);
      if ('error' in r) { setError(r.error); return; }
      onClose();
      if (elegido === 'panel') { router.refresh(); return; }
      marcarPantallaCompleta(elegido);
      try { sessionStorage.setItem(MARCA_INICIO, '1'); } catch { /* sin almacenamiento */ }
      router.push(`${enlace(USOS[elegido].ruta)}?aparato=listo`);
    });
  }

  const opciones: { v: UsoAparato | 'panel'; label: string; desc: string }[] = [
    ...ORDEN_USOS.map((u) => ({ v: u, label: USOS[u].label, desc: USOS[u].desc })),
    { v: 'panel', label: 'Panel completo', desc: 'Como hasta hoy' },
  ];

  return (
    <HojaOperativa
      label="Este aparato"
      title="¿Para qué es este aparato?"
      onClose={onClose}
      footer={
        <div className={s.pie}>
          {error && <p className={s.error} role="alert">{error}</p>}
          <Button type="button" size="action" className="w-full" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : elegido === 'panel' ? 'Usar como panel completo' : `Usar para ${USOS[elegido].label}`}
          </Button>
        </div>
      }
    >
      <div className={s.cuerpo}>
        <p className={s.nota}>Quien entre aquí abre directo en esa pantalla. Sus permisos no cambian.</p>
        <div role="radiogroup" aria-label="Uso del aparato" className={s.opciones}>
          {opciones.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={elegido === o.v}
              className={s.opcion} data-on={elegido === o.v ? '1' : undefined} onClick={() => elegir(o.v)}>
              <span className={s.radio} aria-hidden />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-[15px] font-semibold text-adm-text">{o.label}</span>
                <span className="block text-[13px] text-adm-text-3">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
        {elegido !== 'panel' && (
          <label className={s.campo}>
            <span>Nombre del aparato</span>
            <input className="adm-field" value={nombreAparato} maxLength={60}
              onChange={(e) => { tocoNombre.current = true; setNombre(e.target.value); }}
              placeholder="Ej. Tablet de cocina" />
          </label>
        )}
      </div>
    </HojaOperativa>
  );
}

/* ── El inicio directo ──────────────────────────────────────── */
export function InicioDelAparato({ uso, pathname, rutasPermitidas, enlace }: {
  uso: UsoAparato | null;
  /** Ruta interna actual. */
  pathname: string;
  rutasPermitidas: ReadonlySet<string>;
  enlace: (ruta: string) => string;
}) {
  const router = useRouter();
  const { add: toast } = useToastManager();
  const hecho = useRef(false);

  useEffect(() => {
    if (!uso || pathname !== '/admin' || hecho.current) return;
    hecho.current = true;
    /* Una vez por apertura de la app: si el dueño vuelve a Hoy desde la
       tablet de cocina, no se le echa de nuevo. */
    try {
      if (sessionStorage.getItem(MARCA_INICIO) === '1') return;
      sessionStorage.setItem(MARCA_INICIO, '1');
    } catch { return; }
    const destino = destinoDelAparato(uso, rutasPermitidas);
    if (!destino) {
      toast({ title: `Este aparato es de ${USOS[uso].label}`, description: 'Tú no tienes acceso a esa pantalla: entras a la tuya de siempre.' });
      return;
    }
    marcarPantallaCompleta(uso);
    router.replace(enlace(destino));
  }, [uso, pathname, rutasPermitidas, enlace, router, toast]);

  return null;
}

/* ── «Listo: ¿se oye y se imprime?» ─────────────────────────── */
export function AvisoAparatoListo({ uso }: { uso: UsoAparato | null }) {
  const params = useSearchParams();
  const router = useRouter();
  const [cerrado, setCerrado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  if (!uso || cerrado || params.get('aparato') !== 'listo') return null;

  function cerrar() {
    setCerrado(true);
    router.replace(window.location.pathname);
  }

  function sonar() {
    primeAudio();
    if (uso === 'cocina') playKitchenSound(0.7, 1, { force: true });
    else playOrderSound(0.7, 1, { force: true });
    setMsg('¿Lo oíste? Si no, sube el volumen del aparato.');
  }

  function imprimir() {
    start(async () => {
      const r = await sendTestPrint({ role: uso === 'caja' ? 'receipt' : 'kitchen' });
      setMsg(r.error ?? 'Prueba enviada: sale en unos segundos en la impresora.');
    });
  }

  return (
    <div className={s.aviso} role="status">
      <div className={s.avisoFila}>
        <Icon name="check" size={18} aria-hidden />
        <p>Listo: este aparato es de <b>{USOS[uso].label}</b>. ¿Se oye y se imprime?</p>
        <button type="button" className={s.cerrar} onClick={cerrar} aria-label="Cerrar"><Icon name="x" size={16} /></button>
      </div>
      <div className={s.avisoBotones}>
        <Button type="button" variant="secondary" size="touch" onClick={sonar}>Probar sonido</Button>
        {uso !== 'mesero' && (
          <Button type="button" variant="secondary" size="touch" disabled={enviando} onClick={imprimir}>
            {enviando ? 'Enviando…' : 'Imprimir prueba'}
          </Button>
        )}
      </div>
      {msg && <p className={s.avisoMsg}>{msg}</p>}
    </div>
  );
}
