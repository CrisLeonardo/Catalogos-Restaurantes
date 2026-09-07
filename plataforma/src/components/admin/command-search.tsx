'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { Icon } from '@/components/icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { NavGroup } from '@/lib/admin-nav';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

/* ============================================================
   BUSCADOR DEL PANEL (rediseño 2026-08-21, Fase 4)
   ------------------------------------------------------------
   Es la pieza que hace que reducir el menú a seis no cueste nada:
   quien ya sabe a dónde va escribe "impresora" y llega, sin recordar
   si eso vive en Ajustes o en Personal. Con treinta pantallas,
   buscar es más rápido que acordarse.

   Busca por NOMBRE y por SINÓNIMOS, que es donde suele fallar un
   buscador de panel: el dueño escribe "factura" y la pantalla se
   llama "Facturación"; escribe "wifi" o "impresora" y lo que
   necesita es "La PC del local". Los sinónimos son el vocabulario
   del restaurante, no el nuestro.

   Solo ofrece lo que esa persona puede abrir: la lista sale de los
   mismos grupos ya filtrados por módulos, plan y permisos.
   ============================================================ */

/** Palabras con las que la gente busca cada pantalla, además de su nombre. */
const ALIAS: Record<string, string> = {
  hoy: 'inicio portada resumen dia',
  pedidos: 'ordenes comandas ventas en vivo',
  cocina: 'kds comanda chef preparacion',
  mesas: 'salon comer en local qr mesa',
  mesero: 'tomar pedido salon mesero',
  catalogo: 'platillos productos menu comida precios fotos',
  categorias: 'secciones grupos entradas bebidas postres',
  ingredientes: 'recetas insumos costos',
  inventario: 'existencias stock bodega kardex',
  proveedores: 'compras insumos facturas de compra',
  clientes: 'comensales contactos base de datos',
  lealtad: 'puntos premios fidelidad recompensas',
  cupones: 'descuentos promociones codigos',
  encuestas: 'opiniones calificaciones satisfaccion',
  reservaciones: 'reservas apartar mesa',
  lista_espera: 'fila espera turnos',
  metricas: 'numeros ventas reportes estadisticas',
  analitica: 'reportes graficas tendencias',
  finanzas: 'caja cierre gastos utilidad corte',
  fel: 'facturacion factura electronica sat nit dte',
  canales: 'delivery pedidosya uber apps externas',
  respaldo: 'backup copia exportar datos descargar',
  perfil: 'datos negocio whatsapp direccion telefono',
  ajustes: 'horarios abrir cerrar pausa moneda idiomas ubicacion',
  personalizar: 'colores logo tipografia marca plantilla diseno',
  qr: 'codigo qr imprimir mesa enlace',
  impresion: 'pc computadora impresora ticket wifi sin internet agente',
  personal: 'empleados equipo permisos usuarios pin',
  suscripcion: 'plan pago precio factura mensualidad',
  modulos: 'funciones activar apagar',
  ayuda: 'soporte tutoriales guias dudas',
};

interface Hit {
  href: string;
  label: string;
  group: string;
  locked?: boolean;
  haystack: string;
}

/** Sin acentos y en minúsculas: quien escribe "analitica" busca "Analítica". */
function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

interface Props {
  groups: NavGroup[];
}

export default function CommandSearch({ groups }: Props) {
  const router = useRouter();
  /* Los `href` de los grupos son rutas INTERNAS (`/admin/caja`). Empujarlas
     tal cual sacaba del panel a quien entró por el origen único —el buscador
     es la pieza más usada del "⋯" del teléfono, así que se salía por la
     puerta más transitada. Ver lib/panel-links.ts. */
  const base = panelBaseFrom(usePathname());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    for (const g of groups) {
      const entries = g.items.length > 0 ? g.items : [{ href: g.href, label: g.label, key: g.key }];
      for (const it of entries) {
        out.push({
          href: 'locked' in it && it.locked ? '/admin/suscripcion' : it.href,
          label: it.label,
          group: g.label,
          locked: 'locked' in it ? it.locked : undefined,
          haystack: fold(`${it.label} ${g.label} ${ALIAS[it.key] ?? ''}`),
        });
      }
    }
    return out;
  }, [groups]);

  const hits = useMemo(() => {
    const needle = fold(q.trim());
    if (!needle) return all.slice(0, 8);
    // Las palabras pueden venir en cualquier orden: "pedidos cocina" y
    // "cocina pedidos" tienen que encontrar lo mismo.
    const words = needle.split(/\s+/);
    return all.filter((h) => words.every((w) => h.haystack.includes(w))).slice(0, 8);
  }, [q, all]);

  // Abrir con ⌘K / Ctrl+K desde cualquier pantalla del panel. Se ignora si el
  // foco está escribiendo en otro sitio y el atajo no es el nuestro.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    // El campo de la barra lateral es un botón normal: avisa por evento para
    // no tener que subir el estado hasta el shell.
    const openEvt = () => setOpen(true);
    window.addEventListener('admin:search', openEvt);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('admin:search', openEvt);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setCursor(0);
    // El foco se reclama DESPUÉS de que el diálogo termine de montarse y de
    // hacer su propia gestión de foco (se lo lleva el popup, no el campo).
    // Sin esto hace falta un clic extra antes de poder escribir, que es justo
    // lo que un buscador con atajo de teclado no puede pedir. Se reintenta unas
    // cuantas veces en vez de apostar a un único retardo mágico.
    // Se insiste en varios momentos, SIN cortar al primer acierto: el diálogo
    // hace su gestión de foco después de montarse y devolvía el foco al popup
    // en cuanto lo soltábamos. El último que escribe gana, y ese tiene que ser
    // el campo.
    const ids = [0, 50, 120, 260].map((ms) => setTimeout(() => inputRef.current?.focus(), ms));
    return () => ids.forEach(clearTimeout);
  }, [open]);

  useEffect(() => { setCursor(0); }, [q]);

  const go = useCallback((h: Hit) => {
    setOpen(false);
    router.push(panelHref(base, h.href));
  }, [router, base]);

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); go(hits[cursor]); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showClose={false}
        className="top-[15vh] w-[min(94vw,520px)] translate-y-0 p-0"
        initialFocus={inputRef}
        aria-label="Buscar en el panel"
      >
        <DialogTitle className="sr-only">Buscar en el panel</DialogTitle>

        <div className="flex items-center gap-3 border-b border-adm-border px-4 py-3.5">
          <Icon name="search" size={17} className="shrink-0 text-adm-text-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscá una pantalla: impresora, QR, inventario…"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-adm-text outline-none placeholder:text-adm-text-4"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13.5px] leading-snug text-adm-text-3">
              Nada con ese nombre. Probá con lo que querés hacer —«cobrar», «horarios», «puntos»— o mirá el Centro de ayuda.
            </p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.href + h.label}
                type="button"
                onClick={() => go(h)}
                onMouseMove={() => setCursor(i)}
                data-active={i === cursor ? '1' : '0'}
                className="flex min-h-11 w-full items-center gap-3 rounded-adm-md px-3 text-left transition-colors data-[active=1]:bg-adm-card"
              >
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-adm-text">{h.label}</span>
                {h.locked && <Icon name="key" size={13} className="shrink-0 text-adm-text-4" />}
                <span className="shrink-0 text-[12.5px] text-adm-text-3">{h.group}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
