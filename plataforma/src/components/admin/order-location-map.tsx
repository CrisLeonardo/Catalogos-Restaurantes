'use client';

/* Mini-mapa de la ubicación de entrega del cliente — panel de pedidos admin.
   Importado con dynamic({ ssr: false }). */

import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
}

export default function OrderLocationMap({ lat, lng }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((mod) => {
      const L = mod.default;
      const map = L.map(containerRef.current!, { center: [lat, lng], zoom: 15 });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="
            width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
            background:#3B82F6;border:3px solid #fff;
            box-shadow:0 3px 10px rgba(0,0,0,0.4);
          "></div>`,
          iconSize:   [34, 34],
          iconAnchor: [17, 34],
        }),
      }).addTo(map).bindTooltip('Ubicación del cliente', { permanent: false });

      mapRef.current = map;
    });

    return () => {
      (mapRef.current as { remove?: () => void })?.remove?.();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapsUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height: 200, borderRadius: 10, overflow: 'hidden' }}
      />
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute', bottom: 8, right: 8, zIndex: 1000,
          background: '#fff', borderRadius: 7, padding: '5px 10px',
          fontSize: 11.5, fontWeight: 700, color: '#1a73e8',
          textDecoration: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        Abrir en Google Maps ↗
      </a>
    </div>
  );
}
