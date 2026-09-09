'use client';

/* Mapa interactivo de entrega para el checkout.
   Importado con dynamic({ ssr: false }) — NO renderizar en el servidor.

   El cliente arrastra el pin azul hasta su dirección. Si el restaurante
   tiene radio configurado, se muestra el área de cobertura y se informa
   si el pin está dentro o fuera. */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Icon } from '@/components/icons';

interface Props {
  /** Posición inicial del pin del cliente (si ya se eligió antes). */
  initialLat?: number;
  initialLng?: number;
  /** Ubicación del restaurante (para mostrar el círculo de cobertura). */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  /** Radio de entrega del restaurante en km. */
  radiusKm?: number | null;
  onLocationChange: (lat: number, lng: number) => void;
}

// Haversine client-side (para feedback en tiempo real sin round-trip al servidor)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DeliveryMap({
  initialLat,
  initialLng,
  restaurantLat,
  restaurantLng,
  radiusKm,
  onLocationChange,
}: Props) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const mapRef            = useRef<unknown>(null);
  const markerRef         = useRef<unknown>(null);
  const notifyChangeRef   = useRef<((lat: number, lng: number) => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [calibrating, setCalibrating] = useState(false);

  const hasRestaurant = restaurantLat !== undefined && restaurantLat !== null
    && restaurantLng !== undefined && restaurantLng !== null;
  const hasRadius = hasRestaurant && radiusKm !== undefined && radiusKm !== null;

  // Callback estable para no volver a correr el efecto (se fija al montar a
  // propósito; los cambios del padre no deben recrear el mapa Leaflet).
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const stableOnChange = useCallback(onLocationChange, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Cargar CSS de Leaflet via CDN (evita problemas de build con Turbopack)
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Centro inicial: pin guardado → restaurante → Ciudad de Guatemala
    const startLat = initialLat ?? restaurantLat ?? 14.64072;
    const startLng = initialLng ?? restaurantLng ?? -90.51327;

    import('leaflet').then((mod) => {
      const L = mod.default;

      const map = L.map(containerRef.current!, {
        center: [startLat, startLng],
        zoom:   15,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Círculo de cobertura del restaurante
      if (hasRadius) {
        L.circle([restaurantLat!, restaurantLng!], {
          radius:      (radiusKm as number) * 1000,
          color:       '#D97757',
          fillColor:   '#D97757',
          fillOpacity: 0.07,
          weight:      2,
          dashArray:   '6 4',
        }).addTo(map);
      }

      // Marcador del restaurante (fijo, informativo)
      if (hasRestaurant) {
        L.marker([restaurantLat!, restaurantLng!], {
          icon: L.divIcon({
            className: '',
            html: `<div title="Restaurante" style="
              width:28px;height:28px;border-radius:50%;
              background:#D97757;border:3px solid #fff;
              box-shadow:0 2px 8px rgba(0,0,0,0.4);
              display:flex;align-items:center;justify-content:center;
            ">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
            </div>`,
            iconSize:   [28, 28],
            iconAnchor: [14, 14],
          }),
        }).addTo(map).bindTooltip('Restaurante', { permanent: false });
      }

      // Pin del cliente (arrastrable, azul)
      const clientIcon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          background:#3B82F6;border:3px solid #fff;
          box-shadow:0 3px 10px rgba(0,0,0,0.4);
        "></div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 36],
        popupAnchor:[0, -36],
      });

      const clientMarker = L.marker([startLat, startLng], {
        draggable: true,
        icon:      clientIcon,
      }).addTo(map);
      clientMarker.bindTooltip('Arrastra hasta tu dirección exacta', { permanent: false });

      const notifyChange = (lat: number, lng: number) => {
        stableOnChange(lat, lng);

        // Feedback visual: pin rojo si fuera del radio
        if (hasRadius) {
          const dist = haversineKm(restaurantLat!, restaurantLng!, lat, lng);
          const covered = dist <= (radiusKm as number);
          clientMarker.setIcon(L.divIcon({
            className: '',
            html: `<div style="
              width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
              background:${covered ? '#3B82F6' : '#EF4444'};border:3px solid #fff;
              box-shadow:0 3px 10px rgba(0,0,0,0.4);
            "></div>`,
            iconSize:   [36, 36],
            iconAnchor: [18, 36],
            popupAnchor:[0, -36],
          }));
        }
      };

      clientMarker.on('dragend', () => {
        const pos = (clientMarker as ReturnType<typeof L.marker>).getLatLng();
        notifyChange(pos.lat, pos.lng);
      });

      // Click en el mapa también mueve el pin
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        (clientMarker as ReturnType<typeof L.marker>).setLatLng([lat, lng]);
        notifyChange(lat, lng);
      });

      mapRef.current      = map;
      markerRef.current   = clientMarker;
      notifyChangeRef.current = notifyChange;

      // Notificar posición inicial
      notifyChange(startLat, startLng);

      // El contenedor vive dentro de un sheet/checkout que entra con
      // animación (fade-up, blur de Glass): Leaflet calcula el tamaño del
      // grid de tiles en el instante exacto de L.map(), y si en ese momento
      // el contenedor todavía no tiene su tamaño final, se queda pintando
      // solo un área vacía aunque el contenedor termine bien. Un
      // invalidateSize() inmediato no basta (mismo problema), así que se
      // fuerza uno tras el primer frame Y se sigue vigilando por si el
      // contenedor todavía cambia de tamaño después (ResizeObserver).
      requestAnimationFrame(() => map.invalidateSize());
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(containerRef.current!);
      resizeObserverRef.current = ro;

      // Geolocalización: centrar en la posición real del usuario
      if (navigator.geolocation && initialLat === undefined) {
        navigator.geolocation.getCurrentPosition(
          ({ coords: { latitude, longitude } }) => {
            (map as ReturnType<typeof L.map>).setView([latitude, longitude], 16);
            (clientMarker as ReturnType<typeof L.marker>).setLatLng([latitude, longitude]);
            notifyChange(latitude, longitude);
          },
          () => { /* permiso denegado o tiempo agotado — no es error */ },
          { timeout: 6000, enableHighAccuracy: true },
        );
      }
    });

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      (mapRef.current as { remove?: () => void })?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleRecalibrate() {
    if (!navigator.geolocation || !mapRef.current || !markerRef.current) return;
    setCalibrating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        (mapRef.current as { setView: (latlng: [number, number], zoom: number) => void })
          .setView([latitude, longitude], 16);
        (markerRef.current as { setLatLng: (latlng: [number, number]) => void })
          .setLatLng([latitude, longitude]);
        notifyChangeRef.current?.(latitude, longitude);
        setCalibrating(false);
      },
      () => setCalibrating(false),
      { timeout: 8000, enableHighAccuracy: true },
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{ height: 280, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
      />
      <button
        type="button"
        onClick={handleRecalibrate}
        disabled={calibrating}
        style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 1000,
          background: '#fff', border: 'none', borderRadius: 8,
          padding: '7px 12px', cursor: calibrating ? 'wait' : 'pointer',
          fontSize: 12, fontWeight: 600, color: '#333',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
          opacity: calibrating ? 0.7 : 1,
        }}
      >
        <Icon name="mapPin" size={14} /> {calibrating ? 'Buscando…' : 'Mi ubicación'}
      </button>
    </div>
  );
}
