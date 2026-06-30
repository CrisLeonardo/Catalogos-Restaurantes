'use client';

import { useEffect } from 'react';
import { setScannedTable } from '@/lib/table-session';
import { CartProvider } from '@/lib/cart-context';
import { ThemeProvider } from '@/lib/theme/context';
import Portada from '@/components/menu/portada';
import MenuClient from '@/components/menu-client';
import VisitTracker from '@/components/visit-tracker';
import InstallBanner from '@/components/install-banner';
import { Icon } from '@/components/icons';
import type { MenuReward } from '@/components/menu/rewards-section';
import type { ThemeConfig, ThemeContent } from '@/lib/theme/defaults';
import type { WeeklyHours } from '@/lib/hours';
import type { Category, Product } from '@/types';

type CatItem = Pick<Category, 'id' | 'name' | 'icon'> & { availability?: WeeklyHours | null };
type ProdItem = Pick<Product, 'id' | 'category_id' | 'name' | 'description' | 'price' | 'image_url' | 'icon' | 'tags' | 'options'>;

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
  redeemValue?: number;
  googleAuthEnabled?: boolean;
  /** Número de WhatsApp para el botón de contacto en "Mi cuenta". */
  whatsappNumber?: string | null;
}

export default function MenuShell({ config, content, categories, products, restaurantId, ordersEnabled, isOpen = true, reopenHint = null, timezone = 'America/Guatemala', initialMesa, llamadaMeseroEnabled = false, loyaltyOn = false, rewardsCatalog = null, redeemValue = 0, googleAuthEnabled = false, whatsappNumber = null }: Props) {
  useEffect(() => {
    if (initialMesa && initialMesa > 0) {
      setScannedTable(restaurantId, initialMesa);
    }
  }, [initialMesa, restaurantId]);

  return (
    <ThemeProvider config={config} content={content}>
      <CartProvider restaurantId={restaurantId}>
        <VisitTracker restaurantId={restaurantId} />
        <main className="themed-type" style={{ width: '100%', maxWidth: 460, margin: '0 auto', padding: `0 16px calc(${ordersEnabled ? '80px' : '64px'} + env(safe-area-inset-bottom, 0px))` }}>
          <Portada isOpen={isOpen} />
          <div id="menu" style={{ scrollMarginTop: 16, paddingTop: 12 }}>
            {!isOpen && (
              <div
                role="status"
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)',
                  borderRadius: 'var(--radius-lg)', padding: '13px 15px', marginBottom: 14,
                }}
              >
                <span style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }}>
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
            <MenuClient categories={categories} products={products} ordersEnabled={ordersEnabled} restaurantId={restaurantId} timezone={timezone} llamadaMeseroEnabled={llamadaMeseroEnabled} initialMesa={initialMesa} loyaltyOn={loyaltyOn} rewardsCatalog={rewardsCatalog} redeemValue={redeemValue} googleAuthEnabled={googleAuthEnabled} whatsappNumber={whatsappNumber} />
          </div>
        </main>
        <InstallBanner brandName={config.brandName} />
      </CartProvider>
    </ThemeProvider>
  );
}
