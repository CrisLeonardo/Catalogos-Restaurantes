'use client';

/* Mapa interno del editor de ubicación del restaurante.
   Importado con dynamic({ ssr: false }) — NO renderizar en el servidor. */

import { useEffect, useRef } from 'react';

interface Props {
  lat: number;
  lng: number;
  radiusKm: number;
  onLocationChange: (lat: number, lng: number) => void;
}

export default function RestaurantLocationMap({ lat, lng, radiusKm, onLocationChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const circleRef = useRef<unknown>(null);

  // Montaje inicial del mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Cargar CSS de Leaflet dinámicamente (evita problemas con Turbopack/SSR)
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    import('leaflet').then((mod) => {
      const L = mod.default;

      const map = L.map(containerRef.current!, {
        center: [lat, lng],
        zoom:   15,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Icono del restaurante (pin naranja)
      const restaurantIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:#D97757;border:3px solid #fff;
          box-shadow:0 3px 10px rgba(0,0,0,0.45);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
        </div>`,
        iconSize:   [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lng], { draggable: true, icon: restaurantIcon }).addTo(map);
      marker.bindTooltip('Arrastra para ajustar la ubicación', { permanent: false });

      const circle = L.circle([lat, lng], {
        radius:      radiusKm * 1000,
        color:       '#D97757',
        fillColor:   '#D97757',
        fillOpacity: 0.07,
        weight:      2,
        dashArray:   '6 4',
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = (marker as ReturnType<typeof L.marker>).getLatLng();
        circle.setLatLng(pos);
        onLocationChange(pos.lat, pos.lng);
      });

      mapRef.current    = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });

    return () => {
      (mapRef.current as { remove?: () => void })?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar el círculo cuando cambia el radio (sin remontar el mapa)
  useEffect(() => {
    if (!circleRef.current || !markerRef.current) return;
    import('leaflet').then((mod) => {
      const L = mod.default;
      const pos = (markerRef.current as ReturnType<typeof L.marker>).getLatLng();
      (circleRef.current as ReturnType<typeof L.circle>).setRadius(radiusKm * 1000);
      (circleRef.current as ReturnType<typeof L.circle>).setLatLng(pos);
    });
  }, [radiusKm]);

  return (
    <div
      ref={containerRef}
      style={{ height: 300, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
    />
  );
}
