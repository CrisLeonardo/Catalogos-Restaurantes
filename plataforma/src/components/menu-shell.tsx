'use client';

import { useEffect, useMemo } from 'react';
import { setScannedTable, isStandaloneLaunch } from '@/lib/table-session';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { LocaleProvider } from '@/lib/locale/context';
import Portada from '@/components/menu/portada';
import Cinta from '@/components/menu/cinta';
import { esDestacado } from '@/lib/menu-pairings';
import MenuClient from '@/components/menu-client';
import VisitTracker from '@/components/visit-tracker';
import InstallBanner from '@/components/install-banner';
import OfflineSupport from '@/components/offline-support';
import { Icon } from '@/components/icons';
import type { MenuReward } from '@/components/menu/rewards-section';
import { isVitrina, type ThemeConfig, type ThemeContent } from '@/lib/theme/defaults';
import { VITRINA_TOP_H } from '@/components/menu/vitrina-bar';
import VitrinaArchivo from '@/components/menu/vitrina-archivo';
import { enlaceAvisame } from '@/lib/vitrina/edicion';
import type { EdicionArchivada } from '@/lib/db/vitrina';
import type { WeeklyHours } from '@/lib/hours';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon' | 'name_en'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'name_en' | 'description' | 'description_en' | 'price' | 'image_url' | 'icon' | 'tags' | 'dietary_tags' | 'options'>;

interface Props {
  config: ThemeConfig;
  content: ThemeContent;
  categories: CatItem[];
  products: ProdItem[];
  restaurantId: string;
  ordersEnabled: boolean;
  /** Estado real según horarios del restaurante (default: abierto). */
  isOpen?: boolean;
  /** Texto de próxima apertura ("hoy a las 18:00") cuando está cerrado. */
  reopenHint?: string | null;
  /** Zona horaria del restaurante (para los menús por franja horaria). */
  timezone?: string;
  /** Mesa pre-seleccionada desde el QR de la mesa. */
  initialMesa?: number;
  /** Módulos activos para mostrar funciones opcionales en el menú. */
  llamadaMeseroEnabled?: boolean;
  /** Módulo de lealtad activo (independiente del catálogo de canje). */
  loyaltyOn?: boolean;
  /** Recompensas de lealtad (v2). null = canje deshabilitado. */
  rewardsCatalog?: MenuReward[] | null;
  googleAuthEnabled?: boolean;
  /** Número de WhatsApp para el botón de contacto en "Mi cuenta". */
  whatsappNumber?: string | null;
  /** Ubicación del restaurante + radio de cobertura, para el mapa en "Mi cuenta". */
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  deliveryRadiusKm?: number | null;
  /** Idiomas adicionales al español activos para el menú (migración 086). */
  menuLanguages?: string[];
  /** Vitrina en lanzamiento: ediciones cerradas (migración 141). */
  archivo?: EdicionArchivada[];
  /** Menú de muestra de la portada (/preview/muestra): sin service worker,
      sin contar visitas y sin ofrecer instalarlo. Vive en el dominio de
      Leogin, y su service worker se quedaría controlando la web comercial. */
  muestra?: boolean;
}

export default function MenuShell({ config, content, categories, products, restaurantId, ordersEnabled, isOpen = true, reopenHint = null, timezone = 'America/Guatemala', initialMesa, llamadaMeseroEnabled = false, loyaltyOn = false, rewardsCatalog = null, googleAuthEnabled = false, whatsappNumber = null, restaurantLat = null, restaurantLng = null, deliveryRadiusKm = null, menuLanguages = [], archivo = [], muestra = false }: Props) {
  useEffect(() => {
    if (initialMesa && initialMesa > 0) {
      // "Añadir a inicio" guarda la URL con ?mesa= para siempre (ver
      // isStandaloneLaunch) — si se abre así, NO se re-marca la mesa: se deja
      // que localStorage + TTL decidan si la sesión de mesa sigue vigente.
      if (!isStandaloneLaunch()) {
        setScannedTable(restaurantId, initialMesa);
      }
      // Se borra el ?mesa= de la URL tras leerlo: si no, cada vez que el
      // navegador recarga o restaura esta misma pestaña (común en iOS/Android
      // horas después) se vuelve a "escanear" la mesa y el TTL de la sesión
      // nunca llega a cumplirse.
      const params = new URLSearchParams(window.location.search);
      params.delete('mesa');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [initialMesa, restaurantId]);

  /* QR de mesa → directo a la carta (auditoría 2026-10-02, D-7). El
     comensal ya está sentado: la portada a pantalla completa le pedía un
     toque más («Ver el menú») antes del primer platillo. Con mesa, el menú
     se pinta como sin portada —y entonces la carta lleva arriba el nombre
     del restaurante, que es lo que hace el catálogo cuando no hay portada—.
     El enlace general y el de redes siguen abriendo en la portada. */
  const cfg = useMemo(
    () => (initialMesa && initialMesa > 0 && config.portadaVariant !== 'none'
      ? { ...config, portadaVariant: 'none' as const }
      : config),
    [config, initialMesa],
  );

  /* La portada Vitrina vende con una foto. Si el dueño no subió imagen de
     fondo, se usa la de un producto de su carta: primero uno marcado como
     favorito/destacado (la misma regla que la carta), si no el primero con foto. */
  const vitrinaFoto = useMemo(() => {
    if (cfg.portadaVariant !== 'vitrina' || cfg.backgroundImage) return null;
    const conFoto = products.filter((p) => p.image_url);
    const fav = conFoto.find((p) => esDestacado(p.tags));
    return (fav ?? conFoto[0])?.image_url ?? null;
  }, [cfg.portadaVariant, cfg.backgroundImage, products]);

  const vitrina = isVitrina(cfg);

  return (
    <ThemeProvider config={cfg} content={content}>
      <LocaleProvider restaurantId={restaurantId} extraLanguages={menuLanguages}>
      <CartProvider restaurantId={restaurantId}>
        {!muestra && <OfflineSupport />}
        {!muestra && <VisitTracker restaurantId={restaurantId} />}
        {/* El lienzo ya no es una columna de 460 px para todos: el menú se
            comparte por link y se abre en tablet y escritorio, donde esa
            columna dejaba dos franjas vacías a los lados. El ancho lo pone
            `.menu-canvas` a partir de `data-canvas` en <html> (globals.css),
            no este componente: así es correcto ya en el primer pintado. */}
        <main
          className="themed-type menu-canvas"
          style={{
            // Vitrina: la barra de arriba es fija, así que el contenido arranca
            // debajo de ella; y abajo ya no hay barra de navegación que reservar.
            paddingTop: vitrina ? `calc(${VITRINA_TOP_H}px + env(safe-area-inset-top, 0px))` : undefined,
            paddingBottom: `calc(${vitrina ? '24px' : ordersEnabled ? '80px' : '64px'} + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <Cinta />
          <Portada isOpen={isOpen} fallbackImage={vitrinaFoto} whatsappNumber={whatsappNumber} />
          <div id="menu" style={{ scrollMarginTop: 16, paddingTop: 12 }}>
            {!isOpen && (
              <div
                role="status"
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: 'color-mix(in srgb, var(--c-danger, #f87171) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--c-danger, #f87171) 30%, transparent)',
                  borderRadius: 'var(--radius-lg)', padding: '13px 15px', marginBottom: 14,
                }}
              >
                <span style={{ color: 'var(--c-danger, #f87171)', flexShrink: 0, marginTop: 1 }}>
                  <Icon name="clock" size={18} />
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>
                    {content.portada.badgeClosed}
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--u-text-2)', marginTop: 2, lineHeight: 1.5 }}>
                    {ordersEnabled
                      ? `Puedes ver el menú. Los pedidos en línea ${reopenHint ? `abren ${reopenHint}` : 'no están disponibles ahora'}.`
                      : reopenHint ? `Abrimos ${reopenHint}.` : 'Vuelve dentro de nuestro horario de atención.'}
                  </p>
                </div>
              </div>
            )}
            <MenuClient categories={categories} products={products} ordersEnabled={ordersEnabled} restaurantId={restaurantId} timezone={timezone} llamadaMeseroEnabled={llamadaMeseroEnabled} initialMesa={initialMesa} loyaltyOn={loyaltyOn} rewardsCatalog={rewardsCatalog} googleAuthEnabled={googleAuthEnabled} whatsappNumber={whatsappNumber} restaurantLat={restaurantLat} restaurantLng={restaurantLng} deliveryRadiusKm={deliveryRadiusKm} />
          </div>
          {vitrina && cfg.launchMode && (
            <VitrinaArchivo
              archivo={archivo}
              avisame={enlaceAvisame(whatsappNumber, content.vitrina.nextTitle)}
              foto={cfg.backgroundImage || vitrinaFoto || products.find((p) => p.image_url)?.image_url || null}
            />
          )}
          {vitrina && (
            <footer className="m-vfoot">
              <span>{cfg.brandName}</span>
              {[cfg.tagline, cfg.zone].filter(Boolean).length > 0 && <span>{[cfg.tagline, cfg.zone].filter(Boolean).join(' · ')}</span>}
              <span>Hecho con Leogin</span>
            </footer>
          )}
        </main>
        {!muestra && <InstallBanner brandName={cfg.brandName} />}
      </CartProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
