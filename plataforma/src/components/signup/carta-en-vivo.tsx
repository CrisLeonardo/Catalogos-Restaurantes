'use client';

import { useEffect, useRef, useState } from 'react';
import type { MuestraPedido } from '@/lib/muestra-mensajes';
import { esMuestraAviso } from '@/lib/muestra-mensajes';

/* La carta del alta, en vivo (ficha 2.3). Es el catálogo de verdad
   (/preview/muestra, el mismo MenuShell del comensal) dentro de un teléfono,
   con el nombre, el estilo y los platillos que el dueño va escribiendo. No
   toca la base: todo viaja por postMessage del mismo origen. */
export function CartaEnVivo({
  estilo, nombre, platos, pedidos = true,
}: {
  estilo: string;
  nombre: string;
  platos: { nombre: string; precio: number }[];
  /** El plan elegido recibe pedidos (Básico no). */
  pedidos?: boolean;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [lista, setLista] = useState(false);
  /* La dirección se fija al montar: si cambiara con el estilo o el nombre,
     el iframe se recargaría y perdería los platillos. Lo demás va por
     mensaje. */
  const [src] = useState(() =>
    `/preview/muestra?alta=1&estilo=${encodeURIComponent(estilo)}&nombre=${encodeURIComponent(nombre.trim() || 'Tu restaurante')}`);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== marco.current?.contentWindow) return;
      if (esMuestraAviso(e.data) && e.data.type === 'leogin-muestra-lista') setLista(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!lista) return;
    const msg: MuestraPedido = { type: 'leogin-muestra', estilo, nombre: nombre.trim() || 'Tu restaurante', platos, pedidos };
    marco.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, [lista, estilo, nombre, platos, pedidos]);

  return (
    <div className="listo-telefono" style={{ margin: '0 auto' }}>
      <iframe
        ref={marco}
        src={src}
        title={`La carta de ${nombre.trim() || 'tu restaurante'}`}
      />
    </div>
  );
}
