'use client';

import { useEffect } from 'react';
import { setScannedTable, isStandaloneLaunch } from '@/lib/table-session';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import { LocaleProvider } from '@/lib/locale/context';
import Portada from '@/components/menu/portada';
import MenuClient from '@/components/menu-client';
import VisitTracker from '@/components/visit-tracker';
import InstallBanner from '@/components/install-banner';
import OfflineSupport from '@/components/offline-support';
import { Icon } from '@/components/icons';
import type { MenuReward } from '@/components/menu/rewards-section';
import { LAYOUT_MAX_WIDTH, type ThemeConfig, type ThemeContent } from '@/lib/theme/defaults';
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
}

export default function MenuShell({ config, content, categories, products, restaurantId, ordersEnabled, isOpen = true, reopenHint = null, timezone = 'America/Guatemala', initialMesa, llamadaMeseroEnabled = false, loyaltyOn = false, rewardsCatalog = null, googleAuthEnabled = false, whatsappNumber = null, restaurantLat = null, restaurantLng = null, deliveryRadiusKm = null, menuLanguages = [] }: Props) {
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

  return (
    <ThemeProvider config={config} content={content}>
      <LocaleProvider restaurantId={restaurantId} extraLanguages={menuLanguages}>
      <CartProvider restaurantId={restaurantId}>
        <OfflineSupport />
        <VisitTracker restaurantId={restaurantId} />
        {/* El lienzo ya no es una columna de 460 px para todos: el menú se
            comparte por link y se abre en tablet y escritorio, donde esa
            columna dejaba dos franjas vacías a los lados. */}
        <main className="themed-type" style={{ width: '100%', maxWidth: LAYOUT_MAX_WIDTH[config.layoutWidth] ?? LAYOUT_MAX_WIDTH.movil, margin: '0 auto', padding: `0 16px calc(${ordersEnabled ? '80px' : '64px'} + env(safe-area-inset-bottom, 0px))` }}>
          <Portada isOpen={isOpen} />
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
        </main>
        <InstallBanner brandName={config.brandName} />
      </CartProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
