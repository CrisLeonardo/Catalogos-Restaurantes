'use client';

/* Editor de personalización para el dueño del restaurante.
   Tabs bien organizadas, paletas de color, controles orientados al negocio.
   No incluye: plantillas, CSS propio, pedidos/moneda (esos van en /admin/perfil). */

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import ImageUpload from '@/components/admin/image-upload';
import PreviewPane, { useThemePreviewChannel } from '@/components/super/preview-pane';
import TemplateGallery from '@/components/admin/template-gallery';
import OwnerTemplates from '@/components/admin/owner-templates';
import { saveAdminRestaurantTheme, type RestaurantThemeTemplate } from '@/lib/actions/restaurant';
import { fontsForRole, SHADOW_OPTIONS, type ThemeConfig, type ThemeContent } from '@/lib/theme/defaults';
import { isLight } from '@/lib/theme/resolve';
import { applyTemplateToConfig, structureOfConfig, type BuiltinTemplate } from '@/lib/theme/templates';

/* ── Contraste WCAG (asistente de legibilidad) ─────────────
   El dueño no sabe de ratios: si elige colores que no se leen,
   se lo decimos en su idioma y le damos un botón para arreglarlo. */
function relLum(hex: string): number {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return 1;
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}
function contrast(a: string, b: string): number {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ── Paletas de color prediseñadas ───────────────────────── */
const PALETTES: { name: string; colorBg: string; colorBg2: string; colorText: string; colorAccent: string; onAccent: string; scheme: ThemeConfig['scheme'] }[] = [
  { name: 'Carbón',    colorBg: '#0b0b0c', colorBg2: '#141416', colorText: '#F5F3EF', colorAccent: '#D97757', onAccent: '#0b0b0c', scheme: 'dark' },
  { name: 'Medianoche',colorBg: '#0d0e1a', colorBg2: '#12142a', colorText: '#e8e6ff', colorAccent: '#7c6af5', onAccent: '#fff',    scheme: 'dark' },
  { name: 'Bosque',    colorBg: '#0a120e', colorBg2: '#121f16', colorText: '#d8ede1', colorAccent: '#3dba72', onAccent: '#0a120e', scheme: 'dark' },
  { name: 'Vino',      colorBg: '#120812', colorBg2: '#1e0e1e', colorText: '#f0dff0', colorAccent: '#c44fb8', onAccent: '#fff',    scheme: 'dark' },
  { name: 'Miel',      colorBg: '#fdf8f0', colorBg2: '#f4ece0', colorText: '#1a1208', colorAccent: '#c47b28', onAccent: '#fff',    scheme: 'light' },
  { name: 'Nieve',     colorBg: '#f8fafc', colorBg2: '#eef2f8', colorText: '#0f172a', colorAccent: '#2563eb', onAccent: '#fff',    scheme: 'light' },
  { name: 'Oliva',     colorBg: '#f5f4ed', colorBg2: '#e8e7da', colorText: '#1a1a0d', colorAccent: '#5c6b00', onAccent: '#fff',    scheme: 'light' },
  { name: 'Rojo fuego',colorBg: '#120405', colorBg2: '#1e080a', colorText: '#fde8e8', colorAccent: '#e53e3e', onAccent: '#fff',    scheme: 'dark' },
];

/* ── Tipos ────────────────────────────────────────────────── */
interface Props {
  restaurantId: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
  ownerTemplates: RestaurantThemeTemplate[];
}

type Tab = 'plantillas' | 'identidad' | 'visual' | 'portada' | 'catalogo' | 'fuentes' | 'textos';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'plantillas', label: 'Plantillas', icon: 'grid'  },
  { key: 'identidad', label: 'Identidad',  icon: 'sparkle' },
  { key: 'visual',    label: 'Visual',     icon: 'image'   },
  { key: 'portada',   label: 'Portada',    icon: 'phone'   },
  { key: 'catalogo',  label: 'Catálogo',   icon: 'grid'    },
  { key: 'fuentes',   label: 'Tipografía', icon: 'tag'     },
  { key: 'textos',    label: 'Textos',     icon: 'list'    },
];

/* ── Componente principal ─────────────────────────────────── */
export default function AdminThemeEditor({ restaurantId, config: initialConfig, content: initialContent, customCss: initialCss, ownerTemplates: initialOwnerTemplates }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<ThemeConfig>(initialConfig);
  const [content, setContent] = useState<ThemeContent>(initialContent);
  const [ownerTemplates, setOwnerTemplates] = useState<RestaurantThemeTemplate[]>(initialOwnerTemplates);
  // El CSS a medida (lo escribe solo Leogin) vive en estado porque aplicar una
  // plantilla lo RESETEA: ese CSS se inyecta al final del documento y le gana
  // a las variables de cualquier plantilla — con un CSS hecho para el look
  // anterior, la plantilla salía como mezcla ilegible (fondo/texto viejos +
  // tarjetas del esquema nuevo) tanto en la vista previa como al publicar.
  const [customCss, setCustomCss] = useState(initialCss);
  const [tab, setTab] = useState<Tab>('plantillas');
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [appliedTpl, setAppliedTpl] = useState<string | null>(null);
  // ¿Este restaurante tenía CSS a medida y el dueño lo quitó al aplicar una
  // plantilla? El server action solo permite al dueño LIMPIARLO (nunca
  // escribir CSS arbitrario), por eso viaja como flag y no como texto.
  const cssWasReset = initialCss.trim() !== '' && customCss === '';

  const setC = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setConfig((p) => ({ ...p, [k]: v }));
  const setT = (section: keyof ThemeContent, key: string, v: string) =>
    setContent((p) => ({ ...p, [section]: { ...p[section], [key]: v } }));

  const previewState = useMemo(() => ({ config, content, customCss }), [config, content, customCss]);
  useThemePreviewChannel(restaurantId, previewState);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveAdminRestaurantTheme({ restaurantId, config, content, customCss, resetCustomCss: cssWasReset });
      if (res.error) setMsg(`Error: ${res.error}`);
      else { setMsg('Guardado ✓'); router.refresh(); }
    });
  }

  function applyBuiltinTemplate(tpl: BuiltinTemplate) {
    setConfig((prev) => applyTemplateToConfig(prev, tpl));
    // El CSS a medida se desactiva: pisa las variables de la plantilla y
    // producía la mezcla ilegible (ver comentario en el estado customCss).
    setCustomCss('');
    setAppliedTpl(tpl.id);
    setMsg(null);
  }

  function applyPalette(p: typeof PALETTES[0]) {
    setConfig((prev) => ({
      ...prev,
      colorBg: p.colorBg,
      colorBg2: p.colorBg2,
      colorText: p.colorText,
      colorAccent: p.colorAccent,
      onAccent: p.onAccent,
      scheme: p.scheme,
    }));
  }

  return (
    <div className="theme-editor-layout">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

        {/* ── Tabs ── */}
        <div data-tour-step="personalizar-tabs" style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16,
          padding: '6px', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', borderRadius: 14,
          border: '1px solid var(--u-hair)',
        }}>
          {TABS.map(({ key, label, icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="press"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: 'none',
                  background: on ? 'var(--u-text)' : 'transparent',
                  color: on ? 'var(--admin-content-bg-solid, var(--brand-bg))' : 'var(--u-text-3)',
                  transition: 'all 150ms',
                }}
              >
                <Icon name={icon} size={14} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab: Plantillas ── */}
        {tab === 'plantillas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Glass variant="quiet" style={{ padding: 16 }}>
              <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
                Elige un punto de partida y luego afínalo en las demás pestañas.
                Tu logo, nombre, textos y configuración de pedidos <strong style={{ color: 'var(--u-text-2)' }}>se conservan</strong> —
                la plantilla solo cambia colores, tipografía, portada y estilo.
                Nada se publica hasta que toques «Guardar cambios».
              </p>
            </Glass>
            <OwnerTemplates
              restaurantId={restaurantId}
              currentConfig={config}
              templates={ownerTemplates}
              onTemplatesChange={setOwnerTemplates}
              onApply={applyBuiltinTemplate}
              appliedId={appliedTpl}
            />
            <div style={{ height: 1, background: 'var(--u-hair)', margin: '2px 0' }} aria-hidden />
            {/* Abre en la estructura que el menú ya está usando: si este
                restaurante lleva meses con la carta en acordeón, empezar en
                "Clásico" le enseñaría 22 diseños que no son el suyo. */}
            <TemplateGallery onApply={applyBuiltinTemplate} appliedId={appliedTpl} initialStructure={structureOfConfig(initialConfig)} />
            {appliedTpl && (
              <Glass variant="quiet" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="checkCircle" size={16} style={{ color: 'var(--c-ok)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.5 }}>
                  Plantilla aplicada. Revísala en la vista previa y pulsa <strong>Guardar cambios</strong> para publicarla,
                  o sigue personalizando en las otras pestañas.
                  {cssWasReset && (
                    <> Este sitio tenía un <strong>diseño CSS a medida</strong> que pisaba los colores de las plantillas;
                    se desactivó para que la plantilla se vea fiel (se elimina al guardar).</>
                  )}
                </span>
              </Glass>
            )}
          </div>
        )}

        {/* ── Tab: Identidad ── */}
        {tab === 'identidad' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Logos e imágenes">
              <Field label="Logo principal (portada y encabezado)">
                <ImageUpload restaurantId={restaurantId} currentUrl={config.logoUrl} folder="logo" bgColor={config.colorBg} onUpload={(u) => setC('logoUrl', u)} />
              </Field>
              <Field label="Ícono de app instalada (PWA)">
                <ImageUpload restaurantId={restaurantId} currentUrl={config.pwaIconUrl} folder="pwa-icon" mode="icon" bgColor={config.colorBg} onUpload={(u) => setC('pwaIconUrl', u)} />
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2, lineHeight: 1.5 }}>
                  Aparece en la pantalla de inicio cuando el cliente instala la app. Se adapta automáticamente al color de fondo del tema.
                </p>
              </Field>
              <Field label="Marca de agua (watermark de fondo)">
                <ImageUpload restaurantId={restaurantId} currentUrl={config.markUrl} folder="mark" bgColor={config.colorBg} onUpload={(u) => setC('markUrl', u)} />
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2, lineHeight: 1.5 }}>
                  Ícono pequeño que rota en el fondo cuando activas el watermark. Si no se sube, usa el logo.
                </p>
              </Field>
            </Section>

            <Section title="Información de marca">
              <TextCtl label="Nombre de marca" value={config.brandName} onChange={(v) => setC('brandName', v)} />
              <TextCtl label="Tagline / lema" value={config.tagline} onChange={(v) => setC('tagline', v)} placeholder="Sabor que enamora…" />
              <TextCtl label="Zona / ubicación" value={config.zone} onChange={(v) => setC('zone', v)} placeholder="Zona 1, Centro…" />
            </Section>

            <Section title="Colores de marca">
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 4 }}>
                Paletas listas para aplicar de un toque — siempre puedes ajustar los colores individualmente después.
              </p>
              {/* Paletas */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {PALETTES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPalette(p)}
                    title={`Aplicar paleta "${p.name}"`}
                    className="press"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      border: '1.5px solid var(--u-hair-2)', borderRadius: 10, padding: '8px 10px',
                      background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', cursor: 'pointer', minWidth: 68,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: p.colorBg, border: '1px solid color-mix(in srgb, var(--u-text) 10%, transparent)' }} />
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: p.colorAccent }} />
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: p.colorText, border: '1px solid rgba(0,0,0,0.1)' }} />
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--u-text-3)', fontWeight: 600 }}>{p.name}</span>
                  </button>
                ))}
              </div>

              <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />

              <ColorCtl label="Color de fondo" value={config.colorBg} onChange={(v) => setC('colorBg', v)} />
              <ColorCtl label="Fondo 2 (gradientes)" value={config.colorBg2} onChange={(v) => setC('colorBg2', v)} />
              <ColorCtl label="Color de texto" value={config.colorText} onChange={(v) => setC('colorText', v)} />
              <ColorCtl label="Color de acento / marca" value={config.colorAccent} onChange={(v) => setC('colorAccent', v)} />
              <ColorCtl label="Texto sobre acento" value={config.onAccent} onChange={(v) => setC('onAccent', v)} />
              <Segmented
                label="Modo de color"
                value={config.scheme}
                options={[['dark', 'Oscuro'], ['light', 'Claro']]}
                onChange={(v) => setC('scheme', v as ThemeConfig['scheme'])}
              />

              {/* Asistente de legibilidad: avisa combinaciones ilegibles y las
                  arregla con un toque, sin cambiar nada por sorpresa. */}
              {contrast(config.colorText, config.colorBg) < 4.5 && (
                <ContrastHint
                  text="El color de texto casi no se distingue del fondo — el menú costará leerse."
                  actionLabel="Corregir texto"
                  onFix={() => setC('colorText', isLight(config.colorBg) ? '#15130f' : '#F5F3EF')}
                />
              )}
              {contrast(config.onAccent, config.colorAccent) < 3 && (
                <ContrastHint
                  text="El texto sobre el acento no es legible (botones y badges de marca)."
                  actionLabel="Corregir contraste"
                  onFix={() => setC('onAccent', isLight(config.colorAccent) ? '#15130f' : '#ffffff')}
                />
              )}
              {isLight(config.colorBg) !== (config.scheme === 'light') && (
                <ContrastHint
                  text={isLight(config.colorBg)
                    ? 'Tu fondo es claro pero el modo de color está en "Oscuro": las tarjetas y sombras se verán lavadas.'
                    : 'Tu fondo es oscuro pero el modo de color está en "Claro": las tarjetas y sombras se verán sucias.'}
                  actionLabel={`Cambiar a ${isLight(config.colorBg) ? 'Claro' : 'Oscuro'}`}
                  onFix={() => setC('scheme', isLight(config.colorBg) ? 'light' : 'dark')}
                />
              )}
            </Section>
          </div>
        )}

        {/* ── Tab: Visual ── */}
        {tab === 'visual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Fondo del sitio">
              <Segmented
                label="Tipo de fondo"
                value={config.backgroundType}
                options={[['asphalt', 'Asphalt (textura)'], ['solid', 'Sólido'], ['gradient', 'Gradiente'], ['image', 'Imagen']]}
                onChange={(v) => setC('backgroundType', v as ThemeConfig['backgroundType'])}
              />
              {config.backgroundType === 'image' && (
                <Field label="Imagen de fondo">
                  <ImageUpload restaurantId={restaurantId} currentUrl={config.backgroundImage} folder="bg" onUpload={(u) => setC('backgroundImage', u)} />
                </Field>
              )}
              {config.backgroundType === 'image' && (
                <Slider label="Oscuridad del velo sobre la imagen" value={config.bgOverlayOpacity} min={0} max={1} step={0.05} onChange={(v) => setC('bgOverlayOpacity', v)} />
              )}
              {config.backgroundType === 'gradient' && (
                <TextCtl
                  label="CSS del gradiente"
                  value={config.backgroundGradient ?? ''}
                  onChange={(v) => setC('backgroundGradient', v || null)}
                  placeholder="linear-gradient(160deg, #111, #333)"
                />
              )}
              <Toggle label="Luz ambiental (efecto glow)" value={config.ambientGlow} onChange={(v) => setC('ambientGlow', v)} />
              <Toggle label="Grano / textura" value={config.grain} onChange={(v) => setC('grain', v)} />
              {config.grain && (
                <Segmented
                  label="Estilo del grano"
                  value={config.grainStyle}
                  options={[['fino', 'Fino (concreto)'], ['grueso', 'Grueso (asfalto/parrilla)'], ['papel', 'Papel (fibra cálida)']]}
                  onChange={(v) => setC('grainStyle', v as ThemeConfig['grainStyle'])}
                />
              )}
              <Toggle label="Marca de agua girando" value={config.watermark} onChange={(v) => setC('watermark', v)} />
              {config.watermark && (
                <>
                  <Slider label="Opacidad de la marca de agua" value={config.watermarkOpacity} min={0.01} max={0.15} step={0.01} onChange={(v) => setC('watermarkOpacity', v)} />
                  <Slider label="Tamaño de la marca de agua" value={config.watermarkSize} min={40} max={120} step={5} onChange={(v) => setC('watermarkSize', v)} />
                </>
              )}
            </Section>

            <Section title="Estilo de tarjetas (glass)">
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 2 }}>
                Las tarjetas de producto, el carrito y los modales usan este estilo de cristal.
              </p>
              <Segmented
                label="Estilo"
                value={config.glassIntensity}
                options={[['translucido', 'Translúcido'], ['esmerilado', 'Esmerilado'], ['solido', 'Denso']]}
                onChange={(v) => setC('glassIntensity', v as ThemeConfig['glassIntensity'])}
              />
              <Slider label="Cantidad de glass" value={config.glassAmount ?? 100} min={0} max={100} step={1} onChange={(v) => setC('glassAmount', v)} />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
                100 % = efecto completo · 0 % = sólido puro (sin blur ni transparencia)
              </p>
              <Slider label="Redondeo de esquinas" value={config.cornerRadius} min={0.4} max={1.8} step={0.1} onChange={(v) => setC('cornerRadius', v)} />
              <Toggle label="Brillo que sigue al cursor" value={config.sheen} onChange={(v) => setC('sheen', v)} />
              <Toggle label="Animaciones del menú" value={config.animations} onChange={(v) => setC('animations', v)} />
            </Section>
          </div>
        )}

        {/* ── Tab: Portada ── */}
        {tab === 'portada' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Portada del menú">
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 4 }}>
                La portada es lo primero que ve el cliente al abrir el menú QR.
              </p>
              <Segmented
                label="Estilo de portada"
                value={config.portadaVariant}
                options={[
                  ['spotlight', 'Spotlight'], ['poster', 'Poster'], ['stack', 'Stack'],
                  ['fullbleed', 'Foto a sangre'], ['ticket', 'Comanda'],
                  ['directo', 'Directo al menú'], ['none', 'Sin portada'],
                ]}
                onChange={(v) => setC('portadaVariant', v as ThemeConfig['portadaVariant'])}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4, lineHeight: 1.5 }}>
                {PORTADA_HINT[config.portadaVariant] ?? ''}
              </p>
              {config.portadaVariant !== 'none' && (
                <>
                  <Toggle label="Mostrar logo" value={config.portadaShowLogo} onChange={(v) => setC('portadaShowLogo', v)} />
                  <Toggle label="Mostrar badge 'Abierto / Cerrado'" value={config.portadaShowBadge} onChange={(v) => setC('portadaShowBadge', v)} />
                  <Toggle label="Punto de estado (indicador en vivo)" value={config.portadaShowStatus} onChange={(v) => setC('portadaShowStatus', v)} />
                </>
              )}
              <Segmented
                label="Estilo del botón 'Ver el menú'"
                value={config.ctaStyle}
                options={[['white', 'Blanco'], ['accent', 'Color de acento'], ['outline', 'Contorno']]}
                onChange={(v) => setC('ctaStyle', v as ThemeConfig['ctaStyle'])}
              />
            </Section>

            <Section title="Textos de portada">
              <TextCtl label="Título (vacío = nombre del restaurante)" value={content.portada.title} onChange={(v) => setT('portada', 'title', v)} />
              <TextCtl label="Subtítulo (vacío = tagline)" value={content.portada.subtitle} onChange={(v) => setT('portada', 'subtitle', v)} />
              <TextCtl label="Texto del botón" value={content.portada.cta} onChange={(v) => setT('portada', 'cta', v)} />
              <TextCtl label="Badge 'Abierto'" value={content.portada.badgeOpen} onChange={(v) => setT('portada', 'badgeOpen', v)} />
              <TextCtl label="Badge 'Cerrado'" value={content.portada.badgeClosed} onChange={(v) => setT('portada', 'badgeClosed', v)} />
            </Section>
          </div>
        )}

        {/* ── Tab: Catálogo ── */}
        {tab === 'catalogo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Estructura del menú">
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 2, lineHeight: 1.5 }}>
                Esto no toca los colores: cambia cómo está <em>armado</em> el menú. Es lo que
                hace que tu carta no se parezca a la del restaurante de al lado.
              </p>

              <Segmented
                label="Cómo se recorre la carta"
                value={config.catalogNav}
                options={[['chips', 'Píldoras'], ['secciones', 'Secciones'], ['acordeon', 'Acordeón'], ['portadas', 'Portadas']]}
                onChange={(v) => setC('catalogNav', v as ThemeConfig['catalogNav'])}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4, lineHeight: 1.5 }}>
                {NAV_HINT[config.catalogNav] ?? ''}
              </p>

              <Segmented
                label="Forma de cada platillo"
                value={config.cardStyle}
                options={[['tarjeta', 'Tarjeta'], ['fila', 'Fila'], ['texto', 'Texto'], ['mosaico', 'Mosaico'], ['carrusel', 'Carrusel']]}
                onChange={(v) => setC('cardStyle', v as ThemeConfig['cardStyle'])}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4, lineHeight: 1.5 }}>
                {CARD_HINT[config.cardStyle] ?? ''}
              </p>

              <Segmented
                label="Ancho de la página"
                value={config.layoutWidth}
                options={[['movil', 'Columna de móvil'], ['ancho', 'Ancho'], ['revista', 'Revista']]}
                onChange={(v) => setC('layoutWidth', v as ThemeConfig['layoutWidth'])}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4, lineHeight: 1.5 }}>
                Cuando compartes el menú por link se abre también en tablet y computadora.
                «Columna de móvil» lo deja en 460 px siempre; las otras dos aprovechan la
                pantalla en vez de dejar dos franjas vacías a los lados.
              </p>

              {/* Las columnas solo mandan en la columna de móvil: en lienzos anchos
                  se reparten por ancho disponible o cada tarjeta saldría enorme. */}
              {(config.cardStyle === 'tarjeta' || config.cardStyle === 'mosaico') && config.layoutWidth === 'movil' && (
                <Segmented
                  label="Columnas"
                  value={String(config.catalogColumns)}
                  options={[['2', '2 columnas'], ['3', '3 columnas']]}
                  onChange={(v) => setC('catalogColumns', Number(v) as 2 | 3)}
                />
              )}

              {config.cardStyle === 'texto' ? (
                <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', lineHeight: 1.5, margin: 0 }}>
                  La forma «Texto» no muestra ninguna imagen, así que el arte de productos no
                  aplica aquí.
                </p>
              ) : (
                <Segmented
                  label="Arte de productos"
                  value={config.productArt}
                  options={[['auto', 'Auto (foto o patrón)'], ['pattern', 'Solo patrón'], ['photo', 'Solo foto']]}
                  onChange={(v) => setC('productArt', v as ThemeConfig['productArt'])}
                />
              )}
            </Section>

            <Section title="Elementos visibles">
              <Toggle label="Buscador de productos" value={config.showSearch} onChange={(v) => setC('showSearch', v)} />
              <Toggle label="Íconos de categoría" value={config.showCategoryIcons} onChange={(v) => setC('showCategoryIcons', v)} />
              <Toggle label="Etiquetas (Picante, Nuevo, Veggie…)" value={config.showTags} onChange={(v) => setC('showTags', v)} />
              <Toggle label="Favoritos como tarjeta destacada" value={config.featuredFavorites} onChange={(v) => setC('featuredFavorites', v)} />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4, lineHeight: 1.5 }}>
                Los productos con etiqueta «Favorito» o «Destacado» se muestran en grande, a todo lo ancho
                (máximo 3), para guiar al cliente hacia tus platillos estrella.
              </p>
            </Section>

            <Section title="Textos del menú">
              <TextCtl label="Título del menú" value={content.catalog.heading} onChange={(v) => setT('catalog', 'heading', v)} />
              <TextCtl label="Placeholder del buscador" value={content.catalog.searchPlaceholder} onChange={(v) => setT('catalog', 'searchPlaceholder', v)} />
              <TextCtl label="Etiqueta 'Todos'" value={content.catalog.allLabel} onChange={(v) => setT('catalog', 'allLabel', v)} />
              <TextCtl label="Mensaje cuando no hay resultados" value={content.catalog.empty} onChange={(v) => setT('catalog', 'empty', v)} />
            </Section>

            <Section title="Etiquetas de producto">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <TextCtl label="Picante" value={content.tags.hot} onChange={(v) => setT('tags', 'hot', v)} />
                <TextCtl label="Nuevo" value={content.tags.new} onChange={(v) => setT('tags', 'new', v)} />
                <TextCtl label="Favorito" value={content.tags.fav} onChange={(v) => setT('tags', 'fav', v)} />
                <TextCtl label="Veggie" value={content.tags.veg} onChange={(v) => setT('tags', 'veg', v)} />
              </div>
            </Section>

            <Section title="Checkout y pago" defaultOpen={false}>
              <Segmented
                label="Color del estado activo (tabs / opciones)"
                value={config.checkoutActiveColor}
                options={[['text', 'Blanco / texto'], ['accent', 'Acento']]}
                onChange={(v) => setC('checkoutActiveColor', v as ThemeConfig['checkoutActiveColor'])}
              />
              <Toggle label="Glass en opciones de pago (efectivo / tarjeta)" value={config.checkoutPayGlass !== false} onChange={(v) => setC('checkoutPayGlass', v)} />
              <Toggle label="Glass en los campos del formulario" value={config.checkoutFormGlass} onChange={(v) => setC('checkoutFormGlass', v)} />
              <Segmented
                label="Sombra de texto (legibilidad)"
                value={config.checkoutTextShadow ?? 'soft'}
                options={SHADOW_OPTIONS}
                onChange={(v) => setC('checkoutTextShadow', v as ThemeConfig['checkoutTextShadow'])}
              />
              <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', margin: 0, lineHeight: 1.5 }}>
                La sombra hace que el texto resalte sobre fondos vivos o con imagen. El glass distingue las opciones de pago con cualquier paleta.
              </p>
            </Section>
          </div>
        )}

        {/* ── Tab: Fuentes ── */}
        {tab === 'fuentes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="Tipografía">
              <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 4 }}>
                Las fuentes se cargan desde Google Fonts. Úsalas para dar personalidad a tu menú.
              </p>
              <FontCtl label="Titulares y encabezados" role="display" value={config.fontDisplay} onChange={(v) => setC('fontDisplay', v)} />
              <FontCtl label="Kickers y etiquetas grandes" role="poster" value={config.fontPoster} onChange={(v) => setC('fontPoster', v)} />
              <FontCtl label="Texto del cuerpo" role="body" value={config.fontBody} onChange={(v) => setC('fontBody', v)} />
              <FontCtl label="Cursivas y texto literario" role="serif" value={config.fontSerif} onChange={(v) => setC('fontSerif', v)} />
              <FontCtl label="Precios y números" role="mono" value={config.fontMono} onChange={(v) => setC('fontMono', v)} />
              <Slider label="Escala de texto global" value={config.fontScale} min={0.85} max={1.25} step={0.05} onChange={(v) => setC('fontScale', v)} />
            </Section>
          </div>
        )}

        {/* ── Tab: Textos ── */}
        {tab === 'textos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Glass variant="quiet" style={{ padding: 16 }}>
              <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.6 }}>
                Personaliza cada texto que ve el cliente. Deja en blanco para usar el texto por defecto.
              </p>
            </Glass>

            {([
              ['product', 'Producto', [
                ['add', 'Botón "Agregar"'],
                ['soldOut', 'Agotado'],
                ['prepTime', 'Tiempo de preparación'],
                ['fresh', 'Etiqueta "recién hecho"'],
                ['chooseOne', 'Opción obligatoria'],
                ['optional', 'Opción opcional'],
              ]],
              ['cart', 'Carrito', [
                ['title', 'Título del carrito'],
                ['empty', 'Carrito vacío'],
                ['subtotal', 'Subtotal'],
                ['shipping', 'Envío'],
                ['free', 'Gratis'],
                ['total', 'Total'],
                ['checkout', 'Botón "Ir a pagar"'],
                ['barCta', 'Barra flotante'],
              ]],
              ['checkout', 'Checkout', [
                ['title', 'Título'],
                ['typeLabel', 'Tipo de pedido'],
                ['delivery', 'A domicilio'],
                ['pickup', 'Para llevar'],
                ['name', 'Campo nombre'],
                ['namePh', 'Placeholder nombre'],
                ['phone', 'Campo teléfono'],
                ['phonePh', 'Placeholder teléfono'],
                ['address', 'Campo dirección'],
                ['addressPh', 'Placeholder dirección'],
                ['notes', 'Campo notas'],
                ['notesPh', 'Placeholder notas'],
                ['payLabel', 'Forma de pago'],
                ['payCash', 'Pago en efectivo'],
                ['payCashSub', 'Sub-texto efectivo'],
                ['confirm', 'Botón confirmar'],
                ['closedTitle', 'Cerrado: título'],
                ['closedMsg', 'Cerrado: mensaje'],
                ['pausedTitle', 'En pausa: título'],
                ['pausedMsg', 'En pausa: mensaje'],
              ]],
              ['confirmation', 'Confirmación', [
                ['title', 'Título'],
                ['subtitle', 'Subtítulo'],
                ['orderNo', 'Número de pedido'],
                ['eta', 'Tiempo estimado'],
                ['etaValue', 'Valor del tiempo'],
                ['payment', 'Forma de pago'],
                ['notified', 'Notificado'],
                ['track', 'Botón seguimiento'],
                ['again', 'Hacer otro pedido'],
              ]],
              ['tracking', 'Seguimiento', [
                ['title', 'Título'],
                ['subtitle', 'Subtítulo'],
                ['statusNew', 'Estado: recibido'],
                ['statusPrep', 'Estado: en preparación'],
                ['statusReady', 'Estado: listo'],
                ['statusReadyPickup', 'Estado: listo para recoger'],
                ['statusTransit', 'Estado: en camino'],
                ['statusDelivered', 'Estado: entregado'],
                ['statusCancel', 'Estado: cancelado'],
                ['back', 'Volver al menú'],
              ]],
            ] as [keyof ThemeContent, string, [string, string][]][]).map(([section, label, fields]) => (
              <Glass key={section} variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="adm-label">{label}</div>
                {fields.map(([key, fieldLabel]) => (
                  <TextCtl
                    key={key}
                    label={fieldLabel}
                    value={(content[section] as Record<string, string>)[key] ?? ''}
                    onChange={(v) => setT(section, key, v)}
                  />
                ))}
              </Glass>
            ))}
          </div>
        )}

        {/* (La apariencia del panel admin ya no se edita aquí: el panel usa 2
            temas fijos claro/oscuro que se alternan desde la barra superior.) */}

        {/* ── Guardar ── */}
        <div style={{
          position: 'sticky', bottom: 0,
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
          flexWrap: 'wrap',
          /* Velo que tapa el contenido al hacer scroll. OJO: --u-bg no existe
             (bug histórico: la barra quedaba transparente); el fondo sólido
             efectivo del contenido lo emite buildAdminPanelVars. */
          background: 'linear-gradient(to top, var(--admin-content-bg-solid, var(--brand-bg)) 70%, transparent)',
          marginTop: 14,
        }}>
          <button
            onClick={save}
            disabled={isPending}
            className="press btn-accent"
            data-tour-step="personalizar-guardar"
            style={{ padding: '13px 28px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <a
            href={`/preview/${restaurantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', textDecoration: 'none', padding: '12px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--u-hair-2)' }}
          >
            Ver sitio ↗
          </a>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--c-danger, #f87171)' : 'var(--c-ok, #4ade80)' }}>{msg}</span>
          )}
        </div>
      </div>

      {/* ── Panel de vista previa ── */}
      <PreviewPane previewId={restaurantId} />
    </div>
  );
}

/* ── Controles reutilizables ─────────────────────────────── */

/* Panel colapsable: reduce el ruido visual del editor. El estado (abierto/
   cerrado) se recuerda por título en localStorage para que cada quien deje
   abierto solo lo que usa. */
/* Ayudas de los ejes de estructura. "Acordeón" o "mosaico" no le dicen nada a
   un dueño de restaurante leyendo solo la etiqueta de un botón, y estas tres
   decisiones son las que más cambian el menú — conviene que se elijan sabiendo
   qué se está eligiendo, no probando a ver qué sale. */
const NAV_HINT: Record<string, string> = {
  chips: 'Píldoras arriba que filtran una categoría a la vez. Es la vista de siempre.',
  secciones: 'Toda la carta de corrido, una sección por categoría, con un índice que se queda pegado arriba.',
  acordeon: 'Categorías plegadas: se abre una a la vez. Para cartas con muchísimos productos.',
  portadas: 'El menú arranca eligiendo sección en tarjetas grandes, como una app de comida.',
};

const CARD_HINT: Record<string, string> = {
  tarjeta: 'Rejilla de tarjetas con la imagen arriba.',
  fila: 'Una fila por platillo, con miniatura a la izquierda.',
  texto: 'Carta impresa: sin imágenes, nombre y precio unidos por una línea de puntos.',
  mosaico: 'Tarjetas de alturas desiguales que encajan como una revista.',
  carrusel: 'Cada categoría es una fila que se desliza de lado.',
};

const PORTADA_HINT: Record<string, string> = {
  spotlight: 'Logo y nombre centrados, con un halo detrás.',
  poster: 'El nombre enorme alineado a la izquierda, como un cartel.',
  stack: 'Logo arriba y tres tarjetas con lo que te distingue.',
  fullbleed: 'Tu imagen de fondo a pantalla completa con el nombre encima (súbela en «Fondo»).',
  ticket: 'Una comanda de papel, con bordes dentados y letra de máquina.',
  directo: 'Solo un encabezado pequeño: el menú empieza de inmediato, sin pantalla de bienvenida.',
  none: 'Sin ninguna cabecera: el menú arranca en seco.',
};

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const storageKey = `admin-theme-sec:${title}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);

    if (stored !== null) setOpen(stored === '1');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: open ? 12 : 0 }}>
      <button
        type="button"
        onClick={toggle}
        className="press"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        <span className="adm-label">{title}</span>
        <Icon name="chevronDown" size={16} style={{ color: 'var(--u-text-3)', transition: 'transform 180ms var(--ease-out)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </button>
      {open && children}
    </Glass>
  );
}

/** Aviso de legibilidad con arreglo de un toque (asistente de contraste). */
function ContrastHint({ text, actionLabel, onFix }: { text: string; actionLabel: string; onFix: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in srgb, var(--c-warn, #fbbf24) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--c-warn, #fbbf24) 35%, transparent)',
      }}
    >
      <span style={{ color: 'var(--c-warn)', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        <Icon name="alertCircle" size={16} />
      </span>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--u-text-2)', lineHeight: 1.45 }}>{text}</span>
      <button
        type="button"
        onClick={onFix}
        className="press"
        style={{
          flexShrink: 0, padding: '7px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
          background: 'var(--u-text)', color: 'var(--admin-content-bg-solid, var(--brand-bg))',
          fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};

/* El select nativo sigue el esquema efectivo del contenido del panel
   (--admin-content-scheme): así el popup del sistema no sale blanco en un
   panel oscuro ni negro en un panel claro. */
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--admin-content-bg-solid, #1a1a1a)',
  colorScheme: 'var(--admin-content-scheme, dark)' as React.CSSProperties['colorScheme'],
};

const optionStyle: React.CSSProperties = {
  background: 'var(--admin-content-bg-solid, #1a1a1a)',
  color: 'var(--u-text, #e5e5e5)',
};

function TextCtl({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </Field>
  );
}

function ColorCtl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, background: 'transparent' }} />
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)', flex: 1 }}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 96, fontFamily: 'var(--ui-font-mono)', fontSize: 12, padding: '6px 8px' }} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)} className="press" style={{ width: 42, height: 25, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3, background: value ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 14%, transparent)', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', transition: 'background 180ms', flexShrink: 0 }}>
        <span style={{ width: 19, height: 19, borderRadius: 99, background: value ? 'var(--admin-content-bg-solid, var(--brand-bg))' : 'var(--u-text)' }} />
      </button>
    </div>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(([val, lbl]) => {
          const on = value === val;
          return (
            <button key={val} type="button" onClick={() => onChange(val)} className="press" style={{ padding: '7px 13px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 5%, transparent)', color: on ? 'var(--admin-content-bg-solid, var(--brand-bg))' : 'var(--u-text-3)', transition: 'all 150ms' }}>
              {lbl}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} · ${value % 1 === 0 ? value : value.toFixed(2)}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--brand-accent)' }} />
    </Field>
  );
}

function FontCtl({ label, role, value, onChange }: { label: string; role: 'display' | 'poster' | 'body' | 'serif' | 'mono'; value: string; onChange: (v: string) => void }) {
  const opts = fontsForRole(role);
  const has = opts.some((o) => o.family === value);
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...selectStyle, cursor: 'pointer' }}>
        {!has && <option value={value} style={optionStyle}>{value}</option>}
        {opts.map((o) => <option key={o.family} value={o.family} style={optionStyle}>{o.label}</option>)}
      </select>
    </Field>
  );
}
